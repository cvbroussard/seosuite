/**
 * Migration 028: Scope vendors to sites instead of subscribers.
 *
 * Adds site_id column to vendors table, backfills from subscriber → first active site,
 * and updates the unique constraint.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("028: Adding site_id to vendors...");

  // Add site_id column (nullable first for backfill)
  await sql`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE`;

  // Backfill: assign each vendor to the subscriber's first active site
  const updated = await sql`
    UPDATE vendors v
    SET site_id = (
      SELECT id FROM sites
      WHERE subscriber_id = v.subscriber_id AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1
    )
    WHERE v.site_id IS NULL
    RETURNING id, name
  `;
  console.log(`  Backfilled ${updated.length} vendors`);

  // Drop old unique constraint and add new site-scoped one
  await sql`ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_subscriber_id_slug_key`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendors_site_id_slug_key
    ON vendors (site_id, slug)
    WHERE site_id IS NOT NULL
  `;

  // Create index for site lookups
  await sql`CREATE INDEX IF NOT EXISTS idx_vendors_site_id ON vendors (site_id)`;

  console.log("028: Done — vendors now site-scoped.");
}

migrate().catch(console.error);
