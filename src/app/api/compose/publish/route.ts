import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * POST /api/compose/publish
 *
 * Phase 2d — TRIGGER step. Creates a social_posts row with the
 * subscriber-assembled package. The existing publishing pipeline
 * (cron) picks up scheduled rows and pushes to the platform's API.
 *
 * Body:
 *   {
 *     template_id:   string (UUID),
 *     asset_ids:     string[]  (selected media_assets, in order),
 *     caption:       string,
 *     link?:         string,
 *     hashtags?:     string[],
 *     scheduled_at?: ISO datetime (omit = publish ASAP via cron)
 *   }
 *
 * Returns:
 *   { post_id, status, scheduled_at }
 *
 * For "Publish now" flow: scheduled_at = NOW(), status = 'scheduled'.
 * Cron picks it up on the next cycle and publishes via the existing
 * platform-specific publisher logic. Synchronous publish (faster
 * feedback) is a Phase 5 enhancement — for now subscribers see
 * "queued for publishing within minutes".
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = session.activeSiteId;
  if (!siteId) return NextResponse.json({ error: "No active site" }, { status: 400 });

  const body = await req.json();
  const templateId = body.template_id;
  const assetIds = Array.isArray(body.asset_ids) ? body.asset_ids : [];
  const caption = (body.caption as string | undefined) || "";
  const link = (body.link as string | undefined) || null;
  const hashtags = Array.isArray(body.hashtags) ? body.hashtags : [];
  const scheduledAt = body.scheduled_at as string | undefined;

  // Reach data (enterprise tier only). For mode='organic' (or absent),
  // existing publish flow runs. For mode='paid' or 'both', the reach
  // targeting + budget + duration are captured on the post row so the
  // downstream boost-after-publish chain can fire when wired.
  const reachMode = (body.reach_mode as "organic" | "paid" | "both" | undefined) || "organic";
  const reachData = reachMode === "organic" ? null : {
    mode: reachMode,
    latitude: body.reach_latitude as number | undefined,
    longitude: body.reach_longitude as number | undefined,
    radiusMiles: body.reach_radius_miles as number | undefined,
    placeName: body.reach_place_name as string | undefined,
    placeId: body.reach_place_id as string | undefined,
    isOverride: Boolean(body.reach_is_override),
    dailyBudgetDollars: body.reach_daily_budget_dollars as number | undefined,
    durationDays: body.reach_duration_days as number | undefined,
  };

  if (reachData && (!reachData.latitude || !reachData.longitude || !reachData.radiusMiles)) {
    return NextResponse.json(
      { error: "Paid/Both mode requires latitude, longitude, and radius_miles" },
      { status: 400 },
    );
  }

  if (!templateId) return NextResponse.json({ error: "template_id required" }, { status: 400 });

  // Fetch template
  const [template] = await sql`
    SELECT id, platform, format, asset_slots
    FROM post_templates
    WHERE id = ${templateId} AND enabled = true
  `;
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Resolve the social_account that handles this platform for this site
  let accountId: string | null = null;
  if (template.platform !== "blog") {
    const [bound] = await sql`
      SELECT pa.social_account_id
      FROM site_platform_assets spa
      JOIN platform_assets pa ON pa.id = spa.platform_asset_id
      JOIN social_accounts sa ON sa.id = pa.social_account_id
      WHERE spa.site_id = ${siteId}
        AND pa.platform = ${template.platform}
        AND spa.is_primary = true
        AND sa.subscription_id = ${session.subscriptionId}
      LIMIT 1
    `;
    if (!bound) {
      return NextResponse.json({
        error: `${template.platform} not connected to this site`,
      }, { status: 400 });
    }
    accountId = bound.social_account_id as string;
  } else {
    // Blog publishes to the TracPost-owned property — no social_account
    // needed in the legacy sense, but social_posts.account_id is NOT NULL.
    // For now we'll error out; blog publishing wires in Phase 3 when
    // articles + posts commingle in Unifeed.
    return NextResponse.json({
      error: "Blog publishing via Compose lands in Phase 3 (article/post commingling)",
    }, { status: 501 });
  }

  // Validate asset count against template's slot requirements
  const slots = (template.asset_slots as Record<string, unknown>) || {};
  const slotCount =
    typeof slots.count === "number" ? slots.count :
    typeof slots.count_min === "number" ? slots.count_min :
    1;
  const slotMax =
    typeof slots.count === "number" ? slots.count :
    typeof slots.count_max === "number" ? (slots.count_max as number) :
    slotCount;
  if (assetIds.length < slotCount || assetIds.length > slotMax) {
    return NextResponse.json({
      error: `This template requires ${slotCount === slotMax ? slotCount : `${slotCount}-${slotMax}`} asset(s); received ${assetIds.length}`,
    }, { status: 400 });
  }

  // Verify the assets belong to this site
  const ownedAssets = await sql`
    SELECT id, storage_url, media_type
    FROM media_assets
    WHERE id = ANY(${assetIds}::uuid[])
      AND site_id = ${siteId}
  `;
  if (ownedAssets.length !== assetIds.length) {
    return NextResponse.json({ error: "One or more assets are not accessible" }, { status: 400 });
  }
  // Preserve subscriber's chosen order (assetIds is small — at most 10)
  ownedAssets.sort((a, b) => assetIds.indexOf(a.id as string) - assetIds.indexOf(b.id as string));
  const mediaUrls = ownedAssets.map((a) => a.storage_url as string);
  const sourceAssetId = ownedAssets[0]?.id as string | undefined;

  // "Publish now" if no scheduled_at provided — cron picks up
  // status='scheduled' rows where scheduled_at <= NOW()
  const effectiveScheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString();

  // Build the post metadata. Reach data lives on metadata so the
  // downstream boost-after-publish chain (Phase 4 follow-up) can
  // pick it up without schema changes. The reach_mode is the routing
  // key for the chain.
  const postMetadata: Record<string, unknown> = {
    source: "compose",
  };
  if (reachData) {
    postMetadata.reach = reachData;
  }

  const [inserted] = await sql`
    INSERT INTO social_posts (
      account_id, source_asset_id, status, authority,
      caption, hashtags, media_urls, media_type, link_url,
      scheduled_at, ai_generated, trigger_type,
      template_id, content_type, metadata
    )
    VALUES (
      ${accountId}, ${sourceAssetId ?? null}, 'scheduled', 'subscriber',
      ${caption}, ${hashtags as string[]},
      ${mediaUrls}::text[],
      ${template.format},
      ${link ?? null},
      ${effectiveScheduledAt}, false, 'compose_manual',
      ${templateId}, 'post',
      ${JSON.stringify(postMetadata)}::jsonb
    )
    RETURNING id, status, scheduled_at
  `;

  // Mode-aware response so the UI can show the right success state.
  // Boost-after-publish chain integration is the next iteration of
  // task #92 — for now reach data is persisted so the chain can fire
  // when wired without losing what the subscriber configured.
  const responseExtras: Record<string, unknown> = {};
  if (reachData?.mode === "paid") {
    responseExtras.note =
      "Paid-only mode requires direct ad-creative creation (Meta dark post pattern). " +
      "That integration is the next iteration of Compose. For now your post is queued " +
      "as organic only. To run a paid-only ad immediately, use Promote → Quick Boost " +
      "after this post publishes.";
    responseExtras.modeFallback = "organic";
  } else if (reachData?.mode === "both") {
    responseExtras.note =
      "Post is queued for organic publish. Auto-boost-after-publish chain wires in next. " +
      "After this publishes (within minutes), use Promote → Quick Boost to amplify it with " +
      "your selected reach settings ($" + (reachData.dailyBudgetDollars ?? 7) + "/day, " +
      (reachData.radiusMiles ?? 10) + " mi radius).";
    responseExtras.boostQueued = false;
    responseExtras.boostSettings = {
      latitude: reachData.latitude,
      longitude: reachData.longitude,
      radiusMiles: reachData.radiusMiles,
      dailyBudgetDollars: reachData.dailyBudgetDollars,
      durationDays: reachData.durationDays,
    };
  }

  return NextResponse.json({
    postId: inserted.id,
    status: inserted.status,
    scheduledAt: inserted.scheduled_at,
    publishingTarget: template.platform,
    reachMode: reachMode,
    ...responseExtras,
  });
}
