/**
 * Migration 134: Formalize the media_assets processing state model — values + constraints.
 *
 * Part 1 of 2. This migration remaps the values, enforces the enum, and
 * drops the dead `status` column. The column KEEPS its old name
 * `triage_status` here — the cosmetic rename to `processing_stage` is
 * migration 135, so the code sweep can be split into a reviewable
 * behavioral commit and a mechanical rename commit.
 *
 * Audit (2026-05-20):
 *   - media_assets.status was dead: all 693 rows 'pending', never
 *     written by any code path. ~17 query filters referenced it as
 *     `status NOT IN ('deleted','failed')` — every one a no-op.
 *   - triage_status commingled two axes: processing progression AND
 *     utilization (scheduled/consumed). Utilization is now a derived
 *     history (Option B), not a status value.
 *
 * New 5-value model (the enum is the enforced source of truth):
 *   uploaded   — baseline processing in progress (HEIC/poster/EXIF/R2)
 *   onboarded  — baseline done, awaiting human briefing
 *   briefed    — transcription saved
 *   analyzed   — cascade committed (asset_analysis populated) — consumable
 *   failed     — terminal: baseline processing gave up
 *
 * Liveness stays orthogonal on archived_at. Failure detail lives in
 * metadata.failure.{code,detail,at} (no schema — JSONB convention).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("134: Formalizing media_assets processing state...");

  // 1. Remap legacy values to the new 5-value model.
  //    asset_analysis present wins — those assets are genuinely analyzed.
  //    triaged/scheduled have narrative but no cascade → briefed.
  //    pending_briefing/received/flagged/shelved → onboarded (re-flow).
  const remap = await sql`
    UPDATE media_assets SET triage_status = CASE
      WHEN asset_analysis IS NOT NULL                               THEN 'analyzed'
      WHEN triage_status IN ('triaged','scheduled')                 THEN 'briefed'
      WHEN triage_status IN ('pending_briefing','received','flagged','shelved') THEN 'onboarded'
      ELSE 'onboarded'
    END
    RETURNING id
  `;
  console.log(`  + remapped ${remap.length} rows to the 5-value model`);

  // 2. Constrain — the enum becomes the enforced source of truth.
  await sql`ALTER TABLE media_assets ALTER COLUMN triage_status SET DEFAULT 'uploaded'`;
  console.log("  + default → 'uploaded'");

  await sql`ALTER TABLE media_assets ALTER COLUMN triage_status SET NOT NULL`;
  console.log("  + NOT NULL");

  await sql`ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_triage_status_check`;
  await sql`
    ALTER TABLE media_assets
    ADD CONSTRAINT media_assets_triage_status_check
    CHECK (triage_status IN ('uploaded','onboarded','briefed','analyzed','failed'))
  `;
  console.log("  + CHECK constraint (uploaded/onboarded/briefed/analyzed/failed)");

  // 3. Drop the dead field.
  await sql`ALTER TABLE media_assets DROP COLUMN IF EXISTS status`;
  console.log("  + dropped dead column media_assets.status");

  // Distribution check
  const dist = await sql`
    SELECT triage_status, COUNT(*)::int AS n FROM media_assets GROUP BY triage_status ORDER BY n DESC
  `;
  console.log("\n  media_assets processing-stage distribution:");
  for (const r of dist) console.log(`    ${r.triage_status}: ${r.n}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
