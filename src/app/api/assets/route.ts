import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline/orchestrator";

/**
 * POST /api/assets — Register a new media asset.
 *
 * The mobile capture app or any client calls this after uploading
 * the file to object storage (R2/S3). This endpoint records the
 * asset metadata and sets triage_status = "received" to enter
 * the autopilot pipeline.
 *
 * Body: { site_id, storage_url, media_type, context_note?, metadata? }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { site_id, storage_url, media_type, context_note, metadata } = body;

    if (!site_id || !storage_url || !media_type) {
      return NextResponse.json(
        { error: "site_id, storage_url, and media_type are required" },
        { status: 400 }
      );
    }

    // Verify site belongs to this subscriber
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${site_id} AND subscriber_id = ${auth.subscriberId}
    `;

    if (!site) {
      return NextResponse.json(
        { error: "Site not found or not owned by subscriber" },
        { status: 404 }
      );
    }

    const [asset] = await sql`
      INSERT INTO media_assets (
        site_id, storage_url, media_type, context_note,
        source, triage_status, metadata
      )
      VALUES (
        ${site_id}, ${storage_url}, ${media_type},
        ${context_note || null}, 'upload', 'received',
        ${JSON.stringify(metadata || {})}
      )
      RETURNING id, site_id, storage_url, media_type, context_note, triage_status, created_at
    `;

    // Log usage
    await sql`
      INSERT INTO usage_log (subscriber_id, site_id, action, metadata)
      VALUES (${auth.subscriberId}, ${site_id}, 'asset_upload', ${JSON.stringify({
        asset_id: asset.id,
        media_type,
      })})
    `;

    // Fire pipeline immediately — non-blocking (don't await)
    runPipeline(site_id).catch((err) =>
      console.error("Pipeline trigger after upload failed:", err)
    );

    return NextResponse.json({ asset }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/assets?site_id=xxx&status=received
 * List assets for a site, optionally filtered by triage_status.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("site_id");
    const status = searchParams.get("status");

    if (!siteId) {
      return NextResponse.json(
        { error: "site_id query parameter is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${siteId} AND subscriber_id = ${auth.subscriberId}
    `;

    if (!site) {
      return NextResponse.json(
        { error: "Site not found or not owned by subscriber" },
        { status: 404 }
      );
    }

    let assets;
    if (status) {
      assets = await sql`
        SELECT id, storage_url, media_type, context_note, triage_status,
               quality_score, content_pillar, platform_fit, flag_reason,
               shelve_reason, source, created_at, triaged_at
        FROM media_assets
        WHERE site_id = ${siteId} AND triage_status = ${status}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    } else {
      assets = await sql`
        SELECT id, storage_url, media_type, context_note, triage_status,
               quality_score, content_pillar, platform_fit, flag_reason,
               shelve_reason, source, created_at, triaged_at
        FROM media_assets
        WHERE site_id = ${siteId}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    }

    return NextResponse.json({ assets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
