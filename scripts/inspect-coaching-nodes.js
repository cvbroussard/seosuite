/**
 * Read-only inspector for coaching wizard content.
 *
 * Dumps coaching_walkthroughs + coaching_nodes for a given platform so
 * we can audit what's actually live in the wizard (vs. what's in seed
 * files, which may be stale).
 *
 * Usage:
 *   node scripts/inspect-coaching-nodes.js [platform]
 *
 * Defaults to 'meta' if no platform argument is given. Common platforms:
 * meta, facebook, instagram, gbp, youtube, tiktok, linkedin, pinterest.
 *
 * Read-only — does not mutate any data.
 */

const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);
const PLATFORM = process.argv[2] || "meta";

(async () => {
  // Discover columns first so this works regardless of schema drift.
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'coaching_walkthroughs'
    ORDER BY ordinal_position
  `;
  const colNames = cols.map((c) => c.column_name).join(", ");

  const walkthroughs = await sql`
    SELECT * FROM coaching_walkthroughs
    WHERE platform = ${PLATFORM}
  `;

  console.log(`═══ WALKTHROUGH (columns: ${colNames}) ═══`);
  if (walkthroughs.length === 0) {
    console.log(`No walkthrough rows for platform="${PLATFORM}"`);
  } else {
    for (const w of walkthroughs) {
      for (const k of Object.keys(w)) {
        const v = w[k];
        const display = typeof v === "string" && v.length > 200
          ? v.slice(0, 200) + "..."
          : v;
        console.log(`${k.padEnd(16)} ${display}`);
      }
    }
  }

  const nodes = await sql`
    SELECT id, type, position, content::text AS content
    FROM coaching_nodes
    WHERE platform = ${PLATFORM}
    ORDER BY position NULLS LAST, id
  `;

  console.log(`\n═══ NODES (${nodes.length}) ═══\n`);
  for (const n of nodes) {
    console.log(`──[ ${n.id} ]── (type=${n.type}, position=${n.position})`);
    let parsed;
    try {
      parsed = JSON.parse(n.content);
    } catch {
      console.log(n.content);
      console.log();
      continue;
    }
    // Print known content fields with full text; fall back to JSON for the rest
    if (parsed.title) console.log(`title: ${parsed.title}`);
    if (parsed.question) console.log(`question: ${parsed.question}`);
    if (parsed.help) console.log(`help: ${parsed.help}`);
    if (parsed.body) console.log(`body: ${parsed.body}`);
    if (parsed.bullets && Array.isArray(parsed.bullets)) {
      console.log(`bullets:`);
      for (const b of parsed.bullets) console.log(`  • ${b}`);
    }
    if (parsed.options && Array.isArray(parsed.options)) {
      console.log(`options:`);
      for (const o of parsed.options) console.log(`  → ${o.label}  [next: ${o.next}]`);
    }
    if (parsed.deep_link) console.log(`deep_link: ${parsed.deep_link} (${parsed.deep_link_label || ""})`);
    if (parsed.next) console.log(`next: ${parsed.next}`);
    console.log();
  }
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
