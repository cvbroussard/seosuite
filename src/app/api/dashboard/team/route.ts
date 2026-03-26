import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import crypto from "crypto";

/**
 * GET /api/dashboard/team
 * List all team members for the subscriber.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const members = await sql`
    SELECT id, name, email, phone, role, site_id, invite_method,
           invite_consumed, last_active_at, is_active, created_at,
           invite_token, invite_expires
    FROM team_members
    WHERE subscriber_id = ${session.subscriberId}
    ORDER BY
      CASE role WHEN 'owner' THEN 0 WHEN 'engagement' THEN 1 WHEN 'capture' THEN 2 ELSE 3 END,
      created_at ASC
  `;

  return NextResponse.json({ members });
}

/**
 * POST /api/dashboard/team
 * Create a team member invite.
 * Body: { name, role, siteId?, email?, phone?, method: 'qr' | 'sms' | 'email' }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { name, role, siteId, email, phone, method = "qr" } = body;

  if (!name || !role) {
    return NextResponse.json({ error: "name and role required" }, { status: 400 });
  }

  if (!["owner", "engagement", "capture"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check plan limits
  const [sub] = await sql`SELECT plan FROM subscribers WHERE id = ${session.subscriberId}`;
  const plan = (sub?.plan as string) || "free";
  const currentCount = await sql`
    SELECT COUNT(*)::int AS count FROM team_members
    WHERE subscriber_id = ${session.subscriberId} AND is_active = true
  `;
  const count = currentCount[0]?.count || 0;
  const limit = plan === "pro" || plan === "authority" ? 5 : 1;

  if (count >= limit) {
    return NextResponse.json(
      { error: `Plan limit reached (${count}/${limit} users). Upgrade for more.` },
      { status: 403 }
    );
  }

  // Generate invite token
  const inviteToken = crypto.randomBytes(32).toString("base64url");
  const inviteExpires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const [member] = await sql`
    INSERT INTO team_members (subscriber_id, site_id, name, email, phone, role, invite_token, invite_method, invite_expires)
    VALUES (
      ${session.subscriberId},
      ${siteId || null},
      ${name},
      ${email || null},
      ${phone || null},
      ${role},
      ${inviteToken},
      ${method},
      ${inviteExpires}
    )
    RETURNING id, name, role, invite_token, invite_expires
  `;

  // TODO: If method === 'sms', send Twilio SMS with invite link
  // TODO: If method === 'email', send email with invite link

  return NextResponse.json({ member });
}
