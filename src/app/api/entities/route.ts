import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/entities?site_id=...&slot=1
 * List entities for a site, optionally filtered by slot.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  const slot = req.nextUrl.searchParams.get("slot");

  if (!siteId) {
    return NextResponse.json({ entities: [] });
  }

  const entities = slot
    ? await sql`
        SELECT id, name, slug, url, slot, created_at FROM entities
        WHERE site_id = ${siteId} AND slot = ${parseInt(slot)}
        ORDER BY name ASC
      `
    : await sql`
        SELECT id, name, slug, url, slot, created_at FROM entities
        WHERE site_id = ${siteId}
        ORDER BY slot ASC, name ASC
      `;

  return NextResponse.json({ entities });
}

/**
 * POST /api/entities — create an entity
 * Body: { name, url?, site_id, slot }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, url, site_id, slot } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const siteId = site_id;
  const slotNum = parseInt(slot) || 1;

  if (slotNum < 1 || slotNum > 4) {
    return NextResponse.json({ error: "Slot must be 1-4" }, { status: 400 });
  }

  if (!siteId) {
    return NextResponse.json({ error: "No site selected" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT id FROM sites WHERE id = ${siteId} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

  const [entity] = await sql`
    INSERT INTO entities (subscription_id, site_id, name, slug, url, slot)
    VALUES (${auth.subscriptionId}, ${siteId}, ${name.trim()}, ${slug}, ${url || null}, ${slotNum})
    ON CONFLICT (site_id, slot, slug) WHERE site_id IS NOT NULL DO UPDATE SET name = ${name.trim()}, url = ${url || null}
    RETURNING id, name, slug, url, slot
  `;

  return NextResponse.json({ entity });
}
