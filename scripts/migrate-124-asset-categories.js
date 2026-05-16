/**
 * Migration 124: asset_categories join table.
 *
 * Wires media_assets to gbp_categories — the canonical structured tag
 * that replaces the services tag group per #223 / project_tracpost_gbp
 * _categories_coaching memory.
 *
 * Per-asset categorization fires automatically at briefing complete
 * (Phase C). The multimodal LLM call produces ranked categories with
 * confidence; primary is always assigned, secondaries only at high
 * confidence (≥0.85). Target distribution: ~90% single-tagged,
 * ~10% multi-tagged.
 *
 * Schema rationale:
 *   - Composite PK on (asset_id, gcid) prevents duplicate tags per asset
 *   - confidence: 0..1 from the multimodal LLM call
 *   - is_primary: exactly one per asset, enforced by partial unique index
 *   - assigned_by: 'auto' (LLM categorizer) | 'operator' | 'subscriber'
 *   - reasoning: LLM's per-category explanation (for inspector/audit)
 *   - FK to gbp_categories so categorization can only point to known gcids
 *     (which include the subscriber's 10 + the broader catalog seeded
 *     during CMA Tier 2 enrichment)
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("124: Create asset_categories table...");

  await sql`
    CREATE TABLE IF NOT EXISTS asset_categories (
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      gcid TEXT NOT NULL REFERENCES gbp_categories(gcid) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      confidence NUMERIC(4,3),
      assigned_by TEXT NOT NULL DEFAULT 'auto' CHECK (assigned_by IN ('auto', 'operator', 'subscriber')),
      reasoning TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (asset_id, gcid)
    )
  `;
  console.log("  + asset_categories");

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_categories_primary
    ON asset_categories (asset_id)
    WHERE is_primary = true
  `;
  console.log("  + idx_asset_categories_primary (enforces ≤1 primary per asset)");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_asset_categories_gcid
    ON asset_categories (gcid, is_primary DESC)
  `;
  console.log("  + idx_asset_categories_gcid (orchestrator pool queries by category)");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_asset_categories_asset
    ON asset_categories (asset_id, is_primary DESC)
  `;
  console.log("  + idx_asset_categories_asset (modal renders + diagnostics)");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'asset_categories'
    ORDER BY ordinal_position
  `;
  console.log("\n  Verified columns:");
  cols.forEach((c) => console.log(`    ${c.column_name.padEnd(15)} ${c.data_type}`));
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
