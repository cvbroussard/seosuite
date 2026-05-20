/**
 * Migration 135: Rename media_assets.triage_status → processing_stage.
 *
 * Part 2 of 2. Migration 134 remapped the values + added the CHECK
 * constraint + dropped the dead `status` column, keeping the column
 * named `triage_status` so the code sweep could split into a reviewable
 * behavioral commit and this mechanical rename.
 *
 * "triage_status" was a fossil name — triage was the early-pipeline
 * sorting step, but the field grew to track the whole preparation
 * pipeline (uploaded → onboarded → briefed → analyzed). The honest name
 * is `processing_stage`.
 *
 * Run AFTER migration 134, coordinated with the Commit-2 code deploy.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("135: Renaming triage_status → processing_stage...");

  await sql`ALTER TABLE media_assets RENAME COLUMN triage_status TO processing_stage`;
  console.log("  + column renamed");

  await sql`
    ALTER TABLE media_assets
    RENAME CONSTRAINT media_assets_triage_status_check
    TO media_assets_processing_stage_check
  `;
  console.log("  + CHECK constraint renamed");

  const dist = await sql`
    SELECT processing_stage, COUNT(*)::int AS n
    FROM media_assets GROUP BY processing_stage ORDER BY n DESC
  `;
  console.log("\n  media_assets.processing_stage distribution:");
  for (const r of dist) console.log(`    ${r.processing_stage}: ${r.n}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
