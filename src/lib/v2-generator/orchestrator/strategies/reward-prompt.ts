import { sql } from "@/lib/db";
import type { Strategy } from "../types";
import type { ContentSpec } from "../../types";

/**
 * Reward-prompt strategy.
 *
 * Picks one persuasion-angle prompt from sites.brand_dna.signals.reward_prompts
 * (generated once per site by generateRewardPrompts) and shapes a ContentSpec
 * around it. The prompt's intent + framingAngle become the article's spine;
 * its assetBias hints at which kind of asset works best.
 *
 * Picks randomly from available prompts on each tick — over the course of a
 * batch, the orchestrator naturally rotates through the portfolio. (Future:
 * weight by past performance, recency, conversion-goal balance.)
 */
export const rewardPromptStrategy: Strategy = {
  kind: "reward_prompt",
  label: "Reward-prompt (goal-shaped)",

  score(assessment) {
    const promptCount = assessment.rewardSignals.prompts.length;
    if (promptCount === 0) return 0;
    // Strong score when prompts are available — gives the orchestrator
    // a real strategic option beyond just surfacing assets.
    return 0.6;
  },

  async build(assessment): Promise<ContentSpec | null> {
    const prompts = assessment.rewardSignals.prompts;
    if (prompts.length === 0) return null;

    // Pick a prompt — random for v1; future: bias by past performance,
    // goal balance, last-used recency.
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];

    // Pick a hero asset — biased by assetBias hint when present.
    // For now, all biases collapse to "high-quality unused asset" since we
    // don't have visual classification of proof/process/people yet. The
    // bias-aware selection is a future enhancement (#122-ish).
    const seedId = assessment.freshAssetIds[0];
    if (!seedId) return null;

    const [seed] = await sql`
      SELECT id, context_note, content_pillar, content_pillars, content_tags
      FROM media_assets
      WHERE id = ${seedId} AND site_id = ${assessment.siteId}
    `;
    if (!seed) return null;

    const pillar = (seed.content_pillar as string | null) || null;
    const bodyCandidates = pillar
      ? await sql`
          SELECT id FROM media_assets
          WHERE site_id = ${assessment.siteId}
            AND id <> ${seedId}
            AND triage_status NOT IN ('quarantined','shelved')
            AND status NOT IN ('deleted','failed')
            AND (content_pillar = ${pillar} OR ${pillar} = ANY(COALESCE(content_pillars, ARRAY[]::text[])))
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT 8
        `
      : await sql`
          SELECT id FROM media_assets
          WHERE site_id = ${assessment.siteId}
            AND id <> ${seedId}
            AND triage_status NOT IN ('quarantined','shelved')
            AND status NOT IN ('deleted','failed')
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT 8
        `;

    return {
      pool: "blog",
      siteId: assessment.siteId,
      // The prompt's framingAngle becomes the topic anchor, intent guides shape.
      topicHint: prompt.framingAngle || prompt.label,
      intent: `${prompt.intent} (Goal: ${prompt.goal}.)`,
      heroAssetId: seedId,
      seedAssetId: seedId,
      bodyAssetIds: bodyCandidates.map((r) => r.id as string),
      contentPillars: Array.isArray(seed.content_pillars)
        ? (seed.content_pillars as string[])
        : pillar ? [pillar] : [],
      contentTags: Array.isArray(seed.content_tags) ? (seed.content_tags as string[]) : [],
      status: "draft",
    };
  },
};
