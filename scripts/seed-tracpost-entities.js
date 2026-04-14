/**
 * One-off: seed brands + projects for the TracPost self-tenant, and tag
 * the 13 screenshots to their appropriate brand(s) and project.
 *
 * Idempotent — re-runnable. Uses ON CONFLICT DO UPDATE / DO NOTHING.
 *
 * Usage: node scripts/seed-tracpost-entities.js <site_id> [--dry-run]
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

// ── Brands ──
const BRANDS = [
  // Tenant-brands (the three featured subjects)
  {
    slug: "tracpost",
    name: "TracPost",
    url: "https://tracpost.com",
    description:
      "Content automation platform — The Content Engine. Built so small businesses publish like they have a content team.",
  },
  {
    slug: "epicurious-kitchens",
    name: "Epicurious Kitchens",
    url: "https://staging.tracpost.com/epicurious-kitchens",
    description:
      "Luxury kitchen remodeler in Greater Pittsburgh — The Culinary Performance Brand. Featured as a TracPost case study.",
  },
  {
    slug: "b2-construction",
    name: "B2 Construction",
    url: "https://b2construct.com",
    description:
      "Structural contractor specializing in complex Pittsburgh projects — The Complex Project Specialist. Featured as a TracPost case study.",
  },

  // Vendor-brands (TracPost's stack)
  {
    slug: "vercel",
    name: "Vercel",
    url: "https://vercel.com",
    description: "Hosting and deployment platform for the TracPost application.",
  },
  {
    slug: "neon",
    name: "Neon",
    url: "https://neon.tech",
    description: "Serverless Postgres — platform and tenant databases.",
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    url: "https://anthropic.com",
    description:
      "Maker of Claude, the model behind TracPost's brand intelligence, caption generation, and article writing.",
  },
  {
    slug: "cloudflare-r2",
    name: "Cloudflare R2",
    url: "https://www.cloudflare.com/developer-platform/products/r2/",
    description: "Object storage for tenant media assets — photos, video, PDFs.",
  },
  {
    slug: "cloudflare",
    name: "Cloudflare",
    url: "https://cloudflare.com",
    description: "DNS and edge for the TracPost platform and tenant subdomains.",
  },
  {
    slug: "resend",
    name: "Resend",
    url: "https://resend.com",
    description: "Transactional email — onboarding, DNS instructions, magic links.",
  },
  {
    slug: "stripe",
    name: "Stripe",
    url: "https://stripe.com",
    description: "Subscriber billing and checkout.",
  },
  {
    slug: "twilio",
    name: "Twilio",
    url: "https://twilio.com",
    description: "SMS verification during tenant onboarding.",
  },
];

// ── Projects ──
const PROJECTS = [
  {
    slug: "tracpost-platform-tour",
    name: "TracPost Platform Tour",
    description:
      "A walk through what a TracPost tenant actually experiences — from the baseline playbook that arrives already built, through the moment of sharpening it into something unmistakably theirs, to the studio where the AI drafts everything in their voice.",
  },
  {
    slug: "epicurious-kitchens",
    name: "Epicurious Kitchens",
    description:
      "How a luxury kitchen remodeler in Greater Pittsburgh uses TracPost to write in the voice of its craft — serious cooks, the spaces that serve them, and the language of culinary performance.",
  },
  {
    slug: "b2-construction",
    name: "B2 Construction",
    description:
      "How a structural contractor uses TracPost to write with the authority of a crew that keeps its work in-house — the complex projects other contractors turn down.",
  },
];

// ── Asset → (projects[], brands[]) mapping, keyed by filename substring ──
// Assets CAN live in multiple projects — the sharpened playbook shots (212044,
// 211908) are primary evidence for their tenant case study AND secondary
// evidence in the platform-tour overview.
const ASSET_MAP = {
  // Playbook shots
  "212207":              { projects: ["tracpost-platform-tour"],                                 brands: ["tracpost"] },
  "212044":              { projects: ["epicurious-kitchens", "tracpost-platform-tour"],          brands: ["epicurious-kitchens", "tracpost"] },
  "211908":              { projects: ["b2-construction", "tracpost-platform-tour"],              brands: ["b2-construction", "tracpost"] },
  "Brand_Intelligence":  { projects: ["tracpost-platform-tour"],                                 brands: ["tracpost", "epicurious-kitchens", "b2-construction"] },

  // B2 Construction published outputs
  "b2home":              { projects: ["b2-construction"],                                        brands: ["b2-construction"] },
  "b2_projects":         { projects: ["b2-construction"],                                        brands: ["b2-construction"] },
  "b2blog":              { projects: ["b2-construction"],                                        brands: ["b2-construction"] },

  // Epicurious Kitchens published outputs
  "ekarticle":           { projects: ["epicurious-kitchens"],                                    brands: ["epicurious-kitchens"] },
  "ekblog":              { projects: ["epicurious-kitchens"],                                    brands: ["epicurious-kitchens"] },

  // Epicurious Kitchens studio-experience shots (also tagged TracPost — TracPost UI visible)
  "ekcalendar":          { projects: ["epicurious-kitchens"],                                    brands: ["epicurious-kitchens", "tracpost"] },
  "ekmedia":             { projects: ["epicurious-kitchens"],                                    brands: ["epicurious-kitchens", "tracpost"] },
  "ekstudioblog":        { projects: ["epicurious-kitchens"],                                    brands: ["epicurious-kitchens", "tracpost"] },
  "ekstudioconnections": { projects: ["epicurious-kitchens"],                                    brands: ["epicurious-kitchens", "tracpost"] },
};

async function main() {
  const siteId = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!siteId) {
    console.error("Usage: node scripts/seed-tracpost-entities.js <site_id> [--dry-run]");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  // Sanity — site exists
  const [site] = await sql`SELECT id, name, blog_slug FROM sites WHERE id = ${siteId}`;
  if (!site) {
    console.error(`Site ${siteId} not found`);
    process.exit(1);
  }
  console.log(`Seeding entities for site: ${site.name} (slug: ${site.blog_slug})\n`);

  // Load assets so we can build the tag plan before writing
  const assets = await sql`
    SELECT id, storage_url, metadata FROM media_assets WHERE site_id = ${siteId}
  `;
  console.log(`Found ${assets.length} assets to consider\n`);

  // Build the tag plan
  const plan = [];
  const unmatched = [];
  const ambiguous = [];

  for (const asset of assets) {
    const filename =
      (asset.metadata || {}).original_filename ||
      asset.storage_url.split("/").pop()?.split("?")[0] ||
      "";
    const haystack = filename.toLowerCase();

    const keyHits = Object.keys(ASSET_MAP).filter((k) =>
      haystack.includes(k.toLowerCase())
    );

    if (keyHits.length === 0) {
      unmatched.push({ id: asset.id, filename });
    } else if (keyHits.length > 1) {
      ambiguous.push({ id: asset.id, filename, hits: keyHits });
    } else {
      const map = ASSET_MAP[keyHits[0]];
      plan.push({
        id: asset.id,
        filename,
        key: keyHits[0],
        projects: map.projects,
        brands: map.brands,
      });
    }
  }

  // Print the plan
  console.log(`Brands to upsert (${BRANDS.length}):`);
  for (const b of BRANDS) console.log(`  ${b.slug.padEnd(20)}  ${b.name}`);

  console.log(`\nProjects to upsert (${PROJECTS.length}):`);
  for (const p of PROJECTS) console.log(`  ${p.slug.padEnd(28)}  ${p.name}`);

  console.log(`\nAsset tagging plan (${plan.length} of ${assets.length}):`);
  for (const row of plan) {
    console.log(
      `  ${row.filename.padEnd(40)}  projects=[${row.projects.join(", ")}]  brands=[${row.brands.join(", ")}]`
    );
  }

  if (unmatched.length) {
    console.log(`\nUnmatched (${unmatched.length}):`);
    for (const u of unmatched) console.log(`  ${u.filename}  (${u.id})`);
  }
  if (ambiguous.length) {
    console.log(`\nAmbiguous (${ambiguous.length}):`);
    for (const a of ambiguous) console.log(`  ${a.filename}  →  ${a.hits.join(", ")}`);
    console.error("\nRefusing to apply — tighten ASSET_MAP keys.");
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n--dry-run set — no changes written.");
    return;
  }

  // Apply
  // 1. Upsert brands
  const brandIds = {};
  for (const b of BRANDS) {
    const [row] = await sql`
      INSERT INTO brands (site_id, name, slug, url, description)
      VALUES (${siteId}, ${b.name}, ${b.slug}, ${b.url}, ${b.description})
      ON CONFLICT (site_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        url = EXCLUDED.url,
        description = EXCLUDED.description
      RETURNING id
    `;
    brandIds[b.slug] = row.id;
  }
  console.log(`\nUpserted ${BRANDS.length} brands.`);

  // 2. Upsert projects
  const projectIds = {};
  for (const p of PROJECTS) {
    const [row] = await sql`
      INSERT INTO projects (site_id, name, slug, description, status)
      VALUES (${siteId}, ${p.name}, ${p.slug}, ${p.description}, 'active')
      ON CONFLICT (site_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description
      RETURNING id
    `;
    projectIds[p.slug] = row.id;
  }
  console.log(`Upserted ${PROJECTS.length} projects.`);

  // 3. Tag assets
  for (const row of plan) {
    for (const projectSlug of row.projects) {
      await sql`
        INSERT INTO asset_projects (asset_id, project_id)
        VALUES (${row.id}, ${projectIds[projectSlug]})
        ON CONFLICT DO NOTHING
      `;
    }
    for (const brandSlug of row.brands) {
      await sql`
        INSERT INTO asset_brands (asset_id, brand_id)
        VALUES (${row.id}, ${brandIds[brandSlug]})
        ON CONFLICT DO NOTHING
      `;
    }
  }
  console.log(`Tagged ${plan.length} assets.`);

  // Summary
  const summary = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM brands WHERE site_id = ${siteId}) AS brands,
      (SELECT COUNT(*)::int FROM projects WHERE site_id = ${siteId}) AS projects,
      (SELECT COUNT(*)::int FROM asset_brands ab
       JOIN media_assets ma ON ma.id = ab.asset_id
       WHERE ma.site_id = ${siteId}) AS asset_brand_links,
      (SELECT COUNT(*)::int FROM asset_projects ap
       JOIN media_assets ma ON ma.id = ap.asset_id
       WHERE ma.site_id = ${siteId}) AS asset_project_links
  `;
  console.log(`\nFinal state for this site:`);
  console.log(`  brands              = ${summary[0].brands}`);
  console.log(`  projects            = ${summary[0].projects}`);
  console.log(`  asset_brand_links   = ${summary[0].asset_brand_links}`);
  console.log(`  asset_project_links = ${summary[0].asset_project_links}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
