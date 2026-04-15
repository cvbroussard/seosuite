/**
 * Migration 036: Google Business Profile category index + per-site
 * category selections. The curtained categorization flow reads from
 * gbp_categories (platform-wide index, seeded separately) and writes
 * to site_gbp_categories (site's primary + additional with reasoning).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("036: Creating GBP category index + site selections...");

  // Platform-wide index of Google's official category list. Seeded
  // by scripts/seed-gbp-categories.js. gcid is Google's native ID
  // (e.g., "gcid:construction_company"). keywords holds searchable
  // synonyms for keyword-match ranking before LLM rerank.
  await sql`
    CREATE TABLE IF NOT EXISTS gbp_categories (
      gcid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_gcid TEXT,
      keywords TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_gbp_categories_parent ON gbp_categories(parent_gcid)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_gbp_categories_name ON gbp_categories(name)`;

  // One row per tenant-category binding. primary_gcid is singular
  // (Google allows only one primary); site_gbp_categories with
  // is_primary=true enforces that via a partial unique index.
  await sql`
    CREATE TABLE IF NOT EXISTS site_gbp_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      gcid TEXT NOT NULL REFERENCES gbp_categories(gcid) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      reasoning TEXT,
      confidence NUMERIC(3,2),
      chosen_at TIMESTAMPTZ DEFAULT NOW(),
      chosen_by TEXT NOT NULL DEFAULT 'auto',
      UNIQUE (site_id, gcid)
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_site_gbp_primary
    ON site_gbp_categories(site_id) WHERE is_primary
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_site_gbp_site ON site_gbp_categories(site_id)`;

  console.log("  + gbp_categories platform index");
  console.log("  + site_gbp_categories per-tenant bindings");

  const tables = await sql`
    SELECT table_name,
           (SELECT COUNT(*)::int FROM information_schema.columns
            WHERE table_name = t.table_name) AS column_count
    FROM information_schema.tables t
    WHERE table_name IN ('gbp_categories', 'site_gbp_categories')
    ORDER BY table_name
  `;
  console.log("\nVerification:");
  for (const t of tables) {
    console.log(`  ${t.table_name.padEnd(24)} ${t.column_count} columns`);
  }

  console.log("\n036: Done. Run seed-gbp-categories.js next to populate the index.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
