import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { fetchAndConvert } from "@/lib/image-utils";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

/**
 * POST /api/assets — Register a new media asset.
 *
 * Does the minimum: validate, re-host external URLs, convert HEIC, create DB row.
 * All heavy processing (EXIF, triage, geo-match, project tagging) is deferred
 * to the pipeline cron. Browser can close immediately after this returns.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { site_id, media_type, context_note, project_id } = body;
    const storage_url = body.storage_url || body.url;

    if (!site_id || !storage_url || !media_type) {
      return NextResponse.json(
        { error: "site_id, storage_url, and media_type are required" },
        { status: 400 }
      );
    }

    // Verify site ownership
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Re-host external URLs to R2
    let finalUrl = storage_url;
    if (storage_url && !storage_url.includes("assets.tracpost.com") && media_type === "image") {
      try {
        const imgRes = await fetch(storage_url, { signal: AbortSignal.timeout(15000) });
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const fname = seoFilename(context_note || "product-image", ext);
          const key = `sites/${site_id}/media/${fname}`;
          finalUrl = await uploadBufferToR2(key, buffer, contentType);
        }
      } catch (err) {
        console.warn("External image re-host failed, using original URL:", err instanceof Error ? err.message : err);
      }
    }

    // Convert HEIC/HEIF to web format (needed for browser display)
    // Store original URL for EXIF extraction by the cron
    let originalUrl: string | null = null;
    if (finalUrl && media_type === "image" && (
      finalUrl.endsWith(".heic") || finalUrl.endsWith(".heif")
    )) {
      originalUrl = finalUrl;
      try {
        const { data, mimeType } = await fetchAndConvert(finalUrl);
        const date = new Date().toISOString().slice(0, 10);
        const fname = seoFilename(context_note || "upload", "jpg");
        const key = `sites/${site_id}/${date}/${fname}`;
        finalUrl = await uploadBufferToR2(key, data, mimeType);
      } catch (err) {
        console.warn("HEIC conversion failed, using original:", err instanceof Error ? err.message : err);
        originalUrl = null;
      }
    }

    // Build metadata — include deferred processing hints
    const assetMeta: Record<string, unknown> = {
      ...(body.metadata || {}),
      ...(originalUrl && { original_url: originalUrl }),
      ...(project_id && { pending_project_id: project_id }),
      original_filename: storage_url.split("/").pop()?.split("?")[0] || null,
    };

    const [asset] = await sql`
      INSERT INTO media_assets (
        site_id, storage_url, media_type, context_note,
        source, triage_status, metadata
      )
      VALUES (
        ${site_id}, ${finalUrl}, ${media_type},
        ${context_note || null}, 'upload', 'received',
        ${JSON.stringify(assetMeta)}
      )
      RETURNING id, site_id, storage_url, media_type, context_note, triage_status, created_at
    `;

    // Log usage
    await sql`
      INSERT INTO usage_log (subscription_id, site_id, action, metadata)
      VALUES (${auth.subscriptionId}, ${site_id}, 'asset_upload', ${JSON.stringify({
        asset_id: asset.id,
        media_type,
      })})
    `;

    return NextResponse.json({ asset }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/assets?site_id=xxx&status=received
 * List assets, optionally filtered.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const url = new URL(req.url);
  const siteId = url.searchParams.get("site_id");
  const status = url.searchParams.get("status");

  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT id FROM sites WHERE id = ${siteId} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const assets = status
    ? await sql`
        SELECT id, storage_url, media_type, context_note, triage_status, quality_score, created_at
        FROM media_assets WHERE site_id = ${siteId} AND triage_status = ${status}
        ORDER BY created_at DESC LIMIT 100
      `
    : await sql`
        SELECT id, storage_url, media_type, context_note, triage_status, quality_score, created_at
        FROM media_assets WHERE site_id = ${siteId}
        ORDER BY created_at DESC LIMIT 100
      `;

  return NextResponse.json({ assets });
}
