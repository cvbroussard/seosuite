const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 016: Hub page + RSS feeds...\n");

  // 1. Add blog_slug to sites
  await sql`
    ALTER TABLE sites ADD COLUMN IF NOT EXISTS blog_slug TEXT UNIQUE
  `;
  console.log("  + sites.blog_slug column");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sites_blog_slug ON sites(blog_slug)
  `;
  console.log("  + sites.blog_slug index");

  // 2. Backfill blog_slug for existing sites
  const sites = await sql`SELECT id, name FROM sites WHERE blog_slug IS NULL`;
  for (const site of sites) {
    const slug = slugify(site.name);
    // Avoid collisions — append short id suffix if needed
    const [existing] = await sql`SELECT id FROM sites WHERE blog_slug = ${slug} AND id != ${site.id}`;
    const finalSlug = existing ? `${slug}-${site.id.slice(0, 6)}` : slug;
    await sql`UPDATE sites SET blog_slug = ${finalSlug} WHERE id = ${site.id}`;
    console.log(`  → ${site.name} → ${finalSlug}`);
  }
  console.log(`  + Backfilled ${sites.length} site slugs`);

  // 3. Create rss_feeds table
  await sql`
    CREATE TABLE IF NOT EXISTS rss_feeds (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id      UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      feed_url     TEXT NOT NULL,
      feed_name    TEXT,
      is_active    BOOLEAN DEFAULT true,
      last_polled  TIMESTAMPTZ,
      last_item_id TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(site_id, feed_url)
    )
  `;
  console.log("  + rss_feeds table");

  await sql`CREATE INDEX IF NOT EXISTS idx_rss_feeds_site ON rss_feeds(site_id, is_active)`;
  console.log("  + rss_feeds indexes");

  console.log("\nMigration 016 complete.");
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

migrate().catch((err) => {
  console.error("Migration 016 failed:", err);
  process.exit(1);
});
