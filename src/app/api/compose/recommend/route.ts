import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/compose/recommend?template_id=xxx
 *
 * Phase 2b — given a chosen template + the active site, returns
 * TracPost's recommended package: assets matching the template's slot
 * requirements, a stub caption, default CTA, link, and hashtag stub.
 *
 * The subscriber can edit any of these in the Review step before
 * triggering the publish. This is the RECOMMEND step of the unified
 * Select → Recommend → Review → Trigger pattern.
 *
 * Recommendation logic (v1, intentionally simple — improves over time
 * via the performance loop):
 *   - Assets: most recent N media_assets matching template's
 *     allowed_types, ordered by quality_score DESC, created_at DESC,
 *     limited to template's slot count
 *   - Caption: empty (subscriber fills) — Brand-DNA-voiced caption
 *     generation lands in Phase 5 smart helpers
 *   - Link: site's URL
 *   - CTA: "Learn More" + site URL (publisher default)
 *   - Hashtags: empty (Phase 5 smart helpers)
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = session.activeSiteId;
  if (!siteId) return NextResponse.json({ error: "No active site" }, { status: 400 });

  const templateId = new URL(req.url).searchParams.get("template_id");
  if (!templateId) return NextResponse.json({ error: "template_id required" }, { status: 400 });

  // Fetch the template
  const [template] = await sql`
    SELECT id, platform, format, name, asset_slots, metadata_requirements
    FROM post_templates
    WHERE id = ${templateId} AND enabled = true
  `;
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Verify the site has the template's platform connected (or it's blog)
  if (template.platform !== "blog") {
    const [bound] = await sql`
      SELECT pa.id
      FROM site_platform_assets spa
      JOIN platform_assets pa ON pa.id = spa.platform_asset_id
      JOIN social_accounts sa ON sa.id = pa.social_account_id
      WHERE spa.site_id = ${siteId}
        AND pa.platform = ${template.platform}
        AND spa.is_primary = true
        AND sa.subscription_id = ${session.subscriptionId}
      LIMIT 1
    `;
    if (!bound) {
      return NextResponse.json({
        error: `${template.platform} not connected to this site`,
      }, { status: 400 });
    }
  }

  // Fetch the site's URL for default link/CTA
  const [siteRow] = await sql`SELECT url, name FROM sites WHERE id = ${siteId}`;
  const siteUrl = (siteRow?.url as string | null) || "";

  // Determine asset slot count + allowed types
  const slots = (template.asset_slots as Record<string, unknown>) || {};
  const slotCount =
    typeof slots.count === "number" ? slots.count :
    typeof slots.count_min === "number" ? slots.count_min :
    1;
  const allowedTypes = Array.isArray(slots.allowed_types)
    ? (slots.allowed_types as string[])
    : ["image"];

  // Find candidate assets — most recent matching, quality-sorted
  const assets = await sql`
    SELECT id, storage_url, media_type, context_note, content_pillar,
           quality_score, created_at
    FROM media_assets
    WHERE site_id = ${siteId}
      AND media_type = ANY(${allowedTypes}::text[])
      AND triage_status NOT IN ('quarantined', 'shelved')
      AND status NOT IN ('deleted', 'failed')
    ORDER BY quality_score DESC NULLS LAST, created_at DESC
    LIMIT ${slotCount * 4}
  `;

  // Pre-pick the first slotCount assets as the "recommended" set;
  // the rest become "alternatives" the subscriber can swap to.
  const recommended = assets.slice(0, slotCount).map((a) => ({
    id: a.id,
    url: a.storage_url,
    type: a.media_type,
    contextNote: a.context_note,
    qualityScore: a.quality_score,
  }));
  const alternatives = assets.slice(slotCount).map((a) => ({
    id: a.id,
    url: a.storage_url,
    type: a.media_type,
    contextNote: a.context_note,
    qualityScore: a.quality_score,
  }));

  // Caption stub — start with the first recommended asset's context_note
  // (populated by the autopilot triage/captioning pipeline). Gives the
  // subscriber a meaningful starting point that reflects what they
  // captured, not an empty box. Subscriber can edit freely in the UI.
  // Future: full Brand-DNA-voiced caption generation via LLM.
  const captionStub = (assets[0]?.context_note as string | null) || "";

  // Hashtag stub — basic platform + content_pillar lookup. Cheap v1
  // suggestions; future enhancement reads tag preferences from
  // Brand DNA and includes industry-trending tags.
  const contentPillar = (assets[0]?.content_pillar as string | null) || null;
  const hashtags = suggestHashtags(template.platform as string, contentPillar);

  return NextResponse.json({
    template: {
      id: template.id,
      platform: template.platform,
      format: template.format,
      name: template.name,
    },
    slotCount,
    recommended,
    alternatives,
    captionStub,
    link: siteUrl,
    cta: { type: "LEARN_MORE", label: "Learn More", url: siteUrl },
    hashtags,
  });
}

/**
 * Suggest a small starter hashtag set based on platform + content pillar.
 * Intentionally cheap — gives the subscriber something to start with that
 * they can edit. Phase 5 enhancement reads Brand-DNA tag preferences and
 * adds trending tags per industry from cross-tenant intelligence.
 *
 * Pinterest gets more tag-heavy results since that platform's discovery
 * is search-driven; Story/Reel formats stay light.
 */
function suggestHashtags(platform: string, pillar: string | null): string[] {
  const platformDefaults: Record<string, string[]> = {
    facebook: [],
    instagram: ["#smallbusiness", "#local"],
    pinterest: ["#design", "#inspiration", "#ideas"],
    tiktok: ["#smallbusiness", "#fyp"],
    linkedin: [],
    blog: [],
  };
  const pillarHashtags: Record<string, string[]> = {
    kitchen: ["#kitchenremodel", "#kitchendesign"],
    bath: ["#bathroomremodel", "#bathroomdesign"],
    renovation: ["#homerenovation", "#beforeandafter"],
    landscape: ["#landscaping", "#outdoorliving"],
    food: ["#foodie", "#localrestaurant"],
    salon: ["#hairsalon", "#beforeandafter"],
  };
  const out = [...(platformDefaults[platform] || [])];
  if (pillar && pillarHashtags[pillar]) {
    out.push(...pillarHashtags[pillar]);
  }
  return out;
}
