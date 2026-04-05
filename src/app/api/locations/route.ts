import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/locations?site_id=...
 * List locations for a site.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ locations: [] });
  }

  const locations = await sql`
    SELECT id, name, slug, address, city, state, description, created_at
    FROM locations WHERE site_id = ${siteId}
    ORDER BY name ASC
  `;

  return NextResponse.json({ locations });
}

/**
 * POST /api/locations — create a location
 * Body: { name, address?, city?, state?, description?, site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, address, city, state, description, site_id } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
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
    .slice(0, 40);

  const [location] = await sql`
    INSERT INTO locations (site_id, name, slug, address, city, state, description)
    VALUES (${site_id}, ${name.trim()}, ${slug}, ${address || null}, ${city || null}, ${state || null}, ${description || null})
    ON CONFLICT (site_id, slug) DO UPDATE SET name = ${name.trim()}, address = ${address || null}, city = ${city || null}, state = ${state || null}, description = ${description || null}
    RETURNING id, name, slug, address, city, state, description
  `;

  // Geo-match: geocode address and backfill matching assets — non-blocking
  const fullAddress = [address, city, state].filter(Boolean).join(", ");
  if (fullAddress) {
    import("@/lib/geo-match").then(({ backfillAssetsForEntity }) =>
      backfillAssetsForEntity("location", location.id as string, site_id, fullAddress)
        .then((result) => {
          if (result.matched > 0) {
            console.log(`Geo-matched ${result.matched} assets to location "${name}"`);
          }
        })
    ).catch(() => {});
  }

  return NextResponse.json({ location });
}
