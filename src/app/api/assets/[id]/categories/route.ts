import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/assets/[id]/categories
 *   Returns the asset's categorization (primary + secondaries) PLUS
 *   the site's full 10-category list so the operator can pick from
 *   them when manually adjusting.
 *
 *   Response: {
 *     asset: { id, hasTranscript },
 *     siteCategories: [{ gcid, name }],
 *     assignments: [{ gcid, name, is_primary, confidence, assigned_by, reasoning, assigned_at }]
 *   }
 *
 * POST /api/assets/[id]/categories
 *   Operator/subscriber edit. Body: { action, gcid }
 *   action: 'add' | 'remove' | 'set_primary'
 *   Writes are recorded as assigned_by='operator' (or 'subscriber') so
 *   they're preserved by the auto-categorizer on re-run.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;

  const [asset] = await sql`
    SELECT ma.id, ma.site_id,
      (EXISTS(SELECT 1 FROM recordings WHERE source_asset_id = ma.id AND transcript IS NOT NULL AND transcript <> '' AND archived_at IS NULL)
        OR (ma.context_note IS NOT NULL AND ma.context_note <> '')) AS has_transcript
    FROM media_assets ma WHERE ma.id = ${assetId}
  `;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === asset.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  const siteCategories = await sql`
    SELECT sgc.gcid, gc.name
    FROM site_gbp_categories sgc JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${asset.site_id}
    ORDER BY sgc.is_primary DESC, gc.name
  `;

  const assignments = await sql`
    SELECT ac.gcid, gc.name, ac.is_primary, ac.confidence, ac.assigned_by, ac.reasoning, ac.assigned_at
    FROM asset_categories ac JOIN gbp_categories gc ON gc.gcid = ac.gcid
    WHERE ac.asset_id = ${assetId}
    ORDER BY ac.is_primary DESC, ac.confidence DESC NULLS LAST
  `;

  return NextResponse.json({
    asset: { id: asset.id, hasTranscript: asset.has_transcript },
    siteCategories,
    assignments,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: assetId } = await params;
  let body: { action?: string; gcid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  const gcid = body.gcid;
  if (!action || !gcid) return NextResponse.json({ error: "action and gcid required" }, { status: 400 });

  const [asset] = await sql`SELECT site_id FROM media_assets WHERE id = ${assetId}`;
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (!session.sites.some((s) => s.id === asset.site_id)) {
    return NextResponse.json({ error: "Asset not in your subscription" }, { status: 403 });
  }

  // Validate gcid is in site's catalog
  const [valid] = await sql`
    SELECT 1 FROM site_gbp_categories WHERE site_id = ${asset.site_id} AND gcid = ${gcid}
  `;
  if (!valid) return NextResponse.json({ error: "gcid not in site's category set" }, { status: 400 });

  const assignedBy = session.role === "operator" || session.role === "admin" ? "operator" : "subscriber";

  if (action === "add") {
    const [existing] = await sql`
      SELECT 1 FROM asset_categories WHERE asset_id = ${assetId} AND gcid = ${gcid}
    `;
    if (existing) return NextResponse.json({ ok: true, note: "already assigned" });
    // Insert as non-primary; operator can promote separately
    await sql`
      INSERT INTO asset_categories (asset_id, gcid, is_primary, assigned_by)
      VALUES (${assetId}, ${gcid}, false, ${assignedBy})
    `;
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    await sql`DELETE FROM asset_categories WHERE asset_id = ${assetId} AND gcid = ${gcid}`;
    return NextResponse.json({ ok: true });
  }

  if (action === "set_primary") {
    // Clear existing primary, then set this one (and ensure it exists)
    await sql`
      UPDATE asset_categories SET is_primary = false WHERE asset_id = ${assetId}
    `;
    const [existing] = await sql`
      SELECT 1 FROM asset_categories WHERE asset_id = ${assetId} AND gcid = ${gcid}
    `;
    if (existing) {
      await sql`
        UPDATE asset_categories
        SET is_primary = true, assigned_by = ${assignedBy}
        WHERE asset_id = ${assetId} AND gcid = ${gcid}
      `;
    } else {
      await sql`
        INSERT INTO asset_categories (asset_id, gcid, is_primary, assigned_by)
        VALUES (${assetId}, ${gcid}, true, ${assignedBy})
      `;
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
