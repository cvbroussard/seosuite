/**
 * Fetch a remote URL and persist its bytes to R2 under the given key.
 * Returns the public URL (assets.tracpost.com/{key}).
 *
 * Used by historical-media import to copy IG/FB CDN URLs (which expire)
 * into our durable storage. Does not retry — caller decides on failure.
 */
import "server-only";
import { uploadBufferToR2 } from "@/lib/r2";

export async function rehostFromUrl(remoteUrl: string, key: string, fallbackContentType = "image/jpeg"): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(remoteUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`fetch ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get("content-type") || fallbackContentType;
    const buffer = Buffer.from(await res.arrayBuffer());
    return await uploadBufferToR2(key, buffer, contentType);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pick a file extension from a URL or content-type guess.
 * Falls back to .jpg.
 */
export function extFromUrl(url: string, defaultExt = "jpg"): string {
  const m = url.split("?")[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  if (!m) return defaultExt;
  const ext = m[1].toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "heic"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  return defaultExt;
}
