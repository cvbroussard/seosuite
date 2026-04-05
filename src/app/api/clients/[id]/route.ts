import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/clients/:id — update a client
 * Body: { name?, display_name?, consent_given?, description? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [client] = await sql`
    SELECT c.id FROM clients c
    JOIN sites s ON c.site_id = s.id
    WHERE c.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    const slug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    await sql`UPDATE clients SET name = ${body.name.trim()}, slug = ${slug} WHERE id = ${id}`;
  }
  if (body.display_name !== undefined) {
    await sql`UPDATE clients SET display_name = ${body.display_name || null} WHERE id = ${id}`;
  }
  if (body.consent_given !== undefined) {
    await sql`UPDATE clients SET consent_given = ${!!body.consent_given} WHERE id = ${id}`;
  }
  if (body.description !== undefined) {
    await sql`UPDATE clients SET description = ${body.description || null} WHERE id = ${id}`;
  }

  const [updated] = await sql`SELECT id, name, slug, display_name, consent_given, description FROM clients WHERE id = ${id}`;
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
    DELETE FROM clients c
    USING sites s
    WHERE c.site_id = s.id AND c.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
