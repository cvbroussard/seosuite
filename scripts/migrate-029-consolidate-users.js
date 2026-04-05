/**
 * Migration 029: Consolidate team_members into subscribers table.
 *
 * Adds role, parent_subscriber_id, phone, device auth columns to subscribers.
 * Backfills from metadata and team_members.
 * Does NOT drop team_members yet — code migration happens first.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("029: Consolidating users...");

  // 1. Add columns to subscribers
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'`;
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS parent_subscriber_id UUID REFERENCES subscribers(id) ON DELETE CASCADE`;
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS device_token TEXT`;
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS session_token_hash TEXT`;
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS session_issued_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS magic_token_hash TEXT`;
  await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS magic_token_expires TIMESTAMPTZ`;
  console.log("  Columns added");

  // 2. Backfill parent_subscriber_id and role from metadata
  const backfilled = await sql`
    UPDATE subscribers
    SET parent_subscriber_id = (metadata->>'parent_subscriber_id')::uuid,
        role = COALESCE(metadata->>'role', 'owner')
    WHERE metadata->>'parent_subscriber_id' IS NOT NULL
      AND parent_subscriber_id IS NULL
    RETURNING id, name, role
  `;
  console.log(`  Backfilled ${backfilled.length} sub-subscribers from metadata`);

  // 3. Backfill device fields from team_members (owner entries)
  const ownerBackfill = await sql`
    UPDATE subscribers s
    SET phone = COALESCE(s.phone, tm.phone),
        device_token = COALESCE(s.device_token, tm.device_token),
        session_token_hash = COALESCE(s.session_token_hash, tm.session_token_hash),
        last_active_at = COALESCE(s.last_active_at, tm.last_active_at)
    FROM team_members tm
    WHERE tm.subscriber_id = s.id
      AND tm.role = 'owner'
      AND s.parent_subscriber_id IS NULL
      AND (tm.session_token_hash IS NOT NULL OR tm.phone IS NOT NULL)
    RETURNING s.id, s.name
  `;
  console.log(`  Backfilled ${ownerBackfill.length} owner device fields`);

  // 4. Backfill device fields for sub-subscribers from their team_member counterparts
  const subBackfill = await sql`
    UPDATE subscribers s
    SET phone = COALESCE(s.phone, tm.phone),
        device_token = COALESCE(s.device_token, tm.device_token),
        session_token_hash = COALESCE(s.session_token_hash, tm.session_token_hash),
        site_id = COALESCE(s.site_id, tm.site_id),
        last_active_at = COALESCE(s.last_active_at, tm.last_active_at)
    FROM team_members tm
    WHERE tm.subscriber_id = s.parent_subscriber_id
      AND LOWER(tm.name) = LOWER(s.name)
      AND s.parent_subscriber_id IS NOT NULL
      AND (tm.session_token_hash IS NOT NULL OR tm.phone IS NOT NULL)
    RETURNING s.id, s.name
  `;
  console.log(`  Backfilled ${subBackfill.length} sub-subscriber device fields`);

  // 5. Rename engagement → manager
  const renamed = await sql`
    UPDATE subscribers SET role = 'manager' WHERE role = 'engagement' RETURNING id
  `;
  console.log(`  Renamed ${renamed.length} engagement → manager`);

  // 6. Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_subscribers_parent ON subscribers(parent_subscriber_id) WHERE parent_subscriber_id IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_session_hash ON subscribers(session_token_hash) WHERE session_token_hash IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_magic_token ON subscribers(magic_token_hash) WHERE magic_token_hash IS NOT NULL`;
  console.log("  Indexes created");

  // Verify
  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM subscribers) AS total_subscribers,
      (SELECT COUNT(*)::int FROM subscribers WHERE parent_subscriber_id IS NOT NULL) AS sub_subscribers,
      (SELECT COUNT(*)::int FROM subscribers WHERE role = 'owner') AS owners,
      (SELECT COUNT(*)::int FROM subscribers WHERE role = 'manager') AS managers,
      (SELECT COUNT(*)::int FROM subscribers WHERE role = 'capture') AS captures,
      (SELECT COUNT(*)::int FROM team_members) AS team_members
  `;
  console.log("  Counts:", JSON.stringify(counts[0]));

  console.log("029: Done. team_members table preserved — drop after code migration.");
}

migrate().catch(console.error);
