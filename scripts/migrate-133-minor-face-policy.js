/**
 * Migration 133: Add minor face policy axis.
 *
 * Parallel to face_policy + face_waiver but for minor faces. The two
 * policies are applied per-face at variant render time, routed by
 * AWS Rekognition AgeRange detection (faces with AgeRange.Low < 18
 * get minor_face_policy; older faces get face_policy).
 *
 * Why two axes instead of one: subscribers commonly have ADULT consent
 * (employees, clients) but lack PARENTAL consent for minors who appear
 * in their content (kids in the background of a crew shot, family at
 * an event). Single uniform face_policy would force them to choose
 * between blurring everyone OR publishing minors without parental
 * consent. Two policies + per-face routing honors both realities.
 *
 * Defaults: minor_face_policy = 'blur', minor_face_waiver_signed_at =
 * NULL. Same fall-back-to-conservative semantics as face_policy —
 * 'asis' without signed waiver resolves to 'blur'.
 *
 * The minor face waiver text (stored as version string here, drafted
 * in the privacy panel UI) is meaningfully stronger than the adult
 * face waiver: parental/legal-guardian consent, non-negotiable
 * framing, subscriber affirms they have a verification process.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("133: Adding minor face policy axis to sites...");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS minor_face_policy TEXT NOT NULL DEFAULT 'blur'`;
  console.log("  + sites.minor_face_policy (default 'blur')");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS minor_face_waiver_signed_at TIMESTAMPTZ`;
  console.log("  + sites.minor_face_waiver_signed_at");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS minor_face_waiver_version TEXT`;
  console.log("  + sites.minor_face_waiver_version");

  await sql`ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_minor_face_policy_check`;
  await sql`
    ALTER TABLE sites
    ADD CONSTRAINT sites_minor_face_policy_check
    CHECK (minor_face_policy IN ('asis', 'box', 'blur', 'suppress'))
  `;
  console.log("  + sites_minor_face_policy_check");

  const distribution = await sql`
    SELECT minor_face_policy, COUNT(*)::int AS n FROM sites GROUP BY minor_face_policy
  `;
  console.log("\n  sites.minor_face_policy distribution:");
  for (const r of distribution) console.log(`    ${r.minor_face_policy}: ${r.n}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
