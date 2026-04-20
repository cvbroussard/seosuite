import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * POST /api/google/link-locations
 * Body: { assignments: { socialAccountId: siteId, ... } }
 *
 * Links GBP social accounts to their correct sites.
 * Clears old links and creates new ones.
 */
export async function POST(req: NextRequest) {
  // Accept both admin and session auth
  const adminCookie = req.cookies.get("tp_admin")?.value;
  const sessionCookie = req.cookies.get("tp_session")?.value;
  if (adminCookie !== "authenticated" && !sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assignments } = await req.json();

  if (!assignments || typeof assignments !== "object") {
    return NextResponse.json({ error: "assignments required" }, { status: 400 });
  }

  let linked = 0;
  for (const [socialAccountId, siteId] of Object.entries(assignments)) {
    if (!siteId) continue;

    // Remove any existing link for this social account
    await sql`
      DELETE FROM site_social_links WHERE social_account_id = ${socialAccountId}
    `;

    // Create the correct link
    await sql`
      INSERT INTO site_social_links (site_id, social_account_id)
      VALUES (${siteId as string}, ${socialAccountId})
      ON CONFLICT DO NOTHING
    `;

    // Update the metadata.site_id on the social account
    await sql`
      UPDATE social_accounts
      SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{site_id}', ${JSON.stringify(siteId)}::jsonb)
      WHERE id = ${socialAccountId}
    `;

    linked++;
  }

  // Sync GBP profiles for each linked site
  const uniqueSiteIds = [...new Set(Object.values(assignments).filter(Boolean))] as string[];
  for (const siteId of uniqueSiteIds) {
    try {
      const { syncProfileFromGoogle } = await import("@/lib/gbp/profile");
      await syncProfileFromGoogle(siteId);
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ success: true, linked });
}
