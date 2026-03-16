const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Running cancellation + export migrations...\n");

  // 1. Add cancellation columns to subscribers
  await sql`
    ALTER TABLE subscribers
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT
  `;
  console.log("✓ subscribers cancellation columns added");

  // 2. Departure redirects table
  await sql`
    CREATE TABLE IF NOT EXISTS departure_redirects (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id      UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      target_base  TEXT NOT NULL,
      active_until TIMESTAMPTZ NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ departure_redirects table created");

  // 3. Index for middleware lookup
  await sql`
    CREATE INDEX IF NOT EXISTS idx_departure_redirects_site
    ON departure_redirects (site_id)
  `;
  console.log("✓ idx_departure_redirects_site index");

  // 4. Export tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS data_exports (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscriber_id UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      status        TEXT NOT NULL DEFAULT 'pending',
      download_url  TEXT,
      expires_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ data_exports table created");

  console.log("\n✅ Cancellation + export migrations complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
