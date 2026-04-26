/**
 * Instant Import — orchestrator.
 *
 * One-time pull of platform-side reference data into TracPost when a
 * platform_asset is first assigned to a site. Runs as part of the
 * pipeline cron alongside engagement capture. Per-asset gate via
 * platform_assets.imported_at IS NULL.
 *
 * Phase 1a: GBP profile only.
 * Phase 1b (future): IG/FB historical media → historical_posts table.
 */
import "server-only";
import { sql } from "@/lib/db";
import { importGbpProfile } from "./gbp-profile";

interface PendingImport {
  asset_id: string;
  platform: string;
  asset_name: string;
  platform_native_id: string;
  asset_metadata: Record<string, unknown>;
  access_token_encrypted: string;
  primary_site_id: string | null;
}

async function getPendingImports(): Promise<PendingImport[]> {
  const rows = await sql`
    SELECT pa.id AS asset_id, pa.platform, pa.asset_name,
           pa.asset_id AS platform_native_id, pa.metadata AS asset_metadata,
           sa.access_token_encrypted,
           (SELECT spa.site_id FROM site_platform_assets spa
            WHERE spa.platform_asset_id = pa.id AND spa.is_primary = true
            LIMIT 1) AS primary_site_id
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE pa.imported_at IS NULL
      AND pa.health_status IN ('healthy', 'unknown')
      AND sa.status = 'active'
  `;
  return rows.map((r) => ({
    asset_id: r.asset_id as string,
    platform: r.platform as string,
    asset_name: r.asset_name as string,
    platform_native_id: r.platform_native_id as string,
    asset_metadata: (r.asset_metadata || {}) as Record<string, unknown>,
    access_token_encrypted: r.access_token_encrypted as string,
    primary_site_id: r.primary_site_id as string | null,
  }));
}

export async function runInstantImports(): Promise<{
  candidates: number;
  imported: number;
  skipped: number;
  errored: number;
  details: Array<{ asset_id: string; platform: string; outcome: string }>;
}> {
  const pending = await getPendingImports();
  let imported = 0, skipped = 0, errored = 0;
  const details: Array<{ asset_id: string; platform: string; outcome: string }> = [];

  for (const asset of pending) {
    try {
      let result: { imported: boolean; reason?: string } = { imported: false, reason: "platform not yet wired" };
      if (asset.platform === "gbp") {
        result = await importGbpProfile(asset);
      }
      // facebook + instagram + linkedin: nothing to import in Phase 1a
      // historical_posts (IG/FB media) ships in Phase 1b

      if (result.imported) {
        imported++;
        details.push({ asset_id: asset.asset_id, platform: asset.platform, outcome: "imported" });
      } else {
        skipped++;
        details.push({ asset_id: asset.asset_id, platform: asset.platform, outcome: result.reason || "skipped" });
      }
    } catch (err) {
      errored++;
      const msg = err instanceof Error ? err.message : String(err);
      details.push({ asset_id: asset.asset_id, platform: asset.platform, outcome: `error: ${msg}` });
      console.error(`Instant import failed for asset ${asset.asset_id} (${asset.platform}):`, err);
    }
  }

  return { candidates: pending.length, imported, skipped, errored, details };
}
