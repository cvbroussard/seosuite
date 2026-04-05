import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/projects?site_id=...
 * List projects for a site.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ projects: [] });
  }

  const projects = await sql`
    SELECT id, name, slug, status, start_date, end_date, address, description, created_at
    FROM projects WHERE site_id = ${siteId}
    ORDER BY name ASC
  `;

  return NextResponse.json({ projects });
}

/**
 * POST /api/projects — create a project
 * Body: { name, status?, start_date?, end_date?, address?, description?, site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, status, start_date, end_date, address, description, site_id } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT id FROM sites WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

  const [project] = await sql`
    INSERT INTO projects (site_id, name, slug, status, start_date, end_date, address, description)
    VALUES (${site_id}, ${name.trim()}, ${slug}, ${status || "active"}, ${start_date || null}, ${end_date || null}, ${address || null}, ${description || null})
    ON CONFLICT (site_id, slug) DO UPDATE SET name = ${name.trim()}, status = ${status || "active"}, address = ${address || null}, description = ${description || null}
    RETURNING id, name, slug, status, start_date, end_date, address, description
  `;

  // Geo-match: geocode address and backfill matching assets — non-blocking
  if (address) {
    import("@/lib/geo-match").then(({ backfillAssetsForEntity }) =>
      backfillAssetsForEntity("project", project.id as string, site_id, address)
        .then((result) => {
          if (result.matched > 0) {
            console.log(`Geo-matched ${result.matched} assets to project "${name}"`);
          }
        })
    ).catch(() => {});
  }

  return NextResponse.json({ project });
}
