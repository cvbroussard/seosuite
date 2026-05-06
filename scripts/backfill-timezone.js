/**
 * One-shot backfill: populate sites.timezone for any site that has
 * canonical place coords (place_lat + place_lon) but no timezone.
 *
 * Calls Google Time Zone API per site. Throttles politely (250ms
 * between calls) so we don't hammer Google. Idempotent — safe to
 * re-run; rows that already have timezone are skipped.
 *
 * Run: node scripts/backfill-timezone.js
 *
 * Pairs with migration 094 + the canonical place picker chain
 * extension (the live persistence path now resolves timezone on
 * pick; this fills in pre-existing rows that picked their place
 * before the timezone resolver was wired).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const TIMEZONE_API = "https://maps.googleapis.com/maps/api/timezone/json";
const SLEEP_MS = 250;

async function getTimezoneForCoords(latitude, longitude) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const url = `${TIMEZONE_API}?location=${latitude},${longitude}&timestamp=${timestamp}&key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK") return null;
    return data.timeZoneId || null;
  } catch {
    return null;
  }
}

async function backfill() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Backfill: sites.timezone from canonical place coords...\n");

  const candidates = await sql`
    SELECT id, name, place_lat, place_lon
    FROM sites
    WHERE place_lat IS NOT NULL
      AND place_lon IS NOT NULL
      AND timezone IS NULL
    ORDER BY created_at ASC
  `;

  if (candidates.length === 0) {
    console.log("  Nothing to do — every site with a canonical place already has a timezone.");
    return;
  }

  console.log(`  Found ${candidates.length} site(s) needing timezone resolution.\n`);

  let resolved = 0;
  let failed = 0;
  for (const site of candidates) {
    const tz = await getTimezoneForCoords(Number(site.place_lat), Number(site.place_lon));
    if (tz) {
      await sql`UPDATE sites SET timezone = ${tz} WHERE id = ${site.id}`;
      console.log(`  ✓ ${String(site.name).padEnd(28)} → ${tz}`);
      resolved++;
    } else {
      console.log(`  ✗ ${String(site.name).padEnd(28)} → could not resolve`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  console.log(`\n✓ Backfill complete. Resolved: ${resolved} · Failed: ${failed}.`);
  if (failed > 0) {
    console.log("  Failed rows can be re-run by invoking this script again — safe to repeat.");
  }
}

backfill().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
