/**
 * Migrate legacy projects → projects_v2.
 *
 * For each legacy project:
 *   1. Pull related assets via asset_projects join
 *   2. Pick the top-quality asset as hero
 *   3. Use the rest as body candidates the LLM may place
 *   4. Call generateProjectPage to create the v2 row + content_kit + manifest
 *
 * Skips projects with zero related assets (the v2 schema requires a hero;
 * a fallback would muddy results).
 *
 * Status mapping: legacy 'complete' → v2 'active' so the project still
 * surfaces in the Compose anchor picker. The orchestrator's project-chapter
 * strategy infers lifecycle phase ('beginning'/'process'/'finished') from
 * start_date/end_date independently of status.
 *
 * Run:
 *   node scripts/migrate-projects-to-v2.js --site epicurious
 *   node scripts/migrate-projects-to-v2.js --site epicurious --dry-run
 */
require("dotenv").config({ path: ".env.local" });
const { neon } = require("@neondatabase/serverless");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { siteName: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--site") out.siteName = args[++i];
    else if (args[i] === "--dry-run") out.dryRun = true;
  }
  if (!out.siteName) {
    console.error("Usage: --site <name> [--dry-run]");
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

  const legacy = await sql`
    SELECT id, name, slug, description, status, start_date, end_date
    FROM projects
    WHERE site_id = ${site.id}
    ORDER BY name
  `;
  console.log(`Found ${legacy.length} legacy projects`);
  console.log("");

  // Skip any project that already has a v2 row by slug
  const existing = await sql`
    SELECT slug FROM projects_v2 WHERE site_id = ${site.id}
  `;
  const existingSlugs = new Set(existing.map((r) => r.slug));

  const { generateProjectPage } = await import("../src/lib/v2-generator/adapters.ts");

  const results = [];
  for (const p of legacy) {
    if (existingSlugs.has(p.slug)) {
      console.log(`SKIP ${p.name} — already has v2 row with slug ${p.slug}`);
      continue;
    }

    const assets = await sql`
      SELECT ma.id, ma.quality_score
      FROM asset_projects ap
      JOIN media_assets ma ON ma.id = ap.asset_id
      WHERE ap.project_id = ${p.id}
        AND ma.triage_status NOT IN ('quarantined','shelved')
        AND ma.status NOT IN ('deleted','failed')
        AND ma.media_type ILIKE 'image%'
      ORDER BY ma.quality_score DESC NULLS LAST, ma.created_at DESC
    `;

    if (assets.length === 0) {
      console.log(`SKIP ${p.name} — no eligible assets in asset_projects`);
      results.push({ project: p.name, status: "skipped", reason: "no assets" });
      continue;
    }

    const heroAssetId = assets[0].id;
    const bodyAssetIds = assets.slice(1, 13).map((a) => a.id); // hero + up to 12 body
    const topicHint = `${p.name}${p.description ? " — " + p.description.slice(0, 200) : ""}`;

    if (args.dryRun) {
      console.log(`DRY ${p.name}`);
      console.log(`     hero=${heroAssetId}`);
      console.log(`     body=${bodyAssetIds.length} candidates`);
      console.log(`     status=${p.status} → v2 'active'`);
      results.push({ project: p.name, status: "dry-run" });
      continue;
    }

    console.log(`GEN  ${p.name} (${assets.length} assets) …`);
    const t0 = Date.now();
    try {
      const result = await generateProjectPage({
        siteId: site.id,
        topicHint,
        heroAssetId,
        bodyAssetIds,
        startDate: p.start_date ? new Date(p.start_date).toISOString().slice(0, 10) : undefined,
        endDate: p.end_date ? new Date(p.end_date).toISOString().slice(0, 10) : undefined,
        // Map legacy 'complete' → v2 'active' so it surfaces in the anchor picker.
        // Phase inference (finished/process/beginning) happens in the orchestrator
        // from start_date/end_date, not from status.
        status: "active",
      });
      const elapsed = Math.round((Date.now() - t0) / 1000);
      console.log(`     ✓ "${result.title}" (${elapsed}s, ${result.assetsCount} assets)`);
      results.push({ project: p.name, status: "ok", v2Id: result.id, slug: result.slug });
    } catch (err) {
      console.error(`     ✗ ${err.message}`);
      results.push({ project: p.name, status: "error", error: err.message });
    }
  }

  console.log("");
  console.log("Summary:");
  for (const r of results) {
    const tag = r.status === "ok" ? "✓" : r.status === "skipped" ? "○" : r.status === "dry-run" ? "•" : "✗";
    console.log(`  ${tag} ${r.project}` + (r.reason ? ` — ${r.reason}` : ""));
  }
}

main().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
