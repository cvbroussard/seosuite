/**
 * Migration 046: Page scores table for PageSpeed Insights results.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("046: Page scores table...");

  await sql`
    CREATE TABLE IF NOT EXISTS page_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      performance INTEGER,
      seo INTEGER,
      accessibility INTEGER,
      best_practices INTEGER,
      audits JSONB DEFAULT '[]'::jsonb,
      scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(site_id, url)
    )
  `;
  console.log("  + page_scores table");

  await sql`CREATE INDEX IF NOT EXISTS idx_page_scores_site ON page_scores(site_id)`;
  console.log("  + index on site_id");

  console.log("\n046: Done.");
}

migrate().catch((err) => { console.error(err); process.exit(1); });
