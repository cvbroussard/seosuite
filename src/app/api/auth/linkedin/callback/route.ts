import { oauthSuccessUrl, oauthErrorUrl } from "@/lib/oauth-redirect";
import { NextRequest, NextResponse } from "next/server";
import { exchangeLinkedInCode, getLinkedInUserInfo, discoverLinkedInOrganizations } from "@/lib/linkedin";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";


/**
 * GET /api/auth/linkedin/callback?code=xxx&state=xxx
 *
 * LinkedIn redirects here after the user authorizes. We:
 * 1. Exchange code for access + refresh tokens
 * 2. Fetch user profile via OpenID Connect
 * 3. Store encrypted credentials in social_accounts
 * 4. Redirect to dashboard
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // Try to parse state early so error redirects respect source
  let source: string | undefined;
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString());
      source = parsed.source;
    } catch { /* ignore */ }
  }

  if (error) {
    return NextResponse.redirect(oauthErrorUrl(source, "linkedin_oauth_denied"));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(oauthErrorUrl(source, "missing_params"));
  }

  let state: { subscription_id: string; site_id?: string | null; source?: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state"));
  }

  try {
    const { accessToken, refreshToken, expiresIn } =
      await exchangeLinkedInCode(code);

    // Fetch user profile
    let accountName = "LinkedIn User";
    let accountId = "";
    try {
      const userInfo = await getLinkedInUserInfo(accessToken);
      accountName = userInfo.name;
      accountId = userInfo.id;
    } catch (e) {
      console.warn("LinkedIn user info failed (non-fatal):", e instanceof Error ? e.message : e);
    }

    // LinkedIn author URN for publishing
    const personUrn = accountId ? `urn:li:person:${accountId}` : "";

    // Discover organizations (Company Pages) the user admins
    const organizations = await discoverLinkedInOrganizations(accessToken);
    console.log("LinkedIn orgs discovered:", JSON.stringify(organizations));

    // If exactly one org, auto-select it as the publishing target
    const selectedOrg = organizations.length === 1 ? organizations[0] : null;
    const displayName = selectedOrg ? selectedOrg.orgName : accountName;
    const displayId = selectedOrg ? selectedOrg.orgId : accountId;

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const metadata = {
      name: accountName,
      person_urn: personUrn,
      organizations,
      selected_org: selectedOrg ? {
        org_id: selectedOrg.orgId,
        org_name: selectedOrg.orgName,
        org_urn: `urn:li:organization:${selectedOrg.orgId}`,
      } : null,
    };

    await sql`
      INSERT INTO social_accounts (
        subscription_id, platform, account_name, account_id,
        access_token_encrypted, refresh_token_encrypted, token_expires_at,
        scopes, status, metadata
      )
      VALUES (
        ${state.subscription_id}, 'linkedin', ${displayName}, ${displayId},
        ${encrypt(accessToken)}, ${refreshToken ? encrypt(refreshToken) : null}, ${expiresAt},
        ${"{openid,profile,w_member_social,r_organization_social,w_organization_social}"},
        'active',
        ${JSON.stringify(metadata)}
      )
      ON CONFLICT (subscription_id, platform, account_id)
      DO UPDATE SET
        account_name = EXCLUDED.account_name,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        token_expires_at = EXCLUDED.token_expires_at,
        scopes = EXCLUDED.scopes,
        status = 'active',
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;

    // Auto-link to active channel
    if (state.site_id && accountId) {
      const [acct] = await sql`
        SELECT id FROM social_accounts
        WHERE subscription_id = ${state.subscription_id} AND platform = 'linkedin' AND account_id = ${accountId}
      `;
      if (acct) {
        await sql`
          INSERT INTO site_social_links (site_id, social_account_id)
          VALUES (${state.site_id}, ${acct.id})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'linkedin_connect', ${JSON.stringify({
        name: accountName,
      })})
    `;

    return NextResponse.redirect(
      oauthSuccessUrl(state.source, accountName)
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LinkedIn OAuth callback error:", message);
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "linkedin_oauth_failed", message)
    );
  }
}
