const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 015: Spotlight tables...\n");

  // 1. spotlight_sessions
  await sql`
    CREATE TABLE IF NOT EXISTS spotlight_sessions (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id               UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      subscriber_id         UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      status                TEXT DEFAULT 'waiting',
      session_code          TEXT NOT NULL UNIQUE,
      photo_url             TEXT,
      photo_key             TEXT,
      staff_note            TEXT,
      customer_name         TEXT,
      customer_email        TEXT,
      star_rating           INTEGER,
      review_text           TEXT,
      customer_social_opt_in BOOLEAN DEFAULT false,
      google_review_opened  BOOLEAN DEFAULT false,
      google_review_url     TEXT,
      social_post_id        UUID REFERENCES social_posts(id) ON DELETE SET NULL,
      caption               TEXT,
      reward_type           TEXT,
      reward_code           TEXT,
      photo_consent         BOOLEAN DEFAULT false,
      consent_at            TIMESTAMPTZ,
      captured_at           TIMESTAMPTZ,
      customer_started_at   TIMESTAMPTZ,
      completed_at          TIMESTAMPTZ,
      expires_at            TIMESTAMPTZ NOT NULL,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  + spotlight_sessions table");

  await sql`CREATE INDEX IF NOT EXISTS idx_spotlight_sessions_code ON spotlight_sessions(session_code) WHERE status IN ('waiting', 'active')`;
  await sql`CREATE INDEX IF NOT EXISTS idx_spotlight_sessions_site ON spotlight_sessions(site_id, status, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_spotlight_sessions_subscriber ON spotlight_sessions(subscriber_id, created_at DESC)`;
  console.log("  + spotlight_sessions indexes");

  // 2. spotlight_kiosks
  await sql`
    CREATE TABLE IF NOT EXISTS spotlight_kiosks (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      kiosk_token     TEXT NOT NULL UNIQUE,
      is_active       BOOLEAN DEFAULT true,
      settings        JSONB DEFAULT '{}',
      last_seen_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  + spotlight_kiosks table");

  await sql`CREATE INDEX IF NOT EXISTS idx_spotlight_kiosks_site ON spotlight_kiosks(site_id, is_active)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_spotlight_kiosks_token ON spotlight_kiosks(kiosk_token)`;
  console.log("  + spotlight_kiosks indexes");

  // 3. spotlight_analytics
  await sql`
    CREATE TABLE IF NOT EXISTS spotlight_analytics (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id      UUID NOT NULL REFERENCES spotlight_sessions(id) ON DELETE CASCADE,
      site_id         UUID NOT NULL,
      event           TEXT NOT NULL,
      metadata        JSONB DEFAULT '{}',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  + spotlight_analytics table");

  await sql`CREATE INDEX IF NOT EXISTS idx_spotlight_analytics_site ON spotlight_analytics(site_id, event, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_spotlight_analytics_session ON spotlight_analytics(session_id)`;
  console.log("  + spotlight_analytics indexes");

  console.log("\nMigration 015 complete.");
}

migrate().catch((err) => {
  console.error("Migration 015 failed:", err);
  process.exit(1);
});
