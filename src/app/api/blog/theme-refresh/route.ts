import { NextRequest, NextResponse } from "next/server";
import { refreshStaleThemes, refreshSiteTheme } from "@/lib/blog-theme";

/**
 * POST /api/blog/theme-refresh
 *
 * Cron: refreshes themes for all blog-enabled sites older than 7 days.
 * Manual: pass site_id to refresh a specific site immediately.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const siteId = (body as Record<string, string>).site_id;

  if (siteId) {
    // Manual refresh for a specific site
    try {
      const theme = await refreshSiteTheme(siteId);
      return NextResponse.json({ theme });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Cron: refresh all stale themes
  const cronSecret = req.headers.get("authorization");
  if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refreshed = await refreshStaleThemes();
  return NextResponse.json({ refreshed });
}
