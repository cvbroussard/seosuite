/**
 * Provision a reviewer subscriber — for Meta App Review handoff.
 *
 * Backdoors a fully-onboarded enterprise subscriber with:
 *   - users row with bcrypt-hashed password
 *   - subscriptions row, plan='enterprise', is_active=true
 *   - exactly one sites row, provisioning_status='complete'
 *   - NO platform connections (reviewer triggers OAuth themselves)
 *
 * Idempotent: re-running with the same email updates the row instead of
 * inserting. Safe to use to reset state between review cycles.
 *
 * Usage:
 *   node scripts/provision-reviewer-subscriber.js \
 *     --email=metareview@tracpost.com \
 *     --password='ChangeMe-2026!' \
 *     --site-name='Test 2 Renovations' \
 *     --site-url='https://test2.tracpost.com' \
 *     --business-type=renovation_contractor \
 *     --location='Houston, TX'
 */
const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const a = parseArgs();
  const required = ["email", "password", "site-name", "site-url"];
  const missing = required.filter((k) => !a[k]);
  if (missing.length) {
    console.error("Missing required args: " + missing.map((k) => "--" + k).join(", "));
    console.error("See header comment for usage.");
    process.exit(1);
  }

  const email = a.email.trim().toLowerCase();
  const password = a.password;
  const siteName = a["site-name"];
  const siteUrl = a["site-url"];
  const businessType = a["business-type"] || "renovation_contractor";
  const location = a.location || "Houston, TX";
  const ownerName = a["owner-name"] || "Reviewer Test";

  console.log(`Provisioning reviewer subscriber: ${email}`);

  // 1. Subscription
  const [sub] = await sql`
    INSERT INTO subscriptions (plan, is_active, metadata)
    SELECT 'enterprise', true, ${JSON.stringify({ purpose: "meta_app_review" })}::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM users WHERE email = ${email}
    )
    RETURNING id
  `;
  let subscriptionId;
  if (sub) {
    subscriptionId = sub.id;
    console.log(`  Created subscription ${subscriptionId}`);
  } else {
    const [existing] = await sql`SELECT subscription_id FROM users WHERE email = ${email}`;
    subscriptionId = existing.subscription_id;
    await sql`UPDATE subscriptions SET plan = 'enterprise', is_active = true WHERE id = ${subscriptionId}`;
    console.log(`  Updated existing subscription ${subscriptionId} to enterprise`);
  }

  // 2. User with bcrypt password
  const passwordHash = bcrypt.hashSync(password, 10);
  await sql`
    INSERT INTO users (subscription_id, name, email, password_hash, role, is_active)
    VALUES (${subscriptionId}, ${ownerName}, ${email}, ${passwordHash}, 'owner', true)
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = 'owner',
      is_active = true,
      updated_at = NOW()
  `;
  console.log(`  Set password for ${email}`);

  // 3. Site (exactly one) — create if absent, otherwise leave alone
  const existingSites = await sql`
    SELECT id, name FROM sites WHERE subscription_id = ${subscriptionId}
  `;
  let siteId;
  if (existingSites.length === 0) {
    const [site] = await sql`
      INSERT INTO sites (
        subscription_id, name, url, business_type, location,
        provisioning_status, is_active
      )
      VALUES (
        ${subscriptionId}, ${siteName}, ${siteUrl}, ${businessType}, ${location},
        'complete', true
      )
      RETURNING id
    `;
    siteId = site.id;
    console.log(`  Created site ${siteId} (${siteName})`);
  } else if (existingSites.length === 1) {
    siteId = existingSites[0].id;
    await sql`
      UPDATE sites
      SET name = ${siteName}, url = ${siteUrl},
          business_type = ${businessType}, location = ${location},
          provisioning_status = 'complete', is_active = true,
          updated_at = NOW()
      WHERE id = ${siteId}
    `;
    console.log(`  Updated existing site ${siteId} (${existingSites[0].name} → ${siteName})`);
  } else {
    console.error(`  ERROR: subscription ${subscriptionId} already has ${existingSites.length} sites — refusing to provision (auto-assign-on-single-site requires exactly 1).`);
    process.exit(1);
  }

  // 4. Verify no platform connections exist (reviewer must trigger OAuth themselves)
  const [{ n: socialCount }] = await sql`
    SELECT COUNT(*)::int AS n FROM social_accounts WHERE subscription_id = ${subscriptionId}
  `;
  if (socialCount > 0) {
    console.warn(`  WARNING: ${socialCount} social_accounts row(s) exist for this subscription. Delete manually if reviewer should start clean.`);
  }

  console.log(`\nDone. Sign in at https://app.tracpost.com/login with:`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
