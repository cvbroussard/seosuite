/**
 * Migration 024: Vendors table + asset_vendors join
 *
 * Vendors are a subscriber-level entity shared across all sites.
 * Media assets link to vendors via a join table.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 024: Creating vendors table and asset_vendors join...");

  await sql`
    CREATE TABLE IF NOT EXISTS vendors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscriber_id UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (subscriber_id, slug)
    )
  `;
  console.log("  ✓ vendors table created");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_vendors_subscriber ON vendors(subscriber_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS asset_vendors (
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      PRIMARY KEY (asset_id, vendor_id)
    )
  `;
  console.log("  ✓ asset_vendors join table created");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_asset_vendors_vendor ON asset_vendors(vendor_id)
  `;

  console.log("Migration 024 complete.");
}

migrate().catch(console.error);
