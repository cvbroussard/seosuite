import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/clients?site_id=...
 * List personas for a site.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ clients: [] });
  }

  const personas = await sql`
    SELECT id, name, slug, display_name, type, consent_given, description,
           visual_cues, narrative_context, relationships,
           appearance_count, first_seen_at, last_seen_at,
           hero_asset_id, metadata, created_at
    FROM personas WHERE site_id = ${siteId}
    ORDER BY name ASC
  `;

  return NextResponse.json({ clients: personas });
}

/**
 * POST /api/clients — create a persona
 * Body: { name, display_name?, type?, consent_given?, description?,
 *         visual_cues?, narrative_context?, relationships?,
 *         hero_asset_id?, metadata?, site_id }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { name, display_name, type, consent_given, description,
    visual_cues, narrative_context, relationships, hero_asset_id, metadata, site_id } = body;

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

  const personaType = type || "person";
  const visualCuesArr = Array.isArray(visual_cues)
    ? visual_cues
    : typeof visual_cues === "string"
    ? visual_cues.split(",").map((s: string) => s.trim()).filter(Boolean)
    : [];
  const relationshipsJson = relationships
    ? typeof relationships === "string"
      ? relationships
      : JSON.stringify(relationships)
    : "{}";
  const metadataJson = metadata
    ? typeof metadata === "string"
      ? metadata
      : JSON.stringify(metadata)
    : "{}";

  const [persona] = await sql`
    INSERT INTO personas (site_id, name, slug, display_name, type, consent_given, description,
      visual_cues, narrative_context, relationships, hero_asset_id, metadata)
    VALUES (${site_id}, ${name.trim()}, ${slug}, ${display_name || null}, ${personaType},
      ${consent_given ?? false}, ${description || null},
      ${visualCuesArr}::text[], ${narrative_context || null},
      ${relationshipsJson}::jsonb, ${hero_asset_id || null}, ${metadataJson}::jsonb)
    ON CONFLICT (site_id, slug) DO UPDATE SET
      name = ${name.trim()},
      display_name = ${display_name || null},
      type = ${personaType},
      consent_given = ${consent_given ?? false},
      description = ${description || null},
      visual_cues = ${visualCuesArr}::text[],
      narrative_context = ${narrative_context || null},
      relationships = ${relationshipsJson}::jsonb,
      hero_asset_id = ${hero_asset_id || null},
      metadata = ${metadataJson}::jsonb
    RETURNING id, name, slug, display_name, type, consent_given, description,
              visual_cues, narrative_context, relationships,
              appearance_count, first_seen_at, last_seen_at,
              hero_asset_id, metadata
  `;

  return NextResponse.json({ client: persona });
}
