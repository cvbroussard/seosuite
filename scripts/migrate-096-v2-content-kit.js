/**
 * v2 generator: content_kit column.
 *
 * Adds content_kit JSONB to all three v2 anchor tables. The kit holds
 * structured ingredients (hooks, takeaways, key terms, proof points,
 * link contexts, voice markers, CTA variants) that per-platform
 * slicer functions compose into format-specific captions WITHOUT any
 * LLM call at slice time.
 *
 * The kit is generated alongside the article body in one of the v2
 * generator's two LLM calls. Once persisted, every platform — and
 * every future platform — slices from the same kit.
 *
 * Captions tables remain in place as optional caches; with the kit
 * approach they can stay unused or be retired later.
 *
 * Run: node scripts/migrate-096-v2-content-kit.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("v2 content_kit migration starting…");

  await sql`
    ALTER TABLE blog_posts_v2
      ADD COLUMN IF NOT EXISTS content_kit JSONB NOT NULL DEFAULT '{}'::jsonb
  `;
  console.log("  ✓ blog_posts_v2.content_kit");

  await sql`
    ALTER TABLE projects_v2
      ADD COLUMN IF NOT EXISTS content_kit JSONB NOT NULL DEFAULT '{}'::jsonb
  `;
  console.log("  ✓ projects_v2.content_kit");

  await sql`
    ALTER TABLE services_v2
      ADD COLUMN IF NOT EXISTS content_kit JSONB NOT NULL DEFAULT '{}'::jsonb
  `;
  console.log("  ✓ services_v2.content_kit");

  console.log("");
  console.log("Migration complete.");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
