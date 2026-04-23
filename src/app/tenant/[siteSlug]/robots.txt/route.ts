import { NextResponse } from "next/server";
import { getCustomDomain } from "@/lib/blog";
import { resolveBlogSiteBySlug } from "@/lib/blog";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ siteSlug: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { siteSlug } = await params;
  const site = await resolveBlogSiteBySlug(siteSlug);
  if (!site) return new NextResponse("Not Found", { status: 404 });

  const customDomain = await getCustomDomain(site.siteId);
  const origin = customDomain ? `https://${customDomain}` : `https://preview.tracpost.com/${siteSlug}`;

  const body = `User-agent: *
Allow: /
Disallow: /dashboard/
Disallow: /admin/
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
