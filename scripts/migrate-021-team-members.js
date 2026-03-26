const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 021: Team members + mobile app settings...\n");

  // 1. Team members table
  await sql`
    CREATE TABLE IF NOT EXISTS team_members (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscriber_id         UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      site_id               UUID REFERENCES sites(id) ON DELETE CASCADE,
      name                  TEXT NOT NULL,
      email                 TEXT,
      phone                 TEXT,
      role                  TEXT NOT NULL,
      invite_token          TEXT UNIQUE,
      invite_method         TEXT,
      invite_expires        TIMESTAMPTZ,
      invite_consumed       BOOLEAN DEFAULT false,
      device_token          TEXT,
      session_token_hash    TEXT UNIQUE,
      session_issued_at     TIMESTAMPTZ,
      last_active_at        TIMESTAMPTZ,
      is_active             BOOLEAN DEFAULT true,
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  + team_members table");

  await sql`CREATE INDEX IF NOT EXISTS idx_team_members_subscriber ON team_members(subscriber_id, is_active)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_team_members_session ON team_members(session_token_hash) WHERE session_token_hash IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_team_members_invite ON team_members(invite_token) WHERE invite_token IS NOT NULL`;
  console.log("  + team_members indexes");

  // 2. Mobile app settings on sites (shared V1 — all users same settings)
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS mobile_settings JSONB DEFAULT '{}'`;
  console.log("  + sites.mobile_settings column");

  console.log("\nMigration 021 complete.");
}

migrate().catch((err) => {
  console.error("Migration 021 failed:", err);
  process.exit(1);
});
