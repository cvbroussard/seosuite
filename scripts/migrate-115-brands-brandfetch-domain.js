/**
 * Migration 115: Add brands.logo_service_url for downstream elegant
 * rendering paths.
 *
 * Architecture: every brand's primary logo lives in R2 (via
 * hero_asset_id) — that's what the dashboard renders, fast and cheap.
 * Separately, when a brand was captured via Brandfetch, we record the
 * full CDN URL here. Future public-facing render surfaces (marketing
 * sites, article inline mentions) can append variant params for
 * elegant theme/type/size choices, while the dashboard never queries
 * any third party.
 *
 * Set during enrichment when the Brandfetch candidate wins. Null
 * otherwise — those brands stay on R2-only rendering.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("115: Adding brands.logo_service_url column...");
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_service_url TEXT`;
  console.log("  + brands.logo_service_url column");

  // Backfill from enrichment_metadata.hero_source — already the full
  // Brandfetch CDN URL for any brand previously captured via that path.
  const result = await sql`
    UPDATE brands
    SET logo_service_url = enrichment_metadata->>'hero_source'
    WHERE logo_service_url IS NULL
      AND enrichment_metadata->>'hero_source' LIKE 'https://cdn.brandfetch.io/%'
  `;
  console.log(`  + backfilled ${result.length ?? "?"} rows from existing Brandfetch hero_source`);

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'logo_service_url'
  `;
  for (const c of cols) {
    console.log(`\n  ${c.column_name}  ${c.data_type}`);
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
