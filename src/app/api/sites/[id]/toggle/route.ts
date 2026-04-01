import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * POST /api/sites/:id/toggle — Activate or deactivate a site.
 *
 * Deactivating preserves all data but stops content generation
 * and frees a slot toward the tier limit.
 *
 * Reactivating checks the tier limit before allowing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  // Verify ownership
  const [site] = await sql`
    SELECT id, is_active FROM sites
    WHERE id = ${id} AND subscriber_id = ${auth.subscriberId} AND deleted_at IS NULL
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const currentlyActive = site.is_active !== false;

  if (!currentlyActive) {
    // Reactivating — check tier limit
    const [sub] = await sql`SELECT plan FROM subscribers WHERE id = ${auth.subscriberId}`;
    const plan = (sub?.plan as string) || "free";

    const tierLimits: Record<string, number> = {
      free: 1,
      growth: 2,
      pro: 5,
      authority: 10,
    };
    const maxSites = tierLimits[plan] || 1;

    const [activeCount] = await sql`
      SELECT COUNT(*)::int AS cnt FROM sites
      WHERE subscriber_id = ${auth.subscriberId} AND is_active = true AND deleted_at IS NULL
    `;

    if ((activeCount?.cnt || 0) >= maxSites) {
      return NextResponse.json(
        { error: `Plan limit reached (${activeCount.cnt}/${maxSites} active sites). Upgrade or deactivate another site.` },
        { status: 403 }
      );
    }
  }

  // Toggle
  const newState = !currentlyActive;
  await sql`UPDATE sites SET is_active = ${newState} WHERE id = ${id}`;

  // Refresh session to update sites list
  return NextResponse.json({ success: true, is_active: newState });
}
