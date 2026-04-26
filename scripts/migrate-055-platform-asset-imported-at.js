/**
 * Migration 055: platform_assets.imported_at
 *
 * Tracks whether a one-time import has run for an asset (currently used for
 * GBP profile import; will extend to historical_posts media import in
 * Phase 1b). NULL = not yet imported. Set after a successful import.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("055: platform_assets.imported_at...");

  await sql`
    ALTER TABLE platform_assets
    ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ
  `;
  console.log("  + imported_at TIMESTAMPTZ (nullable)");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_platform_assets_pending_import
    ON platform_assets(platform) WHERE imported_at IS NULL
  `;
  console.log("  + idx_platform_assets_pending_import (partial)");

  console.log("Done.");
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
