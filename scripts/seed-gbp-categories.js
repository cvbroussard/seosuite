/**
 * Seeds the gbp_categories platform-wide index from data/gbp-categories.json.
 * Idempotent — uses upsert on gcid. Re-run when the JSON is expanded
 * (new categories added, keywords refined). Starting list covers ~160
 * categories across construction, food, health, beauty, professional
 * services, retail, and local. Expand as tenants surface edge cases.
 */
const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

async function seed() {
  const sql = neon(process.env.DATABASE_URL);

  const dataPath = path.join(__dirname, "..", "data", "gbp-categories.json");
  const categories = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  console.log(`Seeding ${categories.length} GBP categories...`);

  let inserted = 0;
  let updated = 0;
  for (const cat of categories) {
    const keywords = cat.keywords || [];
    const parent = cat.parent_gcid || null;
    const res = await sql`
      INSERT INTO gbp_categories (gcid, name, parent_gcid, keywords)
      VALUES (${cat.gcid}, ${cat.name}, ${parent}, ${keywords})
      ON CONFLICT (gcid) DO UPDATE SET
        name = EXCLUDED.name,
        parent_gcid = EXCLUDED.parent_gcid,
        keywords = EXCLUDED.keywords
      RETURNING (xmax = 0) AS is_insert
    `;
    if (res[0]?.is_insert) inserted++;
    else updated++;
  }

  const [total] = await sql`SELECT COUNT(*)::int AS n FROM gbp_categories`;
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Total rows: ${total.n}`);
  console.log("\nDone.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
