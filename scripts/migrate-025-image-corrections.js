/**
 * Migration 025: Image corrections table + ensure blog_posts.metadata
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 025: Image corrections...");

  await sql`
    CREATE TABLE IF NOT EXISTS image_corrections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      entity_key TEXT NOT NULL,
      correction TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(site_id, entity_key, correction)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_image_corrections_site ON image_corrections(site_id)`;
  console.log("  ✓ image_corrections table created");

  await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`;
  console.log("  ✓ blog_posts.metadata ensured");

  console.log("Migration 025 complete.");
}

migrate().catch(console.error);
