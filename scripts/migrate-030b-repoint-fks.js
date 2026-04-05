/**
 * Migration 030b: Repoint subscriber_id → subscription_id on all dependent tables.
 * Run after 030 which created the subscriptions + users tables.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("030b: Repointing subscriber_id → subscription_id on dependent tables...");

  // social_accounts
  await repoint(sql, "social_accounts");
  try {
    await sql`DROP INDEX IF EXISTS idx_social_accounts_subscriber_platform_account`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_subscription_platform_account ON social_accounts(subscription_id, platform, account_id)`;
    console.log("  social_accounts: updated unique index");
  } catch (err) { console.log(`  social_accounts index: ${err.message}`); }

  // All other tables
  await repoint(sql, "usage_log");
  await repoint(sql, "data_exports");
  await repoint(sql, "vendors");
  await repoint(sql, "push_tokens");
  await repoint(sql, "spotlight_sessions");
  await repoint(sql, "inbox_comments");
  await repoint(sql, "inbox_reviews");
  await repoint(sql, "inbox_messages");

  console.log("030b: Done.");
}

async function repoint(sql, table) {
  try {
    // Check if subscriber_id exists
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = 'subscriber_id'
    `;
    if (cols.length === 0) {
      console.log(`  ${table}: no subscriber_id, skipping`);
      return;
    }

    // Check if subscription_id already exists
    const existing = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = 'subscription_id'
    `;

    if (existing.length === 0) {
      // Use raw query for ALTER TABLE with dynamic table name
      await sql.query(`ALTER TABLE "${table}" ADD COLUMN subscription_id UUID`);
    }

    // Backfill
    await sql.query(`UPDATE "${table}" SET subscription_id = subscriber_id WHERE subscription_id IS NULL`);

    // Add FK
    try {
      await sql.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE`);
    } catch { /* already exists */ }

    console.log(`  ${table}: subscription_id added and backfilled`);
  } catch (err) {
    console.log(`  ${table}: error — ${err.message}`);
  }
}

migrate().catch(console.error);
