/**
 * SerpAPI wrapper for Google SERP queries.
 *
 * Returns Google's Local Pack (map + top 3 businesses) plus organic
 * top 10. The Local Pack is the load-bearing competitive surface for
 * local SEO — that's where businesses with place_ids surface, and
 * place_ids let us read their GBP profiles via Places API downstream.
 *
 * Provider choice: SerpAPI for V1 (cleanest API, well-documented,
 * fast to integrate). Migrate to DataForSEO at scale if cost becomes
 * meaningful — wrapper interface stays stable, only `fetchSerp` swaps.
 *
 * Cost at SerpAPI: ~$0.0075/query. For 20 queries × weekly = ~$0.60/mo
 * per subscriber. Trivial.
 *
 * Env: SERPAPI_KEY
 */
export interface LocalPackResult {
  /** Position 1-3 in the local pack */
  position: number;
  /** Business title as displayed */
  title: string;
  /**
   * SerpAPI's `place_id` field — Google Maps CID (numeric Customer ID like
   * "14198205168375289065"), NOT the "ChIJ..." Place ID that Places API
   * (New) expects. CIDs are stable identifiers for the same business but
   * require a separate lookup if we want full GBP profile via Places API.
   * For V1 we use CID as the join key for dedup across queries; Places
   * enrichment deferred to V2.
   */
  placeId: string;
  /** Knowledge Graph ID from SerpAPI (e.g. "/g/11ltg_20q5") — alternate identifier */
  knowledgeGraphId?: string;
  /** Star rating, 0-5 */
  rating?: number;
  /** Total review count */
  reviewsCount?: number;
  /** Business type label (e.g., "General contractor") — SerpAPI's primary type */
  type?: string;
  /** Formatted address */
  address?: string;
  /** Phone number if surfaced */
  phone?: string;
  /** Website URL if surfaced (extracted from links.website) */
  website?: string;
  /** Years in business if surfaced (e.g., "3+ years in business") */
  yearsInBusiness?: string;
  /** Single-sentence description SerpAPI surfaces (often pulled from reviews) */
  description?: string;
  /** GPS lat/lng of the business location */
  coordinates?: { latitude: number; longitude: number };
}

export interface OrganicResult {
  /** Position 1-10 in organic results */
  position: number;
  title: string;
  link: string;
  displayedLink?: string;
  snippet?: string;
}

export interface SerpResponse {
  /** The query we ran */
  query: string;
  /** Search location parameter (e.g., "Pittsburgh, PA") */
  searchLocation: string;
  /** When SerpAPI returned results */
  fetchedAt: string;
  /** Local pack businesses (map + top 3) — the competitive gold */
  localPack: LocalPackResult[];
  /** Organic top 10 results */
  organic: OrganicResult[];
  /** Raw response shape for debugging — strip in prod if size becomes a concern */
  rawMeta?: Record<string, unknown>;
}

/**
 * Fetch SerpAPI results for a Google search query.
 *
 * NOTE: This is a stub that throws until SERPAPI_KEY is provisioned.
 * The full implementation is one function — see commented body. The
 * stub deliberately exists so downstream code (parsing, extraction,
 * analysis assembly) can be built and tested against this interface
 * before the API key arrives.
 *
 * To activate: set SERPAPI_KEY env var, uncomment the fetch body.
 */
export async function fetchSerp(
  query: string,
  location: string,
): Promise<SerpResponse> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPAPI_KEY not set — competitive intel SERP fetches are stubbed. " +
        "Provision a SerpAPI account and set SERPAPI_KEY in env to enable.",
    );
  }

  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("location", location);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("num", "10");
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`SerpAPI fetch failed (${res.status}): ${await res.text().then((t) => t.slice(0, 200))}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  return parseSerpResponse(query, location, data);
}

/**
 * Parse SerpAPI's raw response into our normalized SerpResponse shape.
 * Exported separately so we can unit-test parsing against mock JSON
 * without needing the API.
 */
export function parseSerpResponse(
  query: string,
  searchLocation: string,
  data: Record<string, unknown>,
): SerpResponse {
  // SerpAPI wraps local results: data.local_results.places[] — not flat.
  const localResultsWrapper = (data.local_results || {}) as Record<string, unknown>;
  const localResults = (localResultsWrapper.places || []) as Array<Record<string, unknown>>;
  const organicResults = (data.organic_results || []) as Array<Record<string, unknown>>;

  const localPack: LocalPackResult[] = localResults.map((r, i) => {
    const links = (r.links || {}) as Record<string, unknown>;
    const coords = (r.gps_coordinates || {}) as Record<string, unknown>;
    return {
      position: (r.position as number) ?? i + 1,
      title: (r.title as string) || "",
      placeId: String(r.place_id || ""),
      knowledgeGraphId: (r.provider_id as string) ?? undefined,
      rating: (r.rating as number) ?? undefined,
      reviewsCount: (r.reviews as number) ?? undefined,
      type: (r.type as string) ?? undefined,
      address: (r.address as string) ?? undefined,
      phone: (r.phone as string) ?? undefined,
      website: (links.website as string) ?? undefined,
      yearsInBusiness: (r.years_in_business as string) ?? undefined,
      description: (r.description as string) ?? undefined,
      coordinates: typeof coords.latitude === "number" && typeof coords.longitude === "number"
        ? { latitude: coords.latitude, longitude: coords.longitude }
        : undefined,
    };
  }).filter((r) => r.placeId); // Drop rows with no CID — can't dedup them

  const organic: OrganicResult[] = organicResults.map((r, i) => ({
    position: (r.position as number) ?? i + 1,
    title: (r.title as string) || "",
    link: (r.link as string) || "",
    displayedLink: (r.displayed_link as string) ?? undefined,
    snippet: (r.snippet as string) ?? undefined,
  }));

  return {
    query,
    searchLocation,
    fetchedAt: new Date().toISOString(),
    localPack,
    organic,
  };
}
