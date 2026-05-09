/**
 * Asset prep flag: add media_assets.briefable_at column.
 *
 * Per the upload-pipeline cleanup (2026-05-09): HEIC conversion + video
 * poster generation moved out of pipeline/process into upload POST waitUntil.
 * Both produce the artifact a subscriber needs in order to brief the asset
 * (a viewable preview). This timestamp marks "asset is ready for the
 * subscriber to brief."
 *
 * NULL = still preparing (HEIC pending convert, video pending poster).
 * Non-null timestamp = ready (subscriber can open modal + save briefing).
 *
 * Backfill: existing assets that already have a viewable storage_url get
 * NOW() — they're effectively prepared. HEICs that weren't converted yet
 * get NULL so the next pipeline tick (or a manual run) can pick them up.
 *
 * Run: node scripts/migrate-103-asset-briefable-at.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Adding media_assets.briefable_at column...");

  await sql`
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS briefable_at TIMESTAMPTZ NULL
  `;
  console.log("  ✓ media_assets.briefable_at column added");

  // Backfill: anything that doesn't end in .heic/.heif AND isn't a video
  // missing a poster is briefable. Also: anything already triaged is
  // implicitly briefable (it had to be in order to be triaged).
  const backfillResult = await sql`
    UPDATE media_assets
    SET briefable_at = COALESCE(triaged_at, created_at)
    WHERE briefable_at IS NULL
      AND (
        triage_status NOT IN ('pending_briefing')
        OR (
          NOT (storage_url ILIKE '%.heic' OR storage_url ILIKE '%.heif')
          AND NOT (media_type ILIKE 'video%' AND poster_asset_id IS NULL)
        )
      )
  `;
  console.log(`  ✓ backfilled ${backfillResult.count ?? "?"} existing assets as briefable`);

  // Index for the IS NULL filter (operator queries / library badges)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_media_assets_briefable_at_null
    ON media_assets (site_id, created_at DESC)
    WHERE briefable_at IS NULL AND archived_at IS NULL
  `;
  console.log("  ✓ partial index created (preparing assets, per site)");

  // Verify
  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE briefable_at IS NOT NULL)::int AS ready,
      COUNT(*) FILTER (WHERE briefable_at IS NULL AND archived_at IS NULL)::int AS preparing,
      COUNT(*)::int AS total
    FROM media_assets
  `;
  console.log(
    `  ✓ verify: ${counts.ready} ready / ${counts.preparing} preparing / ${counts.total} total`,
  );
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
