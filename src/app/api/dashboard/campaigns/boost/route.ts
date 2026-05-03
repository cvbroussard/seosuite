import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { decrypt } from "@/lib/crypto";
import { createCampaign, createAdSet, createBoostedAd } from "@/lib/meta-ads";

/**
 * POST /api/dashboard/campaigns/boost
 *
 * Body: { postId, pageId, pageName, name, dailyBudgetDollars }
 *
 * Boost-winners flow: takes an existing organic Page post and creates
 * a paid campaign that promotes it. Full Meta hierarchy (campaign +
 * ad set + ad-with-creative). All in PAUSED status — subscriber
 * activates when ready.
 *
 * Uses object_story_id (the Page Post ID) so no new creative authoring
 * is needed; the existing post becomes the ad creative.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  const body = await req.json();
  const postId = String(body.postId || "").trim();
  const pageId = String(body.pageId || "").trim();
  const pageName = String(body.pageName || "Page").trim();
  const name = String(body.name || "").trim() || `Boost: ${pageName}`;
  const dailyBudgetDollars = Number(body.dailyBudgetDollars);

  if (!postId || !pageId) {
    return NextResponse.json({ error: "postId and pageId required" }, { status: 400 });
  }
  if (!Number.isFinite(dailyBudgetDollars) || dailyBudgetDollars < 1) {
    return NextResponse.json({ error: "Daily budget must be at least $1" }, { status: 400 });
  }

  const rows = await sql`
    SELECT pa.asset_id, sa.access_token_encrypted
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${session.activeSiteId}
      AND pa.asset_type = 'meta_ad_account'
      AND sa.subscription_id = ${session.subscriptionId}
    ORDER BY spa.is_primary DESC, pa.created_at DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "No ad account connected" }, { status: 400 });
  }

  const adAccountId = rows[0].asset_id as string;
  const accessToken = decrypt(rows[0].access_token_encrypted as string);

  try {
    const campaign = await createCampaign(
      adAccountId,
      { name, objective: "OUTCOME_ENGAGEMENT", status: "PAUSED" },
      accessToken
    );
    const adSet = await createAdSet(
      adAccountId,
      {
        name: `${name} — ad set`,
        campaignId: campaign.id,
        dailyBudgetCents: Math.round(dailyBudgetDollars * 100),
        optimizationGoal: "POST_ENGAGEMENT",
        status: "PAUSED",
      },
      accessToken
    );
    const ad = await createBoostedAd(
      adAccountId,
      {
        name,
        adSetId: adSet.id,
        pageId,
        postId,
        status: "PAUSED",
      },
      accessToken
    );

    return NextResponse.json({
      campaignId: campaign.id,
      adSetId: adSet.id,
      adId: ad.adId,
      creativeId: ad.creativeId,
      status: "PAUSED",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "marketing_api_failed", message }, { status: 502 });
  }
}
