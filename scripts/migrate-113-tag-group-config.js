/**
 * Migration 113: sites.tag_group_config — JSONB column for per-business
 * tag-group configuration overrides.
 *
 * First use: keyword cue vocabulary per tag group. Subscriber can extend
 * the hard-coded defaults in /lib/auto-tag-rules.ts with business-specific
 * jargon (e.g., "dealership" for branches in an auto industry).
 *
 * Schema shape (JSONB):
 *   {
 *     brand:        { keyword_cues: ["brand", "supplier"] },
 *     project:      { keyword_cues: ["project", "job"] },
 *     service:      { keyword_cues: ["service", "offering"] },
 *     persona:      { keyword_cues: ["client", "customer", "homeowner"] },
 *     branch:       { keyword_cues: ["branch", "location", "dealership"] },
 *     service_area: { keyword_cues: ["area", "zone"] }
 *   }
 *
 * If a group key is absent OR keyword_cues is absent/empty, the
 * AUTO_TAG_RULES default vocabulary applies. Subscriber-provided values
 * REPLACE the defaults (don't merge), so they fully control the list.
 *
 * Defaults to '{}' so existing sites retain hard-coded behavior until
 * subscriber explicitly overrides.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("113: Adding sites.tag_group_config JSONB column...");

  await sql`
    ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS tag_group_config JSONB NOT NULL DEFAULT '{}'::jsonb
  `;

  console.log("  + sites.tag_group_config (jsonb, default '{}')");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'tag_group_config'
  `;
  console.log("\nColumn:");
  for (const c of cols) {
    console.log(`  ${c.column_name}  ${c.data_type}`);
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
