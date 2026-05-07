import { sql } from "@/lib/db";
import type { Strategy } from "../types";
import type { ContentSpec } from "../../types";

/**
 * Asset-driven strategy.
 *
 * "Great new captures came in; turn them into articles."
 * Picks an unused, high-quality image asset as the seed. The asset's
 * context_note becomes the topic hint; siblings matching its pillar
 * become body candidates the LLM may place.
 *
 * This is the workhorse strategy when the asset library has fresh
 * material. Always available if any unused assets exist (floor 0.3).
 */
export const assetDrivenStrategy: Strategy = {
  kind: "asset_driven",
  label: "Asset-driven (capture-first)",

  score(assessment) {
    if (assessment.freshAssetIds.length === 0) return 0;
    // Scale with inventory depth, capped at 0.85 so it doesn't always
    // dominate. Floor at 0.3 when ANY asset exists — there's always
    // value in surfacing real captures.
    const ratio = Math.min(assessment.freshAssetIds.length / 30, 1);
    return 0.3 + ratio * 0.55;
  },

  async build(assessment): Promise<ContentSpec | null> {
    const seedId = assessment.freshAssetIds[0];
    if (!seedId) return null;

    const [seed] = await sql`
      SELECT id, context_note, content_pillar, content_pillars, content_tags
      FROM media_assets
      WHERE id = ${seedId} AND site_id = ${assessment.siteId}
    `;
    if (!seed) return null;

    const pillar = (seed.content_pillar as string | null) || null;

    // Body candidates — pillar-matched siblings, excluding the seed itself.
    const bodyCandidates = pillar
      ? await sql`
          SELECT id FROM media_assets
          WHERE site_id = ${assessment.siteId}
            AND id <> ${seedId}
            AND triage_status NOT IN ('quarantined','shelved')
            AND status NOT IN ('deleted','failed')
            AND (content_pillar = ${pillar} OR ${pillar} = ANY(COALESCE(content_pillars, ARRAY[]::text[])))
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT 10
        `
      : await sql`
          SELECT id FROM media_assets
          WHERE site_id = ${assessment.siteId}
            AND id <> ${seedId}
            AND triage_status NOT IN ('quarantined','shelved')
            AND status NOT IN ('deleted','failed')
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT 10
        `;

    return {
      pool: "blog",
      siteId: assessment.siteId,
      topicHint: (seed.context_note as string | null) || "Recent capture from the field",
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
