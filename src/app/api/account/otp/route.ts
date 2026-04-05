import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sendOtp, verifyOtp } from "@/lib/otp";

/**
 * POST /api/account/otp
 *
 * Actions:
 * - { action: "send", purpose: "change_password" } → sends OTP
 * - { action: "verify", code: "123456", purpose: "change_password" } → verifies OTP
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { action, purpose, code } = body as { action: string; purpose: string; code?: string };

  if (!purpose) {
    return NextResponse.json({ error: "purpose required" }, { status: 400 });
  }

  if (action === "send") {
    const sent = await sendOtp(auth.userId, purpose);
    if (!sent) {
      return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 });
    }
    return NextResponse.json({ sent: true });
  }

  if (action === "verify") {
    if (!code) {
      return NextResponse.json({ error: "code required" }, { status: 400 });
    }
    const valid = await verifyOtp(auth.userId, code, purpose);
    if (!valid) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }
    return NextResponse.json({ verified: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
