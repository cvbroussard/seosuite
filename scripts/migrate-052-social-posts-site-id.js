/**
 * Migration 052: Add site_id to social_posts.
 *
 * The publisher refactor (platform_assets model) made site_social_links an
 * optional path — new posts route via site_platform_assets instead. Queries
 * that need "all posts for this site" can no longer reliably JOIN through
 * either single relationship.
 *
 * Adding social_posts.site_id makes the relationship direct and lets all
 * downstream queries (Unipost, calendar, analytics) read posts by site
 * regardless of which assignment path created them.
 *
 * Backfill: derive site_id from existing site_social_links for legacy posts.
 * For posts created via the new model, the publisher will populate site_id
 * directly going forward.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("052: social_posts.site_id...");

  await sql`
    ALTER TABLE social_posts
    ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE
  `;
  console.log("  + site_id column");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_social_posts_site
    ON social_posts(site_id, status, published_at DESC)
  `;
  console.log("  + idx_social_posts_site");

  // Backfill from site_social_links — picks the first matching site
  // for each post via its account.
  const result = await sql`
    UPDATE social_posts sp
    SET site_id = (
      SELECT ssl.site_id
      FROM site_social_links ssl
      WHERE ssl.social_account_id = sp.account_id
      LIMIT 1
    )
    WHERE sp.site_id IS NULL
  `;
  console.log("  ~ backfilled from site_social_links");

  // Also backfill from site_platform_assets for new-model posts that
  // were created before site_id existed (just the recent test posts).
  await sql`
    UPDATE social_posts sp
    SET site_id = (
      SELECT spa.site_id
      FROM site_platform_assets spa
      JOIN platform_assets pa ON pa.id = spa.platform_asset_id
      WHERE pa.social_account_id = sp.account_id
        AND spa.is_primary = true
      LIMIT 1
    )
    WHERE sp.site_id IS NULL
  `;
  console.log("  ~ backfilled from site_platform_assets");

  console.log("Done.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
