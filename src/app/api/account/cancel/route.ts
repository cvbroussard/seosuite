import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/account/cancel — Request account cancellation.
 *
 * Body: { reason?: string, redirect_target?: string }
 *
 * Sets cancelled_at on subscriber. Grace period is 30 days.
 * If redirect_target is provided, sets up departure redirects for blog.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { reason, redirect_target } = body;

  // Check if already cancelled
  const [subscriber] = await sql`
    SELECT id, cancelled_at FROM subscribers WHERE id = ${auth.subscriberId}
  `;
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }
  if (subscriber.cancelled_at) {
    return NextResponse.json({
      error: "Account already cancelled",
      cancelled_at: subscriber.cancelled_at,
      grace_ends: graceEnd(subscriber.cancelled_at as string),
    }, { status: 409 });
  }

  // Set cancellation
  await sql`
    UPDATE subscribers
    SET cancelled_at = NOW(),
        cancel_reason = ${reason || null},
        updated_at = NOW()
    WHERE id = ${auth.subscriberId}
  `;

  // Disable autopilot on all sites
  await sql`
    UPDATE sites SET autopilot_enabled = false
    WHERE subscriber_id = ${auth.subscriberId}
  `;

  // Set up departure redirects if target provided
  if (redirect_target) {
    const sites = await sql`
      SELECT s.id, bs.subdomain, bs.custom_domain
      FROM sites s
      LEFT JOIN blog_settings bs ON bs.site_id = s.id
      WHERE s.subscriber_id = ${auth.subscriberId}
        AND bs.blog_enabled = true
    `;

    // Redirects active for 120 days (30 grace + 90 post-suspension)
    for (const site of sites) {
      if (site.subdomain || site.custom_domain) {
        await sql`
          INSERT INTO departure_redirects (site_id, target_base, active_until)
          VALUES (${site.id}, ${redirect_target}, NOW() + INTERVAL '120 days')
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  const cancelledAt = new Date().toISOString();

  return NextResponse.json({
    success: true,
    cancelled_at: cancelledAt,
    grace_ends: graceEnd(cancelledAt),
    message: "Your account will remain active for 30 days. Export your data before then.",
    redirects_configured: !!redirect_target,
  });
}

/**
 * DELETE /api/account/cancel — Revoke cancellation (during grace period).
 */
export async function DELETE(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const [subscriber] = await sql`
    SELECT id, cancelled_at, is_active FROM subscribers WHERE id = ${auth.subscriberId}
  `;
  if (!subscriber) {
    return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
  }
  if (!subscriber.cancelled_at) {
    return NextResponse.json({ error: "Account is not cancelled" }, { status: 400 });
  }
  if (!subscriber.is_active) {
    return NextResponse.json({
      error: "Grace period has ended. Contact support to reactivate.",
    }, { status: 410 });
  }

  // Revoke cancellation
  await sql`
    UPDATE subscribers
    SET cancelled_at = NULL, cancel_reason = NULL, updated_at = NOW()
    WHERE id = ${auth.subscriberId}
  `;

  // Remove departure redirects
  const siteIds = await sql`
    SELECT id FROM sites WHERE subscriber_id = ${auth.subscriberId}
  `;
  for (const site of siteIds) {
    await sql`
      DELETE FROM departure_redirects WHERE site_id = ${site.id}
    `;
  }

  return NextResponse.json({
    success: true,
    message: "Cancellation revoked. Your account is fully active.",
  });
}

function graceEnd(cancelledAt: string): string {
  const d = new Date(cancelledAt);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}
