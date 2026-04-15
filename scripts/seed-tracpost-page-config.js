#!/usr/bin/env node
/**
 * Seeds TracPost's own tenant row with an explicit page_config using
 * the SaaS-flavored variants — so the centralized marketing site
 * renders the saas_landing home instead of the service_business default.
 *
 * Idempotent: running again overwrites the page_config column.
 * Run: node scripts/seed-tracpost-page-config.js
 */
require("dotenv").config({ path: ".env.local" });
const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

const SAAS_PAGE_CONFIG = [
  { id: 1, key: "home",     enabled: true, label: "Home",          path: "",          variant: "saas_landing" },
  { id: 2, key: "about",    enabled: true, label: "About",         path: "about",     variant: "founder" },
  { id: 3, key: "work",     enabled: true, label: "Pricing",       path: "work",      variant: "pricing_tiers" },
  { id: 4, key: "blog",     enabled: true, label: "Blog",          path: "blog",      variant: "journal" },
  { id: 5, key: "projects", enabled: true, label: "Case Studies",  path: "projects",  variant: "case_studies" },
  { id: 6, key: "contact",  enabled: true, label: "Contact",       path: "contact",   variant: "booking_demo" },
];

async function main() {
  const [site] = await sql`SELECT id, name, blog_slug FROM sites WHERE blog_slug = 'tracpost'`;
  if (!site) {
    console.error("No site with blog_slug='tracpost' — onboard TracPost first.");
    process.exit(1);
  }

  await sql`
    UPDATE sites
       SET page_config = ${JSON.stringify(SAAS_PAGE_CONFIG)}::jsonb
     WHERE id = ${site.id}
  `;

  console.log(`Seeded page_config for ${site.name} (${site.id})`);
  for (const slot of SAAS_PAGE_CONFIG) {
    console.log(`  ${slot.id}. ${slot.label.padEnd(13)} → ${slot.variant}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
