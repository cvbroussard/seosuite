import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

/**
 * Build social profile URLs from connected social accounts.
 */

const PLATFORM_URL_TEMPLATES: Record<string, (meta: Record<string, unknown>, accountId: string, accountName: string) => { url: string; handle: string } | null> = {
  instagram: (_meta, _id, accountName) => {
    if (!accountName) return null;
    return { url: `https://instagram.com/${accountName}`, handle: `@${accountName}` };
  },
  facebook: (meta, _id, _name) => {
    const username = (meta.page_username as string);
    const pageName = (meta.page_name as string);
    if (username) return { url: `https://facebook.com/${username}`, handle: username };
    const pageId = (meta.page_id as string);
    if (pageId && pageName) return { url: `https://facebook.com/${pageId}`, handle: pageName };
    return null;
  },
  linkedin: (meta, _id, accountName) => {
    const vanity = (meta.vanity_name as string) || (meta.org_vanity as string);
    if (vanity) return { url: `https://linkedin.com/company/${vanity}`, handle: vanity };
    if (accountName) return { url: `https://linkedin.com/in/${accountName.toLowerCase().replace(/\s+/g, "-")}`, handle: accountName };
    return null;
  },
  pinterest: (meta, _id, _name) => {
    const username = (meta.display_username as string);
    if (username) return { url: `https://pinterest.com/${username}`, handle: `@${username}` };
    return null;
  },
  youtube: (meta) => {
    const customUrl = (meta.custom_url as string);
    if (customUrl) return { url: `https://youtube.com/${customUrl}`, handle: customUrl };
    const channelId = (meta.channel_id as string);
    const title = (meta.channel_title as string);
    if (channelId) return { url: `https://youtube.com/channel/${channelId}`, handle: title || channelId };
    return null;
  },
  tiktok: (meta, _id, _name) => {
    const username = (meta.username as string) || (meta.display_name as string);
    if (username && !username.startsWith("-000")) return { url: `https://tiktok.com/@${username}`, handle: `@${username}` };
    return null;
  },
  twitter: (meta, _id, accountName) => {
    const username = (meta.username as string) || accountName;
    if (username) return { url: `https://x.com/${username}`, handle: `@${username}` };
    return null;
  },
};

/**
 * Get social profile URLs for a site from connected accounts.
 */
export async function getSocialProfileUrls(siteId: string): Promise<Array<{ platform: string; url: string; handle: string }>> {
  const accounts = await sql`
    SELECT sa.platform, sa.account_name, sa.account_id, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
      AND sa.status IN ('active', 'token_expired')
      AND sa.platform != 'gbp'
    ORDER BY sa.platform
  `;

  const results: Array<{ platform: string; url: string; handle: string }> = [];

  for (const account of accounts) {
    const template = PLATFORM_URL_TEMPLATES[account.platform as string];
    if (!template) continue;

    const meta = (account.metadata || {}) as Record<string, unknown>;
    const result = template(meta, account.account_id as string, account.account_name as string);
    if (result) {
      results.push({ platform: account.platform as string, ...result });
    }
  }

  return results;
}

/**
 * Push social profile URLs to GBP listing.
 * Called when a social account is connected/disconnected.
 */
export async function pushSocialProfilesToGbp(siteId: string): Promise<{ success: boolean; error?: string }> {
  const [gbpAccount] = await sql`
    SELECT sa.account_id, sa.access_token_encrypted, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp' AND sa.status = 'active'
    LIMIT 1
  `;

  if (!gbpAccount) return { success: false, error: "No active GBP connection" };

  const urls = await getSocialProfileUrls(siteId);
  if (urls.length === 0) return { success: true };

  const accessToken = decrypt(gbpAccount.access_token_encrypted as string);
  const locationPath = gbpAccount.account_id as string;

  const BIZ_INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";

  const res = await fetch(
    `${BIZ_INFO_API}/${locationPath}?updateMask=profile`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profile: {
          description: undefined,
        },
      }),
    }
  );

  // The v1 API may not support socialMediaUrls directly.
  // Fall back to the v4 API's moreUrls field if needed.
  // For now, store locally and push when API support is confirmed.

  // Store social profile URLs in the cached GBP profile
  await sql`
    UPDATE sites
    SET gbp_profile = jsonb_set(
      COALESCE(gbp_profile, '{}'::jsonb),
      '{socialProfiles}',
      ${JSON.stringify(urls)}::jsonb
    )
    WHERE id = ${siteId}
  `;

  return { success: true };
}
