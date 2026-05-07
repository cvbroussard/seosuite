/**
 * v2 generation orchestrator — batch runner.
 *
 * Runs the orchestrator N times against a site. Each tick re-assesses
 * site state and picks the most appropriate strategy. Sequential by
 * design — re-assessment after every article keeps the strategy choices
 * coherent (pillar coverage shifts, used-asset pool shrinks).
 *
 * Run:
 *   node scripts/orchestrate-v2-batch.js --site epicurious --count 25
 *   node scripts/orchestrate-v2-batch.js --site epicurious --preview
 *   node scripts/orchestrate-v2-batch.js --site epicurious --count 1 --strategy pillar_fill
 */
require("dotenv").config({ path: ".env.local" });
const { neon } = require("@neondatabase/serverless");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { siteName: null, count: 1, preview: false, strategy: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--site") out.siteName = args[++i];
    else if (args[i] === "--count") out.count = parseInt(args[++i], 10);
    else if (args[i] === "--preview") out.preview = true;
    else if (args[i] === "--strategy") out.strategy = args[++i];
  }
  if (!out.siteName) {
    console.error("Usage: --site <name> [--count N] [--preview] [--strategy <kind>]");
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
  console.log("");

  const { previewStrategies, orchestrate, orchestrateBatch } = await import(
    "../src/lib/v2-generator/orchestrator/index.ts"
  );

  // Preview mode — show strategy scores, don't generate
  if (args.preview) {
    const scores = await previewStrategies(site.id);
    console.log("Strategy scores for current site state:");
    console.log("");
    for (const s of scores) {
      const bar = "█".repeat(Math.round(s.score * 20));
      console.log(`  ${s.score.toFixed(2)} ${bar.padEnd(20)} ${s.label}`);
    }
    console.log("");
    console.log("(Run without --preview to generate.)");
    return;
  }

  // Single forced-strategy mode
  if (args.strategy && args.count === 1) {
    console.log(`Forcing strategy: ${args.strategy}`);
    const t0 = Date.now();
    const result = await orchestrate(site.id, { forceStrategy: args.strategy });
    console.log(`✓ ${result.strategy} → "${result.generation.title}" (${Date.now() - t0}ms)`);
    return;
  }

  // Batch mode
  console.log(`Running orchestrator ×${args.count} (sequential)…`);
  console.log("");
  const t0 = Date.now();

  let strategiesUsed = {};
  await orchestrateBatch(site.id, args.count, (i, result) => {
    strategiesUsed[result.strategy] = (strategiesUsed[result.strategy] || 0) + 1;
    console.log(
      `  [${String(i).padStart(2, " ")}/${args.count}] ${result.strategy.padEnd(15)} → "${result.generation.title}"`,
    );
  });

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log("");
  console.log(`✓ Done in ${elapsed}s. Strategy distribution:`);
  for (const [kind, n] of Object.entries(strategiesUsed)) {
    console.log(`    ${kind}: ${n}`);
  }
}

main().catch((e) => {
  console.error("");
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
