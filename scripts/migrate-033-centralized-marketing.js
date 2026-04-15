/**
 * Migration 033: Centralized marketing site delivery.
 *
 * Adds two columns to sites:
 *   - website_copy JSONB — cached copy generated from playbook by the
 *     content composer. Templates read from this; admin "regenerate
 *     copy" button overwrites it. Replaces the pattern where copy was
 *     regenerated every spinner run and never persisted.
 *   - hero_asset_id UUID — first-class override for the marketing-site
 *     hero image. Templates pick hero_asset_id first, fall back to
 *     asset-picker scoring if null.
 *
 * Also backfills: does nothing for existing rows. Templates will
 * gracefully handle null website_copy (show empty state / "generate
 * copy" CTA) and null hero_asset_id (fall back to scoring).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("033: Centralized marketing columns on sites…");

  await sql`
    ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS website_copy JSONB
  `;
  console.log("  + sites.website_copy (JSONB)");

  await sql`
    ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS hero_asset_id UUID
      REFERENCES media_assets(id) ON DELETE SET NULL
  `;
  console.log("  + sites.hero_asset_id (UUID FK)");

  // Index on hero_asset_id for the rare but valid lookup "who uses this asset as hero"
  await sql`
    CREATE INDEX IF NOT EXISTS idx_sites_hero_asset ON sites(hero_asset_id)
    WHERE hero_asset_id IS NOT NULL
  `;
  console.log("  + idx_sites_hero_asset");

  // Verify
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name IN ('website_copy', 'hero_asset_id')
    ORDER BY column_name
  `;
  console.log("\nVerification:");
  for (const c of cols) {
    console.log(`  ${c.column_name.padEnd(20)} ${c.data_type.padEnd(12)} nullable=${c.is_nullable}`);
  }

  console.log("\n033: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
