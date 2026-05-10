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
  if (body.visual_cues !== undefined) {
    const arr = Array.isArray(body.visual_cues)
      ? body.visual_cues
      : typeof body.visual_cues === "string"
      ? body.visual_cues.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
    await sql`UPDATE personas SET visual_cues = ${arr}::text[] WHERE id = ${id}`;
  }
  if (body.narrative_context !== undefined) {
    await sql`UPDATE personas SET narrative_context = ${body.narrative_context || null} WHERE id = ${id}`;
  }
  if (body.relationships !== undefined) {
    const rj = typeof body.relationships === "string" ? body.relationships : JSON.stringify(body.relationships || {});
    await sql`UPDATE personas SET relationships = ${rj}::jsonb WHERE id = ${id}`;
  }
  if (body.hero_asset_id !== undefined) {
    await sql`UPDATE personas SET hero_asset_id = ${body.hero_asset_id || null} WHERE id = ${id}`;
  }
  if (body.metadata !== undefined) {
    const mj = typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata || {});
    await sql`UPDATE personas SET metadata = ${mj}::jsonb WHERE id = ${id}`;
  }

  const [updated] = await sql`SELECT id, name, slug, display_name, type, consent_given, description, visual_cues, narrative_context, relationships, appearance_count, first_seen_at, last_seen_at, hero_asset_id, metadata FROM personas WHERE id = ${id}`;
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
