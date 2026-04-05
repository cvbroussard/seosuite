import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/brands?site_id=...
 * List brands for a site.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ brands: [] });
  }

  const brands = await sql`
    SELECT id, name, slug, url, description, created_at
    FROM brands WHERE site_id = ${siteId}
    ORDER BY name ASC
  `;

  return NextResponse.json({ brands });
}

/**
 * POST /api/brands — create a brand
 * Body: { name, url?, description?, site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, url, description, site_id } = body;

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

  const [brand] = await sql`
    INSERT INTO brands (site_id, name, slug, url, description)
    VALUES (${site_id}, ${name.trim()}, ${slug}, ${url || null}, ${description || null})
    ON CONFLICT (site_id, slug) DO UPDATE SET name = ${name.trim()}, url = ${url || null}, description = ${description || null}
    RETURNING id, name, slug, url, description
  `;

  return NextResponse.json({ brand });
}
