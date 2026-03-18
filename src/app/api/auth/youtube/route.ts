import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { getYouTubeAuthUrl } from "@/lib/youtube";

/**
 * GET /api/auth/youtube?site_id=xxx
 *
 * Initiates YouTube OAuth flow. Returns a redirect URL.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = new URL(req.url).searchParams.get("site_id");

  const state = Buffer.from(
    JSON.stringify({
      subscriber_id: auth.subscriberId,
      site_id: siteId || null,
    })
  ).toString("base64url");

  const authUrl = getYouTubeAuthUrl(state);

  return NextResponse.json({ auth_url: authUrl });
}
