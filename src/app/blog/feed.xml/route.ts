import { NextResponse } from "next/server";
import { getAllBlogSites, getBlogPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

/**
 * Global aggregated RSS feed — recent articles from all blog-enabled sites.
 */
export async function GET() {
  const sites = await getAllBlogSites();

  // Collect recent posts from all sites (5 per site, max 50 total)
  const allPosts: Array<Record<string, unknown> & { siteSlug: string; siteName: string }> = [];

  for (const site of sites) {
    const posts = await getBlogPosts(site.siteId, 5);
    for (const post of posts) {
      allPosts.push({
        ...post,
        siteSlug: site.blogSlug,
        siteName: site.siteName,
      });
    }
  }

  // Sort by published_at DESC, limit 50
  allPosts.sort((a, b) => {
    const da = new Date(a.published_at as string).getTime();
    const db = new Date(b.published_at as string).getTime();
    return db - da;
  });
  const feed = allPosts.slice(0, 50);

  const items = feed.map((post) => {
    const baseUrl = `https://blog.tracpost.com/${post.siteSlug}`;
    const pillar = post.content_pillar ? `\n      <category>${post.content_pillar}</category>` : "";
    const tags = Array.isArray(post.tags)
      ? (post.tags as string[]).map((t) => `\n      <category>${t}</category>`).join("")
      : "";
    const enclosure = post.og_image_url
      ? `\n      <enclosure url="${post.og_image_url}" type="image/jpeg" />`
      : "";

    return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${baseUrl}/${post.slug}</link>
      <description><![CDATA[${post.excerpt || ""}]]></description>
      <pubDate>${new Date(post.published_at as string).toUTCString()}</pubDate>
      <guid>${baseUrl}/${post.slug}</guid>
      <author>${post.siteName}</author>${pillar}${tags}${enclosure}
    </item>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tracpost Blog</title>
    <link>https://blog.tracpost.com</link>
    <description>Articles from businesses powered by Tracpost</description>
    <atom:link href="https://blog.tracpost.com/feed.xml" rel="self" type="application/rss+xml"/>
    <language>en-us</language>${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
