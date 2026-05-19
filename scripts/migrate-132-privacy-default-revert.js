/**
 * Migration 132: Revert privacy defaults to conservative.
 *
 * Migrations 130 → 131 → 132 = the architectural arc:
 *   130: Shipped with conservative defaults (blur + anonymize)
 *   131: Flipped to permissive (asis + allow_names) to "match industry
 *        norms" — created the awkward unsigned-permissive state that
 *        required first-visit modal + planned dashboard banner to chase
 *        down waiver signatures
 *   132: Revert. Subscriber experience is identical either way (since
 *        unsigned-permissive resolves to conservative anyway via the
 *        runtime fall-back), so the simplest architecture wins:
 *        defaults are immediately operational with no waiver overhead.
 *
 * Conservative defaults eliminate:
 *   - First-visit modal trigger (no unsigned-permissive state exists)
 *   - Need for dashboard banner nudges
 *   - "you've chosen as-is but haven't signed" warning panels
 *   - The whole class of "subscriber on permissive policy without
 *     having explicitly consented" awkwardness
 *
 * Existing rows are flipped back to conservative ONLY if their waiver
 * is NULL — preserves any row where the subscriber explicitly signed
 * (i.e., genuinely opted into permissive). That subscriber's choice
 * stands.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("132: Reverting privacy defaults to conservative (blur + anonymize)...");

  // Column defaults for new rows
  await sql`ALTER TABLE sites ALTER COLUMN face_policy SET DEFAULT 'blur'`;
  console.log("  + sites.face_policy default → 'blur'");

  await sql`ALTER TABLE sites ALTER COLUMN identity_policy SET DEFAULT 'anonymize'`;
  console.log("  + sites.identity_policy default → 'anonymize'");

  // Flip existing unsigned rows back. Preserve any row where subscriber
  // explicitly signed (that's a genuine opt-in we don't override).
  const faceFlips = await sql`
    UPDATE sites SET face_policy = 'blur'
    WHERE face_policy = 'asis'
      AND face_waiver_signed_at IS NULL
    RETURNING id, name
  `;
  console.log(`  + ${faceFlips.length} sites reverted to face_policy='blur' (unsigned, never opted in)`);

  const idFlips = await sql`
    UPDATE sites SET identity_policy = 'anonymize'
    WHERE identity_policy = 'allow_names'
      AND identity_waiver_signed_at IS NULL
    RETURNING id, name
  `;
  console.log(`  + ${idFlips.length} sites reverted to identity_policy='anonymize' (unsigned, never opted in)`);

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
