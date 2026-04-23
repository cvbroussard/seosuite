import { NextResponse } from "next/server";
import { resolveBlogSiteBySlug, getCustomDomain } from "@/lib/blog";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ siteSlug: string }>;
}

/**
 * Sitemap index — points to sub-sitemaps for pages, blog, and projects.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return new NextResponse("Not Found", { status: 404 });

  const customDomain = await getCustomDomain(site.siteId);
  const origin = customDomain ? `https://${customDomain}` : `https://preview.tracpost.com/${siteSlug}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="${origin}/sitemap-style.xsl"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${origin}/sitemap-pages.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${origin}/blog/sitemap.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${origin}/sitemap-projects.xml</loc>
  </sitemap>
</sitemapindex>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
