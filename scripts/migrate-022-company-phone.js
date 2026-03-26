const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 022: Company phone on subscribers...\n");

  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS company_phone TEXT`;
  console.log("  + subscribers.company_phone column");

  console.log("\nMigration 022 complete.");
}

migrate().catch((err) => {
  console.error("Migration 022 failed:", err);
  process.exit(1);
});
