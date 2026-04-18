/**
 * Migration 040: Review reply_status column + auto_drafted flag.
 * Backfills existing rows based on current state.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("040: Review enhancements...");

  await sql`ALTER TABLE inbox_reviews ADD COLUMN IF NOT EXISTS reply_status TEXT DEFAULT 'needs_reply'`;
  console.log("  + reply_status (TEXT, default 'needs_reply')");

  await sql`ALTER TABLE inbox_reviews ADD COLUMN IF NOT EXISTS auto_drafted BOOLEAN DEFAULT false`;
  console.log("  + auto_drafted (BOOLEAN)");

  // Backfill reply_status from existing state
  await sql`UPDATE inbox_reviews SET reply_status = 'replied' WHERE our_reply IS NOT NULL AND reply_status = 'needs_reply'`;
  await sql`UPDATE inbox_reviews SET reply_status = 'ignored' WHERE is_hidden = true AND our_reply IS NULL AND reply_status = 'needs_reply'`;
  await sql`UPDATE inbox_reviews SET reply_status = 'draft_ready' WHERE suggested_reply IS NOT NULL AND our_reply IS NULL AND is_hidden = false AND reply_status = 'needs_reply'`;
  console.log("  Backfilled reply_status from existing state");

  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_reviews_reply_status ON inbox_reviews(site_id, reply_status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_reviews_rating ON inbox_reviews(site_id, rating)`;
  console.log("  + indexes on reply_status and rating");

  console.log("\n040: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
