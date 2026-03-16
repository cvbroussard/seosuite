import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/assets/:id — Update an asset's context note or pillar.
 *
 * Body: { context_note?, pillar? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  try {
    const body = await req.json();
    const { context_note, pillar } = body;

    if (context_note === undefined && pillar === undefined) {
      return NextResponse.json(
        { error: "Nothing to update — provide context_note or pillar" },
        { status: 400 }
      );
    }

    // Verify ownership via site
    const [asset] = await sql`
      SELECT ma.id, ma.site_id, ma.metadata
      FROM media_assets ma
      JOIN sites s ON ma.site_id = s.id
      WHERE ma.id = ${id} AND s.subscriber_id = ${auth.subscriberId}
    `;

    if (!asset) {
      return NextResponse.json(
        { error: "Asset not found or not owned by subscriber" },
        { status: 404 }
      );
    }

    // Build update fields
    const updates: string[] = [];
    const values: unknown[] = [];

    if (context_note !== undefined) {
      updates.push("context_note");
      values.push(context_note);
    }

    if (pillar !== undefined) {
      // Store pillar in metadata.pillar
      const currentMeta =
        typeof asset.metadata === "object" && asset.metadata !== null
          ? asset.metadata
          : {};
      const newMeta = { ...currentMeta, pillar };
      updates.push("metadata");
      values.push(JSON.stringify(newMeta));

      // Also update content_pillar directly if asset is already triaged
      updates.push("content_pillar");
      values.push(pillar);
    }

    // Use individual update statements since Neon tagged template
    // doesn't support dynamic column lists easily
    if (context_note !== undefined && pillar !== undefined) {
      const currentMeta =
        typeof asset.metadata === "object" && asset.metadata !== null
          ? asset.metadata
          : {};
      const newMeta = { ...currentMeta, pillar };
      await sql`
        UPDATE media_assets
        SET context_note = ${context_note},
            content_pillar = ${pillar},
            metadata = ${JSON.stringify(newMeta)}
        WHERE id = ${id}
      `;
    } else if (context_note !== undefined) {
      await sql`
        UPDATE media_assets
        SET context_note = ${context_note}
        WHERE id = ${id}
      `;
    } else if (pillar !== undefined) {
      const currentMeta =
        typeof asset.metadata === "object" && asset.metadata !== null
          ? asset.metadata
          : {};
      const newMeta = { ...currentMeta, pillar };
      await sql`
        UPDATE media_assets
        SET content_pillar = ${pillar},
            metadata = ${JSON.stringify(newMeta)}
        WHERE id = ${id}
      `;
    }

    // Log the edit
    await sql`
      INSERT INTO subscriber_actions (site_id, action_type, target_type, target_id, payload)
      VALUES (${asset.site_id}, 'edit', 'media_asset', ${id}, ${JSON.stringify({
        context_note: context_note !== undefined ? "updated" : undefined,
        pillar: pillar !== undefined ? pillar : undefined,
      })})
    `;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
