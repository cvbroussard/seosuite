/**
 * Brand logo URL helpers — for downstream public-facing render
 * surfaces that want elegant variants (marketing sites, article
 * inline mentions).
 *
 * Dashboard render path is plain `brand.hero_url` (R2-cached, captured
 * once at brand creation). These helpers exist for the rare surfaces
 * where the captured icon isn't quite the right format — a wordmark
 * for a wide brand grid, a dark-theme variant on a dark hero, etc.
 *
 * Pure functions — no env access, no I/O.
 */

export type BrandLogoVariant = "icon" | "logo" | "symbol";
export type BrandLogoTheme = "light" | "dark";

export interface BrandLogoOpts {
  type?: BrandLogoVariant;
  theme?: BrandLogoTheme;
  height?: number;
  width?: number;
}

/**
 * Append variant params to a stored logo service URL.
 *
 * `serviceUrl` is the URL captured at enrichment time — already
 * includes auth params (e.g. `?c=CLIENT_ID&fallback=404`). This
 * helper layers on type/theme/size for the requesting surface.
 *
 * Returns null when serviceUrl is unset — caller falls back to
 * brand.hero_url (R2) or letter-avatar.
 */
export function variantizeLogoUrl(
  serviceUrl: string | null | undefined,
  opts: BrandLogoOpts = {},
): string | null {
  if (!serviceUrl) return null;
  try {
    const url = new URL(serviceUrl);
    if (opts.type) url.searchParams.set("type", opts.type);
    if (opts.theme) url.searchParams.set("theme", opts.theme);
    if (opts.height) url.searchParams.set("h", String(opts.height));
    if (opts.width) url.searchParams.set("w", String(opts.width));
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Resolve the best available logo URL for a brand:
 *   1. Service URL (Brandfetch) with variant params, when set
 *   2. R2-cached hero_url (captured bytes — fast, ours, always present
 *      after enrichment via any source: Brandfetch, OG, favicon,
 *      Google s2, or subscriber manual paste)
 *   3. null — caller renders letter-avatar
 *
 * Default render in the dashboard skips this helper entirely and
 * just reads brand.hero_url. Use this when a surface wants the
 * variant flexibility.
 */
export function resolveBrandLogo(
  brand: { logo_service_url?: string | null; hero_url?: string | null },
  opts: BrandLogoOpts = {},
): string | null {
  return variantizeLogoUrl(brand.logo_service_url, opts) || brand.hero_url || null;
}
