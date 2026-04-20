import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, discoverGbpLocations } from "@/lib/google";
import { sql } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { oauthErrorUrl } from "@/lib/oauth-redirect";

/**
 * GET /api/auth/google/callback?code=xxx&state=xxx
 *
 * Google redirects here after the user authorizes. We:
 * 1. Exchange code for access + refresh tokens
 * 2. Store credentials in gbp_credentials
 * 3. Discover GBP locations
 * 4. Store all social_accounts (tokens shared across locations)
 * 5. Redirect to location picker for site assignment
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  let source: string | undefined;
  if (stateParam) {
    try {
      const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString());
      source = parsed.source;
    } catch { /* ignore */ }
  }

  if (error) {
    return NextResponse.redirect(oauthErrorUrl(source, "google_oauth_denied"));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(oauthErrorUrl(source, "missing_params"));
  }

  let state: { subscription_id: string; site_id: string; source?: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(oauthErrorUrl(source, "invalid_state"));
  }

  try {
    const { accessToken, refreshToken, expiresIn, email, googleAccountId } =
      await exchangeGoogleCode(code);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store credentials
    await sql`
      INSERT INTO gbp_credentials (
        site_id, google_account_id, google_email,
        access_token, refresh_token, token_expires_at,
        scopes, is_active
      )
      VALUES (
        ${state.site_id}, ${googleAccountId}, ${email},
        ${encrypt(accessToken)}, ${encrypt(refreshToken)}, ${expiresAt},
        ${"{business.manage,userinfo.email,webmasters.readonly}"},
        true
      )
      ON CONFLICT (site_id)
      DO UPDATE SET
        google_account_id = EXCLUDED.google_account_id,
        google_email = EXCLUDED.google_email,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_expires_at = EXCLUDED.token_expires_at,
        scopes = EXCLUDED.scopes,
        is_active = true,
        updated_at = NOW()
    `;

    // Discover locations
    const locations = await discoverGbpLocations(accessToken);

    // Create/update social_accounts for ALL discovered locations
    // (tokens are shared — same Google account manages all locations)
    const locationIds: string[] = [];
    for (const loc of locations) {
      await sql`
        INSERT INTO gbp_locations (
          site_id, external_id, gbp_account_id, gbp_location_id,
          sync_status, sync_data
        )
        VALUES (
          ${state.site_id}, ${loc.locationId}, ${loc.accountId}, ${loc.locationId},
          'synced', ${JSON.stringify({ name: loc.locationName, address: loc.address })}
        )
        ON CONFLICT DO NOTHING
      `;

      const socialAccount = await sql`
        INSERT INTO social_accounts (
          subscription_id, platform, account_name, account_id,
          access_token_encrypted, refresh_token_encrypted, token_expires_at,
          scopes, status, metadata
        )
        VALUES (
          ${state.subscription_id}, 'gbp', ${loc.locationName}, ${loc.locationId},
          ${encrypt(accessToken)}, ${encrypt(refreshToken)}, ${expiresAt},
          ${"{business.manage}"},
          'active',
          ${JSON.stringify({
            google_account_id: googleAccountId,
            google_email: email,
            account_id: loc.accountId,
            location_id: loc.locationId,
            location_name: loc.locationName,
            address: loc.address,
          })}
        )
        ON CONFLICT (subscription_id, platform, account_id)
        DO UPDATE SET
          account_name = EXCLUDED.account_name,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
          token_expires_at = EXCLUDED.token_expires_at,
          status = 'active',
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `;

      if (socialAccount.length > 0) {
        locationIds.push(socialAccount[0].id as string);
      }
    }

    // Log usage
    await sql`
      INSERT INTO usage_log (subscription_id, action, metadata)
      VALUES (${state.subscription_id}, 'google_connect', ${JSON.stringify({
        locations: locations.map((l) => l.locationName),
        email,
      })})
    `;

    // If only 1 location, auto-link to the initiating site and skip picker
    if (locations.length === 1 && locationIds.length === 1) {
      await sql`
        INSERT INTO site_social_links (site_id, social_account_id)
        VALUES (${state.site_id}, ${locationIds[0]})
        ON CONFLICT DO NOTHING
      `;

      // Sync profile
      try {
        const { syncProfileFromGoogle } = await import("@/lib/gbp/profile");
        await syncProfileFromGoogle(state.site_id);
      } catch { /* non-fatal */ }

      const isAdmin = source === "admin";
      const base = isAdmin ? "/admin/sites/" + state.site_id : "/dashboard/accounts";
      return NextResponse.redirect(
        new URL(`${base}?connected=${encodeURIComponent(locations[0].locationName)}`, req.url)
      );
    }

    // Multiple locations — redirect to picker
    // Works from both admin and tenant dashboard
    const pickerParams = new URLSearchParams({
      subscription_id: state.subscription_id,
      source: source || "dashboard",
      initiating_site_id: state.site_id,
    });

    const pickerBase = source === "admin"
      ? "/admin/google-location-picker"
      : "/dashboard/google/location-picker";

    return NextResponse.redirect(
      new URL(`${pickerBase}?${pickerParams}`, req.url)
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Google OAuth callback error:", message);
    return NextResponse.redirect(
      oauthErrorUrl(state.source, "google_oauth_failed", message)
    );
  }
}
