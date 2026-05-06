/**
 * One-shot audit: count + sample anchor candidates for Epicurious Kitchens.
 *
 * Per project_tracpost_anchor_first_compose.md, an anchor is a TracPost-owned
 * destination URL that a social post can point at. Five potential sources
 * exist in the schema:
 *
 *   1. blog_posts          — editorial + project-flavored articles
 *   2. projects            — case-study pages
 *   3. brands              — per-brand pages (for subscribers carrying brands)
 *   4. locations           — location-specific pages (multi-location)
 *   5. clients             — client testimonial pages (with consent)
 *
 * This audit reports per-table counts and samples for the Epicurious
 * Kitchens site so we can see how deep the anchor pool actually is.
 *
 * Run: node scripts/audit-anchors-epicurious.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function audit() {
  const sql = neon(process.env.DATABASE_URL);

  // ── Find Epicurious Kitchens ──────────────────────────────────
  const sites = await sql`
    SELECT id, name, url, business_type, place_name
    FROM sites
    WHERE LOWER(name) LIKE '%epicurious%'
  `;

  if (sites.length === 0) {
    console.log("No site matching 'epicurious' found.");
    return;
  }
  if (sites.length > 1) {
    console.log(`Found ${sites.length} sites matching 'epicurious':`);
    for (const s of sites) {
      console.log(`  - ${s.name} (${s.id})`);
    }
    console.log("Using the first one for the audit.");
  }

  const site = sites[0];
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  ANCHOR AUDIT — ${site.name}`);
  console.log(`  site_id: ${site.id}`);
  console.log(`  url:     ${site.url || "(not set)"}`);
  console.log(`  type:    ${site.business_type || "(not set)"}`);
  console.log(`  place:   ${site.place_name || "(not set)"}`);
  console.log("═══════════════════════════════════════════════════════════════");

  const siteId = site.id;

  // ── 1. blog_posts (editorial + project flavors) ────────────────
  console.log("");
  console.log("─── 1. BLOG POSTS ───────────────────────────────────────────");
  const blogTotal = await sql`
    SELECT COUNT(*)::int AS n FROM blog_posts WHERE site_id = ${siteId}
  `;
  const blogByStatus = await sql`
    SELECT status, COUNT(*)::int AS n FROM blog_posts
    WHERE site_id = ${siteId}
    GROUP BY status
    ORDER BY n DESC
  `;
  const blogByPillar = await sql`
    SELECT COALESCE(content_pillar, '(none)') AS pillar, COUNT(*)::int AS n
    FROM blog_posts
    WHERE site_id = ${siteId}
    GROUP BY content_pillar
    ORDER BY n DESC
  `;
  const blogProjectCount = await sql`
    SELECT COUNT(*)::int AS n FROM blog_posts
    WHERE site_id = ${siteId} AND source_asset_id IS NOT NULL
  `;
  console.log(`  Total: ${blogTotal[0].n}`);
  console.log(`  Editorial (no source_asset): ${blogTotal[0].n - blogProjectCount[0].n}`);
  console.log(`  Project-flavored (has source_asset): ${blogProjectCount[0].n}`);
  console.log("  By status:");
  for (const r of blogByStatus) {
    console.log(`    ${String(r.status).padEnd(20)} ${r.n}`);
  }
  if (blogByPillar.length > 0) {
    console.log("  By content pillar (top 10):");
    for (const r of blogByPillar.slice(0, 10)) {
      console.log(`    ${String(r.pillar).padEnd(20)} ${r.n}`);
    }
  }
  // Recent samples
  const blogSamples = await sql`
    SELECT title, status, content_pillar, published_at, source_asset_id IS NOT NULL AS has_asset
    FROM blog_posts
    WHERE site_id = ${siteId}
    ORDER BY COALESCE(published_at, created_at) DESC
    LIMIT 10
  `;
  if (blogSamples.length > 0) {
    console.log("  Recent samples (up to 10):");
    for (const b of blogSamples) {
      const flavor = b.has_asset ? "project" : "editorial";
      const date = b.published_at ? String(b.published_at).slice(0, 10) : "(unpublished)";
      console.log(`    [${flavor}] [${b.status}] ${date} — ${b.title}`);
    }
  }

  // ── 2. projects ────────────────────────────────────────────────
  console.log("");
  console.log("─── 2. PROJECTS ─────────────────────────────────────────────");
  const projTotal = await sql`
    SELECT COUNT(*)::int AS n FROM projects WHERE site_id = ${siteId}
  `;
  const projByStatus = await sql`
    SELECT status, COUNT(*)::int AS n FROM projects
    WHERE site_id = ${siteId}
    GROUP BY status
    ORDER BY n DESC
  `;
  console.log(`  Total: ${projTotal[0].n}`);
  console.log("  By status:");
  for (const r of projByStatus) {
    console.log(`    ${String(r.status).padEnd(20)} ${r.n}`);
  }
  const projSamples = await sql`
    SELECT name, slug, status, start_date, end_date
    FROM projects
    WHERE site_id = ${siteId}
    ORDER BY COALESCE(end_date, start_date, created_at) DESC NULLS LAST
    LIMIT 10
  `;
  if (projSamples.length > 0) {
    console.log("  Recent samples (up to 10):");
    for (const p of projSamples) {
      const date = p.end_date || p.start_date || "(no date)";
      console.log(`    [${p.status}] ${date} — ${p.name} (/${p.slug})`);
    }
  }

  // ── 3. brands ──────────────────────────────────────────────────
  console.log("");
  console.log("─── 3. BRANDS ───────────────────────────────────────────────");
  const brandTotal = await sql`
    SELECT COUNT(*)::int AS n FROM brands WHERE site_id = ${siteId}
  `;
  console.log(`  Total: ${brandTotal[0].n}`);
  const brandSamples = await sql`
    SELECT name, slug FROM brands WHERE site_id = ${siteId}
    ORDER BY name LIMIT 10
  `;
  if (brandSamples.length > 0) {
    console.log("  Samples (up to 10):");
    for (const b of brandSamples) {
      console.log(`    ${b.name} (/${b.slug})`);
    }
  }

  // ── 4. locations ───────────────────────────────────────────────
  console.log("");
  console.log("─── 4. LOCATIONS ────────────────────────────────────────────");
  const locTotal = await sql`
    SELECT COUNT(*)::int AS n FROM locations WHERE site_id = ${siteId}
  `;
  console.log(`  Total: ${locTotal[0].n}`);
  const locSamples = await sql`
    SELECT name, slug, city, state FROM locations WHERE site_id = ${siteId}
    ORDER BY name LIMIT 10
  `;
  if (locSamples.length > 0) {
    console.log("  Samples (up to 10):");
    for (const l of locSamples) {
      const where = [l.city, l.state].filter(Boolean).join(", ");
      console.log(`    ${l.name}${where ? ` — ${where}` : ""} (/${l.slug})`);
    }
  }

  // ── 5. clients ─────────────────────────────────────────────────
  console.log("");
  console.log("─── 5. CLIENTS ──────────────────────────────────────────────");
  const cliTotal = await sql`
    SELECT COUNT(*)::int AS n FROM clients WHERE site_id = ${siteId}
  `;
  const cliConsented = await sql`
    SELECT COUNT(*)::int AS n FROM clients
    WHERE site_id = ${siteId} AND consent_given = true
  `;
  console.log(`  Total: ${cliTotal[0].n}  (with consent: ${cliConsented[0].n})`);
  const cliSamples = await sql`
    SELECT name, display_name, slug, consent_given FROM clients
    WHERE site_id = ${siteId}
    ORDER BY name LIMIT 10
  `;
  if (cliSamples.length > 0) {
    console.log("  Samples (up to 10):");
    for (const c of cliSamples) {
      const consent = c.consent_given ? "✓" : "✗";
      console.log(`    [${consent}] ${c.display_name || c.name} (/${c.slug})`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ANCHOR POOL SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  const total = blogTotal[0].n + projTotal[0].n + brandTotal[0].n + locTotal[0].n + cliConsented[0].n;
  console.log(`  Blog posts:       ${blogTotal[0].n}`);
  console.log(`    └─ editorial:   ${blogTotal[0].n - blogProjectCount[0].n}`);
  console.log(`    └─ project:     ${blogProjectCount[0].n}`);
  console.log(`  Projects:         ${projTotal[0].n}`);
  console.log(`  Brands:           ${brandTotal[0].n}`);
  console.log(`  Locations:        ${locTotal[0].n}`);
  console.log(`  Clients (cons.):  ${cliConsented[0].n}`);
  console.log(`                    ────`);
  console.log(`  Total anchors:    ${total}`);
  console.log("");
  console.log("Notes:");
  console.log("  - Anchor-first Compose (#119) would surface published blog posts + project");
  console.log("    pages as the primary anchor sources. Brands/locations/clients are");
  console.log("    less commonly chosen but valid destinations.");
  console.log("  - Status filter: only 'published' blog_posts and 'active' projects make");
  console.log("    sense as anchors (drafts shouldn't be linked to from social).");
}

audit().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
