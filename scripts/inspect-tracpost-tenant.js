/**
 * One-off: dump the current state of a site + its blog_settings +
 * subscription row. Use to diagnose why provisioning is skipping steps.
 *
 * Usage: node scripts/inspect-tracpost-tenant.js <site_id>
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const siteId = process.argv[2];
  if (!siteId) {
    console.error("Usage: node scripts/inspect-tracpost-tenant.js <site_id>");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  const [site] = await sql`
    SELECT id, name, blog_slug, business_type, location, url,
           provisioning_status, is_active,
           (brand_playbook IS NOT NULL) AS has_playbook,
           (brand_voice IS NOT NULL) AS has_brand_voice,
           (pillar_config IS NOT NULL) AS has_pillar_config,
           (image_style IS NOT NULL AND image_style != '') AS has_image_style,
           brand_voice->>'_source' AS brand_voice_source,
           brand_playbook->>'version' AS playbook_version,
           updated_at
    FROM sites WHERE id = ${siteId}
  `;

  if (!site) {
    console.error(`Site ${siteId} not found`);
    process.exit(1);
  }

  console.log("sites row:");
  for (const [k, v] of Object.entries(site)) {
    console.log(`  ${k.padEnd(24)} = ${v === null ? "(null)" : v}`);
  }

  const [blog] = await sql`
    SELECT site_id, blog_enabled, subdomain, custom_domain, blog_title, theme IS NOT NULL AS has_theme,
           nav_links IS NOT NULL AS has_nav
    FROM blog_settings WHERE site_id = ${siteId}
  `;

  console.log("\nblog_settings row:");
  if (!blog) {
    console.log("  (none)");
  } else {
    for (const [k, v] of Object.entries(blog)) {
      console.log(`  ${k.padEnd(24)} = ${v === null ? "(null)" : v}`);
    }
  }

  // What the provision endpoint's condition would evaluate to right now
  const wouldGeneratePlaybook = !site.has_playbook && !!site.business_type;
  const wouldEnableBlog = !blog?.blog_enabled;

  console.log("\nprovision would:");
  console.log(`  generate playbook?    ${wouldGeneratePlaybook}`);
  console.log(`    (!has_playbook=${!site.has_playbook}, business_type truthy=${!!site.business_type})`);
  console.log(`  enable blog?          ${wouldEnableBlog}`);
  console.log(`  derive theme?         ${!!site.url}`);
  console.log(`  seed nav?             ${!!site.url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
