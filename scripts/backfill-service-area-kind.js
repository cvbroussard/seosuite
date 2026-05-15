/**
 * Backfill service_areas_canonical.kind for entries with a place_id.
 *
 * Re-derives kind from Google Places types + displayName for every
 * canonical row that has a place_id, using the same logic as the live
 * deriveKindFromTypes() function. Updates rows where the derived kind
 * differs from what's stored.
 *
 * Origin: 2026-05-15 testing surfaced that early entries created via
 * the Google Places picker all came in as "city" because the legacy
 * Place Details API was being called (REQUEST_DENIED) — fix shipped to
 * use Places API (New). This script repairs entries created during the
 * window when the legacy endpoint was being hit.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_AI_API_KEY;

function deriveKind(types, displayName) {
  const set = new Set(types);
  if (set.has("neighborhood") || set.has("sublocality") || set.has("sublocality_level_1")) return "neighborhood";
  if (set.has("postal_code")) return "zip";
  if (set.has("locality") || set.has("administrative_area_level_3")) return "city";
  if (set.has("administrative_area_level_2")) return "county";
  if (set.has("administrative_area_level_1")) return "state";
  if (set.has("country")) return "region";
  const name = (displayName || "").toLowerCase();
  if (set.has("colloquial_area")) {
    const regionPatterns = /\b(north|south|east|west|northern|southern|eastern|western|northwestern|northeastern|southwestern|southeastern|central|greater|tri-state|valley|county|region|area|coast)\b/;
    if (regionPatterns.test(name)) return "region";
    return "neighborhood";
  }
  if (/\b(metropolitan|metro)\b/.test(name)) return "metro";
  if (/\btownship\b/.test(name)) return "city";
  if (set.has("political")) return "metro";
  return "city";
}

async function fetchDetails(placeId) {
  if (!placeId || placeId.startsWith("manual_")) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": KEY,
          "X-Goog-FieldMask": "types,displayName",
        },
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`  ! Place Details ${res.status} for ${placeId}: ${body.slice(0, 100)}`);
      return null;
    }
    const data = await res.json();
    return {
      types: data.types || [],
      displayName: data.displayName?.text || "",
    };
  } catch (err) {
    console.warn(`  ! Fetch error for ${placeId}: ${err.message}`);
    return null;
  }
}

async function backfill() {
  if (!KEY) {
    console.error("No Google API key found in env.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log("Backfilling service_areas_canonical.kind from Place ID details...\n");

  const rows = await sql`
    SELECT id, name, kind, place_id
    FROM service_areas_canonical
    WHERE place_id IS NOT NULL AND place_id != ''
    ORDER BY name
  `;

  console.log(`Found ${rows.length} rows with place_id\n`);

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (const row of rows) {
    const details = await fetchDetails(row.place_id);
    if (!details) {
      errors++;
      console.log(`  ✗ ${row.name} — could not fetch details`);
      continue;
    }
    const newKind = deriveKind(details.types, details.displayName);
    if (newKind === row.kind) {
      unchanged++;
      console.log(`  = ${row.name}  kind=${row.kind} (unchanged) types=${details.types.join(",")}`);
    } else {
      await sql`UPDATE service_areas_canonical SET kind = ${newKind} WHERE id = ${row.id}`;
      updated++;
      console.log(`  ✓ ${row.name}  kind: ${row.kind} → ${newKind}  types=${details.types.join(",")}`);
    }
    // Light rate limiting — Places API has per-minute caps in free tier
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\n${updated} updated, ${unchanged} unchanged, ${errors} errors`);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
