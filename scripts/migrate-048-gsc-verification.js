/**
 * Migration 048: GSC verification token column on sites.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("048: GSC verification token...");
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS gsc_verification_token TEXT`;
  console.log("  + sites.gsc_verification_token");
  console.log("\n048: Done.");
}

migrate().catch((err) => { console.error(err); process.exit(1); });
