import type { MetadataRoute } from "next";
import { headers } from "next/headers";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = (h.get("host") || "").toLowerCase().split(":")[0];

  // Preview subdomain must not be indexed — it serves unreleased tenant
  // content and would split ranking signals from the production domain.
  if (host === "preview.tracpost.com" || host === "staging.tracpost.com") {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/blog/",
      disallow: ["/dashboard/", "/admin/", "/api/"],
    },
    sitemap: "https://tracpost.com/blog/sitemap.xml",
  };
}
