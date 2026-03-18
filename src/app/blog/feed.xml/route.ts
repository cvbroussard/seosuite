import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveBlogSite, getBlogPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

export async function GET() {
  const headersList = await headers();
  const blogHost = headersList.get("x-blog-host") || "blog.tracpost.com";
  const site = await resolveBlogSite(blogHost);

  if (!site) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const posts = await getBlogPosts(site.siteId, 20);
  const baseUrl = `https://${blogHost}`;
  const title = site.blogTitle || site.siteName;

  const items = posts.map((post) => {
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
      <guid>${baseUrl}/${post.slug}</guid>${pillar}${tags}${enclosure}
    </item>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <link>${baseUrl}</link>
    <description>${site.blogDescription || ""}</description>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
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
