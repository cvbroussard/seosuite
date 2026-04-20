import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/google/social-profiles?site_id=xxx
 * Returns social profile URLs derived from connected accounts.
 */
export async function GET(req: NextRequest) {
  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const { getSocialProfileUrls } = await import("@/lib/gbp/social-profiles");
  const profiles = await getSocialProfileUrls(siteId);

  return NextResponse.json({ profiles });
}
