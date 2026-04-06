import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/clients/:id — update a persona
 * Body: { name?, display_name?, type?, consent_given?, description? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [persona] = await sql`
    SELECT p.id FROM personas p
    JOIN sites s ON p.site_id = s.id
    WHERE p.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!persona) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE personas SET name = ${body.name.trim()}, slug = ${slug} WHERE id = ${id}`;
  }
  if (body.display_name !== undefined) {
    await sql`UPDATE personas SET display_name = ${body.display_name || null} WHERE id = ${id}`;
  }
  if (body.type !== undefined) {
    await sql`UPDATE personas SET type = ${body.type} WHERE id = ${id}`;
  }
  if (body.consent_given !== undefined) {
    await sql`UPDATE personas SET consent_given = ${!!body.consent_given} WHERE id = ${id}`;
  }
  if (body.description !== undefined) {
    await sql`UPDATE personas SET description = ${body.description || null} WHERE id = ${id}`;
  }

  const [updated] = await sql`SELECT id, name, slug, display_name, type, consent_given, description FROM personas WHERE id = ${id}`;
  return NextResponse.json({ client: updated });
}

/**
 * DELETE /api/clients/:id
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
    DELETE FROM personas p
    USING sites s
    WHERE p.site_id = s.id AND p.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
