import { cookies } from "next/headers";

export interface Session {
  userId: string;
  userName: string;
  subscriptionId: string;
  subscriptionName: string;
  plan: string;
  role: string;
  sites: Array<{ id: string; name: string; url: string; is_active?: boolean }>;
  activeSiteId: string | null;
}

/**
 * Read the user session from the httpOnly cookie.
 * Returns null if not logged in.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("tp_session")?.value;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}
