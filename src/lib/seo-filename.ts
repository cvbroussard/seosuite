/**
 * Generate SEO-friendly image filenames from descriptive text.
 * Google Images indexes filenames — "walnut-countertop-brass-sink.jpg"
 * ranks better than "IMG_2450.jpg" or "1774728372244-ihy2jw.png".
 */

/**
 * Generate an SEO-friendly filename from descriptive text.
 * Slugifies the text, truncates to ~60 chars, appends a short dedup hash.
 */
export function seoFilename(
  description: string,
  ext: string = "jpg"
): string {
  const slug = description
    .toLowerCase()
    .replace(/#\w+/g, "") // strip hashtags
    .replace(/https?:\/\/\S+/g, "") // strip URLs
    .replace(/[^a-z0-9]+/g, "-") // non-alphanum to hyphens
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .replace(/-{2,}/g, "-") // collapse multiple hyphens
    .slice(0, 60)
    .replace(/-$/, ""); // trim trailing hyphen after slice

  const hash = Math.random().toString(36).slice(2, 6);
  const base = slug || "image";

  return `${base}-${hash}.${ext}`;
}
