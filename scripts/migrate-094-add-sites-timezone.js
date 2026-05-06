/**
 * Migration 094: Add sites.timezone (IANA timezone string).
 *
 * Foundational for the manual-first publishing pipeline rebuild — the
 * Compose Schedule UI, the On Deck page, and the countdown component
 * all need to interpret scheduled_at in the BUSINESS's timezone, not
 * the subscriber's browser tz (which can drift wildly — operator at a
 * coffee shop in Mexico, business in Pittsburgh).
 *
 * Authoritative source: business location (sites.place_id + place_lat
 * + place_lon). On pick (LocationPicker callback chain), backend calls
 * Google Time Zone API with lat/lon → IANA name → persists to
 * sites.timezone alongside the canonical place fields.
 *
 * Manual override field is a v2 nice-to-have (deferred per
 * project_tracpost_manual_first_rebuild memory). v1 just auto-resolves
 * from canonical place.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("094: add sites.timezone (IANA)...");

  await sql`
    ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS timezone TEXT
  `;
  console.log("  + sites.timezone TEXT (nullable)");

  // ── Verification ─────────────────────────────────────────────
  const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM sites`;
  const [{ withPlace }] = await sql`
    SELECT COUNT(*)::int AS withPlace FROM sites
    WHERE place_lat IS NOT NULL AND place_lon IS NOT NULL
  `;
  const [{ withTz }] = await sql`
    SELECT COUNT(*)::int AS withTz FROM sites WHERE timezone IS NOT NULL
  `;

  console.log("");
  console.log(`✓ Migration 094 complete. ${total} sites · ${withPlace} have canonical place · ${withTz} have timezone.`);
  if (withPlace > withTz) {
    console.log(`  ⚠ ${withPlace - withTz} site(s) have a canonical place but no timezone — run scripts/backfill-timezone.js to populate.`);
  }
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
