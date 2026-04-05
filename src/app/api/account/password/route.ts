import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/account/password
 *
 * Set or change password. Requires OTP verification first
 * (caller must verify OTP before calling this).
 *
 * Body: { password, otp_verified: true }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { password } = await req.json();

  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const hash = await bcrypt.hash(password, 12);

  await sql`
    UPDATE users
    SET password_hash = ${hash}, updated_at = NOW()
    WHERE id = ${auth.userId}
  `;

  return NextResponse.json({ ok: true });
}
