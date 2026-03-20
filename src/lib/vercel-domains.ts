/**
 * Vercel Domain Management API.
 *
 * Adds/removes custom domains on the TracPost Vercel project.
 * Used for blog custom domain provisioning.
 *
 * Env vars:
 *   VERCEL_TOKEN — Vercel API token (from dashboard → tokens)
 *   VERCEL_PROJECT_ID — TracPost project ID
 *   VERCEL_TEAM_ID — Team/scope ID (optional for personal accounts)
 */

const API_BASE = "https://api.vercel.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function teamQuery(): string {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}

/**
 * Add a custom domain to the Vercel project.
 */
export async function addDomain(domain: string): Promise<{ success: boolean; error?: string }> {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    console.warn("Vercel domain API not configured — skipping domain addition");
    return { success: false, error: "Vercel API not configured" };
  }

  const res = await fetch(
    `${API_BASE}/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains${teamQuery()}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: domain }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    return {
      success: false,
      error: data.error?.message || JSON.stringify(data),
    };
  }

  return { success: true };
}

/**
 * Remove a custom domain from the Vercel project.
 */
export async function removeDomain(domain: string): Promise<{ success: boolean; error?: string }> {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return { success: false, error: "Vercel API not configured" };
  }

  const res = await fetch(
    `${API_BASE}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${domain}${teamQuery()}`,
    {
      method: "DELETE",
      headers: headers(),
    }
  );

  if (!res.ok) {
    const data = await res.json();
    return { success: false, error: data.error?.message || "Failed to remove domain" };
  }

  return { success: true };
}

/**
 * Check if a domain's DNS is configured correctly.
 */
export async function verifyDomain(domain: string): Promise<{
  verified: boolean;
  configured: boolean;
  error?: string;
}> {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return { verified: false, configured: false, error: "Vercel API not configured" };
  }

  const res = await fetch(
    `${API_BASE}/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${domain}${teamQuery()}`,
    { headers: headers() }
  );

  if (!res.ok) {
    return { verified: false, configured: false, error: "Domain not found on project" };
  }

  const data = await res.json();
  return {
    verified: data.verified === true,
    configured: data.configured === true,
  };
}
