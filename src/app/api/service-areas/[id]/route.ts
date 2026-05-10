import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/service-areas/:id — update site overlay fields ONLY.
 *
 * The :id is the site_service_areas.id (overlay row), NOT the canonical
 * row. Edits to canonical fields (name, kind, boundary, etc.) require
 * operator-tier moderation per the canonical+overlay pattern (not
 * implemented yet — this endpoint refuses such edits).
 *
 * Body: { is_active?, hero_asset_id?, site_notes?, custom_description? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [overlay] = await sql`
    SELECT sa.id FROM site_service_areas sa
    JOIN sites s ON sa.site_id = s.id
    WHERE sa.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!overlay) {
    return NextResponse.json({ error: "Service area not found" }, { status: 404 });
  }

  const body = await req.json();

  // Refuse canonical edits (those require operator moderation)
  if (body.name !== undefined || body.kind !== undefined || body.boundary_geojson !== undefined) {
    return NextResponse.json({
      error: "Edits to name/kind/boundary require operator review (canonical-layer change)",
    }, { status: 400 });
  }

  if (body.is_active !== undefined) {
    await sql`UPDATE site_service_areas SET is_active = ${!!body.is_active} WHERE id = ${id}`;
  }
  if (body.hero_asset_id !== undefined) {
    await sql`UPDATE site_service_areas SET hero_asset_id = ${body.hero_asset_id || null} WHERE id = ${id}`;
  }
  if (body.site_notes !== undefined) {
    await sql`UPDATE site_service_areas SET site_notes = ${body.site_notes || null} WHERE id = ${id}`;
  }
  if (body.custom_description !== undefined) {
    await sql`UPDATE site_service_areas SET custom_description = ${body.custom_description || null} WHERE id = ${id}`;
  }

  const [updated] = await sql`
    SELECT
      sa.id AS overlay_id, sa.is_active, sa.hero_asset_id, sa.site_notes, sa.custom_description,
      c.id AS canonical_id, c.name, c.slug, c.kind, c.parent_region_id, c.place_id
    FROM site_service_areas sa
    JOIN service_areas_canonical c ON c.id = sa.service_area_canonical_id
    WHERE sa.id = ${id}
  `;
  return NextResponse.json({ service_area: updated });
}

/**
 * DELETE /api/service-areas/:id — remove the SITE OVERLAY (subscriber stops
 * listing this service area). Does NOT delete the canonical row, since
 * other subscribers may still reference it.
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
    DELETE FROM site_service_areas sa
    USING sites s
    WHERE sa.site_id = s.id AND sa.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  return NextResponse.json({ success: true });
}
