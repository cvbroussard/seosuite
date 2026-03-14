const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Running SEO Suite migrations...\n");

  // Subscribers — consumers of the service
  await sql`
    CREATE TABLE IF NOT EXISTS subscribers (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT NOT NULL,
      api_key_hash  TEXT NOT NULL UNIQUE,
      plan          TEXT DEFAULT 'free',
      is_active     BOOLEAN DEFAULT true,
      metadata      JSONB DEFAULT '{}',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ subscribers");

  // Sites — websites/storefronts being managed
  await sql`
    CREATE TABLE IF NOT EXISTS sites (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscriber_id   UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      url             TEXT,
      external_id     TEXT,
      brand_voice     JSONB DEFAULT '{}',
      metadata        JSONB DEFAULT '{}',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ sites");

  // Social accounts connected to a site
  await sql`
    CREATE TABLE IF NOT EXISTS social_accounts (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id                 UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      platform                TEXT NOT NULL,
      account_name            TEXT,
      account_id              TEXT,
      access_token_encrypted  TEXT,
      refresh_token_encrypted TEXT,
      token_expires_at        TIMESTAMPTZ,
      scopes                  TEXT[],
      status                  TEXT DEFAULT 'active',
      metadata                JSONB DEFAULT '{}',
      created_at              TIMESTAMPTZ DEFAULT NOW(),
      updated_at              TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(site_id, platform, account_id)
    )
  `;
  console.log("✓ social_accounts");

  // Scheduled/published social posts
  await sql`
    CREATE TABLE IF NOT EXISTS social_posts (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id            UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      status                TEXT DEFAULT 'draft',
      caption               TEXT,
      hashtags              TEXT[],
      media_urls            TEXT[],
      media_type            TEXT,
      link_url              TEXT,
      platform_post_id      TEXT,
      platform_post_url     TEXT,
      scheduled_at          TIMESTAMPTZ,
      published_at          TIMESTAMPTZ,
      ai_generated          BOOLEAN DEFAULT false,
      trigger_type          TEXT,
      trigger_reference_id  TEXT,
      error_message         TEXT,
      metadata              JSONB DEFAULT '{}',
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ social_posts");

  // Post performance metrics
  await sql`
    CREATE TABLE IF NOT EXISTS social_post_analytics (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id         UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      snapshot_date   DATE NOT NULL,
      impressions     INT DEFAULT 0,
      reach           INT DEFAULT 0,
      likes           INT DEFAULT 0,
      comments        INT DEFAULT 0,
      shares          INT DEFAULT 0,
      saves           INT DEFAULT 0,
      link_clicks     INT DEFAULT 0,
      video_views     INT DEFAULT 0,
      engagement_rate NUMERIC(5,4) DEFAULT 0,
      UNIQUE(post_id, snapshot_date)
    )
  `;
  console.log("✓ social_post_analytics");

  // Account-level analytics snapshots
  await sql`
    CREATE TABLE IF NOT EXISTS social_account_analytics (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id      UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      snapshot_date   DATE NOT NULL,
      followers       INT DEFAULT 0,
      follower_change INT DEFAULT 0,
      impressions     INT DEFAULT 0,
      reach           INT DEFAULT 0,
      profile_views   INT DEFAULT 0,
      website_clicks  INT DEFAULT 0,
      UNIQUE(account_id, snapshot_date)
    )
  `;
  console.log("✓ social_account_analytics");

  // Automation triggers per site
  await sql`
    CREATE TABLE IF NOT EXISTS social_triggers (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      event_type          TEXT NOT NULL,
      enabled             BOOLEAN DEFAULT true,
      platforms           TEXT[],
      requires_approval   BOOLEAN DEFAULT true,
      ai_generate         BOOLEAN DEFAULT true,
      template            TEXT,
      delay_minutes       INT DEFAULT 0,
      filters             JSONB DEFAULT '{}',
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ social_triggers");

  // Audit trail for post status changes
  await sql`
    CREATE TABLE IF NOT EXISTS social_post_history (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id     UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      action      TEXT NOT NULL,
      old_status  TEXT,
      new_status  TEXT,
      notes       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ social_post_history");

  // SEO page audits
  await sql`
    CREATE TABLE IF NOT EXISTS seo_audits (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      page_type   TEXT,
      page_id     TEXT,
      url         TEXT,
      audit_data  JSONB,
      seo_score   INT,
      issues      JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ seo_audits");

  // Generated/managed meta content
  await sql`
    CREATE TABLE IF NOT EXISTS seo_content (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      page_type         TEXT,
      page_id           TEXT,
      meta_title        TEXT,
      meta_description  TEXT,
      og_title          TEXT,
      og_description    TEXT,
      structured_data   JSONB,
      ai_provider       TEXT,
      status            TEXT DEFAULT 'draft',
      approved_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(site_id, page_type, page_id)
    )
  `;
  console.log("✓ seo_content");

  // GBP locations linked to a site
  await sql`
    CREATE TABLE IF NOT EXISTS gbp_locations (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      external_id       TEXT,
      gbp_account_id    TEXT,
      gbp_location_id   TEXT,
      sync_status       TEXT DEFAULT 'pending',
      sync_data         JSONB DEFAULT '{}',
      last_synced_at    TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ gbp_locations");

  // GBP OAuth credentials per site
  await sql`
    CREATE TABLE IF NOT EXISTS gbp_credentials (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      google_account_id TEXT,
      google_email      TEXT,
      access_token      TEXT,
      refresh_token     TEXT,
      token_expires_at  TIMESTAMPTZ,
      scopes            TEXT[],
      is_active         BOOLEAN DEFAULT true,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(site_id)
    )
  `;
  console.log("✓ gbp_credentials");

  // Service usage tracking for billing
  await sql`
    CREATE TABLE IF NOT EXISTS usage_log (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscriber_id   UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
      action          TEXT NOT NULL,
      credits_used    INT DEFAULT 1,
      metadata        JSONB DEFAULT '{}',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ usage_log");

  // Media assets uploaded via mobile capture
  await sql`
    CREATE TABLE IF NOT EXISTS media_assets (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      storage_url     TEXT NOT NULL,
      media_type      TEXT NOT NULL,
      context_note    TEXT,
      transcription   TEXT,
      status          TEXT DEFAULT 'pending',
      metadata        JSONB DEFAULT '{}',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ media_assets");

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_sites_subscriber ON sites(subscriber_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_social_accounts_site ON social_accounts(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_social_posts_account ON social_posts(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status, scheduled_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_seo_audits_site ON seo_audits(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_seo_content_site ON seo_content(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_gbp_locations_site ON gbp_locations(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_log_subscriber ON usage_log(subscriber_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_assets_site ON media_assets(site_id, status)`;
  console.log("✓ indexes");

  console.log("\n✅ All migrations complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
