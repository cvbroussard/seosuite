import { NextResponse } from "next/server";
import { getAllBlogSites } from "@/lib/blog";

export const dynamic = "force-dynamic";

/**
 * Sitemap index — lists all per-site sitemaps.
 */
export async function GET() {
  const sites = await getAllBlogSites();

  const sitemaps = sites.map((site) => {
    const lastmod = site.latestPostDate
      ? `\n    <lastmod>${new Date(site.latestPostDate).toISOString()}</lastmod>`
      : "";
    return `
  <sitemap>
    <loc>https://blog.tracpost.com/${site.blogSlug}/sitemap.xml</loc>${lastmod}
  </sitemap>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps}
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
