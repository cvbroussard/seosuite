/**
 * Migration 130: Add face + identity privacy policy columns to sites.
 *
 * Two independent privacy axes (locked 2026-05-19):
 *
 *   face_policy        — what happens to detected faces in published images
 *     'blur'      (default) — gaussian blur over each detected face region
 *     'box'                 — solid rectangle overlay over each face
 *     'asis'                — pass faces through unaltered (waiver required)
 *     'suppress'            — do not publish asset if faces detected
 *
 *   identity_policy    — what happens to proper names mentioned in transcripts
 *     'anonymize' (default) — caption-gen substitutes generic role descriptors
 *     'allow_names'         — caption-gen preserves names verbatim (waiver req'd)
 *
 * Each axis has independent waiver tracking (signed_at + version). Waivers
 * are required for the permissive option on each axis. Subscriber can sign
 * one without the other, or both, or neither — they're orthogonal consent.
 *
 * Defaults land everyone on the safe posture so no existing site breaks.
 * Waivers stay NULL until subscriber explicitly elects a permissive option
 * via the Privacy settings page.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("130: Adding face + identity privacy columns to sites...");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS face_policy TEXT NOT NULL DEFAULT 'blur'`;
  console.log("  + sites.face_policy (default 'blur')");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS face_waiver_signed_at TIMESTAMPTZ`;
  console.log("  + sites.face_waiver_signed_at");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS face_waiver_version TEXT`;
  console.log("  + sites.face_waiver_version");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS identity_policy TEXT NOT NULL DEFAULT 'anonymize'`;
  console.log("  + sites.identity_policy (default 'anonymize')");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS identity_waiver_signed_at TIMESTAMPTZ`;
  console.log("  + sites.identity_waiver_signed_at");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS identity_waiver_version TEXT`;
  console.log("  + sites.identity_waiver_version");

  // CHECK constraints — drop-then-add for idempotency
  await sql`ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_face_policy_check`;
  await sql`
    ALTER TABLE sites
    ADD CONSTRAINT sites_face_policy_check
    CHECK (face_policy IN ('asis', 'box', 'blur', 'suppress'))
  `;
  console.log("  + sites_face_policy_check");

  await sql`ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_identity_policy_check`;
  await sql`
    ALTER TABLE sites
    ADD CONSTRAINT sites_identity_policy_check
    CHECK (identity_policy IN ('allow_names', 'anonymize'))
  `;
  console.log("  + sites_identity_policy_check");

  // Distribution check
  const facePolicies = await sql`
    SELECT face_policy, COUNT(*)::int AS n FROM sites GROUP BY face_policy
  `;
  console.log("\n  sites.face_policy distribution:");
  for (const r of facePolicies) console.log(`    ${r.face_policy}: ${r.n}`);

  const idPolicies = await sql`
    SELECT identity_policy, COUNT(*)::int AS n FROM sites GROUP BY identity_policy
  `;
  console.log("\n  sites.identity_policy distribution:");
  for (const r of idPolicies) console.log(`    ${r.identity_policy}: ${r.n}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
