import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

export const runtime = "nodejs";

/**
 * POST /api/dashboard/business-info
 * Update tenant-managed business info: phone, email, logo (file upload).
 *
 * Accepts multipart/form-data:
 *   business_phone (text)
 *   business_email (text)
 *   business_logo (file, optional)
 *   business_logo_url (text, optional — to keep existing without re-upload)
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const siteId = session.activeSiteId;
  const formData = await req.formData();
  const phone = (formData.get("business_phone") as string) || null;
  const email = (formData.get("business_email") as string) || null;
  const logoFile = formData.get("business_logo") as File | null;
  const existingLogoUrl = (formData.get("business_logo_url") as string) || null;

  // Validate email
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Determine logo URL — upload new file or keep existing
  let logoUrl: string | null = existingLogoUrl;
  if (logoFile && logoFile.size > 0) {
    // Validate file
    if (!logoFile.type.startsWith("image/")) {
      return NextResponse.json({ error: "Logo must be an image" }, { status: 400 });
    }
    if (logoFile.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo must be under 2MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await logoFile.arrayBuffer());
    const ext = logoFile.type.includes("png") ? "png"
      : logoFile.type.includes("svg") ? "svg"
      : logoFile.type.includes("webp") ? "webp"
      : "jpg";
    const fname = seoFilename("logo", ext);
    const key = `sites/${siteId}/branding/${fname}`;
    logoUrl = await uploadBufferToR2(key, buffer, logoFile.type);
  }

  await sql`
    UPDATE sites
    SET business_phone = ${phone},
        business_email = ${email},
        business_logo = ${logoUrl},
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ success: true, business_logo: logoUrl });
}
