import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/entities/:id — update an entity
 * Body: { name?, url? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [entity] = await sql`
    SELECT id FROM entities WHERE id = ${id} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE entities SET name = ${body.name}, slug = ${slug} WHERE id = ${id}`;
  }
  if (body.url !== undefined) {
    await sql`UPDATE entities SET url = ${body.url || null} WHERE id = ${id}`;
  }

  const [updated] = await sql`SELECT id, name, slug, url, slot FROM entities WHERE id = ${id}`;
  return NextResponse.json({ entity: updated });
}

/**
 * DELETE /api/entities/:id — delete an entity
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
    DELETE FROM entities WHERE id = ${id} AND subscription_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
