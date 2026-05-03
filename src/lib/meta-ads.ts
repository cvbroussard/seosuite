/**
 * Marketing API + TracPost — Ads app OAuth utilities.
 *
 * Separate from the organic Meta app (lib/meta.ts) — the three-app
 * architecture isolates ads_management as a high-risk scope from the
 * organic publishing scopes. Different Meta App ID, different secret,
 * different callback, different scopes.
 *
 * Env vars required:
 *   META_ADS_APP_ID     — TracPost — Ads app on Meta Developer Dashboard
 *   META_ADS_APP_SECRET — corresponding secret
 *   NEXT_PUBLIC_APP_URL — for the redirect URI
 */

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const ADS_REDIRECT_PATH = "/api/auth/meta-ads/callback";

export const ADS_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "public_profile",
];

export function getMetaAdsAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_ADS_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}${ADS_REDIRECT_PATH}`,
    scope: ADS_SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

export async function exchangeAdsCodeForToken(code: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const shortRes = await fetch(`${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
    client_id: process.env.META_ADS_APP_ID!,
    client_secret: process.env.META_ADS_APP_SECRET!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}${ADS_REDIRECT_PATH}`,
    code,
  }));
  const shortData = await shortRes.json();
  if (!shortRes.ok) {
    throw new Error(`Ads token exchange failed: ${JSON.stringify(shortData.error || shortData)}`);
  }

  const longRes = await fetch(`${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_ADS_APP_ID!,
    client_secret: process.env.META_ADS_APP_SECRET!,
    fb_exchange_token: shortData.access_token,
  }));
  const longData = await longRes.json();
  if (!longRes.ok) {
    throw new Error(`Ads long-lived token exchange failed: ${JSON.stringify(longData.error || longData)}`);
  }

  return {
    accessToken: longData.access_token,
    expiresIn: longData.expires_in || 5184000,
  };
}

export interface MetaAdAccount {
  id: string;            // 'act_123456789'
  accountId: string;     // '123456789' (no act_ prefix)
  name: string;
  currency: string;
  status: number;        // Meta numeric status: 1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED, 7 = PENDING_RISK_REVIEW, etc.
  amountSpent: string;   // string-encoded number
}

/**
 * Enumerate ad accounts the OAuth grant can access.
 * Returns ad accounts via the user's connected Business Manager(s).
 */
export async function discoverAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const res = await fetch(
    `${GRAPH_BASE}/me/adaccounts?fields=id,account_id,name,currency,account_status,amount_spent&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Ad account discovery failed: ${JSON.stringify(data.error || data)}`);
  }
  if (!Array.isArray(data.data)) return [];

  return data.data.map((a: Record<string, unknown>) => ({
    id: String(a.id),
    accountId: String(a.account_id),
    name: String(a.name || a.id),
    currency: String(a.currency || "USD"),
    status: Number(a.account_status ?? 0),
    amountSpent: String(a.amount_spent ?? "0"),
  }));
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective: string;       // OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, etc.
  status: string;          // ACTIVE, PAUSED, DELETED, ARCHIVED
  effectiveStatus: string; // ACTIVE, PAUSED, IN_PROCESS, etc.
  dailyBudget: string | null;
  lifetimeBudget: string | null;
  createdTime: string;
  startTime: string | null;
  stopTime: string | null;
}

/**
 * List campaigns under an ad account. Returns most recent first.
 */
export async function listCampaigns(
  adAccountId: string,
  accessToken: string
): Promise<MetaCampaign[]> {
  // adAccountId may be passed with or without 'act_' prefix; normalize
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const fields = [
    "id",
    "name",
    "objective",
    "status",
    "effective_status",
    "daily_budget",
    "lifetime_budget",
    "created_time",
    "start_time",
    "stop_time",
  ].join(",");
  const res = await fetch(
    `${GRAPH_BASE}/${id}/campaigns?fields=${fields}&limit=100&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`List campaigns failed: ${JSON.stringify(data.error || data)}`);
  }
  if (!Array.isArray(data.data)) return [];

  return data.data.map((c: Record<string, unknown>) => ({
    id: String(c.id),
    name: String(c.name || ""),
    objective: String(c.objective || ""),
    status: String(c.status || ""),
    effectiveStatus: String(c.effective_status || ""),
    dailyBudget: c.daily_budget ? String(c.daily_budget) : null,
    lifetimeBudget: c.lifetime_budget ? String(c.lifetime_budget) : null,
    createdTime: String(c.created_time || ""),
    startTime: c.start_time ? String(c.start_time) : null,
    stopTime: c.stop_time ? String(c.stop_time) : null,
  }));
}

// ─── Write operations ────────────────────────────────────────────────

export interface CreateCampaignParams {
  name: string;
  objective: string;        // e.g. 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_LEADS'
  status?: "ACTIVE" | "PAUSED";
}

/**
 * Create a campaign in the given ad account. Returns the new campaign ID.
 * Defaults status to PAUSED so review-time creations don't accidentally
 * spend money. special_ad_categories=[] is correct for TracPost's
 * subscriber segment (contractors, restaurants, etc.) — no special
 * regulated categories.
 */
export async function createCampaign(
  adAccountId: string,
  params: CreateCampaignParams,
  accessToken: string
): Promise<{ id: string }> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const body = new URLSearchParams({
    name: params.name,
    objective: params.objective,
    status: params.status || "PAUSED",
    special_ad_categories: JSON.stringify([]),
    access_token: accessToken,
  });
  const res = await fetch(`${GRAPH_BASE}/${id}/campaigns`, {
    method: "POST",
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Create campaign failed: ${JSON.stringify(data.error || data)}`);
  }
  return { id: String(data.id) };
}

export interface CreateAdSetParams {
  name: string;
  campaignId: string;
  dailyBudgetCents: number;        // Meta wants integer cents
  optimizationGoal?: string;       // default LINK_CLICKS
  billingEvent?: string;           // default IMPRESSIONS
  bidStrategy?: string;            // default LOWEST_COST_WITHOUT_CAP
  countryCodes?: string[];         // default ['US']
  status?: "ACTIVE" | "PAUSED";
}

/**
 * Create an ad set under a campaign. Returns the new ad set ID.
 *
 * Defaults are deliberately broad to make creation reliable for first
 * campaigns: US-only targeting, lowest-cost bid strategy, link-clicks
 * optimization. Subscribers can refine in Meta Ads Manager if needed.
 *
 * Ad set start_time defaults to immediate; Meta requires a non-past
 * timestamp. We send a 1-minute future offset to avoid clock skew
 * rejecting the call.
 */
export async function createAdSet(
  adAccountId: string,
  params: CreateAdSetParams,
  accessToken: string
): Promise<{ id: string }> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const startTime = new Date(Date.now() + 60_000).toISOString();
  const body = new URLSearchParams({
    name: params.name,
    campaign_id: params.campaignId,
    daily_budget: String(params.dailyBudgetCents),
    billing_event: params.billingEvent || "IMPRESSIONS",
    optimization_goal: params.optimizationGoal || "LINK_CLICKS",
    bid_strategy: params.bidStrategy || "LOWEST_COST_WITHOUT_CAP",
    start_time: startTime,
    targeting: JSON.stringify({
      geo_locations: { countries: params.countryCodes || ["US"] },
    }),
    status: params.status || "PAUSED",
    access_token: accessToken,
  });
  const res = await fetch(`${GRAPH_BASE}/${id}/adsets`, {
    method: "POST",
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Create ad set failed: ${JSON.stringify(data.error || data)}`);
  }
  return { id: String(data.id) };
}

export interface CreateBoostedAdParams {
  name: string;
  adSetId: string;
  pageId: string;
  postId: string;             // The full post id including page prefix is fine
  status?: "ACTIVE" | "PAUSED";
}

/**
 * Create an ad whose creative is an existing organic Page post —
 * the "boost an existing post" pattern. Used by the boost-winners flow.
 *
 * Step 1: create an ad creative referencing object_story_id (full
 *   {pageId}_{postId} form).
 * Step 2: create the ad attaching that creative to the ad set.
 *
 * Meta requires that the post is owned by the connected Page.
 */
export async function createBoostedAd(
  adAccountId: string,
  params: CreateBoostedAdParams,
  accessToken: string
): Promise<{ creativeId: string; adId: string }> {
  const id = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  // post id may already be in pageId_postId form (Page Post id) or just the bare post id;
  // boost requires the full pageId_postId object_story_id.
  const objectStoryId = params.postId.includes("_") ? params.postId : `${params.pageId}_${params.postId}`;

  // Step 1 — creative
  const creativeBody = new URLSearchParams({
    name: `${params.name} — creative`,
    object_story_id: objectStoryId,
    access_token: accessToken,
  });
  const creativeRes = await fetch(`${GRAPH_BASE}/${id}/adcreatives`, {
    method: "POST",
    body: creativeBody,
  });
  const creativeData = await creativeRes.json();
  if (!creativeRes.ok) {
    throw new Error(`Create ad creative failed: ${JSON.stringify(creativeData.error || creativeData)}`);
  }

  // Step 2 — ad
  const adBody = new URLSearchParams({
    name: params.name,
    adset_id: params.adSetId,
    creative: JSON.stringify({ creative_id: String(creativeData.id) }),
    status: params.status || "PAUSED",
    access_token: accessToken,
  });
  const adRes = await fetch(`${GRAPH_BASE}/${id}/ads`, {
    method: "POST",
    body: adBody,
  });
  const adData = await adRes.json();
  if (!adRes.ok) {
    throw new Error(`Create ad failed: ${JSON.stringify(adData.error || adData)}`);
  }

  return { creativeId: String(creativeData.id), adId: String(adData.id) };
}

export interface CampaignInsights {
  spend: string;
  impressions: string;
  clicks: string;
  reach: string;
  cpc: string;
  cpm: string;
  ctr: string;
}

/**
 * Fetch lifetime insights for a campaign. Returns zero-filled values if
 * the campaign has no impressions yet.
 */
export async function getCampaignInsights(
  campaignId: string,
  accessToken: string
): Promise<CampaignInsights> {
  const fields = ["spend", "impressions", "clicks", "reach", "cpc", "cpm", "ctr"].join(",");
  const res = await fetch(
    `${GRAPH_BASE}/${campaignId}/insights?fields=${fields}&date_preset=maximum&access_token=${accessToken}`
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Campaign insights failed: ${JSON.stringify(data.error || data)}`);
  }
  const row = Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : {};
  return {
    spend: String(row.spend ?? "0"),
    impressions: String(row.impressions ?? "0"),
    clicks: String(row.clicks ?? "0"),
    reach: String(row.reach ?? "0"),
    cpc: String(row.cpc ?? "0"),
    cpm: String(row.cpm ?? "0"),
    ctr: String(row.ctr ?? "0"),
  };
}
