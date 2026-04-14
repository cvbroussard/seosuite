/**
 * One-off: reset TracPost's playbook to baseline, then re-sharpen with
 * a fresh angle. Use when the first sharpening went off-target and you
 * want a clean slate (the refinePlaybook function loads whatever's
 * currently stored, so calling refine twice would "refine the refined").
 *
 * Two sequential POSTs to /api/brand-intelligence:
 *   1. action:"auto_generate" — regenerates category-level baseline
 *   2. action:"refine"        — sharpens baseline with the new angle
 *
 * Both calls can take up to ~2 min each (Anthropic playbook generation
 * plus downstream cascade). The route's maxDuration is now 300s.
 *
 * Usage: node scripts/resharpen-tracpost-playbook.js <site_id> [--base=...]
 *   The new angle is hard-coded below — edit before running.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const ANGLE =
  "We build content automation the only way it actually works: by starting with the one sentence that makes each client's business different. That sentence shapes their brand playbook, and every post, caption, and article we generate for them across 8 platforms is derived from it. They don't write content and they don't pick templates — they tell us what makes them different, we do the rest.";

async function main() {
  const siteId = process.argv[2];
  if (!siteId) {
    console.error("Usage: node scripts/resharpen-tracpost-playbook.js <site_id> [--base=...]");
    process.exit(1);
  }
  const baseArg = process.argv.find((a) => a.startsWith("--base="));
  const base = baseArg ? baseArg.slice("--base=".length) : "https://platform.tracpost.com";

  const sql = neon(process.env.DATABASE_URL);

  const [site] = await sql`
    SELECT id, name, subscription_id, business_type, location, url
    FROM sites WHERE id = ${siteId}
  `;
  if (!site) {
    console.error(`Site ${siteId} not found`);
    process.exit(1);
  }

  console.log(`Site:         ${site.name}`);
  console.log(`Subscription: ${site.subscription_id}`);
  console.log(`Base:         ${base}`);
  console.log(`Angle:        ${ANGLE.slice(0, 80)}…\n`);

  const url = `${base}/api/brand-intelligence?subscription_id=${site.subscription_id}`;
  const headers = {
    "Content-Type": "application/json",
    Cookie: "tp_admin=authenticated",
  };

  // Phase 1 — reset to baseline
  console.log("Phase 1: regenerating baseline playbook (auto_generate)…");
  const t1 = Date.now();
  const r1 = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      site_id: siteId,
      action: "auto_generate",
      business_type: site.business_type || "Content automation platform",
      location: site.location || undefined,
      website_url: site.url || undefined,
    }),
  });
  const d1 = await r1.json().catch((e) => ({ _parseError: e.message }));
  const elapsed1 = ((Date.now() - t1) / 1000).toFixed(1);

  if (!r1.ok) {
    console.error(`  FAIL (${r1.status}) in ${elapsed1}s: ${d1.error || d1._parseError || r1.statusText}`);
    process.exit(1);
  }
  console.log(`  OK in ${elapsed1}s — baseline regenerated (phase: ${d1.phase}).\n`);

  // Phase 2 — sharpen with new angle
  console.log("Phase 2: sharpening with new angle (refine)…");
  const t2 = Date.now();
  const r2 = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      site_id: siteId,
      action: "refine",
      angle: ANGLE,
    }),
  });
  const d2 = await r2.json().catch((e) => ({ _parseError: e.message }));
  const elapsed2 = ((Date.now() - t2) / 1000).toFixed(1);

  if (!r2.ok) {
    console.error(`  FAIL (${r2.status}) in ${elapsed2}s: ${d2.error || d2._parseError || r2.statusText}`);
    process.exit(1);
  }
  console.log(`  OK in ${elapsed2}s — playbook sharpened (phase: ${d2.phase}).\n`);

  // Summary — verify what landed
  const [after] = await sql`
    SELECT brand_playbook->'brandPositioning'->'selectedAngles'->0->>'name' AS positioning,
           brand_playbook->'brandPositioning'->'selectedAngles'->0->>'tagline' AS tagline,
           brand_voice->>'_source' AS brand_voice_source,
           brand_playbook->>'version' AS playbook_version,
           (pillar_config IS NOT NULL) AS has_pillar_config,
           (image_style IS NOT NULL AND image_style != '') AS has_image_style
    FROM sites WHERE id = ${siteId}
  `;

  console.log("Final state:");
  console.log(`  positioning         = ${after.positioning}`);
  console.log(`  tagline             = ${after.tagline}`);
  console.log(`  playbook_version    = ${after.playbook_version}`);
  console.log(`  brand_voice_source  = ${after.brand_voice_source}`);
  console.log(`  has_pillar_config   = ${after.has_pillar_config}`);
  console.log(`  has_image_style     = ${after.has_image_style}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
