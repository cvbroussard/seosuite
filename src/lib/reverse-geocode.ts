/**
 * Reverse geocoding — lat/lng → Google Place ID + hierarchy ancestors.
 *
 * Used by the service-area auto-tag pipeline: when an asset has EXIF GPS,
 * resolve the coordinates to a Place ID and walk the address hierarchy.
 * The asset's "geographic identity" is then matchable against the site's
 * service area catalog (which stores Place IDs per the 2026-05-15
 * canonical-place-aware service area architecture).
 *
 * Matching rule (per the locked architecture):
 *   spoken/derived place matches catalog entry IF catalog entry is an
 *   ancestor of (or equal to) the spoken/derived place in the
 *   geographic hierarchy.
 *
 * Example: GPS resolves to "Squirrel Hill" (Pittsburgh, PA). Hierarchy
 * = [Squirrel Hill, Pittsburgh, Allegheny County, Pennsylvania, US].
 * Catalog has "Pittsburgh" → matches. Catalog has "Squirrel Hill" →
 * matches. Catalog has "Pennsylvania" → matches.
 *
 * If catalog has only "Mount Lebanon" (a different neighborhood), no
 * match — Mount Lebanon is not in the asset's hierarchy.
 *
 * Cost: Google Geocoding API basic data is in the free SKU under the
 * current pricing model (~$200/mo credit). Per-asset cost is effectively
 * zero at our scale.
 */

const GOOGLE_API_KEY = () =>
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_AI_API_KEY ||
  "";

export interface PlaceHierarchyEntry {
  /** Place ID for this level. */
  placeId: string;
  /** Display name (e.g., "Squirrel Hill", "Pittsburgh"). */
  name: string;
  /** Google place types for this level (sublocality, locality, etc). */
  types: string[];
}

export interface GeoResolution {
  /** Place ID for the most-specific match (e.g. neighborhood). */
  placeId: string;
  /** Formatted address. */
  formattedAddress: string;
  /** Hierarchy from most-specific to broadest.
   * E.g., [Squirrel Hill, Pittsburgh, Allegheny County, PA, US] */
  hierarchy: PlaceHierarchyEntry[];
}

/**
 * Reverse geocode lat/lng to a structured place hierarchy.
 *
 * Uses Google Geocoding API. Returns null when:
 * - No API key configured (silent fallback for dev environments)
 * - Coordinates don't resolve to a known place
 * - API call times out / fails
 *
 * The returned hierarchy is ordered most-specific to broadest. Each
 * entry has its own Place ID, so the matcher can compare against
 * catalog Place IDs at any level.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeoResolution | null> {
  const key = GOOGLE_API_KEY();
  if (!key) return null;
  if (!isFinite(lat) || !isFinite(lng)) return null;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
      return null;
    }

    // The FIRST result is typically the most specific (street address);
    // we want the most specific NAMED place that's useful for tagging.
    // Strategy: walk results from most to least specific, pick the first
    // one whose primary type is a tagging-useful level (neighborhood,
    // sublocality, locality, etc) — skip street_address and route which
    // are too granular to be service areas.
    const TAGGING_USEFUL_TYPES = new Set([
      "neighborhood",
      "sublocality",
      "sublocality_level_1",
      "locality",
      "administrative_area_level_3",
      "administrative_area_level_2",
      "administrative_area_level_1",
      "country",
      "postal_code",
    ]);

    let primaryResult = null;
    for (const r of data.results) {
      const types = (r.types || []) as string[];
      if (types.some((t) => TAGGING_USEFUL_TYPES.has(t))) {
        primaryResult = r;
        break;
      }
    }
    if (!primaryResult) primaryResult = data.results[0];

    // Build hierarchy from address_components. Each component is a
    // separate place at a specific level. We construct PlaceHierarchyEntry
    // for each, but unfortunately address_components don't include their
    // own place_ids — we'd need an extra Place Details call per ancestor
    // for those. For matching purposes, the NAME is enough since the
    // service area catalog stores both name and place_id and we can match
    // either. (Pure-Place-ID matching can be added later via Place Details
    // calls cached per ancestor, if needed for disambiguation.)
    const hierarchy: PlaceHierarchyEntry[] = [];
    const components = (primaryResult.address_components || []) as Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    for (const c of components) {
      // Only include tagging-useful levels in the hierarchy
      if (c.types.some((t) => TAGGING_USEFUL_TYPES.has(t))) {
        hierarchy.push({
          placeId: "", // Not directly available from this endpoint per ancestor
          name: c.long_name,
          types: c.types,
        });
      }
    }

    return {
      placeId: primaryResult.place_id as string,
      formattedAddress: (primaryResult.formatted_address as string) || "",
      hierarchy,
    };
  } catch {
    return null;
  }
}

/**
 * Match an asset's geographic hierarchy against the site's service area
 * catalog. Returns matching catalog entries by overlay_id (the
 * site_service_areas FK that asset_service_areas references).
 *
 * Matching rule: catalog entry matches IF its name (case-insensitive)
 * appears in the asset's hierarchy. This is a name-based match for now;
 * future enhancement: compare on Place IDs once we cache per-ancestor
 * place_ids via additional Place Details calls.
 */
export interface ServiceAreaMatch {
  /** site_service_areas.id (the FK target for asset_service_areas) */
  overlayId: string;
  /** service_areas_canonical.id */
  canonicalId: string;
  /** Catalog name */
  name: string;
  /** Catalog place_id (for verification/UI display) */
  catalogPlaceId: string | null;
  /** Which hierarchy level matched (most-specific entry name) */
  matchedHierarchyName: string;
}

/**
 * Derive a service-area kind value from Google place types + display name.
 *
 * The legacy schema stores `kind` (city/county/zip/region/state/metro/
 * neighborhood) as a manual subscriber selection. With Place IDs as the
 * canonical geographic identity, kind becomes derivable from the Place's
 * types — no need to ask the subscriber to redundantly classify.
 *
 * For unambiguous types (locality, administrative_area_level_*, etc.) the
 * type alone determines the kind. For ambiguous types like `colloquial_area`
 * (used for both neighborhoods like "Squirrel Hill" AND informal regions
 * like "Northwestern Pennsylvania") OR bare `political` (used for metro
 * areas like "Pittsburgh Metropolitan Area"), the displayName provides
 * disambiguation hints.
 */
export function deriveKindFromTypes(types: string[], displayName?: string): string {
  const set = new Set(types);

  // Unambiguous types — type alone determines kind:
  if (set.has("neighborhood") || set.has("sublocality") || set.has("sublocality_level_1")) return "neighborhood";
  if (set.has("postal_code")) return "zip";
  if (set.has("locality") || set.has("administrative_area_level_3")) return "city";
  if (set.has("administrative_area_level_2")) return "county";
  if (set.has("administrative_area_level_1")) return "state";
  if (set.has("country")) return "region";

  // Ambiguous cases — apply name-based heuristics:
  const name = (displayName || "").toLowerCase();

  if (set.has("colloquial_area")) {
    // colloquial_area covers BOTH neighborhoods and informal regions.
    // Heuristic: regional descriptors (directional + state name + region
    // qualifiers) → region; otherwise → neighborhood. Catches forms like
    // "Northwestern Pennsylvania", "Greater Boston", "Bay Area".
    const regionPatterns = /\b(north|south|east|west|northern|southern|eastern|western|northwestern|northeastern|southwestern|southeastern|central|greater|tri-state|valley|county|region|area|coast)\b/;
    if (regionPatterns.test(name)) {
      return "region";
    }
    return "neighborhood";
  }

  if (/\b(metropolitan|metro)\b/.test(name)) return "metro";
  if (/\btownship\b/.test(name)) return "city";

  // Bare political (no specific type) — last-resort fallback.
  // Most often metro/region for places like "Pittsburgh Metropolitan Area".
  if (set.has("political")) return "metro";

  return "city"; // safe fallback
}

/**
 * Fetch the Google Places types for a Place ID via Places API (New).
 * Used to derive `kind` server-side from Place ID instead of requiring
 * the subscriber to pick it manually. Returns empty array on any failure
 * (caller should fall back to the legacy kind value).
 *
 * NOTE: Uses Places API (New) — the legacy `maps/api/place/details/json`
 * endpoint is no longer enabled on the Google project (caught
 * 2026-05-15 with REQUEST_DENIED "calling a legacy API"). The new
 * endpoint format: GET /v1/places/{placeId} with X-Goog-Api-Key +
 * X-Goog-FieldMask headers, response uses camelCase fields.
 */
export async function fetchPlaceTypes(placeId: string): Promise<string[]> {
  const details = await fetchPlaceDetails(placeId);
  return details?.types || [];
}

export interface ViewportBox {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
}

export interface PlaceTypeDetails {
  types: string[];
  displayName: string;
  /** Google Places API viewport (bounding box). Cached at service area
   * creation time and used for in-memory containment matching against
   * asset GPS coords. */
  viewport: ViewportBox | null;
}

/**
 * Fetch types + display name + viewport in one Place Details call.
 * Powers two architectural pieces:
 *   1. kind derivation (types + displayName disambiguate colloquial_area)
 *   2. viewport-based asset matching (cache once, match in-memory forever)
 *
 * Single API call captures both — efficient and atomic.
 */
export async function fetchPlaceDetails(placeId: string): Promise<PlaceTypeDetails | null> {
  const key = GOOGLE_API_KEY();
  if (!key || !placeId) return null;
  if (placeId.startsWith("manual_")) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "types,displayName,viewport",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      types: (data.types as string[]) || [],
      displayName: (data.displayName?.text as string) || "",
      viewport: (data.viewport as ViewportBox) || null,
    };
  } catch {
    return null;
  }
}

/**
 * Viewport-based asset matching. Given an asset's GPS coordinates and a
 * site's service area catalog (with viewports), returns matching catalog
 * entries by in-memory bounding-box containment check.
 *
 * Zero API calls. Microseconds per check. The viewport cache (populated
 * one-time at service area creation) is the only API surface this
 * architecture touches.
 *
 * Match rule: catalog entry matches if asset's lat/lng falls within
 * its viewport box. Entries without viewports are skipped (legacy
 * service areas pre-viewport-cache; can be backfilled).
 */
export interface ViewportMatch {
  overlayId: string;
  canonicalId: string;
  name: string;
  catalogPlaceId: string | null;
  kind: string;
}

export function matchAssetByViewport(
  assetLat: number,
  assetLng: number,
  catalog: Array<{
    overlay_id: string;
    canonical_id: string;
    name: string;
    place_id: string | null;
    kind: string;
    viewport: ViewportBox | null;
  }>,
): ViewportMatch[] {
  if (!isFinite(assetLat) || !isFinite(assetLng)) return [];
  const matches: ViewportMatch[] = [];
  for (const entry of catalog) {
    const v = entry.viewport;
    if (!v || !v.low || !v.high) continue;
    if (
      assetLat >= v.low.latitude &&
      assetLat <= v.high.latitude &&
      assetLng >= v.low.longitude &&
      assetLng <= v.high.longitude
    ) {
      matches.push({
        overlayId: entry.overlay_id,
        canonicalId: entry.canonical_id,
        name: entry.name,
        catalogPlaceId: entry.place_id,
        kind: entry.kind,
      });
    }
  }
  return matches;
}

export function matchHierarchyToServiceAreas(
  hierarchy: PlaceHierarchyEntry[],
  catalog: Array<{
    overlay_id: string;
    canonical_id: string;
    name: string;
    place_id: string | null;
  }>,
): ServiceAreaMatch[] {
  const matches: ServiceAreaMatch[] = [];
  // Build a lower-cased name set from the hierarchy for fast lookup.
  const hierarchyByName = new Map<string, PlaceHierarchyEntry>();
  for (const h of hierarchy) {
    hierarchyByName.set(h.name.toLowerCase(), h);
  }

  for (const entry of catalog) {
    const lowerName = entry.name.toLowerCase();
    const hierarchyMatch = hierarchyByName.get(lowerName);
    if (hierarchyMatch) {
      matches.push({
        overlayId: entry.overlay_id,
        canonicalId: entry.canonical_id,
        name: entry.name,
        catalogPlaceId: entry.place_id,
        matchedHierarchyName: hierarchyMatch.name,
      });
    }
  }

  return matches;
}
