/**
 * Image re-hosting — downloads images from original blog
 * and uploads to R2 so imported posts are self-contained.
 */
import { createHash } from "crypto";
import { uploadBufferToR2 } from "@/lib/r2";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/**
 * Download images and upload to R2. Returns a mapping of original→new URLs.
 */
export async function rehostImages(
  imageUrls: string[],
  siteId: string
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();

  for (const originalUrl of imageUrls) {
    try {
      const res = await fetch(originalUrl, {
        headers: { "User-Agent": "TracPost-Importer/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) continue;

      // Determine extension from URL or content-type
      const ext = getExtension(originalUrl, res.headers.get("content-type"));
      if (!ext) continue;

      const contentType = MIME_MAP[ext] || "application/octet-stream";
      const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
      const key = `sites/${siteId}/imported/${hash}${ext}`;

      const publicUrl = await uploadBufferToR2(key, buffer, contentType);
      urlMap.set(originalUrl, publicUrl);
    } catch {
      // Skip failed images — non-fatal
      console.warn(`Failed to re-host image: ${originalUrl}`);
    }
  }

  return urlMap;
}

/**
 * Replace image URLs in markdown with re-hosted R2 URLs.
 */
export function rewriteImageUrls(
  markdown: string,
  urlMap: Map<string, string>
): string {
  let result = markdown;
  for (const [original, replacement] of urlMap) {
    result = result.replaceAll(original, replacement);
  }
  return result;
}

function getExtension(
  url: string,
  contentType: string | null
): string | null {
  // Try URL path first
  const pathMatch = new URL(url).pathname.match(/(\.\w+)(?:\?|$)/);
  if (pathMatch && MIME_MAP[pathMatch[1].toLowerCase()]) {
    return pathMatch[1].toLowerCase();
  }

  // Fall back to content-type
  if (contentType) {
    const entry = Object.entries(MIME_MAP).find(
      ([, mime]) => contentType.includes(mime.split("/")[1])
    );
    if (entry) return entry[0];
  }

  return ".jpg"; // default fallback for unknown images
}
