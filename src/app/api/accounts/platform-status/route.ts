import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/accounts/platform-status?site_id=xxx&platform=facebook
 *
 * Returns the connection status for a given site/platform combo. Three states:
 *   - connected           — site has an assigned platform_asset OR an old site_social_links row
 *   - pending_assignment  — subscriber has platform_assets for this platform but
 *                            this site has no assignment yet
 *   - not_connected       — no platform_assets exist for this subscriber on this platform
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const siteId = url.searchParams.get("site_id") || session.activeSiteId;
  const platform = url.searchParams.get("platform");

  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });
  if (!platform) return NextResponse.json({ error: "platform required" }, { status: 400 });

  // 1. New model: check site_platform_assets for an assigned asset on this platform
  const [assignedAsset] = await sql`
    SELECT pa.id AS asset_id, pa.asset_name, pa.social_account_id,
           sa.token_expires_at, sa.status AS account_status
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${siteId}
      AND pa.platform = ${platform}
      AND spa.is_primary = true
      AND sa.subscription_id = ${session.subscriptionId}
    LIMIT 1
  `;

  if (assignedAsset) {
    // For now we don't track per-asset published/scheduled counts in the new model
    return NextResponse.json({
      connected: true,
      status: "connected",
      accountId: assignedAsset.asset_id,
      accountName: assignedAsset.asset_name,
      tokenExpiresAt: assignedAsset.token_expires_at ? String(assignedAsset.token_expires_at) : null,
      published: 0,
      scheduled: 0,
    });
  }

  // 2. Legacy model: check site_social_links
  const [legacyAccount] = await sql`
    SELECT sa.id, sa.account_name, sa.status, sa.token_expires_at,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'published') AS published,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'scheduled') AS scheduled
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
      AND sa.platform = ${platform}
      AND sa.subscription_id = ${session.subscriptionId}
    ORDER BY sa.created_at DESC
    LIMIT 1
  `;

  if (legacyAccount) {
    return NextResponse.json({
      connected: true,
      status: legacyAccount.status,
      accountId: legacyAccount.id,
      accountName: legacyAccount.account_name,
      tokenExpiresAt: legacyAccount.token_expires_at ? String(legacyAccount.token_expires_at) : null,
      published: legacyAccount.published || 0,
      scheduled: legacyAccount.scheduled || 0,
    });
  }

  // 3. Pending assignment: check if subscriber has any platform_assets for this platform
  const [pendingAsset] = await sql`
    SELECT pa.id, pa.asset_name
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE pa.platform = ${platform}
      AND sa.subscription_id = ${session.subscriptionId}
    LIMIT 1
  `;

  if (pendingAsset) {
    const [count] = await sql`
      SELECT COUNT(*)::int AS available
      FROM platform_assets pa
      JOIN social_accounts sa ON sa.id = pa.social_account_id
      WHERE pa.platform = ${platform}
        AND sa.subscription_id = ${session.subscriptionId}
    `;
    return NextResponse.json({
      connected: false,
      status: "pending_assignment",
      accountId: null,
      accountName: null,
      tokenExpiresAt: null,
      published: 0,
      scheduled: 0,
      availableAssets: count.available,
    });
  }

  // 4. Not connected at all
  return NextResponse.json({
    connected: false,
    status: "not_connected",
    accountId: null,
    accountName: null,
    tokenExpiresAt: null,
    published: 0,
    scheduled: 0,
  });
}
