/**
 * DEPRECATED 2026-05-16 — RETIRED, throws on call.
 *
 * Per project_tracpost_asset_analysis_cascade memory, ALL briefing-time
 * heavy work (vision triage, R2 source rename, variant cascade-delete,
 * video poster regen, variant render) moved to the cascade commit
 * orchestrator (src/lib/categorization/cascade-commit.ts). That fires
 * via POST /api/assets/[id]/categorize/commit when the subscriber
 * explicitly auto-tags an asset.
 *
 * This function was kept temporarily as a no-op `briefable_at` stamp,
 * which caused a silent regression: three callers (briefing-flip PATCH,
 * upload-as-briefed POST, backfill route) still invoked it, so save
 * appeared to succeed while producing assets with no asset_analysis,
 * no slug, and no variants. The audit caught this 2026-05-16.
 *
 * Throwing is intentional — surfaces "what still calls this" at runtime
 * so each call site can be repointed at commitCascade (or removed if
 * briefing is now strictly manual). Do not restore a silent no-op.
 *
 * Known callers needing migration:
 *   - src/app/api/assets/[id]/route.ts  (briefing-flip PATCH)
 *   - src/app/api/assets/route.ts        (upload-as-briefed POST)
 *   - src/app/api/admin/backfill-pretty-urls/route.ts.disabled (already disabled)
 */
export async function processBriefedAsset(_assetId: string): Promise<{
  ok: boolean;
}> {
  throw new Error(
    "DEPRECATED 2026-05-16: processBriefedAsset is retired. Briefing-time work " +
      "moved to commitCascade (src/lib/categorization/cascade-commit.ts). " +
      "Repoint this caller to POST /api/assets/[id]/categorize/preview + commit, " +
      "or remove the call if the caller is now part of the manual-first flow.",
  );
}
