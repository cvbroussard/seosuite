/**
 * Migration 056: historical_posts
 *
 * Pulled-content table for IG/FB/GBP posts and photos. Architecturally
 * separate from media_assets so the publisher cannot accidentally
 * republish pulled content. Used for: brand-DNA derivation, marketing
 * site reference (operator-curated), CRM context, customer relationship
 * timeline.
 *
 * Storage_url points to our R2 copy (rehosted, since IG/FB CDN URLs
 * expire). Original metadata preserved in metadata JSONB.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("056: historical_posts...");

  await sql`
    CREATE TABLE IF NOT EXISTS historical_posts (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id          UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      site_id                  UUID REFERENCES sites(id) ON DELETE SET NULL,
      platform_asset_id        UUID REFERENCES platform_assets(id) ON DELETE SET NULL,
      platform                 TEXT NOT NULL,
      source_platform_id       TEXT NOT NULL,
      post_type                TEXT NOT NULL,
      caption                  TEXT,
      source_url               TEXT,
      storage_url              TEXT NOT NULL,
      thumbnail_url            TEXT,
      posted_at                TIMESTAMPTZ,
      like_count               INTEGER,
      comment_count            INTEGER,
      width                    INTEGER,
      height                   INTEGER,
      duration_ms              INTEGER,
      metadata                 JSONB NOT NULL DEFAULT '{}',
      imported_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      hidden_at                TIMESTAMPTZ,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (platform, source_platform_id)
    )
  `;
  console.log("  + historical_posts");

  await sql`CREATE INDEX IF NOT EXISTS idx_historical_posts_site_time ON historical_posts(site_id, posted_at DESC NULLS LAST) WHERE hidden_at IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_historical_posts_subscription ON historical_posts(subscription_id, posted_at DESC NULLS LAST)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_historical_posts_asset ON historical_posts(platform_asset_id)`;
  console.log("  + 3 indexes");

  console.log("Done.");
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
