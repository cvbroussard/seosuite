import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * POST /api/dashboard/business-info
 * Update tenant-managed business info: phone, email, logo URL.
 * Body: { business_phone?, business_email?, business_logo? }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const body = await req.json();
  const { business_phone, business_email, business_logo } = body;

  // Basic validation
  if (business_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business_email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  await sql`
    UPDATE sites
    SET business_phone = ${business_phone ?? null},
        business_email = ${business_email ?? null},
        business_logo = ${business_logo ?? null},
        updated_at = NOW()
    WHERE id = ${session.activeSiteId}
  `;

  return NextResponse.json({ success: true });
}
