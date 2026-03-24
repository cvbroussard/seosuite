/**
 * OAuth redirect helper — returns the appropriate redirect URL
 * based on whether the flow was initiated from mobile, web dashboard, or admin.
 */
import { studioUrl, platformUrl } from "./subdomains";

const MOBILE_CALLBACK = "tracpost-studio://auth/complete";

export function oauthSuccessUrl(
  source: string | undefined,
  accountName: string
): string {
  if (source === "mobile") {
    return `${MOBILE_CALLBACK}?connected=${encodeURIComponent(accountName)}`;
  }
  if (source === "admin") {
    return `${platformUrl("/provisioning")}?connected=${encodeURIComponent(accountName)}`;
  }
  return `${studioUrl("/accounts")}?connected=${encodeURIComponent(accountName)}`;
}

export function oauthErrorUrl(
  source: string | undefined,
  error: string,
  detail?: string
): string {
  const detailParam = detail ? `&detail=${encodeURIComponent(detail.slice(0, 200))}` : "";
  if (source === "mobile") {
    return `${MOBILE_CALLBACK}?error=${error}${detailParam}`;
  }
  if (source === "admin") {
    return `${platformUrl("/provisioning")}?error=${error}${detailParam}`;
  }
  return `${studioUrl("/accounts")}?error=${error}${detailParam}`;
}
