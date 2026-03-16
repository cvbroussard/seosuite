import { analyzePageSeo } from "./analyzer";
import type { SeoAnalysis } from "./types";

/** Result of crawling a single page. */
export interface CrawlPageResult {
  url: string;
  status: number;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  canonical: string | null;
  ogTags: {
    title: string | null;
    description: string | null;
    image: string | null;
  };
  jsonLdTypes: string[];
  internalLinks: string[];
  images: Array<{ src: string; alt: string | null }>;
  seoAnalysis: SeoAnalysis;
  error?: string;
}

/** Aggregate result of a full site crawl. */
export interface CrawlResult {
  siteUrl: string;
  pages: CrawlPageResult[];
  startedAt: string;
  completedAt: string;
  pagesSkipped: number;
}

/**
 * Crawl a site starting from the homepage, following internal links.
 * Respects rate limiting (1 request per second) and maxPages cap.
 */
export async function crawlSite(
  siteUrl: string,
  maxPages: number = 50
): Promise<CrawlResult> {
  const startedAt = new Date().toISOString();
  const origin = new URL(siteUrl).origin;
  const visited = new Set<string>();
  const queue: string[] = [normalizeUrl(siteUrl)];
  const pages: CrawlPageResult[] = [];
  let pagesSkipped = 0;

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    const normalized = normalizeUrl(url);

    if (visited.has(normalized)) continue;
    visited.add(normalized);

    // Rate limit: 1 request per second
    if (pages.length > 0) {
      await sleep(1000);
    }

    try {
      const result = await crawlPage(url, origin);
      pages.push(result);

      // Add new internal links to the queue
      for (const link of result.internalLinks) {
        const normalizedLink = normalizeUrl(link);
        if (!visited.has(normalizedLink) && !queue.includes(normalizedLink)) {
          queue.push(normalizedLink);
        }
      }
    } catch {
      pagesSkipped++;
    }
  }

  pagesSkipped += queue.length; // remaining unvisited pages

  return {
    siteUrl,
    pages,
    startedAt,
    completedAt: new Date().toISOString(),
    pagesSkipped,
  };
}

/** Crawl a single page and extract SEO data. */
async function crawlPage(
  url: string,
  origin: string
): Promise<CrawlPageResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "TracPost-Crawler/1.0 (+https://tracpost.com)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return {
      url,
      status: 0,
      title: null,
      metaDescription: null,
      h1: null,
      canonical: null,
      ogTags: { title: null, description: null, image: null },
      jsonLdTypes: [],
      internalLinks: [],
      images: [],
      seoAnalysis: emptyAnalysis(url),
      error: err instanceof Error ? err.message : "Fetch failed",
    };
  }

  if (!response.ok) {
    return {
      url,
      status: response.status,
      title: null,
      metaDescription: null,
      h1: null,
      canonical: null,
      ogTags: { title: null, description: null, image: null },
      jsonLdTypes: [],
      internalLinks: [],
      images: [],
      seoAnalysis: emptyAnalysis(url),
      error: `HTTP ${response.status}`,
    };
  }

  const html = await response.text();
  const analysis = analyzePageSeo(url, html);

  const title = extractTitle(html);
  const h1 = extractH1(html);
  const internalLinks = extractInternalLinks(html, origin, url);
  const images = extractImages(html);

  return {
    url,
    status: response.status,
    title,
    metaDescription: analysis.existing.metaDescription,
    h1,
    canonical: analysis.existing.canonical,
    ogTags: {
      title: analysis.existing.ogTitle,
      description: analysis.existing.ogDescription,
      image: analysis.existing.ogImage,
    },
    jsonLdTypes: analysis.existing.jsonLdTypes,
    internalLinks,
    images,
    seoAnalysis: analysis,
  };
}

// ── HTML extraction helpers ──────────────────────────────────

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractH1(html: string): string | null {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return null;
  // Strip HTML tags from H1 content
  return match[1].replace(/<[^>]+>/g, "").trim() || null;
}

function extractInternalLinks(
  html: string,
  origin: string,
  currentUrl: string
): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    let href = match[1].trim();

    // Skip non-navigational links
    if (
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    ) {
      continue;
    }

    // Resolve relative URLs
    try {
      const resolved = new URL(href, currentUrl);
      if (resolved.origin !== origin) continue; // external link

      // Skip non-HTML resources
      const ext = resolved.pathname.split(".").pop()?.toLowerCase();
      if (
        ext &&
        ["pdf", "jpg", "jpeg", "png", "gif", "svg", "css", "js", "xml", "json", "zip", "mp4", "webm"].includes(ext)
      ) {
        continue;
      }

      const normalized = normalizeUrl(resolved.href);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(resolved.href);
      }
    } catch {
      // Skip malformed URLs
    }
  }

  return links;
}

function extractImages(
  html: string
): Array<{ src: string; alt: string | null }> {
  const images: Array<{ src: string; alt: string | null }> = [];
  const re = /<img[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);

    if (srcMatch) {
      images.push({
        src: srcMatch[1],
        alt: altMatch ? altMatch[1] || null : null,
      });
    }
  }

  return images;
}

/** Normalize URL by removing trailing slashes and fragments. */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return u.origin + path + u.search;
  } catch {
    return url;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyAnalysis(url: string): SeoAnalysis {
  return {
    url,
    pageType: "unknown",
    existing: {
      metaTitle: null,
      metaDescription: null,
      canonical: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      ogUrl: null,
      ogType: null,
      jsonLdTypes: [],
    },
    missing: {
      metaDescription: true,
      canonical: true,
      ogTitle: true,
      ogDescription: true,
      ogImage: true,
      ogUrl: true,
      jsonLd: true,
    },
  };
}
