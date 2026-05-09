/**
 * Backfill driver: pretty URL rename pipeline (LOCKED 2026-05-08).
 *
 * Iterates legacy assets that have triage results but no `url_slug_applied_at`
 * marker and POSTs them to /api/admin/backfill-pretty-urls in batches. The
 * endpoint runs the full processBriefedAsset orchestrator on each — re-triages
 * with the new prompt (returns url_slug), renames source bytes via R2
 * server-side copy, cascade-deletes legacy variants, re-renders fresh ones.
 *
 * Required env (auto-loaded from .env.local):
 *   - DATABASE_URL
 *   - TP_ADMIN_TOKEN  (admin session cookie value — copy from browser)
 *   - APP_URL         (default http://localhost:3000)
 *
 * Usage:
 *   node scripts/backfill-pretty-urls.js                        # all sites
 *   node scripts/backfill-pretty-urls.js --site=<uuid>          # one site
 *   node scripts/backfill-pretty-urls.js --batch=10             # smaller batches
 *   node scripts/backfill-pretty-urls.js --dry-run              # list candidates only
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const ADMIN_TOKEN = process.env.TP_ADMIN_TOKEN;

const args = process.argv.slice(2);
const siteFilter = args.find((a) => a.startsWith("--site="))?.split("=")[1];
const batchSize = parseInt(args.find((a) => a.startsWith("--batch="))?.split("=")[1] || "25", 10);
const dryRun = args.includes("--dry-run");

async function main() {
  if (!ADMIN_TOKEN) {
    console.error("ERROR: TP_ADMIN_TOKEN env var required (copy your tp_admin cookie value).");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  const totalRows = siteFilter
    ? await sql`
        SELECT COUNT(*)::int AS n
        FROM media_assets
        WHERE site_id = ${siteFilter}
          AND triage_status NOT IN ('pending_briefing')
          AND archived_at IS NULL
          AND (metadata->>'url_slug_applied_at') IS NULL
      `
    : await sql`
        SELECT COUNT(*)::int AS n
        FROM media_assets
        WHERE triage_status NOT IN ('pending_briefing')
          AND archived_at IS NULL
          AND (metadata->>'url_slug_applied_at') IS NULL
      `;
  const total = totalRows[0]?.n || 0;

  console.log(
    `Backfill scope: ${total} candidate asset${total === 1 ? "" : "s"}` +
      (siteFilter ? ` (site=${siteFilter})` : " (all sites)") +
      `, batch=${batchSize}` +
      (dryRun ? ", dry-run" : ""),
  );
  console.log(`Endpoint: ${APP_URL}/api/admin/backfill-pretty-urls`);
  console.log("");

  if (total === 0) {
    console.log("No candidates. Done.");
    return;
  }

  let totals = { processed: 0, succeeded: 0, failed: 0, renamed: 0, variants: 0 };
  let batchNum = 0;

  // Each batch consumes the next N candidates; the endpoint always picks the
  // oldest unmigrated assets first, so we just keep posting until nothing
  // comes back. With dry_run we stop after one batch.
  while (true) {
    batchNum++;
    const startedAt = Date.now();

    const res = await fetch(`${APP_URL}/api/admin/backfill-pretty-urls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `tp_admin=${ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        site_id: siteFilter,
        limit: batchSize,
        dry_run: dryRun,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Batch ${batchNum} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
      process.exit(1);
    }

    const json = await res.json();
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (dryRun) {
      console.log(`Dry-run candidates (${json.candidate_count}):`);
      for (const c of json.candidates || []) {
        console.log(`  ${c.id}  site=${c.site_id}  ${c.media_type}  ${c.triage_status}`);
      }
      return;
    }

    const s = json.summary;
    totals.processed += s.processed;
    totals.succeeded += s.succeeded;
    totals.failed += s.failed;
    totals.renamed += s.renamed;
    totals.variants += s.total_variants;

    console.log(
      `Batch ${batchNum}: processed=${s.processed} ok=${s.succeeded} failed=${s.failed} ` +
        `renamed=${s.renamed} variants=${s.total_variants} (${elapsedSec}s)`,
    );

    // Surface failures inline so an operator can tell whether to abort
    for (const r of (json.results || []).filter((x) => !x.ok)) {
      console.log(`  ✗ ${r.asset_id}: ${r.error || "unknown error"}`);
    }

    if (s.processed === 0) break;
    if (s.processed < batchSize) break; // last batch
  }

  console.log("");
  console.log(
    `Done: processed=${totals.processed} ok=${totals.succeeded} failed=${totals.failed} ` +
      `renamed=${totals.renamed} variants=${totals.variants}`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
