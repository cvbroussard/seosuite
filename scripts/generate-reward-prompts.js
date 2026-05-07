/**
 * Generate reward prompts for a site from its brand DNA.
 *
 * One Haiku call. Persists into sites.brand_dna.signals.reward_prompts.
 * Re-running overwrites the existing set.
 *
 * Run:
 *   node scripts/generate-reward-prompts.js --site epicurious
 *   npx tsx scripts/generate-reward-prompts.js --site epicurious
 */
require("dotenv").config({ path: ".env.local" });
const { neon } = require("@neondatabase/serverless");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { siteName: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--site") out.siteName = args[++i];
  }
  if (!out.siteName) {
    console.error("Usage: --site <name>");
    process.exit(1);
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const sql = neon(process.env.DATABASE_URL);

  const [site] = await sql`
    SELECT id, name FROM sites WHERE LOWER(name) LIKE ${`%${args.siteName.toLowerCase()}%`} LIMIT 1
  `;
  if (!site) {
    console.error(`No site matching '${args.siteName}'`);
    process.exit(1);
  }
  console.log(`Site: ${site.name} (${site.id})`);
  console.log("Calling generateRewardPrompts (1 Haiku call)…");

  const { generateRewardPrompts } = await import("../src/lib/v2-generator/reward-prompts/generate.ts");
  const t0 = Date.now();
  const prompts = await generateRewardPrompts(site.id);
  const elapsed = Math.round((Date.now() - t0) / 1000);

  console.log(`✓ Generated ${prompts.length} prompts in ${elapsed}s`);
  console.log("");
  console.log("─── Reward prompts ───");
  for (const p of prompts) {
    console.log("");
    console.log(`  [${p.goal}] ${p.label}`);
    console.log(`    intent: ${p.intent}`);
    console.log(`    angle:  ${p.framingAngle}`);
    if (p.assetBias) console.log(`    bias:   ${p.assetBias}`);
  }
  console.log("");
  console.log("Stored on sites.brand_dna.signals.reward_prompts. The orchestrator's");
  console.log("reward-prompt strategy will now pick from these on every tick.");
}

main().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
