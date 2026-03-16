/**
 * Blog post discovery — finds all post URLs from an existing blog.
 * Strategy: RSS feed first → sitemap.xml fallback → crawl last resort.
 */

export interface DiscoveredPost {
  url: string;
  title?: string;
  publishDate?: string;
  slug: string;
}

/**
 * Discover blog posts from a URL. Tries RSS, then sitemap, then crawl.
 */
export async function discoverBlogPosts(
  blogUrl: string
): Promise<DiscoveredPost[]> {
  const base = blogUrl.replace(/\/+$/, "");

  // 1. Try RSS feeds
  const rssPosts = await tryRss(base);
  if (rssPosts.length > 0) return dedupeBySlug(rssPosts);

  // 2. Try sitemap.xml
  const sitemapPosts = await trySitemap(base);
  if (sitemapPosts.length > 0) return dedupeBySlug(sitemapPosts);

  // 3. Crawl and detect blog post pages
  const crawlPosts = await tryCrawl(base);
  return dedupeBySlug(crawlPosts);
}

// --- RSS Discovery ---

const RSS_PATHS = [
  "/feed",
  "/rss",
  "/feed.xml",
  "/rss.xml",
  "/blog/feed",
  "/blog/feed.xml",
  "/blog/rss.xml",
  "/index.xml",
];

async function tryRss(base: string): Promise<DiscoveredPost[]> {
  // First check the page for <link rel="alternate" type="application/rss+xml">
  try {
    const html = await fetchPage(base);
    const rssLinkMatch = html.match(
      /<link[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/i
    );
    if (rssLinkMatch) {
      const rssUrl = resolveUrl(base, rssLinkMatch[1]);
      const posts = await parseRssFeed(rssUrl);
      if (posts.length > 0) return posts;
    }
  } catch {
    // continue to path probing
  }

  // Probe common RSS paths
  for (const path of RSS_PATHS) {
    try {
      const posts = await parseRssFeed(`${base}${path}`);
      if (posts.length > 0) return posts;
    } catch {
      continue;
    }
  }

  return [];
}

async function parseRssFeed(url: string): Promise<DiscoveredPost[]> {
  const xml = await fetchPage(url);
  if (!xml.includes("<rss") && !xml.includes("<feed") && !xml.includes("<channel")) {
    return [];
  }

  const posts: DiscoveredPost[] = [];

  // RSS 2.0: <item> blocks
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const item of rssItems) {
    const link = extractTag(item, "link") || extractAttr(item, "link", "href");
    if (!link) continue;

    posts.push({
      url: link,
      title: extractTag(item, "title") || undefined,
      publishDate: extractTag(item, "pubDate") || extractTag(item, "dc:date") || undefined,
      slug: extractSlug(link),
    });
  }

  // Atom: <entry> blocks
  if (posts.length === 0) {
    const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const entry of atomEntries) {
      const link =
        extractAttr(entry, "link", "href") || extractTag(entry, "link");
      if (!link) continue;

      posts.push({
        url: link,
        title: extractTag(entry, "title") || undefined,
        publishDate: extractTag(entry, "published") || extractTag(entry, "updated") || undefined,
        slug: extractSlug(link),
      });
    }
  }

  return posts;
}

// --- Sitemap Discovery ---

async function trySitemap(base: string): Promise<DiscoveredPost[]> {
  const sitemapUrls = [`${base}/sitemap.xml`, `${base}/post-sitemap.xml`, `${base}/blog-sitemap.xml`];

  for (const url of sitemapUrls) {
    try {
      const xml = await fetchPage(url);
      if (!xml.includes("<urlset") && !xml.includes("<sitemapindex")) continue;

      const posts: DiscoveredPost[] = [];
      const locs = xml.match(/<loc>([\s\S]*?)<\/loc>/gi) || [];

      for (const loc of locs) {
        const urlStr = loc.replace(/<\/?loc>/gi, "").trim();
        if (looksLikeBlogPost(urlStr, base)) {
          posts.push({
            url: urlStr,
            slug: extractSlug(urlStr),
          });
        }
      }

      if (posts.length > 0) return posts;
    } catch {
      continue;
    }
  }

  return [];
}

// --- Crawl Discovery ---

async function tryCrawl(base: string): Promise<DiscoveredPost[]> {
  const visited = new Set<string>();
  const posts: DiscoveredPost[] = [];
  const queue = [base];
  const maxPages = 200;

  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift()!;
    const normalized = url.replace(/\/+$/, "").split("#")[0].split("?")[0];
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    try {
      await sleep(1000);
      const html = await fetchPage(url);

      // Check if this page looks like a blog post
      const hasArticle = /<article[\s>]/i.test(html);
      const hasLongContent =
        (html.match(/<p[\s>]/gi) || []).length > 3;

      if (hasArticle || (hasLongContent && looksLikeBlogPost(url, base))) {
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        posts.push({
          url: normalized,
          title: titleMatch ? decodeEntities(titleMatch[1].trim()) : undefined,
          slug: extractSlug(normalized),
        });
      }

      // Follow internal links
      const linkRegex = /<a[^>]+href=["']([^"'#]+)["']/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const href = resolveUrl(base, match[1]);
        if (href.startsWith(base) && !visited.has(href.replace(/\/+$/, ""))) {
          queue.push(href);
        }
      }
    } catch {
      continue;
    }
  }

  return posts;
}

// --- Helpers ---

function looksLikeBlogPost(url: string, base: string): boolean {
  const path = url.replace(base, "");
  // Common blog URL patterns
  const blogPatterns = [
    /\/blog\/.+/,
    /\/posts?\/.+/,
    /\/articles?\/.+/,
    /\/\d{4}\/\d{2}\/.+/, // /2024/03/post-slug
    /\/news\/.+/,
  ];
  return blogPatterns.some((p) => p.test(path));
}

function extractSlug(url: string): string {
  const path = new URL(url).pathname;
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  return last.replace(/\.html?$/, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  if (!match) return null;
  return decodeEntities(match[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "i");
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function dedupeBySlug(posts: DiscoveredPost[]): DiscoveredPost[] {
  const seen = new Set<string>();
  return posts.filter((p) => {
    if (seen.has(p.slug)) return false;
    seen.add(p.slug);
    return true;
  });
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "TracPost-Importer/1.0" },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
