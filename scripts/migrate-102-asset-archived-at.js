/**
 * Asset soft-delete: add media_assets.archived_at column.
 *
 * Per project_tracpost_deletion_policy.md (LOCKED 2026-05-08):
 * subscribers cannot hard-delete assets. Delete = archive (set
 * archived_at = NOW()). Library + orchestrator pool + Compose pickers
 * filter `archived_at IS NULL`. Everything persists until subscription
 * cancellation + retention expiry, then a wipe sweep removes bytes.
 *
 * NULL = active. Non-null timestamp = archived (subscriber clicked
 * "Archive"). Index on archived_at for fast filter.
 *
 * Run: node scripts/migrate-102-asset-archived-at.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Adding media_assets.archived_at column...");

  await sql`
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL
  `;
  console.log("  ✓ media_assets.archived_at column added");

  // Index for the IS NULL filter that runs on most asset queries
  await sql`
    CREATE INDEX IF NOT EXISTS idx_media_assets_active
      ON media_assets (site_id, archived_at)
      WHERE archived_at IS NULL
  `;
  console.log("  ✓ idx_media_assets_active partial index created");

  console.log("");
  console.log("Migration 102 complete.");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
