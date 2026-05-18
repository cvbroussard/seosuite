/**
 * Project matcher — maps Stage 1 NER project candidates to the site's
 * projects catalog. Mirrors brand-match.ts pattern (proven via #215
 * Levenshtein fuzzy + slug fallback).
 *
 * The match path:
 *   1. For each NER project candidate, fuzzy-token-match (forward +
 *      reverse) against every catalog project. Longest catalog name
 *      wins (stabilizes when "Shadyside" and "Shadyside Parlor
 *      Restoration" both qualify — the more-specific catalog entry
 *      wins).
 *   2. Slug-equality fallback catches normalization edge cases.
 *   3. Unmatched NER candidates become suggested_new — subscriber/
 *      operator can promote them to the catalog via the existing
 *      project-creation UI.
 *
 * Same NER-only philosophy as brand-match: vision-based project
 * inference is too easy to hallucinate. Projects only land on assets
 * when the subscriber actually named one in the transcript.
 */
import "server-only";
import { sql } from "@/lib/db";
import { tokenizeEntityName, findFuzzyTokenSpan } from "@/lib/auto-tag-rules";

export interface NerProjectCandidate {
  /** Surface form as extracted by NER (e.g. "Shadyside Parlor Restoration"). */
  name: string;
  /** Sentence-level excerpt for evidence display. */
  context?: string;
}

export interface ProjectCatalogMatch {
  project_id: string;
  /** Catalog name (canonical). */
  name: string;
  /** Catalog slug — useful for downstream link composition. */
  slug: string;
  /** What NER said before matching to the catalog. */
  ner_text: string;
  context: string;
}

export interface SuggestedNewProject {
  name: string;
  slug: string;
  context: string;
}

/** Geo-derived project candidate. Surfaces in the analyzer JSON as a
 * project the subscriber may want to confirm — NOT auto-bound. The
 * asset's GPS fell within a project's geofence (200m default) so the
 * binding is plausible, but the subscriber confirms via manual binding
 * since GPS precision and neighbor-inclusion mean false positives are
 * expected (per discussion 2026-05-18). */
export interface ProjectGeoCandidate {
  project_id: string;
  name: string;
  slug: string;
  /** Project center as stored (the subscriber-picked address). */
  project_lat: number;
  project_lng: number;
  /** Distance from asset GPS to project center, in meters. */
  distance_m: number;
}

export interface ProjectMatchResult {
  matched: ProjectCatalogMatch[];
  suggested_new: SuggestedNewProject[];
  /** Geo-matched candidates (asset GPS within 200m of project center).
   * Empty when asset has no GPS or no projects have geo data set. */
  geo_candidates: ProjectGeoCandidate[];
}

/** 200m geofence radius. Generous on purpose — see discussion 2026-05-18
 * for the precision-vs-false-positives trade-off. Will include 3-4
 * neighbors on a typical residential block; subscriber resolves via
 * manual binding (the analyzer surfaces candidates, doesn't auto-bind). */
const GEOFENCE_RADIUS_M = 200;

/** Haversine great-circle distance between two lat/lng points, in meters. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function slugifyName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

export async function matchProjectsFromNer(
  siteId: string,
  nerProjects: NerProjectCandidate[],
  /** Asset GPS for the geo-candidate pass. Pass null when asset has
   * no EXIF GPS — geo_candidates will be empty. */
  gpsLat?: number | null,
  gpsLng?: number | null,
): Promise<ProjectMatchResult> {
  const matched: ProjectCatalogMatch[] = [];
  const suggested_new: SuggestedNewProject[] = [];
  const geo_candidates: ProjectGeoCandidate[] = [];

  // Early exit only if both signal sources are absent. Even with zero
  // NER candidates we may have geo signal worth surfacing.
  const hasGpsSignal =
    gpsLat != null && gpsLng != null && Number.isFinite(gpsLat) && Number.isFinite(gpsLng);
  if (nerProjects.length === 0 && !hasGpsSignal) {
    return { matched, suggested_new, geo_candidates };
  }

  const projectRows = await sql`
    SELECT id, name, slug, gps_lat, gps_lng FROM projects WHERE site_id = ${siteId}
  `;
  const catalogIndex = projectRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    tokens: tokenizeEntityName(r.name as string),
  }));

  const claimedProjectIds = new Set<string>();
  const seenSuggestedLower = new Set<string>();

  for (const ner of nerProjects) {
    const candidateTokens = tokenizeEntityName(ner.name).map((word, i) => ({
      word,
      start: i,
      end: i + 1,
    }));

    // Forward + reverse fuzzy-token match. Longest catalog name wins —
    // when "Shadyside" matches both "Shadyside" and "Shadyside Parlor
    // Restoration", the more specific entry is the correct binding.
    let best: { id: string; name: string; slug: string; matchLen: number } | null = null;
    for (const entry of catalogIndex) {
      if (entry.tokens.length === 0) continue;
      const forward = findFuzzyTokenSpan(candidateTokens, entry.tokens);
      const candidateAsTokens = candidateTokens.map((t) => t.word);
      const reverseHaystack = entry.tokens.map((word, i) => ({
        word,
        start: i,
        end: i + 1,
      }));
      const reverse = findFuzzyTokenSpan(reverseHaystack, candidateAsTokens);
      if (forward || reverse) {
        const matchLen = entry.tokens.join(" ").length;
        if (!best || matchLen > best.matchLen) {
          best = { id: entry.id, name: entry.name, slug: entry.slug, matchLen };
        }
      }
    }

    if (best) {
      if (!claimedProjectIds.has(best.id)) {
        matched.push({
          project_id: best.id,
          name: best.name,
          slug: best.slug,
          ner_text: ner.name,
          context: ner.context || "",
        });
        claimedProjectIds.add(best.id);
      }
      continue;
    }

    // Slug-equality fallback (whitespace/punctuation drift the fuzzy
    // matcher wouldn't catch).
    const slug = slugifyName(ner.name);
    const slugHit = catalogIndex.find((e) => slugifyName(e.name) === slug);
    if (slugHit) {
      if (!claimedProjectIds.has(slugHit.id)) {
        matched.push({
          project_id: slugHit.id,
          name: slugHit.name,
          slug: slugHit.slug,
          ner_text: ner.name,
          context: ner.context || "",
        });
        claimedProjectIds.add(slugHit.id);
      }
      continue;
    }

    // No catalog hit → suggest as new project. Dedup by lowercase name.
    const lower = ner.name.toLowerCase();
    if (seenSuggestedLower.has(lower)) continue;
    seenSuggestedLower.add(lower);
    suggested_new.push({
      name: ner.name,
      slug,
      context: ner.context || "",
    });
  }

  // Geo-candidate pass: for every project with stored gps_lat/gps_lng,
  // compute Haversine distance from asset GPS to project center. If
  // within GEOFENCE_RADIUS_M, surface as a candidate the subscriber
  // can confirm. Dedupes against NER-matched projects (no point
  // surfacing the same project twice).
  if (hasGpsSignal) {
    for (const row of projectRows) {
      if (row.gps_lat == null || row.gps_lng == null) continue;
      const pLat = Number(row.gps_lat);
      const pLng = Number(row.gps_lng);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;
      const d = haversineMeters(gpsLat as number, gpsLng as number, pLat, pLng);
      if (d > GEOFENCE_RADIUS_M) continue;
      // Dedupe against NER matches — already-bound projects don't need
      // to surface as candidates again.
      if (matched.some((m) => m.project_id === row.id)) continue;
      geo_candidates.push({
        project_id: row.id as string,
        name: row.name as string,
        slug: row.slug as string,
        project_lat: pLat,
        project_lng: pLng,
        distance_m: Math.round(d),
      });
    }
    // Sort closest-first so the most plausible candidate is visually
    // first in the JSON.
    geo_candidates.sort((a, b) => a.distance_m - b.distance_m);
  }

  return { matched, suggested_new, geo_candidates };
}
