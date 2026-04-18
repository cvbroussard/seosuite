/**
 * Migration 043: Video pool schema — source_asset_id column + video_pool_config.
 * Promotes the parent-child relationship from JSON metadata to a proper FK.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("043: Video pool schema...");

  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS source_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL`;
  console.log("  + media_assets.source_asset_id (UUID FK)");

  await sql`CREATE INDEX IF NOT EXISTS idx_media_source_asset ON media_assets(source_asset_id) WHERE source_asset_id IS NOT NULL`;
  console.log("  + index on source_asset_id");

  // Backfill from metadata for existing AI videos
  const backfilled = await sql`
    UPDATE media_assets
    SET source_asset_id = (metadata->>'source_asset_id')::uuid
    WHERE source = 'ai_generated'
      AND media_type = 'video'
      AND metadata->>'source_asset_id' IS NOT NULL
      AND source_asset_id IS NULL
      AND EXISTS (
        SELECT 1 FROM media_assets parent
        WHERE parent.id = (metadata->>'source_asset_id')::uuid
      )
  `;
  console.log(`  Backfilled ${backfilled.length || 0} video → parent links`);

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS video_pool_config JSONB DEFAULT '{}'::jsonb`;
  console.log("  + sites.video_pool_config (JSONB)");

  console.log("\n043: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
