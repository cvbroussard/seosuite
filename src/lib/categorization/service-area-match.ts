/**
 * Service area matcher — maps a site's GBP-declared service areas
 * against an asset's transcript + GPS + NER-extracted locations.
 *
 * Per project_tracpost_service_areas_gbp_canonical memory + the
 * 2026-05-15 architecture (commits 94f0b4d viewport + bd4a90d "JIT at
 * gen time"): service areas live in service_areas_canonical with
 * cached viewports. Matching is three-pronged:
 *
 *   1. Transcript substring match — area name appears in the transcript
 *      (fuzzy token match handles & ↔ and, capitalization, etc.)
 *   2. GPS viewport containment — asset's EXIF lat/lng falls inside the
 *      cached Place viewport (zero API calls, microseconds)
 *   3. NER location match — Haiku-extracted locations get fuzzy-matched
 *      against catalog (same matcher as pass 1, but operating on
 *      already-extracted location names instead of raw transcript)
 *
 * All three populate `matched`. Deduped by overlay_id. No persistence —
 * matches are computed JIT on each cascade preview and at orchestrator
 * gen time (per the retired-asset-side-tagging decision).
 *
 * NER locations that DON'T find a catalog match surface as
 * `suggested_new` — same pattern as brand-match's suggested_new. Lets
 * subscribers see "you mentioned Shadyside; want to add it to GBP?"
 * Privacy-sensitive types (street_address) are filtered out — never
 * suggest a client home address as a service area.
 */
import "server-only";
import { sql } from "@/lib/db";
import {
  tokenizeWithPositions,
  tokenizeEntityName,
  findFuzzyTokenSpan,
} from "@/lib/auto-tag-rules";
import { matchAssetByViewport, type ViewportBox } from "@/lib/reverse-geocode";

export interface ServiceAreaCatalogMatch {
  /** site_service_areas.id (the subscriber's overlay row) */
  overlay_id: string;
  /** service_areas_canonical.id (the platform-canonical area) */
  canonical_id: string;
  /** Display name (e.g. "Squirrel Hill") */
  name: string;
  /** Google Place ID, if known */
  place_id: string | null;
  /** Derived kind: city / neighborhood / zip / county / state / etc. */
  kind: string;
  /** Which signal produced this match. */
  source: "transcript" | "gps";
  /** Sentence-level excerpt for transcript matches, GPS coords for gps matches. */
  context: string;
}

export interface SuggestedNewServiceArea {
  /** Verbatim NER location text — what the subscriber said. */
  name: string;
  /** NER's classification: city | neighborhood | state | region | metro | zip. */
  kind: string;
  /** Sentence-level excerpt showing where in the transcript it was mentioned. */
  context: string;
}

export interface ServiceAreaMatchResult {
  matched: ServiceAreaCatalogMatch[];
  /** NER-extracted locations not present in the site's GBP service areas.
   * UI surfaces these as "want to add this?" promote-to-GBP candidates. */
  suggested_new: SuggestedNewServiceArea[];
}

/** NER location record shape (subset of NerEntities.locations). */
export interface NerLocationCandidate {
  text: string;
  context_excerpt: string;
  type: string;
  geocodable: boolean;
  privacy_sensitive: boolean;
}

/** NER location types that map cleanly to GBP service areas. Excludes
 * street_address (privacy) and landmark (too specific). */
const SUGGESTABLE_LOCATION_TYPES = new Set([
  "city",
  "neighborhood",
  "state",
  "region",
  "metro",
  "zip",
]);

interface CatalogRow {
  overlay_id: string;
  canonical_id: string;
  name: string;
  place_id: string | null;
  kind: string;
  viewport: ViewportBox | null;
}

export async function matchServiceAreas(
  siteId: string,
  transcript: string,
  gpsLat?: number | null,
  gpsLng?: number | null,
  nerLocations?: NerLocationCandidate[],
): Promise<ServiceAreaMatchResult> {
  // Per migration 120 (2026-05-15): site_service_areas table was dropped
  // when asset-side tagging was retired. Subscriber's declared GBP
  // service areas now live in sites.gbp_profile->'serviceArea'->'places'
  // ->'placeInfos' as a JSONB array of { placeId, placeName }. Canonical
  // viewport + kind data still lives in service_areas_canonical, joined
  // by place_id.
  const [site] = await sql`
    SELECT gbp_profile->'serviceArea'->'places'->'placeInfos' AS place_infos
    FROM sites
    WHERE id = ${siteId}
  `;
  const placeInfos = (site?.place_infos || []) as Array<{ placeId?: string; placeName?: string }>;
  const placeIds = placeInfos.map((p) => p.placeId).filter((id): id is string => Boolean(id));
  if (placeIds.length === 0) return { matched: [], suggested_new: [] };

  const canonicalRows = await sql`
    SELECT id, name, place_id, kind, viewport
    FROM service_areas_canonical
    WHERE place_id = ANY(${placeIds}::text[])
  `;
  const canonicalByPlaceId = new Map(canonicalRows.map((r) => [r.place_id as string, r]));

  // Build catalog: prefer canonical name/viewport when enriched, fall
  // back to GBP placeName for unenriched entries (matching still works
  // by transcript substring, GPS just won't have a viewport to test).
  const catalog: CatalogRow[] = placeInfos
    .filter((p): p is { placeId: string; placeName?: string } => Boolean(p.placeId))
    .map((p) => {
      const c = canonicalByPlaceId.get(p.placeId);
      return {
        // No more overlay row — use canonical id when enriched, else
        // place_id as a stable identifier for dedupe.
        overlay_id: (c?.id as string) || p.placeId,
        canonical_id: (c?.id as string) || "",
        name: (c?.name as string) || p.placeName || "",
        place_id: p.placeId,
        kind: (c?.kind as string) || "",
        viewport: (c?.viewport as ViewportBox | null) ?? null,
      };
    })
    .filter((c) => c.name.length > 0);
  if (catalog.length === 0) return { matched: [], suggested_new: [] };

  const matched: ServiceAreaCatalogMatch[] = [];
  const claimed = new Set<string>();

  // Pass 1: transcript substring match (always runs when transcript exists).
  // Uses the same fuzzy token matcher that powers brand-match — so & ↔ and,
  // capitalization, and minor token punctuation drift all dissolve.
  if (transcript && transcript.trim().length > 0) {
    const transcriptTokens = tokenizeWithPositions(transcript);
    for (const entry of catalog) {
      const entityTokens = tokenizeEntityName(entry.name);
      if (entityTokens.length === 0) continue;
      const span = findFuzzyTokenSpan(transcriptTokens, entityTokens);
      if (!span) continue;
      const ctxStart = Math.max(0, span.charStart - 30);
      const ctxEnd = Math.min(transcript.length, span.charEnd + 30);
      const ctx = transcript.slice(ctxStart, ctxEnd).trim();
      const ellStart = ctxStart > 0 ? "…" : "";
      const ellEnd = ctxEnd < transcript.length ? "…" : "";
      matched.push({
        overlay_id: entry.overlay_id,
        canonical_id: entry.canonical_id,
        name: entry.name,
        place_id: entry.place_id,
        kind: entry.kind,
        source: "transcript",
        context: `${ellStart}${ctx}${ellEnd}`,
      });
      claimed.add(entry.overlay_id);
    }
  }

  // Pass 2: GPS viewport containment (only when asset has EXIF GPS).
  // Skips entries already claimed via transcript — transcript signal
  // wins for display since it's the explicit subscriber narration.
  if (gpsLat != null && gpsLng != null && Number.isFinite(gpsLat) && Number.isFinite(gpsLng)) {
    const viewportCatalog = catalog.filter((e) => e.viewport !== null);
    if (viewportCatalog.length > 0) {
      const gpsMatches = matchAssetByViewport(gpsLat, gpsLng, viewportCatalog);
      for (const m of gpsMatches) {
        if (claimed.has(m.overlayId)) continue;
        matched.push({
          overlay_id: m.overlayId,
          canonical_id: m.canonicalId,
          name: m.name,
          place_id: m.catalogPlaceId,
          kind: m.kind,
          source: "gps",
          context: `📍 Asset GPS (${gpsLat.toFixed(4)}, ${gpsLng.toFixed(4)}) within viewport`,
        });
        claimed.add(m.overlayId);
      }
    }
  }

  // Pass 3: NER locations as suggested_new candidates. Mirrors the
  // brand-match.ts suggested_new pattern. NER caught "Shadyside" but
  // Shadyside isn't in B²'s declared GBP service areas → surface as
  // "want to add this?" promotion candidate. Filters out privacy-
  // sensitive types (street_address). Dedupes against already-matched
  // catalog entries (NER might re-extract a location the catalog scan
  // already caught).
  const suggested_new: SuggestedNewServiceArea[] = [];
  if (nerLocations && nerLocations.length > 0) {
    const matchedNamesLower = new Set(matched.map((m) => m.name.toLowerCase()));
    const seenSuggestedLower = new Set<string>();
    for (const loc of nerLocations) {
      if (loc.privacy_sensitive) continue;
      if (!SUGGESTABLE_LOCATION_TYPES.has(loc.type)) continue;
      const textLower = loc.text.trim().toLowerCase();
      if (textLower.length === 0) continue;
      if (seenSuggestedLower.has(textLower)) continue;

      // Check if this NER location is already represented in matched
      // (catalog scan caught the same place via fuzzy-token match).
      // Cheap check: exact lowercase name match against matched names.
      // The fuzzy-token check below handles "Squirrel Hill" ↔ catalog
      // "Squirrel Hill" without re-running findFuzzyTokenSpan.
      if (matchedNamesLower.has(textLower)) {
        seenSuggestedLower.add(textLower);
        continue;
      }

      // Defensive: run fuzzy-token match of NER name against catalog
      // names. Catches "Squirrel Hill" NER → catalog "Squirrel Hill,
      // Pittsburgh, PA, USA" style drift (canonical names sometimes
      // get long-formatted on Place API responses).
      const nerTokens = tokenizeEntityName(loc.text);
      const nerAsHaystack = nerTokens.map((word, i) => ({
        word, start: i, end: i + 1,
      }));
      let catalogHit = false;
      for (const entry of catalog) {
        const entryTokens = tokenizeEntityName(entry.name);
        if (entryTokens.length === 0) continue;
        // Either direction counts as a match
        const fwd = findFuzzyTokenSpan(nerAsHaystack, entryTokens);
        const entryAsHaystack = entryTokens.map((word, i) => ({
          word, start: i, end: i + 1,
        }));
        const rev = findFuzzyTokenSpan(entryAsHaystack, nerTokens);
        if (fwd || rev) { catalogHit = true; break; }
      }
      if (catalogHit) {
        seenSuggestedLower.add(textLower);
        continue;
      }

      seenSuggestedLower.add(textLower);
      suggested_new.push({
        name: loc.text,
        kind: loc.type,
        context: loc.context_excerpt,
      });
    }
  }

  return { matched, suggested_new };
}
