/**
 * Migration 030c: Drop old tables and redundant subscriber_id columns.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("030c: Dropping old tables and redundant columns...");

  // Drop old tables
  await sql`DROP TABLE IF EXISTS team_members`;
  console.log("  Dropped team_members");

  await sql`DROP TABLE IF EXISTS subscribers CASCADE`;
  console.log("  Dropped subscribers");

  // Drop redundant subscriber_id columns from repointed tables
  const tables = [
    'sites', 'social_accounts', 'usage_log', 'data_exports', 'vendors',
    'push_tokens', 'spotlight_sessions',
    'inbox_comments', 'inbox_reviews', 'inbox_messages'
  ];

  for (const table of tables) {
    try {
      const [col] = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = 'subscriber_id'
      `;
      if (col) {
        await sql.query(`ALTER TABLE "${table}" DROP COLUMN subscriber_id`);
        console.log(`  ${table}: dropped subscriber_id`);
      }
    } catch (err) {
      console.log(`  ${table}: ${err.message}`);
    }
  }

  console.log("030c: Done.");
}

migrate().catch(console.error);
