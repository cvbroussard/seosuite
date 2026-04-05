/**
 * Migration 031: Generalize vendors into entities with 4 labeled slots.
 *
 * - Renames vendors → entities, adds slot column
 * - Renames asset_vendors → asset_entities
 * - Adds entity_label_1..4 and entity_flags_1..4 to sites
 * - Backfills existing vendors as slot 1
 * - Sets default labels for sites that have vendors
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("031: Generalizing vendors into entities...");

  // 1. Rename vendors → entities
  await sql`ALTER TABLE vendors RENAME TO entities`;
  console.log("  Renamed vendors → entities");

  // 2. Add slot column, default to 1 (all existing vendors = slot 1)
  await sql`ALTER TABLE entities ADD COLUMN IF NOT EXISTS slot INT NOT NULL DEFAULT 1`;
  console.log("  Added slot column");

  // 3. Rename asset_vendors → asset_entities
  await sql`ALTER TABLE asset_vendors RENAME TO asset_entities`;
  await sql`ALTER TABLE asset_entities RENAME COLUMN vendor_id TO entity_id`;
  console.log("  Renamed asset_vendors → asset_entities (vendor_id → entity_id)");

  // 4. Add entity labels and flags to sites
  for (let i = 1; i <= 4; i++) {
    await sql.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS entity_label_${i} TEXT`);
    await sql.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS entity_flags_${i} JSONB DEFAULT '{}'`);
  }
  console.log("  Added entity_label_1..4 and entity_flags_1..4 to sites");

  // 5. Set default labels for sites that have entities
  await sql`
    UPDATE sites SET
      entity_label_1 = 'Vendor',
      entity_flags_1 = '{"link_in_post": true, "group_narrative": false, "privacy_gate": false, "geo_relevance": false}'::jsonb
    WHERE id IN (SELECT DISTINCT site_id FROM entities WHERE site_id IS NOT NULL)
      AND entity_label_1 IS NULL
  `;
  console.log("  Set default slot 1 labels for sites with entities");

  // 6. Update unique index
  try {
    await sql`DROP INDEX IF EXISTS vendors_site_id_slug_key`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS entities_site_slot_slug ON entities (site_id, slot, slug) WHERE site_id IS NOT NULL`;
  } catch (err) {
    console.log(`  Index update: ${err.message}`);
  }

  // 7. Update other indexes
  try {
    await sql`DROP INDEX IF EXISTS idx_vendors_site_id`;
    await sql`CREATE INDEX IF NOT EXISTS idx_entities_site_id ON entities (site_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_entities_site_slot ON entities (site_id, slot)`;
  } catch (err) {
    console.log(`  Index: ${err.message}`);
  }

  // Verify
  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM entities) AS entities,
      (SELECT COUNT(*)::int FROM asset_entities) AS asset_links,
      (SELECT COUNT(*)::int FROM sites WHERE entity_label_1 IS NOT NULL) AS sites_with_labels
  `;
  console.log("  Counts:", JSON.stringify(counts[0]));

  console.log("031: Done.");
}

migrate().catch(console.error);
