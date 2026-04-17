/**
 * Migration 039: Quality gates + quarantine support.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("039: Quality gates + quarantine...");

  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS gate_flags JSONB DEFAULT '[]'::jsonb`;
  console.log("  + media_assets.gate_flags (JSONB)");

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'media_assets' AND column_name = 'gate_flags'
  `;
  console.log("  Verified:", cols.length > 0 ? "yes" : "MISSING");

  console.log("\n039: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
