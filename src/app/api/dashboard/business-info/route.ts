import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const name = (formData.get("name") as string)?.trim() || null;
  const businessType = (formData.get("business_type") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || null;
  const phone = (formData.get("business_phone") as string) || null;
  const email = (formData.get("business_email") as string) || null;
  const logoFile = formData.get("business_logo") as File | null;
  const existingLogoUrl = (formData.get("business_logo_url") as string) || null;
  const faviconFile = formData.get("business_favicon") as File | null;
  const existingFaviconUrl = (formData.get("business_favicon_url") as string) || null;

  if (!name) {
    return NextResponse.json({ error: "Site name is required" }, { status: 400 });
  }

  // Validate email
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Helper: upload an image file to R2
  async function uploadImage(file: File, label: string, maxBytes: number): Promise<string> {
    if (!file.type.startsWith("image/") && file.type !== "image/x-icon") {
      throw new Error(`${label} must be an image`);
    }
    if (file.size > maxBytes) {
      throw new Error(`${label} must be under ${Math.floor(maxBytes / 1024)}KB`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type.includes("png") ? "png"
      : file.type.includes("svg") ? "svg"
      : file.type.includes("webp") ? "webp"
      : file.type.includes("icon") ? "ico"
      : "jpg";
    const fname = seoFilename(label, ext);
    const key = `sites/${siteId}/branding/${fname}`;
    return uploadBufferToR2(key, buffer, file.type);
  }

  // Logo upload
  let logoUrl: string | null = existingLogoUrl;
  if (logoFile && logoFile.size > 0) {
    try {
      logoUrl = await uploadImage(logoFile, "logo", 2 * 1024 * 1024);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Logo upload failed" }, { status: 400 });
    }
  }

  // Favicon upload
  let faviconUrl: string | null = existingFaviconUrl;
  if (faviconFile && faviconFile.size > 0) {
    try {
      faviconUrl = await uploadImage(faviconFile, "favicon", 256 * 1024);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Favicon upload failed" }, { status: 400 });
    }
  }

  await sql`
    UPDATE sites
    SET name = ${name},
        business_type = ${businessType},
        location = ${location},
        business_phone = ${phone},
        business_email = ${email},
        business_logo = ${logoUrl},
        business_favicon = ${faviconUrl},
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ success: true, business_logo: logoUrl, business_favicon: faviconUrl });
}
