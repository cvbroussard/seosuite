import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/service-areas?site_id=...
 * List service areas for a site. Joins canonical+overlay tables and
 * returns a flat shape for UI consumption.
 *
 * Per entity_scoping_principle (LOCKED 2026-05-10): service areas use
 * the canonical+overlay pattern. The canonical layer holds universal
 * place facts; the site overlay holds per-business notes/customizations.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ service_areas: [] });
  }

  const rows = await sql`
    SELECT
      sa.id AS overlay_id,
      sa.is_active,
      sa.hero_asset_id,
      sa.site_notes,
      sa.custom_description,
      sa.created_at,
      c.id AS canonical_id,
      c.name,
      c.slug,
      c.kind,
      c.parent_region_id,
      c.place_id,
      c.boundary_geojson,
      c.enriched_at
    FROM site_service_areas sa
    JOIN service_areas_canonical c ON c.id = sa.service_area_canonical_id
    WHERE sa.site_id = ${siteId}
    ORDER BY c.name ASC
  `;

  return NextResponse.json({ service_areas: rows });
}

/**
 * POST /api/service-areas — add a service area for a site.
 *
 * Beta-pragmatic flow:
 * - If a canonical row exists for the slug, link the site to it
 * - Otherwise, create a canonical row + the site overlay together
 *
 * Body: { name, kind?, description?, parent_region_id?, place_id?,
 *         site_notes?, custom_description?, hero_asset_id?, site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, kind, parent_region_id, place_id,
    site_notes, custom_description, hero_asset_id, site_id,
    seed_source, seed_recording_id, seed_asset_id } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }
  // Derive kind from Place ID when present — no need for the subscriber
  // to redundantly classify what Google already knows. Falls back to
  // submitted `kind` (or "city") when no place_id or geocoding fails.
  // Per 2026-05-15 architecture: Place ID IS the canonical geographic
  // identity; kind is a derived label, not a subscriber input.
  let k = kind || "city";
  if (place_id) {
    try {
      const { fetchPlaceTypes, deriveKindFromTypes } = await import("@/lib/reverse-geocode");
      const types = await fetchPlaceTypes(place_id);
      if (types.length > 0) {
        k = deriveKindFromTypes(types);
      }
    } catch { /* fall back to submitted kind */ }
  }
  const validKinds = ["city", "county", "zip", "region", "state", "metro", "neighborhood"];
  if (!validKinds.includes(k)) {
    return NextResponse.json({ error: `Invalid kind. Allowed: ${validKinds.join(", ")}` }, { status: 400 });
  }

  const [site] = await sql`
    SELECT id FROM sites WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);

  // Find or create the canonical row
  let canonicalId: string | null = null;
  const [existing] = await sql`SELECT id FROM service_areas_canonical WHERE slug = ${slug}`;
  if (existing) {
    canonicalId = existing.id as string;
  } else {
    const [created] = await sql`
      INSERT INTO service_areas_canonical (name, slug, kind, parent_region_id, place_id)
      VALUES (${name.trim()}, ${slug}, ${k}, ${parent_region_id || null}, ${place_id || null})
      RETURNING id
    `;
    canonicalId = created.id as string;
  }

  // Provenance defaults to typed_subscriber unless audio fields provided
  const seedSource = seed_source || (seed_recording_id ? "audio_transcript" : "typed_subscriber");

  // Create or update the site overlay
  const [overlay] = await sql`
    INSERT INTO site_service_areas (site_id, service_area_canonical_id, is_active,
      hero_asset_id, site_notes, custom_description,
      seed_source, seed_recording_id, seed_asset_id, authorized_at, enrichment_status)
    VALUES (${site_id}, ${canonicalId}, TRUE,
      ${hero_asset_id || null}, ${site_notes || null}, ${custom_description || null},
      ${seedSource}, ${seed_recording_id || null}, ${seed_asset_id || null}, NOW(),
      'pending')
    ON CONFLICT (site_id, service_area_canonical_id) DO UPDATE SET
      is_active = TRUE,
      hero_asset_id = ${hero_asset_id || null},
      site_notes = ${site_notes || null},
      custom_description = ${custom_description || null}
    RETURNING id, is_active, hero_asset_id, site_notes, custom_description, created_at
  `;

  // Async geocoding enrichment if canonical doesn't have place_id yet
  if (seedSource === "audio_transcript") {
    import("@vercel/functions").then(({ waitUntil }) => {
      waitUntil(
        (async () => {
          try {
            const { enrichServiceArea } = await import("@/lib/service-area-enrich");
            await enrichServiceArea(canonicalId as string, overlay.id as string, name.trim());
          } catch (err) {
            console.warn(`Service area enrichment failed for ${canonicalId}:`, err instanceof Error ? err.message : err);
          }
        })(),
      );
    }).catch(() => { /* @vercel/functions unavailable */ });
  }

  return NextResponse.json({
    service_area: {
      overlay_id: overlay.id,
      canonical_id: canonicalId,
      name: name.trim(),
      slug,
      kind: k,
      parent_region_id: parent_region_id || null,
      place_id: place_id || null,
      is_active: true,
      hero_asset_id: hero_asset_id || null,
      site_notes: site_notes || null,
      custom_description: custom_description || null,
    },
  });
}
