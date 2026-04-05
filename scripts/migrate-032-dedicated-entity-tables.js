/**
 * Migration 032: Replace generic entities table with 4 dedicated tables.
 *
 * brands, projects, clients, locations — each with slot-specific schema.
 * Migrates existing entities (all slot 1) into brands.
 * Replaces entity_label_1..4 / entity_flags_1..4 with brand_label, project_label, client_label, location_label.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("032: Creating dedicated entity tables...");

  // ── 1. Create brands table ──
  await sql`
    CREATE TABLE IF NOT EXISTS brands (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      url TEXT,
      description TEXT,
      hero_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_site_slug ON brands(site_id, slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_brands_site ON brands(site_id)`;

  // ── 2. Create projects table ──
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      start_date DATE,
      end_date DATE,
      description TEXT,
      hero_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_site_slug ON projects(site_id, slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_projects_site ON projects(site_id)`;

  // ── 3. Create clients table ──
  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      display_name TEXT,
      consent_given BOOLEAN NOT NULL DEFAULT false,
      description TEXT,
      hero_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_site_slug ON clients(site_id, slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_clients_site ON clients(site_id)`;

  // ── 4. Create locations table ──
  await sql`
    CREATE TABLE IF NOT EXISTS locations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      description TEXT,
      hero_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_site_slug ON locations(site_id, slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_locations_site ON locations(site_id)`;

  // ── 5. Create join tables ──
  await sql`
    CREATE TABLE IF NOT EXISTS asset_brands (
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      PRIMARY KEY (asset_id, brand_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS asset_projects (
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (asset_id, project_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS asset_clients (
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      PRIMARY KEY (asset_id, client_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS asset_locations (
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      PRIMARY KEY (asset_id, location_id)
    )
  `;
  console.log("  Tables and join tables created");

  // ── 6. Migrate existing entities (slot 1) → brands ──
  const migrated = await sql`
    INSERT INTO brands (id, site_id, name, slug, url, created_at)
    SELECT id, site_id, name, slug, url, created_at
    FROM entities
    WHERE slot = 1 AND site_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  console.log(`  Migrated ${migrated.length} entities → brands`);

  // ── 7. Migrate existing entities (slot 2) → projects ──
  const migratedProjects = await sql`
    INSERT INTO projects (id, site_id, name, slug, created_at)
    SELECT id, site_id, name, slug, created_at
    FROM entities
    WHERE slot = 2 AND site_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;
  console.log(`  Migrated ${migratedProjects.length} entities → projects`);

  // ── 8. Migrate asset_entities → asset_brands (for slot 1 entities) ──
  const brandLinks = await sql`
    INSERT INTO asset_brands (asset_id, brand_id)
    SELECT ae.asset_id, ae.entity_id
    FROM asset_entities ae
    JOIN entities e ON ae.entity_id = e.id
    WHERE e.slot = 1
    ON CONFLICT DO NOTHING
    RETURNING asset_id
  `;
  console.log(`  Migrated ${brandLinks.length} asset_entities → asset_brands`);

  // ── 9. Migrate asset_entities → asset_projects (for slot 2 entities) ──
  const projectLinks = await sql`
    INSERT INTO asset_projects (asset_id, project_id)
    SELECT ae.asset_id, ae.entity_id
    FROM asset_entities ae
    JOIN entities e ON ae.entity_id = e.id
    WHERE e.slot = 2
    ON CONFLICT DO NOTHING
    RETURNING asset_id
  `;
  console.log(`  Migrated ${projectLinks.length} asset_entities → asset_projects`);

  // ── 10. Add label columns to sites ──
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_label TEXT`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS project_label TEXT`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS client_label TEXT`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS location_label TEXT`;

  // Backfill from entity_label_1..4
  await sql`UPDATE sites SET brand_label = entity_label_1 WHERE entity_label_1 IS NOT NULL AND brand_label IS NULL`;
  await sql`UPDATE sites SET project_label = entity_label_2 WHERE entity_label_2 IS NOT NULL AND project_label IS NULL`;
  await sql`UPDATE sites SET client_label = entity_label_3 WHERE entity_label_3 IS NOT NULL AND client_label IS NULL`;
  await sql`UPDATE sites SET location_label = entity_label_4 WHERE entity_label_4 IS NOT NULL AND location_label IS NULL`;
  console.log("  Label columns added and backfilled");

  // Verify
  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM brands) AS brands,
      (SELECT COUNT(*)::int FROM projects) AS projects,
      (SELECT COUNT(*)::int FROM clients) AS clients,
      (SELECT COUNT(*)::int FROM locations) AS locations,
      (SELECT COUNT(*)::int FROM asset_brands) AS brand_links,
      (SELECT COUNT(*)::int FROM asset_projects) AS project_links
  `;
  console.log("  Counts:", JSON.stringify(counts[0]));

  console.log("\n032: Done. Old entities/asset_entities tables preserved.");
  console.log("     Drop after code migration: DROP TABLE asset_entities; DROP TABLE entities;");
}

migrate().catch(console.error);
