/**
 * Scene Composition: add media_assets.scene_types TEXT[] column + backfill
 * from the legacy single-string ai_analysis.scene_type vocabulary.
 *
 * Per the AI tagging rebuild (LOCKED 2026-05-09): scene_type moves from a
 * single AI-only field on ai_analysis to a subscriber-controlled multi-array
 * column on media_assets, mirroring how content_pillars works. The new
 * vocabulary is composition-focused (wide_shot / close_up / in_progress /
 * people / before / after / documentation / lifestyle), defined in
 * src/lib/scene-types.ts.
 *
 * Backfill mapping (legacy → new):
 *   environment → [wide_shot]
 *   method      → [in_progress]
 *   product     → [after, close_up]
 *   humans      → [people]
 *   region      → [wide_shot]
 *
 * Run: node scripts/migrate-104-scene-types-array.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const LEGACY_MAP = {
  environment: ["wide_shot"],
  method: ["in_progress"],
  product: ["after", "close_up"],
  humans: ["people"],
  region: ["wide_shot"],
};

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Adding media_assets.scene_types column...");

  await sql`
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS scene_types TEXT[] DEFAULT NULL
  `;
  console.log("  ✓ media_assets.scene_types column added");

  // Backfill from legacy ai_analysis->>'scene_type'
  console.log("Backfilling from legacy ai_analysis.scene_type...");
  let totalBackfilled = 0;
  for (const [legacyValue, newArray] of Object.entries(LEGACY_MAP)) {
    const result = await sql`
      UPDATE media_assets
      SET scene_types = ${newArray}
      WHERE scene_types IS NULL
        AND ai_analysis->>'scene_type' = ${legacyValue}
    `;
    console.log(`  ✓ ${legacyValue} → ${JSON.stringify(newArray)} (${result.count ?? "?"} rows)`);
    totalBackfilled += result.count || 0;
  }
  console.log(`  Total backfilled: ${totalBackfilled}`);

  // Verify
  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE scene_types IS NOT NULL)::int AS with_scene_types,
      COUNT(*) FILTER (WHERE scene_types IS NULL AND triage_status = 'triaged')::int AS triaged_without,
      COUNT(*)::int AS total
    FROM media_assets
    WHERE archived_at IS NULL
  `;
  console.log(
    `  ✓ verify: ${counts.with_scene_types} have scene_types / ${counts.triaged_without} triaged without / ${counts.total} active`,
  );
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
