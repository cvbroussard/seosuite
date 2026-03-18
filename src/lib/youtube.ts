/**
 * YouTube OAuth 2.0 — separate from GBP Google OAuth.
 *
 * Uses the same Google Client ID/Secret but different scopes and redirect URI.
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI =
  process.env.NODE_ENV === "production"
    ? "https://tracpost.com/api/auth/youtube/callback"
    : "http://localhost:3099/api/auth/youtube/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Build the YouTube OAuth consent URL.
 */
export function getYouTubeAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeYouTubeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  email: string;
}> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`YouTube token exchange failed: ${err}`);
  }

  const tokenData = await tokenRes.json();

  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const userData = userRes.ok ? await userRes.json() : {};

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || "",
    expiresIn: tokenData.expires_in || 3600,
    email: userData.email || "",
  };
}

/**
 * Discover the authenticated user's YouTube channel.
 */
export async function discoverYouTubeChannel(accessToken: string): Promise<{
  channelId: string;
  channelTitle: string;
  customUrl: string;
} | null> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube channel discovery failed: ${err}`);
  }

  const data = await res.json();
  const channel = data.items?.[0];

  if (!channel) return null;

  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title || "",
    customUrl: channel.snippet?.customUrl || "",
  };
}
