/**
 * Add provenance fields to brands + site_service_areas for the
 * audio-first auto-tagging pipelines (#201, #203).
 *
 * Per provenance-play-by-play (held in conversation, applies per
 * seed_and_enrich_principle): every entity row should track WHERE it
 * came from (transcript, typed entry, operator add) so future sessions
 * can reason about quality + provenance.
 *
 * Beta-pragmatic: skip authorized_by/verified_by FKs and field-level
 * provenance jsonb. Add when polish pass lands.
 *
 * Run: node scripts/migrate-111-tagging-provenance.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  const tables = ["brands", "site_service_areas"];
  for (const t of tables) {
    console.log(`Adding provenance fields to ${t}...`);
    await sql.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS seed_source TEXT`);
    await sql.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS seed_recording_id UUID REFERENCES recordings(id) ON DELETE SET NULL`);
    await sql.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS seed_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL`);
    await sql.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ`);
    await sql.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending'`);
    await sql.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS enrichment_attempts INTEGER NOT NULL DEFAULT 0`);
    await sql.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS enrichment_metadata JSONB NOT NULL DEFAULT '{}'::jsonb`);
    console.log(`  ✓ ${t} provenance fields added`);
  }

  console.log("\nVerification:");
  for (const t of tables) {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = ${t}
        AND column_name IN ('seed_source','seed_recording_id','seed_asset_id','authorized_at','enrichment_status','enrichment_attempts','enrichment_metadata')
      ORDER BY column_name
    `;
    console.log(`  ${t}: ${cols.map((c) => c.column_name).join(", ")}`);
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
