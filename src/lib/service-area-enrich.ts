import "server-only";
import { sql } from "@/lib/db";

/**
 * Service area enrichment for the audio-first auto-tagging pipeline (#203).
 *
 * Per seed_and_enrich_principle: human commits identity (name), AI/system
 * completes schema. For service areas: geocode the name to get
 * place_id + lat/lng + parent region from Google Geocoding API.
 *
 * Beta-pragmatic: only fills place_id on the canonical row if not
 * already set. Doesn't compute boundary_geojson yet (that's a deeper
 * enrichment when admin curation happens). Failure is non-fatal.
 */

interface GeocodeResult {
  place_id: string;
  formatted_address: string;
  lat: number;
  lng: number;
  components: Array<{ types: string[]; long_name: string; short_name: string }>;
}

async function geocode(query: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const top = data.results?.[0];
    if (!top) return null;
    return {
      place_id: top.place_id,
      formatted_address: top.formatted_address,
      lat: top.geometry?.location?.lat,
      lng: top.geometry?.location?.lng,
      components: top.address_components || [],
    };
  } catch {
    return null;
  }
}

/**
 * Enrich a canonical service area row with Google Places data.
 * Updates BOTH the canonical row (place_id, etc.) AND the site overlay
 * (enrichment_status). Idempotent — checks status before running.
 */
export async function enrichServiceArea(
  canonicalId: string,
  overlayId: string,
  name: string,
): Promise<void> {
  const [canonical] = await sql`
    SELECT id, place_id FROM service_areas_canonical WHERE id = ${canonicalId}
  `;
  if (!canonical) return;

  const [overlay] = await sql`
    SELECT enrichment_status FROM site_service_areas WHERE id = ${overlayId}
  `;
  if (!overlay) return;
  if (overlay.enrichment_status === "enriched" || overlay.enrichment_status === "skipped") return;

  await sql`
    UPDATE site_service_areas SET enrichment_attempts = enrichment_attempts + 1
    WHERE id = ${overlayId}
  `;

  try {
    // Skip geocoding if canonical already has place_id (another subscriber enriched first)
    let geo: GeocodeResult | null = null;
    if (!canonical.place_id) {
      geo = await geocode(name);
      if (geo) {
        await sql`
          UPDATE service_areas_canonical
          SET
            place_id = ${geo.place_id},
            enriched_at = NOW(),
            enrichment_metadata = ${JSON.stringify({
              formatted_address: geo.formatted_address,
              lat: geo.lat,
              lng: geo.lng,
              enriched_at: new Date().toISOString(),
              provider: "google-geocoding",
            })}::jsonb
          WHERE id = ${canonicalId}
        `;
      }
    }

    await sql`
      UPDATE site_service_areas
      SET
        enrichment_status = ${geo || canonical.place_id ? "enriched" : "no_match"},
        enrichment_metadata = ${JSON.stringify({
          enriched_at: new Date().toISOString(),
          canonical_was_pre_enriched: !!canonical.place_id,
        })}::jsonb
      WHERE id = ${overlayId}
    `;
  } catch (err) {
    await sql`
      UPDATE site_service_areas
      SET
        enrichment_status = 'failed',
        enrichment_metadata = ${JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          attempted_at: new Date().toISOString(),
        })}::jsonb
      WHERE id = ${overlayId}
    `;
    throw err;
  }
}
