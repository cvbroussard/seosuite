import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { runPipeline } from "@/lib/pipeline/orchestrator";

/**
 * POST /api/pipeline — Trigger the autopilot pipeline for a site.
 *
 * Called by:
 * - Cron job (runs all sites via /api/pipeline/cron)
 * - Post-upload trigger (runs one site immediately)
 * - Manual trigger from dashboard
 *
 * Body: { site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { site_id } = body;

    if (!site_id) {
      return NextResponse.json(
        { error: "site_id is required" },
        { status: 400 }
      );
    }

    const result = await runPipeline(site_id);

    return NextResponse.json({ result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
