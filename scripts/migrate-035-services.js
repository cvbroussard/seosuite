/**
 * Migration 035: Service entity — fifth site-scoped entity parallel to
 * brand/project/client/location. Services bind the /work page's tile
 * variant to a real DB entity (instead of inline JSONB), feed GBP
 * category classification, and power /services/[slug] detail pages.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("035: Creating services entity + join table...");

  await sql`
    CREATE TABLE IF NOT EXISTS services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      price_range TEXT,
      duration TEXT,
      display_order INT NOT NULL DEFAULT 0,
      hero_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_services_site_slug ON services(site_id, slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_services_site ON services(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_services_site_order ON services(site_id, display_order)`;

  await sql`
    CREATE TABLE IF NOT EXISTS asset_services (
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      PRIMARY KEY (asset_id, service_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_asset_services_service ON asset_services(service_id)`;

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS service_label TEXT`;

  console.log("  + services table");
  console.log("  + asset_services join table");
  console.log("  + sites.service_label column");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'services'
    ORDER BY ordinal_position
  `;
  console.log("\nVerification — services columns:");
  for (const c of cols) {
    console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}`);
  }

  console.log("\n035: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
