/**
 * Migration 057: parallel brand_dna storage on sites.
 *
 * sites.brand_dna           JSONB — full envelope: { playbook, signals, score,
 *                                  generated_at, version }
 * sites.active_brand_source TEXT  — 'playbook' | 'dna'  (default 'playbook')
 *
 * Exploratory architecture: brand_dna lives parallel to brand_playbook so
 * operators can toggle which one is active without losing either. Downstream
 * consumers read via getActiveBrandPlaybook() helper (Phase B sweep).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("057: brand_dna + active_brand_source on sites...");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_dna JSONB`;
  console.log("  + brand_dna JSONB");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS active_brand_source TEXT NOT NULL DEFAULT 'playbook'`;
  console.log("  + active_brand_source TEXT default 'playbook'");

  await sql`ALTER TABLE sites ADD CONSTRAINT IF NOT EXISTS active_brand_source_check CHECK (active_brand_source IN ('playbook', 'dna'))`.catch(async (err) => {
    // Older Postgres versions don't support IF NOT EXISTS on ADD CONSTRAINT
    if (err.message.includes("syntax")) {
      const exists = await sql`
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'sites' AND constraint_name = 'active_brand_source_check'
      `;
      if (exists.length === 0) {
        await sql`ALTER TABLE sites ADD CONSTRAINT active_brand_source_check CHECK (active_brand_source IN ('playbook', 'dna'))`;
      }
    } else {
      throw err;
    }
  });
  console.log("  + active_brand_source CHECK constraint");

  console.log("Done.");
})().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
