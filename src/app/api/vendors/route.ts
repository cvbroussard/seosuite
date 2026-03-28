import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/vendors — list all vendors for the subscriber
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const vendors = await sql`
    SELECT id, name, slug, url, created_at
    FROM vendors
    WHERE subscriber_id = ${auth.subscriberId}
    ORDER BY name ASC
  `;

  return NextResponse.json({ vendors });
}

/**
 * POST /api/vendors — create a new vendor
 * Body: { name, url? }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, url } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

  const [vendor] = await sql`
    INSERT INTO vendors (subscriber_id, name, slug, url)
    VALUES (${auth.subscriberId}, ${name.trim()}, ${slug}, ${url || null})
    ON CONFLICT (subscriber_id, slug) DO UPDATE SET name = ${name.trim()}, url = ${url || null}
    RETURNING id, name, slug, url
  `;

  return NextResponse.json({ vendor });
}
