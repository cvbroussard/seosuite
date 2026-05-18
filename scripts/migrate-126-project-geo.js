/**
 * Migration 126: Add geo columns to projects for GPS-based asset matching.
 *
 * Projects gain a Google Place ID + lat/lng. Subscriber sets the project's
 * address via the LocationPicker on create/edit; the API enriches via
 * Google Places to populate place_id + gps_lat + gps_lng on the row.
 *
 * The project matcher (project-match.ts) gains a geo pass: assets whose
 * gps_lat/gps_lng fall within a hardcoded 200m radius of a project's
 * center surface as `matched_by_geo` candidates in the analyzer JSON.
 * Subscriber confirms via manual binding.
 *
 * 200m geofence is intentionally generous — designed to compensate for
 * typical GPS precision (5-10m outdoors, 20-100m indoors). False
 * positives (neighbors) are surfaced as candidates, not auto-bound; the
 * subscriber resolves ambiguity. See discussion 2026-05-18.
 *
 * Future: per-project radius column if subscribers need tighter (precise
 * lots) or wider (sprawling sites) geofences. Hardcoded for v1.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("126: Adding geo columns to projects...");
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS place_id TEXT`;
  console.log("  + projects.place_id");
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS gps_lat NUMERIC`;
  console.log("  + projects.gps_lat");
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS gps_lng NUMERIC`;
  console.log("  + projects.gps_lng");

  // Partial index for the matcher: filter to "projects that participate
  // in geo-matching" without scanning the whole table.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_projects_has_geo
    ON projects (site_id) WHERE gps_lat IS NOT NULL
  `;
  console.log("  + idx_projects_has_geo");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'projects'
      AND column_name IN ('place_id', 'gps_lat', 'gps_lng')
    ORDER BY column_name
  `;
  console.log("\n  Verified:");
  for (const c of cols) {
    console.log(`  ${c.column_name}  ${c.data_type}`);
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
