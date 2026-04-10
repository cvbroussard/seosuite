import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { addCustomHostname, removeCustomHostname, verifyCustomHostname } from "@/lib/cloudflare-domains";

/**
 * POST /api/blog/domain
 *
 * Actions:
 * - { action: "set", site_id, subdomain } — set custom domain, add to Cloudflare
 * - { action: "verify", site_id } — check TLS/DNS status
 * - { action: "remove", site_id } — remove custom domain
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { action, site_id } = body;

  if (!site_id) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  // Verify ownership
  const [site] = await sql`
    SELECT s.id, s.url, bs.subdomain, bs.custom_domain,
           bs.metadata->>'cf_hostname_id' AS cf_hostname_id
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.id = ${site_id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  if (action === "set") {
    const { subdomain } = body;
    if (!subdomain) return NextResponse.json({ error: "subdomain required" }, { status: 400 });

    // Build the full domain: "blog" → blog.b2construct.com, or full domain passed
    const siteHost = site.url ? new URL(site.url as string).hostname : null;
    const fullDomain = subdomain.includes(".")
      ? subdomain
      : siteHost
        ? `${subdomain}.${siteHost}`
        : `${subdomain}.tracpost.com`;

    // Add to Cloudflare Custom Hostnames
    const result = await addCustomHostname(fullDomain);

    // Store in blog_settings
    const cfMeta = result.id ? { cf_hostname_id: result.id } : {};
    await sql`
      UPDATE blog_settings
      SET custom_domain = ${fullDomain},
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(cfMeta)}::jsonb,
          updated_at = NOW()
      WHERE site_id = ${site_id}
    `;

    // Get siteSlug for CUSTOM_DOMAIN_MAP instruction
    const siteSlug = (site.subdomain as string) || site_id;

    return NextResponse.json({
      domain: fullDomain,
      siteSlug,
      added: result.success,
      status: result.status || "pending",
      error: result.error,
      cname_target: "blogs.tracpost.com",
      instructions: `Add a CNAME record: ${subdomain.includes(".") ? subdomain.split(".")[0] : subdomain} → blogs.tracpost.com`,
      env_update: `Add to CUSTOM_DOMAIN_MAP: {"${fullDomain}":"${siteSlug}"}`,
    });
  }

  if (action === "verify") {
    const hostnameId = site.cf_hostname_id as string;
    if (!hostnameId) {
      return NextResponse.json({ error: "No custom hostname configured" }, { status: 400 });
    }

    const status = await verifyCustomHostname(hostnameId);
    return NextResponse.json(status);
  }

  if (action === "remove") {
    const domain = site.custom_domain as string;
    const hostnameId = site.cf_hostname_id as string;

    if (hostnameId) {
      await removeCustomHostname(hostnameId);
    }

    await sql`
      UPDATE blog_settings
      SET custom_domain = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb) - 'cf_hostname_id',
          updated_at = NOW()
      WHERE site_id = ${site_id}
    `;

    return NextResponse.json({ removed: true, domain });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
