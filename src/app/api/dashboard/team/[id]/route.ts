import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import crypto from "crypto";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/dashboard/team/[id]
 * Update a team member (role, site scope).
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { role, siteId } = body;

  const [member] = await sql`
    SELECT id, role FROM team_members
    WHERE id = ${id} AND subscription_id = ${session.subscriptionId}
  `;

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Don't allow changing owner role
  if (member.role === "owner") {
    return NextResponse.json({ error: "Cannot modify owner" }, { status: 403 });
  }

  if (role) {
    await sql`UPDATE team_members SET role = ${role} WHERE id = ${id}`;
  }
  if (siteId !== undefined) {
    await sql`UPDATE team_members SET site_id = ${siteId || null} WHERE id = ${id}`;
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/dashboard/team/[id]
 * Revoke a team member's access.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  const [member] = await sql`
    SELECT id, role FROM team_members
    WHERE id = ${id} AND subscription_id = ${session.subscriptionId}
  `;

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (member.role === "owner") {
    return NextResponse.json({ error: "Cannot remove owner" }, { status: 403 });
  }

  await sql`
    UPDATE team_members
    SET is_active = false, session_token_hash = NULL
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/dashboard/team/[id] — special actions
 * Body: { action: 'regenerate' | 'revoke-device' }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  const [member] = await sql`
    SELECT id, phone, invite_token, name FROM team_members
    WHERE id = ${id} AND subscription_id = ${session.subscriptionId}
  `;

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (action === "regenerate") {
    const inviteToken = crypto.randomBytes(32).toString("base64url");
    const inviteExpires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    await sql`
      UPDATE team_members
      SET invite_token = ${inviteToken},
          invite_expires = ${inviteExpires},
          invite_consumed = false
      WHERE id = ${id}
    `;

    return NextResponse.json({ inviteToken, inviteExpires });
  }

  if (action === "revoke-device") {
    await sql`
      UPDATE team_members
      SET session_token_hash = NULL, session_issued_at = NULL
      WHERE id = ${id}
    `;
    return NextResponse.json({ ok: true });
  }

  if (action === "resend-sms") {
    const phone = member.phone as string;
    const token = member.invite_token as string;

    if (!phone) {
      return NextResponse.json({ error: "No phone number on this member" }, { status: 400 });
    }
    if (!token) {
      return NextResponse.json({ error: "No invite token — regenerate first" }, { status: 400 });
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioAuth || !twilioFrom) {
      return NextResponse.json({ error: "SMS not configured" }, { status: 500 });
    }

    const inviteUrl = `https://tracpost.com/invite/${token}`;

    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        To: phone,
        From: twilioFrom,
        Body: `${session.userName} invited you to TracPost Studio. Tap to get started: ${inviteUrl}`,
      }),
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
