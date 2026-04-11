import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const VERCEL_API = "https://api.vercel.com";

function vercelHeaders() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function teamQuery(): string {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}

/**
 * POST /api/admin/website
 *
 * Actions:
 * - { action: "generate", site_id } — generate + deploy website
 * - { action: "add-domain", site_id, domain } — add root domain to website project
 * - { action: "verify-domain", site_id, domain } — check domain status
 */
export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { site_id, action } = body;

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  if (action === "generate") {
    try {
      const { spinWebsite } = await import("@/lib/website-spinner/generate");
      const result = await spinWebsite(site_id);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }, { status: 500 });
    }
  }

  if (action === "add-domain") {
    const { domain } = body;
    if (!domain) {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }

    // Derive project name from site slug
    const [settings] = await sql`SELECT subdomain FROM blog_settings WHERE site_id = ${site_id}`;
    const siteSlug = (settings?.subdomain as string) || "";
    const projectName = `${siteSlug}-site`;

    // Add domain to the website project
    const addRes = await fetch(`${VERCEL_API}/v10/projects/${projectName}/domains${teamQuery()}`, {
      method: "POST",
      headers: vercelHeaders(),
      body: JSON.stringify({ name: domain }),
    });
    const addData = await addRes.json();

    if (!addRes.ok && addData.error?.code !== "domain_already_in_use") {
      return NextResponse.json({
        success: false,
        error: addData.error?.message || "Failed to add domain",
      });
    }

    // Fetch verification records
    const domainRes = await fetch(
      `${VERCEL_API}/v9/projects/${projectName}/domains/${domain}${teamQuery()}`,
      { headers: vercelHeaders() }
    );
    const domainData = domainRes.ok ? await domainRes.json() : null;

    // Build DNS records
    const dnsRecords: Array<{ type: string; name: string; value: string; purpose: string }> = [];

    // Verification TXT
    if (domainData?.verification) {
      for (const v of domainData.verification) {
        dnsRecords.push({
          type: (v.type as string).toUpperCase(),
          name: v.domain as string,
          value: v.value as string,
          purpose: "Domain ownership verification",
        });
      }
    }

    // A record for root domain
    dnsRecords.push({
      type: "A",
      name: "@",
      value: "76.76.21.21",
      purpose: "Root domain to Vercel",
    });

    return NextResponse.json({
      success: true,
      domain,
      projectName,
      verified: domainData?.verified === true,
      dnsRecords,
    });
  }

  if (action === "verify-domain") {
    const { domain } = body;
    if (!domain) {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }

    const [settings] = await sql`SELECT subdomain FROM blog_settings WHERE site_id = ${site_id}`;
    const siteSlug = (settings?.subdomain as string) || "";
    const projectName = `${siteSlug}-site`;

    // Check domain status
    const domainRes = await fetch(
      `${VERCEL_API}/v9/projects/${projectName}/domains/${domain}${teamQuery()}`,
      { headers: vercelHeaders() }
    );

    if (!domainRes.ok) {
      return NextResponse.json({ verified: false, configured: false, error: "Domain not found" });
    }

    const domainData = await domainRes.json();

    // Check config
    const configRes = await fetch(
      `${VERCEL_API}/v6/domains/${domain}/config${teamQuery()}`,
      { headers: vercelHeaders() }
    );
    const configData = configRes.ok ? await configRes.json() : null;

    return NextResponse.json({
      domain,
      verified: domainData.verified === true,
      configured: configData?.misconfigured === false,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
