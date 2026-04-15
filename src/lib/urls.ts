/**
 * URL generation for tenant content.
 *
 * Three contexts that produce different URLs for the same content:
 *
 *   1. TracPost itself (siteSlug === "tracpost"):
 *      Single-segment root paths via next.config rewrites.
 *      /blog/[article], /projects/[project]
 *
 *   2. Tenant with active custom domain (e.g. blog.b2construct.com):
 *      Absolute URLs to the custom subdomain.
 *      https://blog.b2construct.com/[article]
 *
 *   3. Tenant on staging (no custom domain yet):
 *      Internal paths under /tenant/[siteSlug]/.
 *      Resolves on staging.tracpost.com via middleware rewrite,
 *      and works locally for development.
 *
 * All public-facing pages should use these helpers instead of
 * hardcoding /blog/[slug]/... or /projects/[slug]/... patterns.
 */

/** TracPost's reserved tenant slug. Used to detect the platform's own tenant. */
export const TRACPOST_SLUG = "tracpost";

/**
 * Slugs that cannot be claimed by tenants. They collide with reserved
 * subdomains, route segments, or platform-owned identifiers.
 *
 * Add new entries here when introducing routes that live at the root
 * (e.g., /studio, /admin) or new reserved subdomains.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "tracpost",
  "admin",
  "api",
  "app",
  "studio",
  "platform",
  "blog",
  "projects",
  "staging",
  "www",
  "tenant",
]);

/** True if a slug collides with a reserved name and cannot be assigned. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** True when this site is TracPost itself. */
export function isTracpost(siteSlug: string): boolean {
  return siteSlug === TRACPOST_SLUG;
}

/**
 * Host mode for intra-render URL emission.
 *
 *  - "production"  — custom domain or TracPost root. Helpers emit root
 *                    paths like /blog, /projects. (Default.)
 *  - "preview"     — rendering under preview.tracpost.com/[slug]/*.
 *                    Helpers emit /[slug]/blog, /[slug]/projects so nav
 *                    stays on preview instead of resolving to preview root.
 *  - "internal"    — rendering at /tenant/[slug]/* directly (dev or
 *                    unrewritten request). Helpers emit /tenant/[slug]/*.
 */
export type HostMode = "production" | "preview" | "internal";

// ──────────────────────────────────────────────────────────────────
// Blog
// ──────────────────────────────────────────────────────────────────

/** Hub URL — the blog landing page. */
export function blogHubUrl(
  siteSlug: string,
  customDomain?: string | null,
  hostMode: HostMode = "production",
): string {
  if (hostMode === "preview") return `/${siteSlug}/blog`;
  if (hostMode === "internal") return `/tenant/${siteSlug}/blog`;
  // production: custom domain + TracPost both serve path-based from root
  return "/blog";
}

/** Article URL — a single blog post. */
export function blogArticleUrl(
  siteSlug: string,
  articleSlug: string,
  customDomain?: string | null,
  hostMode: HostMode = "production",
): string {
  if (hostMode === "preview") return `/${siteSlug}/blog/${articleSlug}`;
  if (hostMode === "internal") return `/tenant/${siteSlug}/blog/${articleSlug}`;
  return `/blog/${articleSlug}`;
}

/** RSS feed URL. */
export function blogFeedUrl(
  siteSlug: string,
  customDomain?: string | null,
  hostMode: HostMode = "production",
): string {
  if (hostMode === "preview") return `/${siteSlug}/blog/feed.xml`;
  if (hostMode === "internal") return `/tenant/${siteSlug}/blog/feed.xml`;
  return "/blog/feed.xml";
}

/** Sitemap URL. */
export function blogSitemapUrl(
  siteSlug: string,
  customDomain?: string | null,
  hostMode: HostMode = "production",
): string {
  if (hostMode === "preview") return `/${siteSlug}/blog/sitemap.xml`;
  if (hostMode === "internal") return `/tenant/${siteSlug}/blog/sitemap.xml`;
  return "/blog/sitemap.xml";
}

// ──────────────────────────────────────────────────────────────────
// Projects
// ──────────────────────────────────────────────────────────────────

/** Hub URL — the projects landing page. */
export function projectsHubUrl(
  siteSlug: string,
  customDomain?: string | null,
  hostMode: HostMode = "production",
): string {
  if (hostMode === "preview") return `/${siteSlug}/projects`;
  if (hostMode === "internal") return `/tenant/${siteSlug}/projects`;
  return "/projects";
}

/** Project detail URL. */
export function projectUrl(
  siteSlug: string,
  projectSlug: string,
  customDomain?: string | null,
  hostMode: HostMode = "production",
): string {
  if (hostMode === "preview") return `/${siteSlug}/projects/${projectSlug}`;
  if (hostMode === "internal") return `/tenant/${siteSlug}/projects/${projectSlug}`;
  return `/projects/${projectSlug}`;
}

/** Brand hub URL — list of all brands/materials. */
export function brandHubUrl(
  siteSlug: string,
  customDomain?: string | null,
  hostMode: HostMode = "production",
): string {
  if (hostMode === "preview") return `/${siteSlug}/projects/brands`;
  if (hostMode === "internal") return `/tenant/${siteSlug}/projects/brands`;
  return "/projects/brands";
}

/** Brand detail URL. */
export function brandUrl(
  siteSlug: string,
  brandSlug: string,
  customDomain?: string | null,
  hostMode: HostMode = "production",
): string {
  if (hostMode === "preview") return `/${siteSlug}/projects/brands/${brandSlug}`;
  if (hostMode === "internal") return `/tenant/${siteSlug}/projects/brands/${brandSlug}`;
  return `/projects/brands/${brandSlug}`;
}

// ──────────────────────────────────────────────────────────────────
// Absolute (public) variants — for canonical, OG, sitemaps, emails
//
// These always emit the canonical production URL — custom domain if
// set, TracPost root for TracPost, preview.tracpost.com fallback for
// tenants without a custom domain yet.
// ──────────────────────────────────────────────────────────────────

const TRACPOST_ORIGIN = "https://tracpost.com";
const PREVIEW_ORIGIN = "https://preview.tracpost.com";

/** Absolute blog hub URL for canonical / OG / sitemap usage. */
export function publicBlogUrl(siteSlug: string, customDomain?: string | null): string {
  if (customDomain) return `https://${customDomain}/blog`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/blog`;
  return `${PREVIEW_ORIGIN}/${siteSlug}/blog`;
}

/** Absolute blog article URL. */
export function publicBlogArticleUrl(
  siteSlug: string,
  articleSlug: string,
  customDomain?: string | null
): string {
  if (customDomain) return `https://${customDomain}/blog/${articleSlug}`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/blog/${articleSlug}`;
  return `${PREVIEW_ORIGIN}/${siteSlug}/blog/${articleSlug}`;
}

/** Absolute projects hub URL. */
export function publicProjectsUrl(siteSlug: string, customDomain?: string | null): string {
  if (customDomain) return `https://${customDomain}/projects`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/projects`;
  return `${PREVIEW_ORIGIN}/${siteSlug}/projects`;
}

/** Absolute project detail URL. */
export function publicProjectUrl(
  siteSlug: string,
  projectSlug: string,
  customDomain?: string | null
): string {
  if (customDomain) return `https://${customDomain}/projects/${projectSlug}`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/projects/${projectSlug}`;
  return `${PREVIEW_ORIGIN}/${siteSlug}/projects/${projectSlug}`;
}

/** Absolute brand hub URL. */
export function publicBrandHubUrl(siteSlug: string, customDomain?: string | null): string {
  if (customDomain) return `https://${customDomain}/projects/brands`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/projects/brands`;
  return `${PREVIEW_ORIGIN}/${siteSlug}/projects/brands`;
}

/** Absolute brand detail URL. */
export function publicBrandUrl(
  siteSlug: string,
  brandSlug: string,
  customDomain?: string | null
): string {
  if (customDomain) return `https://${customDomain}/projects/brands/${brandSlug}`;
  if (isTracpost(siteSlug)) return `${TRACPOST_ORIGIN}/projects/brands/${brandSlug}`;
  return `${PREVIEW_ORIGIN}/${siteSlug}/projects/brands/${brandSlug}`;
}

/** Origin used as the base for absolute URLs in emails, sitemaps, etc. */
export function tenantPublicOrigin(
  siteSlug: string,
  customDomain?: string | null
): string {
  if (customDomain) return `https://${customDomain}`;
  if (isTracpost(siteSlug)) return TRACPOST_ORIGIN;
  return `${PREVIEW_ORIGIN}/${siteSlug}`;
}

// ──────────────────────────────────────────────────────────────────
// Host context detection (server-only, reads request headers)
//
// Server components can call detectHostMode() to determine the current
// rendering context, then pass the returned HostMode to helper calls.
// Default is "production" if no explicit context signal is found.
// ──────────────────────────────────────────────────────────────────

/**
 * Detect the current host mode from request headers.
 * Server-only — must be called from a Server Component or route handler.
 */
export async function detectHostMode(): Promise<HostMode> {
  // Dynamic import so client components that import other helpers from
  // this module don't pull next/headers into their bundle.
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = (h.get("host") || "").toLowerCase().split(":")[0];

  if (host === "preview.tracpost.com") return "preview";
  // Legacy name during transition; drop after DNS cutover.
  if (host === "staging.tracpost.com") return "preview";
  return "production";
}
