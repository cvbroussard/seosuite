/**
 * Migration 116: Add EXIF GPS columns to media_assets.
 *
 * Architecture: every asset upload reads EXIF GPS (when present) and
 * stores lat/lng on the asset row. Downstream service area auto-tagging
 * reverse-geocodes these coordinates to a Google Place ID + hierarchy
 * and matches against the site's service area catalog (per the
 * canonical-place architecture).
 *
 * GPS is "where taken." Transcript signals "what about." Both feed the
 * service area suggestions in auto-tag with provenance badges; subscriber
 * resolves any conflict at the modal review pass (no-persist-before-save
 * invariant ensures discarding the modal discards the suggestions).
 *
 * Columns:
 *   gps_lat      — decimal degrees, -90 to 90 (north positive)
 *   gps_lng      — decimal degrees, -180 to 180 (east positive)
 *   gps_place_id — reverse-geocoded Place ID (filled async after upload).
 *                  Cached so we don't re-geocode the same coordinates per
 *                  asset render. Refreshed only when GPS values change.
 *
 * Privacy note: GPS lives in our DB only. Never exposed publicly. Only
 * the derived service area tags (which are intentional subscriber-curated
 * categories) ever surface to viewers.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("116: Adding EXIF GPS columns to media_assets...");
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION`;
  console.log("  + media_assets.gps_lat");
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION`;
  console.log("  + media_assets.gps_lng");
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS gps_place_id TEXT`;
  console.log("  + media_assets.gps_place_id");

  // Optional: index for assets-with-GPS queries (matcher pipeline scans
  // assets by site_id + has-gps for backfill or batch reverse-geocoding)
  await sql`CREATE INDEX IF NOT EXISTS idx_media_assets_gps ON media_assets (site_id) WHERE gps_lat IS NOT NULL`;
  console.log("  + idx_media_assets_gps (partial — has-gps only)");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'media_assets'
      AND column_name IN ('gps_lat', 'gps_lng', 'gps_place_id')
    ORDER BY column_name
  `;
  console.log("\n  Verified columns:");
  for (const c of cols) {
    console.log(`  ${c.column_name}  ${c.data_type}`);
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
