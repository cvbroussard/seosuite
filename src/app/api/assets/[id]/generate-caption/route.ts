import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/assets/:id/generate-caption
 *
 * Generate an AI caption using the best available context:
 * - Project snapshot (if asset belongs to a project)
 * - Site-level snapshot (fallback for non-project assets)
 *
 * Returns draft text — does NOT write to DB.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.media_type, ma.date_taken, ma.created_at, ma.metadata
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    WHERE ma.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const { generateCaptionForAsset, buildProjectSnapshot, buildSiteSnapshot } = await import("@/lib/pipeline/project-captions");

  // Try project context first, fall back to site context
  const [projectLink] = await sql`
    SELECT p.id FROM projects p
    JOIN asset_projects ap ON ap.project_id = p.id
    WHERE ap.asset_id = ${id}
    LIMIT 1
  `;

  const snapshot = projectLink
    ? await buildProjectSnapshot(projectLink.id as string)
    : await buildSiteSnapshot(asset.site_id as string);

  const caption = await generateCaptionForAsset(asset, snapshot);

  if (!caption) {
    return NextResponse.json({ error: "Caption generation failed" }, { status: 500 });
  }

  return NextResponse.json({ caption });
}
