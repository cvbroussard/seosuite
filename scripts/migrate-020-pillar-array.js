const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 020: Convert media_assets.content_pillar to array...\n");

  // Add new array column
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS content_pillars TEXT[]`;
  console.log("  + Added content_pillars TEXT[] column");

  // Migrate existing data
  await sql`
    UPDATE media_assets
    SET content_pillars = ARRAY[content_pillar]
    WHERE content_pillar IS NOT NULL AND content_pillars IS NULL
  `;
  console.log("  + Migrated existing pillar values to array");

  // Keep old column for now (backward compat during transition)
  console.log("  ! Old content_pillar column preserved (drop later)");

  console.log("\nMigration 020 complete.");
}

migrate().catch((err) => {
  console.error("Migration 020 failed:", err);
  process.exit(1);
});
