/**
 * Migration 127: Add `assigned_by` provenance to asset_brands + asset_projects.
 *
 * Mirrors the asset_categories.assigned_by pattern. Lets commitCascade
 * destructively replace algorithmic ('auto') links on re-analyze while
 * preserving subscriber/operator manual assignments.
 *
 * The autopilot mental model demands this: a cron-fired re-analysis is
 * the source of truth for what an asset depicts. Without provenance, the
 * matcher can only INSERT ... ON CONFLICT DO NOTHING — meaning stale
 * links from prior runs accumulate forever. With provenance, we can
 * DELETE WHERE assigned_by = 'auto' before re-inserting matched
 * candidates, and subscriber-promoted entries survive.
 *
 * Default for existing rows: 'subscriber'. Safe — won't get wiped on
 * next analyze. New cascade inserts stamp 'auto'; approval-card
 * promotions stamp 'subscriber'; explicit tag-UI assignments preserve
 * their existing path. Existing legacy paths (geo-match.ts upload-time,
 * pdf-process.ts, etc.) get audited in a follow-up so their inserts
 * carry the right provenance.
 *
 * See 2026-05-18 destructive-replace discussion.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("127: Adding assigned_by provenance to asset_brands + asset_projects...");

  await sql`
    ALTER TABLE asset_brands
    ADD COLUMN IF NOT EXISTS assigned_by TEXT NOT NULL DEFAULT 'subscriber'
  `;
  console.log("  + asset_brands.assigned_by (default 'subscriber')");

  await sql`
    ALTER TABLE asset_projects
    ADD COLUMN IF NOT EXISTS assigned_by TEXT NOT NULL DEFAULT 'subscriber'
  `;
  console.log("  + asset_projects.assigned_by (default 'subscriber')");

  // Helpful index for the destructive-replace WHERE clause inside
  // commitCascade: DELETE WHERE asset_id = ? AND assigned_by = 'auto'.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_asset_brands_auto
    ON asset_brands (asset_id) WHERE assigned_by = 'auto'
  `;
  console.log("  + idx_asset_brands_auto");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_asset_projects_auto
    ON asset_projects (asset_id) WHERE assigned_by = 'auto'
  `;
  console.log("  + idx_asset_projects_auto");

  const brandCounts = await sql`
    SELECT assigned_by, COUNT(*)::int AS n
    FROM asset_brands GROUP BY assigned_by ORDER BY n DESC
  `;
  console.log("\n  asset_brands.assigned_by distribution:");
  for (const r of brandCounts) console.log(`    ${r.assigned_by}: ${r.n}`);

  const projectCounts = await sql`
    SELECT assigned_by, COUNT(*)::int AS n
    FROM asset_projects GROUP BY assigned_by ORDER BY n DESC
  `;
  console.log("\n  asset_projects.assigned_by distribution:");
  for (const r of projectCounts) console.log(`    ${r.assigned_by}: ${r.n}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
