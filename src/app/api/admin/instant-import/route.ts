/**
 * GET  /api/admin/instant-import?subscription_id=xxx
 *      → per-asset import status for the subscriber
 * POST /api/admin/instant-import
 *      → manually run pending imports across all subscribers (operator trigger)
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscriptionId = new URL(req.url).searchParams.get("subscription_id");
  if (!subscriptionId) {
    return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
  }

  const assets = await sql`
    SELECT pa.id, pa.platform, pa.asset_name, pa.health_status,
           pa.imported_at, pa.created_at,
           (SELECT s.name FROM site_platform_assets spa
            JOIN sites s ON s.id = spa.site_id
            WHERE spa.platform_asset_id = pa.id AND spa.is_primary = true
            LIMIT 1) AS primary_site_name,
           (SELECT s.gbp_profile FROM site_platform_assets spa
            JOIN sites s ON s.id = spa.site_id
            WHERE spa.platform_asset_id = pa.id AND spa.is_primary = true
            LIMIT 1) AS gbp_profile_snapshot,
           (SELECT COUNT(*)::int FROM historical_posts hp WHERE hp.platform_asset_id = pa.id) AS historical_count
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE sa.subscription_id = ${subscriptionId}
    ORDER BY pa.platform, pa.asset_name
  `;

  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runInstantImports } = await import("@/lib/instant-import");
  const result = await runInstantImports();
  return NextResponse.json(result);
}
