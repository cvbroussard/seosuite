import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, discoverInstagramAccounts, discoverFacebookPages } from "@/lib/meta";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

/**
 * GET /api/auth/instagram/callback?code=xxx&state=xxx
 *
 * Meta redirects here after the user authorizes. We:
 * 1. Exchange code for long-lived token
 * 2. Discover Instagram Business accounts
 * 3. Store credentials in social_accounts (subscriber-owned)
 * 4. Redirect to dashboard with success message
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Parse source early for error redirects
  let source: string | undefined;
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString());
      source = parsed.source;
    } catch { /* ignore */ }
  }

  if (error) {
    return NextResponse.redirect(oauthErrorUrl(source, "oauth_denied"));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(oauthErrorUrl(source, "missing_params"));
  }

  let state: { subscription_id: string; site_id?: string | null; source?: string; page_ids?: string[] };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state"));
  }

  try {
    const { accessToken, expiresIn } = await exchangeCodeForToken(code);
    console.log("OAuth callback — token obtained, expires in:", expiresIn);
    console.log("OAuth callback — state:", JSON.stringify(state));

    const igAccounts = await discoverInstagramAccounts(accessToken, state.page_ids);
    console.log("OAuth callback — discovered accounts:", JSON.stringify(igAccounts));

    if (igAccounts.length === 0) {
      console.log("OAuth callback — no IG accounts found, redirecting with error");
      return NextResponse.redirect(oauthErrorUrl(state.source, "no_ig_account"));
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    for (const ig of igAccounts) {
      await sql`
        INSERT INTO social_accounts (
          subscription_id, platform, account_name, account_id,
          access_token_encrypted, token_expires_at,
          scopes, status, metadata
        )
        VALUES (
          ${state.subscription_id}, 'instagram', ${ig.igUsername}, ${ig.igUserId},
          ${encrypt(accessToken)}, ${expiresAt},
          ${'{instagram_basic,instagram_content_publish,pages_manage_posts,pages_read_engagement}'},
          'active',
          ${JSON.stringify({ page_id: ig.pageId, page_name: ig.pageName })}
        )
        ON CONFLICT (subscription_id, platform, account_id)
        DO UPDATE SET
          account_name = EXCLUDED.account_name,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          token_expires_at = EXCLUDED.token_expires_at,
          scopes = EXCLUDED.scopes,
          status = 'active',
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `;
    }

    // Also discover and store Facebook Page accounts
    const fbPages = await discoverFacebookPages(accessToken, state.page_ids);
    console.log("OAuth callback — discovered FB pages:", JSON.stringify(fbPages));

    for (const fb of fbPages) {
      await sql`
        INSERT INTO social_accounts (
          subscription_id, platform, account_name, account_id,
          access_token_encrypted, token_expires_at,
          scopes, status, metadata
        )
        VALUES (
          ${state.subscription_id}, 'facebook', ${fb.pageName}, ${fb.pageId},
          ${encrypt(fb.pageAccessToken)}, ${expiresAt},
          ${'{pages_manage_posts,pages_show_list,pages_read_engagement}'},
          'active',
          ${JSON.stringify({ page_id: fb.pageId, page_name: fb.pageName })}
        )
        ON CONFLICT (subscription_id, platform, account_id)
        DO UPDATE SET
          account_name = EXCLUDED.account_name,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          token_expires_at = EXCLUDED.token_expires_at,
          scopes = EXCLUDED.scopes,
          status = 'active',
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `;
    }

    // Auto-link to active channel
    if (state.site_id) {
      for (const ig of igAccounts) {
        const [acct] = await sql`
          SELECT id FROM social_accounts
          WHERE subscription_id = ${state.subscription_id} AND platform = 'instagram' AND account_id = ${ig.igUserId}
        `;
        if (acct) {
          await sql`
            INSERT INTO site_social_links (site_id, social_account_id)
            VALUES (${state.site_id}, ${acct.id})
            ON CONFLICT DO NOTHING
          `;
        }
      }
      for (const fb of fbPages) {
        const [acct] = await sql`
          SELECT id FROM social_accounts
          WHERE subscription_id = ${state.subscription_id} AND platform = 'facebook' AND account_id = ${fb.pageId}
        `;
        if (acct) {
          await sql`
            INSERT INTO site_social_links (site_id, social_account_id)
            VALUES (${state.site_id}, ${acct.id})
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    // Log usage
    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'instagram_connect', ${JSON.stringify({
        accounts: igAccounts.map((a) => a.igUsername),
        facebook_pages: fbPages.map((p) => p.pageName),
      })})
    `;

    const allNames = [
      ...igAccounts.map((a) => a.igUsername),
      ...fbPages.map((p) => `FB:${p.pageName}`),
    ];
    const accountNames = allNames.join(",");
    return NextResponse.redirect(
      oauthSuccessUrl(state.source, accountNames)
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Instagram OAuth callback error:", message);
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "oauth_failed", message)
    );
  }
}
