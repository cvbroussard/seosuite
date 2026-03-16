const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Running blog import migrations...\n");

  // 1. blog_imports table — tracks import jobs
  await sql`
    CREATE TABLE IF NOT EXISTS blog_imports (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      source_url      TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      discovered_urls JSONB DEFAULT '[]'::jsonb,
      imported_count  INTEGER DEFAULT 0,
      total_count     INTEGER DEFAULT 0,
      errors          JSONB DEFAULT '[]'::jsonb,
      current_post    TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ blog_imports table created");

  // 2. Add source column to blog_posts
  await sql`
    ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'generated'
  `;
  console.log("✓ blog_posts.source column added");

  // 3. Index for active imports
  await sql`
    CREATE INDEX IF NOT EXISTS idx_blog_imports_site
    ON blog_imports (site_id, status)
  `;
  console.log("✓ idx_blog_imports_site index");

  console.log("\n✅ Blog import migrations complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
