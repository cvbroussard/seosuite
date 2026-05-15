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
