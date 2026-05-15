/**
 * Migration 117: Add viewport column to service_areas_canonical.
 *
 * Architecture: each service area's Place ID has a viewport (bounding
 * box). Cached at creation time — geographic boundaries rarely change,
 * so the cache is essentially permanent. Asset matching then uses
 * in-memory bounding-box containment checks: zero API calls per match,
 * microseconds per check.
 *
 * Stored shape (matches Google Places API "viewport" object):
 *   { low: { latitude, longitude }, high: { latitude, longitude } }
 *
 * Match rule: asset.gps_lat,gps_lng falls inside catalog.viewport →
 * service area auto-tag suggestion fires for that asset.
 *
 * This obviates the name-based hierarchy matching for cases like
 * "Pittsburgh Metropolitan Area" which Google's address_components
 * doesn't include for Squirrel Hill — but the metro's viewport DOES
 * contain Squirrel Hill's coords.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("117: Adding viewport column to service_areas_canonical...");
  await sql`ALTER TABLE service_areas_canonical ADD COLUMN IF NOT EXISTS viewport JSONB`;
  console.log("  + service_areas_canonical.viewport");

  // Index for "has viewport" filter used by the matcher
  await sql`CREATE INDEX IF NOT EXISTS idx_service_areas_canonical_has_viewport ON service_areas_canonical (id) WHERE viewport IS NOT NULL`;
  console.log("  + idx_service_areas_canonical_has_viewport");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'service_areas_canonical' AND column_name = 'viewport'
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
