const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 013: Post analytics...\n");

  await sql`
    CREATE TABLE IF NOT EXISTS post_analytics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      likes INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      saves INTEGER DEFAULT 0,
      reach INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      engagement_rate NUMERIC(5,2),
      raw_data JSONB DEFAULT '{}',
      UNIQUE(post_id, collected_at)
    )
  `;
  console.log("  + post_analytics table");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_post_analytics_post
    ON post_analytics(post_id, collected_at DESC)
  `;
  console.log("  + idx_post_analytics_post index");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_post_analytics_site
    ON post_analytics(platform, collected_at DESC)
  `;
  console.log("  + idx_post_analytics_site index");

  console.log("\nMigration 013 complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
