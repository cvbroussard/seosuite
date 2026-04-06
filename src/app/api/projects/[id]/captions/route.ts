import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/projects/:id/captions — Caption pipeline status.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  const [project] = await sql`
    SELECT caption_mode, manual_caption_count FROM projects WHERE id = ${id}
  `;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [counts] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ma.context_note IS NOT NULL AND ma.context_note != '')::int AS captioned,
      COUNT(*) FILTER (WHERE ma.context_note IS NULL OR ma.context_note = '')::int AS uncaptioned
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${id}
  `;

  return NextResponse.json({
    caption_mode: project.caption_mode,
    manual_caption_count: project.manual_caption_count,
    seed_threshold: 3,
    total_assets: counts?.total || 0,
    captioned: counts?.captioned || 0,
    uncaptioned: counts?.uncaptioned || 0,
  });
}

/**
 * POST /api/projects/:id/captions — Set caption mode or trigger generation.
 * Body: { mode: "autopilot" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [project] = await sql`
    SELECT p.id, p.caption_mode FROM projects p
    JOIN sites s ON p.site_id = s.id
    WHERE p.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.mode === "autopilot") {
    await sql`UPDATE projects SET caption_mode = 'autopilot' WHERE id = ${id}`;

    const { generateAllCaptions, buildProjectSnapshot } = await import("@/lib/pipeline/project-captions");
    await buildProjectSnapshot(id);
    const generated = await generateAllCaptions(id);

    return NextResponse.json({ mode: "autopilot", generated });
  }

  if (body.mode === "supervised") {
    await sql`UPDATE projects SET caption_mode = 'supervised' WHERE id = ${id}`;
    return NextResponse.json({ mode: "supervised" });
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}
