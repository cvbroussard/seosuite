/**
 * POST /api/admin/coaching/upload
 *   Body: { platform, nodeId, filename, contentType }
 *   Returns: { uploadUrl, publicUrl, key }
 *
 * Generates a presigned R2 upload URL with a stable, named key derived
 * from the platform + node id + provided filename. Stable filenames let
 * coaching content reference the URL once without breaking when the
 * screenshot is re-uploaded. Stable filenames make CDN purge mandatory
 * — see /api/admin/coaching/purge.
 *
 * Key shape: onboarding/{platform}/{nodeId}/{filename}
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { createPresignedUpload } from "@/lib/r2";
import { purgeCdnCache } from "@/lib/cdn";

interface PostBody {
  platform?: string;
  nodeId?: string;
  filename?: string;
  contentType?: string;
}

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const { platform, nodeId, filename, contentType } = body;

  if (!platform || !nodeId || !filename || !contentType) {
    return NextResponse.json(
      { error: "platform, nodeId, filename, contentType all required" },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Content type ${contentType} not allowed` },
      { status: 400 }
    );
  }

  // Sanitize the filename — strip any path segments, restrict to safe chars.
  const safeFilename = filename
    .replace(/[/\\]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safeFilename || safeFilename.startsWith(".")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const key = `onboarding/${platform}/${nodeId}/${safeFilename}`;

  const { uploadUrl, publicUrl } = await createPresignedUpload({
    key,
    contentType,
  });

  // Pre-emptively purge — if this key was uploaded before, the edge cache
  // may serve the old bytes. Purge before client uploads new bytes; the
  // next GET after upload is the first miss and will pull fresh.
  await purgeCdnCache([publicUrl]);

  return NextResponse.json({ uploadUrl, publicUrl, key });
}
