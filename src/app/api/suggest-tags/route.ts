import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { suggestTags } from "@/lib/triage/suggest-tags";

/**
 * POST /api/suggest-tags
 * Body: { siteId, contextNote }
 *
 * Returns AI-suggested pillar + tags for a context note.
 * Designed for real-time use during upload — fast Haiku call.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const { siteId, contextNote } = body;

  if (!siteId || !contextNote) {
    return NextResponse.json({ pillarId: "", tagIds: [] });
  }

  const result = await suggestTags(siteId, contextNote);
  return NextResponse.json(result);
}
