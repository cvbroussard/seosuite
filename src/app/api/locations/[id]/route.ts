import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/locations/:id — update a location
 * Body: { name?, address?, city?, state?, description? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [location] = await sql`
    SELECT l.id FROM locations l
    JOIN sites s ON l.site_id = s.id
    WHERE l.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE locations SET name = ${body.name.trim()}, slug = ${slug} WHERE id = ${id}`;
  }
  if (body.address !== undefined) {
    await sql`UPDATE locations SET address = ${body.address || null} WHERE id = ${id}`;
  }
  if (body.city !== undefined) {
    await sql`UPDATE locations SET city = ${body.city || null} WHERE id = ${id}`;
  }
  if (body.state !== undefined) {
    await sql`UPDATE locations SET state = ${body.state || null} WHERE id = ${id}`;
  }
  if (body.description !== undefined) {
    await sql`UPDATE locations SET description = ${body.description || null} WHERE id = ${id}`;
  }

  const [updated] = await sql`SELECT id, name, slug, address, city, state, description FROM locations WHERE id = ${id}`;
  return NextResponse.json({ location: updated });
}

/**
 * DELETE /api/locations/:id
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  await sql`
    DELETE FROM locations l
    USING sites s
    WHERE l.site_id = s.id AND l.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
