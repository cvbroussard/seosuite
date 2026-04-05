import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * PATCH /api/account/profile
 * Update subscription name and/or user profile.
 */
export async function PATCH(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, subscriptionName, ownerName, phone, companyPhone } = body;
  const bizName = subscriptionName || name;

  if (bizName) {
    await sql`
      UPDATE subscriptions SET name = ${bizName}, updated_at = NOW()
      WHERE id = ${auth.subscriptionId}
    `;
  }

  if (companyPhone !== undefined) {
    await sql`
      UPDATE sites SET business_phone = ${companyPhone || null}, updated_at = NOW()
      WHERE subscription_id = ${auth.subscriptionId}
    `;
  }

  if (ownerName) {
    await sql`
      UPDATE users SET name = ${ownerName}
      WHERE id = ${auth.userId}
    `;
  }

  if (phone !== undefined) {
    await sql`
      UPDATE users SET phone = ${phone || null}
      WHERE id = ${auth.userId}
    `;
  }

  return NextResponse.json({ ok: true });
}
