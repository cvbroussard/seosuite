/**
 * Migration 030: Split subscribers into users + subscriptions.
 *
 * - Creates subscriptions table (billing entity)
 * - Creates users table (people who log in)
 * - Migrates data preserving UUIDs (owner subscriber.id → subscription.id AND user.id)
 * - Repoints all subscriber_id FKs → subscription_id
 * - Moves company_phone → sites.business_phone
 * - Drops subscribers and team_members
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("030: Splitting subscribers into users + subscriptions...");

  // ── Step 1: Create subscriptions table ──
  await sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan          TEXT DEFAULT 'free',
      api_key_hash  TEXT NOT NULL,
      metadata      JSONB DEFAULT '{}',
      cancelled_at  TIMESTAMPTZ,
      cancel_reason TEXT,
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  Created subscriptions table");

  // ── Step 2: Create users table ──
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id     UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      name                TEXT NOT NULL,
      email               TEXT UNIQUE,
      password_hash       TEXT,
      phone               TEXT,
      role                TEXT NOT NULL DEFAULT 'owner',
      site_id             UUID,
      session_token_hash  TEXT,
      device_token        TEXT,
      magic_token_hash    TEXT,
      magic_token_expires TIMESTAMPTZ,
      last_active_at      TIMESTAMPTZ,
      is_active           BOOLEAN DEFAULT true,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  Created users table");

  // ── Step 3: Migrate data ──
  // Owner subscribers → subscriptions (preserving UUID)
  const subs = await sql`
    INSERT INTO subscriptions (id, plan, api_key_hash, metadata, cancelled_at, cancel_reason, is_active, created_at, updated_at)
    SELECT id, plan, api_key_hash, metadata, cancelled_at, cancel_reason, is_active, created_at, updated_at
    FROM subscribers
    WHERE parent_subscriber_id IS NULL
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  console.log(`  Migrated ${subs.length} subscriptions`);

  // Owner subscribers → users (preserving UUID, subscription_id = own id)
  const owners = await sql`
    INSERT INTO users (id, subscription_id, name, email, password_hash, phone, role, site_id, session_token_hash, device_token, magic_token_hash, magic_token_expires, last_active_at, is_active, created_at, updated_at)
    SELECT id, id, name, email, password_hash, phone, role, site_id, session_token_hash, device_token, magic_token_hash, magic_token_expires, last_active_at, is_active, created_at, updated_at
    FROM subscribers
    WHERE parent_subscriber_id IS NULL
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  console.log(`  Migrated ${owners.length} owner users`);

  // Sub-subscribers → users (subscription_id = parent's id)
  const subUsers = await sql`
    INSERT INTO users (id, subscription_id, name, email, password_hash, phone, role, site_id, session_token_hash, device_token, magic_token_hash, magic_token_expires, last_active_at, is_active, created_at, updated_at)
    SELECT id, parent_subscriber_id, name, email, password_hash, phone, role, site_id, session_token_hash, device_token, magic_token_hash, magic_token_expires, last_active_at, is_active, created_at, updated_at
    FROM subscribers
    WHERE parent_subscriber_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  console.log(`  Migrated ${subUsers.length} sub-users`);

  // ── Step 4: Add subscription_id to sites, backfill, swap FK ──
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE`;
  await sql`UPDATE sites SET subscription_id = subscriber_id WHERE subscription_id IS NULL`;
  await sql`ALTER TABLE sites ALTER COLUMN subscription_id SET NOT NULL`;
  console.log("  Sites: added subscription_id, backfilled");

  // Add business_phone to sites
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS business_phone TEXT`;
  await sql`
    UPDATE sites s SET business_phone = sub.company_phone
    FROM subscribers sub
    WHERE s.subscription_id = sub.id AND sub.company_phone IS NOT NULL AND s.business_phone IS NULL
  `;
  console.log("  Sites: moved company_phone → business_phone");

  // ── Step 5: Repoint all other subscriber_id FKs ──
  const tables = [
    'social_accounts', 'usage_log', 'data_exports', 'vendors',
    'push_tokens', 'spotlight_sessions',
    'inbox_comments', 'inbox_reviews', 'inbox_messages'
  ];

  for (const table of tables) {
    try {
      // Check if column exists
      const [col] = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = 'subscriber_id'
      `;
      if (!col) {
        console.log(`  ${table}: no subscriber_id column, skipping`);
        continue;
      }

      // Add new column
      await sql`ALTER TABLE ${sql(table)} ADD COLUMN IF NOT EXISTS subscription_id UUID`;

      // Backfill
      await sql`UPDATE ${sql(table)} SET subscription_id = subscriber_id WHERE subscription_id IS NULL`;

      // Add FK constraint
      try {
        await sql`ALTER TABLE ${sql(table)} ADD CONSTRAINT ${sql(table + '_subscription_id_fkey')} FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE`;
      } catch { /* constraint may already exist */ }

      console.log(`  ${table}: added subscription_id, backfilled`);
    } catch (err) {
      console.log(`  ${table}: error — ${err.message}`);
    }
  }

  // Fix social_accounts unique index
  try {
    await sql`DROP INDEX IF EXISTS idx_social_accounts_subscriber_platform_account`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_subscription_platform_account ON social_accounts(subscription_id, platform, account_id)`;
    console.log("  social_accounts: updated unique index");
  } catch (err) {
    console.log(`  social_accounts index: ${err.message}`);
  }

  // ── Step 6: Add users FK for site_id ──
  try {
    await sql`ALTER TABLE users ADD CONSTRAINT users_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL`;
  } catch { /* may already exist */ }

  // ── Step 7: Create indexes ──
  await sql`CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_session_hash ON users(session_token_hash) WHERE session_token_hash IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_magic_token ON users(magic_token_hash) WHERE magic_token_hash IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sites_subscription ON sites(subscription_id)`;
  console.log("  Indexes created");

  // ── Step 8: Verify ──
  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM subscriptions) AS subscriptions,
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM users WHERE role = 'owner') AS owners,
      (SELECT COUNT(*)::int FROM sites) AS sites
  `;
  console.log("  Counts:", JSON.stringify(counts[0]));

  console.log("\n030: Done. subscribers and team_members tables preserved for now.");
  console.log("     Drop them manually after code migration is verified:");
  console.log("     DROP TABLE IF EXISTS team_members;");
  console.log("     DROP TABLE IF EXISTS subscribers CASCADE;");
}

migrate().catch(console.error);
