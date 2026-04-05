import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/clients?site_id=...
 * List clients for a site.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ clients: [] });
  }

  const clients = await sql`
    SELECT id, name, slug, display_name, consent_given, description, created_at
    FROM clients WHERE site_id = ${siteId}
    ORDER BY name ASC
  `;

  return NextResponse.json({ clients });
}

/**
 * POST /api/clients — create a client
 * Body: { name, display_name?, consent_given?, description?, site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, display_name, consent_given, description, site_id } = body;

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

  const [client] = await sql`
    INSERT INTO clients (site_id, name, slug, display_name, consent_given, description)
    VALUES (${site_id}, ${name.trim()}, ${slug}, ${display_name || null}, ${consent_given ?? false}, ${description || null})
    ON CONFLICT (site_id, slug) DO UPDATE SET name = ${name.trim()}, display_name = ${display_name || null}, consent_given = ${consent_given ?? false}, description = ${description || null}
    RETURNING id, name, slug, display_name, consent_given, description
  `;

  return NextResponse.json({ client });
}
