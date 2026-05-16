import { sql } from "@/lib/db";

/**
 * Lightweight briefing-complete handler.
 *
 * Per the consumption-gated architecture (LOCKED 2026-05-16 via
 * project_tracpost_asset_analysis_cascade memory):
 *
 *   "Nothing can consume an unbriefed asset — not an orchestrator,
 *    not a website page, not an article, not a post. So ugly URLs
 *    prior to briefing are fine. Absence of variants prior to briefing
 *    is fine. All consumable work fires at cascade commit, not save."
 *
 * This handler USED TO do six expensive things (vision triage, R2 source
 * rename, variant cascade-delete, video poster regen, variant render,
 * cascade auto-fire). All of that moved to the cascade commit orchestrator
 * (src/lib/categorization/cascade-commit.ts) which fires when the
 * subscriber explicitly auto-tags an asset.
 *
 * What survives here:
 *   - Asset existence check
 *   - briefable_at stamp (state machine bookkeeping — the asset has
 *     received human input, even if cascade hasn't run yet)
 *   - metadata.last_briefed_at timestamp for audit
 *
 * Variant render, slug-based R2 rename, video poster regen — all live
 * in cascade-commit.ts now. Save-without-auto-tag produces an asset
 * with: transcript persisted, UUID-prefix R2 key, no variants, no
 * asset_analysis. Consumers (orchestrator, generators, etc.) gate on
 * `asset_analysis IS NOT NULL`, so they correctly ignore unbriefed assets.
 */
export async function processBriefedAsset(assetId: string): Promise<{
  ok: boolean;
}> {
  const [asset] = await sql`
    SELECT id FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) {
    console.warn(`processBriefedAsset: asset ${assetId} not found`);
    return { ok: false };
  }

  // Lightweight metadata stamp — marks that this asset has had a save
  // (subscriber clicked save with substantive content). Does NOT imply
  // the cascade has run; that's tracked separately via asset_analysis
  // IS NOT NULL.
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      last_briefed_at: new Date().toISOString(),
    })}::jsonb,
    briefable_at = COALESCE(briefable_at, NOW()),
    updated_at = NOW()
    WHERE id = ${assetId}
  `;

  return { ok: true };
}
