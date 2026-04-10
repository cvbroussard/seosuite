/**
 * Cloudflare Custom Hostnames API (Cloudflare for SaaS).
 *
 * Manages tenant custom domains without Vercel domain registration.
 * Cloudflare issues TLS certs and proxies to our origin.
 *
 * Env vars:
 *   CLOUDFLARE_API_TOKEN — API token with Zone:Edit + Custom Hostnames permissions
 *   CLOUDFLARE_ZONE_ID — Zone ID for tracpost.com
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

function headers() {
  return {
    Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function zoneId(): string {
  return process.env.CLOUDFLARE_ZONE_ID || "";
}

/**
 * Add a custom hostname (e.g., blog.b2construct.com).
 * Cloudflare will issue a TLS cert and route traffic to our origin.
 */
export async function addCustomHostname(
  hostname: string
): Promise<{ success: boolean; id?: string; error?: string; status?: string }> {
  if (!process.env.CLOUDFLARE_API_TOKEN || !zoneId()) {
    console.warn("Cloudflare API not configured — skipping custom hostname");
    return { success: false, error: "Cloudflare API not configured" };
  }

  const res = await fetch(
    `${API_BASE}/zones/${zoneId()}/custom_hostnames`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        hostname,
        ssl: {
          method: "http",
          type: "dv",
          settings: {
            min_tls_version: "1.2",
          },
        },
      }),
    }
  );

  const data = await res.json();

  if (!data.success) {
    return {
      success: false,
      error: data.errors?.[0]?.message || JSON.stringify(data.errors),
    };
  }

  return {
    success: true,
    id: data.result.id,
    status: data.result.status,
  };
}

/**
 * Remove a custom hostname.
 */
export async function removeCustomHostname(
  hostnameId: string
): Promise<{ success: boolean; error?: string }> {
  if (!process.env.CLOUDFLARE_API_TOKEN || !zoneId()) {
    return { success: false, error: "Cloudflare API not configured" };
  }

  const res = await fetch(
    `${API_BASE}/zones/${zoneId()}/custom_hostnames/${hostnameId}`,
    {
      method: "DELETE",
      headers: headers(),
    }
  );

  const data = await res.json();
  return { success: data.success };
}

/**
 * Check the status of a custom hostname (TLS cert provisioning).
 */
export async function verifyCustomHostname(
  hostnameId: string
): Promise<{ status: string; ssl_status: string; error?: string }> {
  if (!process.env.CLOUDFLARE_API_TOKEN || !zoneId()) {
    return { status: "unknown", ssl_status: "unknown", error: "Cloudflare API not configured" };
  }

  const res = await fetch(
    `${API_BASE}/zones/${zoneId()}/custom_hostnames/${hostnameId}`,
    { headers: headers() }
  );

  const data = await res.json();

  if (!data.success) {
    return {
      status: "error",
      ssl_status: "error",
      error: data.errors?.[0]?.message || "Unknown error",
    };
  }

  return {
    status: data.result.status, // pending, active, moved, deleted
    ssl_status: data.result.ssl?.status || "unknown", // pending_validation, active, etc.
  };
}

/**
 * List all custom hostnames (for debugging/admin).
 */
export async function listCustomHostnames(): Promise<Array<{
  id: string;
  hostname: string;
  status: string;
  ssl_status: string;
}>> {
  if (!process.env.CLOUDFLARE_API_TOKEN || !zoneId()) {
    return [];
  }

  const res = await fetch(
    `${API_BASE}/zones/${zoneId()}/custom_hostnames?per_page=50`,
    { headers: headers() }
  );

  const data = await res.json();
  if (!data.success) return [];

  return (data.result || []).map((h: Record<string, unknown>) => ({
    id: h.id as string,
    hostname: h.hostname as string,
    status: h.status as string,
    ssl_status: (h.ssl as Record<string, unknown>)?.status as string || "unknown",
  }));
}
