/**
 * POST /api/auto-tag-suggest
 *
 * Single entry point for audio-first auto-tagging suggestions, fired
 * by the asset modal after a recording commits. Combines three
 * suggestion paths into one round-trip:
 *
 *   1. content_tags (#204): pillar-based tags via existing
 *      suggestTags() function (text-driven Haiku call)
 *   2. brand_candidates (#201): NER-extracted brand mentions, with
 *      existing-vs-new flag for each
 *   3. service_area_candidates (#203): NER-extracted geographic
 *      mentions, with existing-vs-new flag for each (checking BOTH
 *      site overlay and platform canonical)
 *
 * The modal renders these as suggestions; subscriber single-tap
 * confirms each entity to materialize it (lazy auto-create).
 *
 * Body: { transcript, site_id, source_asset_id?, business_category? }
 * Returns: {
 *   content_tags: { pillarId, tagIds[] },
 *   brand_candidates: [{ name, slug, existing, existing_id? }],
 *   service_area_candidates: [{ name, slug, kind, existing_overlay,
 *                                existing_canonical_id?, overlay_id? }]
 * }
 *
 * See auto_tagging_audit.md for the full architecture.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { suggestTags } from "@/lib/triage/suggest-tags";
import { extractEntities } from "@/lib/ner";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { transcript, site_id, source_asset_id, business_category } = body;

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ error: "transcript required" }, { status: 400 });
    }
    if (!site_id) {
      return NextResponse.json({ error: "site_id required" }, { status: 400 });
    }

    // Verify ownership
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // Run content_tags suggestion + NER extraction in parallel
    const [tagSuggestion, ner] = await Promise.all([
      suggestTags(site_id, transcript).catch(() => ({ pillarId: "", tagIds: [] })),
      extractEntities(transcript, business_category).catch(() => ({
        brands: [] as Array<{ name: string; context: string }>,
        places: [] as Array<{ name: string; context: string }>,
        provider: "error",
        warnings: [] as string[],
      })),
    ]);

    // For each NER brand: dedup against existing brands for this site
    const existingBrands = await sql`
      SELECT id, slug FROM brands WHERE site_id = ${site_id}
    `;
    const existingBrandSlugs = new Map<string, string>();
    for (const b of existingBrands) {
      existingBrandSlugs.set(b.slug as string, b.id as string);
    }

    const brandCandidates = ner.brands.map((b) => {
      const slug = slugify(b.name);
      const existingId = existingBrandSlugs.get(slug);
      return {
        name: b.name,
        slug,
        context: b.context,
        existing: !!existingId,
        existing_id: existingId || null,
      };
    });

    // For each NER place: dedup against site overlay AND canonical
    const existingOverlay = await sql`
      SELECT sa.id AS overlay_id, c.slug, c.id AS canonical_id
      FROM site_service_areas sa
      JOIN service_areas_canonical c ON c.id = sa.service_area_canonical_id
      WHERE sa.site_id = ${site_id}
    `;
    const overlaySlugs = new Map<string, { overlay_id: string; canonical_id: string }>();
    for (const o of existingOverlay) {
      overlaySlugs.set(o.slug as string, { overlay_id: o.overlay_id as string, canonical_id: o.canonical_id as string });
    }

    // For places not yet in overlay, check if canonical row exists platform-wide
    const placeSlugs = ner.places.map((p) => slugify(p.name));
    const newSlugs = placeSlugs.filter((s) => !overlaySlugs.has(s));
    const canonicalLookup = new Map<string, string>();
    if (newSlugs.length > 0) {
      const canonicals = await sql`
        SELECT id, slug FROM service_areas_canonical WHERE slug = ANY(${newSlugs}::text[])
      `;
      for (const c of canonicals) {
        canonicalLookup.set(c.slug as string, c.id as string);
      }
    }

    const serviceAreaCandidates = ner.places.map((p) => {
      const slug = slugify(p.name);
      const overlayMatch = overlaySlugs.get(slug);
      const canonicalMatch = canonicalLookup.get(slug);
      return {
        name: p.name,
        slug,
        kind: "city" as const, // default kind — subscriber can change on add
        context: p.context,
        existing_overlay: !!overlayMatch,
        existing_canonical_id: overlayMatch?.canonical_id || canonicalMatch || null,
        overlay_id: overlayMatch?.overlay_id || null,
      };
    });

    return NextResponse.json({
      content_tags: tagSuggestion,
      brand_candidates: brandCandidates,
      service_area_candidates: serviceAreaCandidates,
      ner_provider: ner.provider,
      ner_warnings: ner.warnings || [],
      source_asset_id: source_asset_id || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("auto-tag-suggest error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
