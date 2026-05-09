/**
 * Asset URL key derivation — single source of slug truth.
 *
 * Per the URL-naming architecture (LOCKED 2026-05-08): once vision triage
 * returns a `url_slug` for an asset, every R2 key for that asset and its
 * derivatives derives from the slug + a stable hash suffix.
 *
 * Hash = first 8 chars of the asset's UUID. Deterministic, recoverable
 * from DB, collision-resistant at TracPost-scale volumes.
 *
 * Examples (slug = "walked-through-carter-foundation-underpinning",
 *           hash = "3db37450"):
 *   Source:  sites/X/media/walked-through-carter-foundation-underpinning-3db37450.mov
 *   Poster:  sites/X/posters/walked-through-carter-foundation-underpinning-3db37450-poster.jpg
 *   Reel:    sites/X/variants/walked-through-carter-foundation-underpinning-3db37450-reel-9x16.mp4
 *   Square:  sites/X/variants/walked-through-carter-foundation-underpinning-3db37450-feed-square.jpg
 */

export function assetIdHash(assetId: string): string {
  // First 8 chars of the UUID — strip any leading hyphens. UUIDs are stable
  // forever per asset, so this hash is stable forever per asset.
  return assetId.replace(/-/g, "").slice(0, 8);
}

export function deriveSourceKey(
  siteId: string,
  slug: string,
  assetId: string,
  ext: string,
): string {
  const hash = assetIdHash(assetId);
  return `sites/${siteId}/media/${slug}-${hash}.${ext}`;
}

export function derivePosterKey(
  siteId: string,
  slug: string,
  sourceAssetId: string,
): string {
  const hash = assetIdHash(sourceAssetId);
  return `sites/${siteId}/posters/${slug}-${hash}-poster.jpg`;
}

export function deriveVariantKey(
  siteId: string,
  slug: string,
  sourceAssetId: string,
  templateId: string,
  ext: string,
): string {
  const hash = assetIdHash(sourceAssetId);
  return `sites/${siteId}/variants/${slug}-${hash}-${templateId}.${ext}`;
}

/**
 * Pull the existing slug from a renamed asset's storage URL (so variants
 * can derive from already-renamed sources without re-querying triage).
 *
 * Source URL pattern: https://assets.tracpost.com/sites/X/media/{slug}-{hash}.{ext}
 * Returns null if the URL doesn't follow the slug-based pattern (e.g.
 * legacy asset that hasn't been renamed yet).
 */
export function extractSlugFromSourceUrl(sourceUrl: string): string | null {
  try {
    const u = new URL(sourceUrl);
    const parts = u.pathname.split("/");
    // Expected: ["", "sites", siteId, "media", filename]
    if (parts.length < 5 || parts[1] !== "sites" || parts[3] !== "media") {
      return null;
    }
    const filename = parts[parts.length - 1];
    const baseName = filename.replace(/\.[^.]+$/, "");
    // Must end with -{8 hex chars} hash to be slug-formatted
    const hashPattern = /-[a-f0-9]{8}$/;
    if (!hashPattern.test(baseName)) return null;
    return baseName.replace(hashPattern, "");
  } catch {
    return null;
  }
}
