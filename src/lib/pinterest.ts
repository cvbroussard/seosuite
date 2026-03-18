/**
 * Pinterest OAuth 2.0.
 *
 * Env vars:
 *   PINTEREST_APP_ID
 *   PINTEREST_APP_SECRET
 *   NEXT_PUBLIC_APP_URL
 */

const AUTH_URL = "https://www.pinterest.com/oauth";
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const USER_URL = "https://api.pinterest.com/v5/user_account";
const BOARDS_URL = "https://api.pinterest.com/v5/boards";

/**
 * Build Pinterest OAuth authorization URL.
 */
export function getPinterestAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.PINTEREST_APP_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/pinterest/callback`,
    response_type: "code",
    scope: "boards:read,pins:read,pins:write,user_accounts:read",
    state,
  });

  return `${AUTH_URL}/?${params}`;
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangePinterestCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const credentials = Buffer.from(
    `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
  ).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/pinterest/callback`,
    }),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      `Pinterest token exchange failed: ${data.message || data.error || JSON.stringify(data)}`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Fetch the authenticated user's profile.
 */
export async function getPinterestUserInfo(accessToken: string): Promise<{
  username: string;
}> {
  const res = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Pinterest user info failed: ${JSON.stringify(data)}`
    );
  }

  return {
    username: data.username || "",
  };
}

/**
 * Fetch the user's boards for board selection.
 */
export async function getPinterestBoards(accessToken: string): Promise<
  Array<{ id: string; name: string; description: string }>
> {
  const res = await fetch(`${BOARDS_URL}?page_size=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Pinterest boards fetch failed: ${JSON.stringify(data)}`
    );
  }

  return (data.items || []).map((b: Record<string, unknown>) => ({
    id: b.id as string,
    name: b.name as string,
    description: (b.description as string) || "",
  }));
}
