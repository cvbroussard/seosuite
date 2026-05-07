import { sql } from "@/lib/db";
import type { Strategy } from "../types";
import type { ContentSpec } from "../../types";

const TARGET_PILLARS = ["what", "who", "how", "craft", "proof", "design"];

/**
 * Pillar-fill strategy.
 *
 * "We're heavy on 'craft' but light on 'who'; fill the gap."
 *
 * Looks at v2 published article distribution across content pillars.
 * If coverage is uneven, picks the most-underrepresented pillar and
 * builds a ContentSpec biased toward filling it. Asset selection
 * prioritizes assets matching the gap pillar.
 */
export const pillarFillStrategy: Strategy = {
  kind: "pillar_fill",
  label: "Pillar-fill (gap-aware)",

  score(assessment) {
    if (assessment.publishedCount < 5) return 0; // need a baseline before gap-filling makes sense

    const counts = TARGET_PILLARS.map((p) => assessment.pillarCoverage[p] || 0);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max === 0) return 0;

    // Imbalance ratio: 0 = perfectly balanced, 1 = one pillar dominates
    const imbalance = (max - min) / max;
    // Scale: 0 imbalance → 0 score; 0.7+ imbalance → strong score
    return Math.min(imbalance * 0.9, 0.85);
  },

  async build(assessment): Promise<ContentSpec | null> {
    // Pick the gap pillar — lowest count among target pillars, ties
    // broken by recent-article-pillars (avoid back-to-back repetition).
    const counts = TARGET_PILLARS.map((p) => ({
      pillar: p,
      count: assessment.pillarCoverage[p] || 0,
      recentlyUsed: assessment.recentArticlePillars.includes(p),
    }));
    counts.sort((a, b) => {
      if (a.count !== b.count) return a.count - b.count;
      if (a.recentlyUsed !== b.recentlyUsed) return a.recentlyUsed ? 1 : -1;
      return 0;
    });
    const gap = counts[0]?.pillar;
    if (!gap) return null;

    // Find an unused asset matching the gap pillar.
    const usedRows = await sql`
      SELECT DISTINCT id FROM (
        SELECT seed_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${assessment.siteId} AND seed_asset_id IS NOT NULL
        UNION
        SELECT hero_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${assessment.siteId}
      ) u
    `;
    const usedIds = usedRows.map((r) => r.id as string);

    const [seed] = await sql`
      SELECT id, context_note, content_pillars, content_tags
      FROM media_assets
      WHERE site_id = ${assessment.siteId}
        AND media_type ILIKE 'image%'
        AND triage_status NOT IN ('quarantined','shelved')
        AND status NOT IN ('deleted','failed')
        AND (content_pillar = ${gap} OR ${gap} = ANY(COALESCE(content_pillars, ARRAY[]::text[])))
        AND id <> ALL(${usedIds}::uuid[])
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
      LIMIT 1
    `;
    if (!seed) return null; // no unused asset matches the gap pillar

    // Body candidates — also pillar-matched
    const bodyCandidates = await sql`
      SELECT id FROM media_assets
      WHERE site_id = ${assessment.siteId}
        AND id <> ${seed.id}
        AND triage_status NOT IN ('quarantined','shelved')
        AND status NOT IN ('deleted','failed')
        AND (content_pillar = ${gap} OR ${gap} = ANY(COALESCE(content_pillars, ARRAY[]::text[])))
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
      LIMIT 8
    `;

    return {
      pool: "blog",
      siteId: assessment.siteId,
      topicHint: (seed.context_note as string | null) || `Article focused on the "${gap}" pillar`,
      intent: `Fill the "${gap}" pillar gap — angle the article from this perspective.`,
      heroAssetId: seed.id as string,
      seedAssetId: seed.id as string,
      bodyAssetIds: bodyCandidates.map((r) => r.id as string),
      contentPillars: [gap, ...(Array.isArray(seed.content_pillars)
        ? (seed.content_pillars as string[]).filter((p) => p !== gap)
        : [])],
      contentTags: Array.isArray(seed.content_tags) ? (seed.content_tags as string[]) : [],
      status: "draft",
    };
  },
};
