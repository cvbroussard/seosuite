import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { composeAnchorCaption, templateToPlatformFormat } from "@/lib/pipeline/caption-generator";

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

  const params = new URL(req.url).searchParams;
  const templateId = params.get("template_id");
  if (!templateId) return NextResponse.json({ error: "template_id required" }, { status: 400 });

  // Anchor (Topic) inputs — when provided, the recommendation pulls
  // its hero asset, title-derived caption stub, and content_pillar
  // hashtags from the anchor instead of the most-recent-quality fallback.
  const anchorId = params.get("anchor_id");
  const anchorType = params.get("anchor_type"); // "blog_post" | "project"

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
  // media_type column is inconsistently populated — some rows store
  // bare types ("image", "video") and others MIME-shaped values
  // ("image/jpeg", "image/png"). We match by category prefix so the
  // picker doesn't silently drop valid candidates. ILIKE patterns are
  // built once and used in every asset query below.
  const typePatterns = allowedTypes.map((t) => `${t}%`);

  // Anchor lookup — fetch hero asset id + content_pillar + title/excerpt
  // when the subscriber picked a Topic on Step 1. Anchor wins over the
  // generic "most recent quality" recommendation.
  let anchorRow: {
    title: string | null;
    excerpt: string | null;
    contentPillar: string | null;
    heroAssetId: string | null;
    articleTags: string[];
    slug: string | null;
  } | null = null;
  if (anchorId && anchorType === "blog_post") {
    const [r] = await sql`
      SELECT title, excerpt, content_pillar, source_asset_id, tags, slug
      FROM blog_posts
      WHERE id = ${anchorId} AND site_id = ${siteId}
    `;
    if (r) {
      anchorRow = {
        title: (r.title as string | null) || null,
        excerpt: (r.excerpt as string | null) || null,
        contentPillar: (r.content_pillar as string | null) || null,
        heroAssetId: (r.source_asset_id as string | null) || null,
        articleTags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        slug: (r.slug as string | null) || null,
      };
    }
  } else if (anchorId && anchorType === "project") {
    const [r] = await sql`
      SELECT name AS title, description AS excerpt, hero_asset_id, slug
      FROM projects
      WHERE id = ${anchorId} AND site_id = ${siteId}
    `;
    if (r) {
      anchorRow = {
        title: (r.title as string | null) || null,
        excerpt: (r.excerpt as string | null) || null,
        contentPillar: null,
        heroAssetId: (r.hero_asset_id as string | null) || null,
        articleTags: [],
        slug: (r.slug as string | null) || null,
      };
    }
  }

  // Compose the anchor's public URL — used as the link the caption
  // teases. Falls back to site root if the anchor lacks a slug.
  const anchorUrl = anchorRow?.slug
    ? (anchorType === "blog_post"
        ? `${siteUrl.replace(/\/+$/, "")}/blog/${anchorRow.slug}`
        : `${siteUrl.replace(/\/+$/, "")}/projects/${anchorRow.slug}`)
    : siteUrl;

  // Candidate assets — when an anchor is provided, the picker presents
  // assets curated to the anchor's topic (matched on content_pillar),
  // not the whole site library. The structural change of formally
  // joining articles to an asset array is deferred (see Option A in
  // the topic-anchor design); for now we synthesize the array at
  // request time. Hero is always promoted first; remaining slots are
  // pillar-matched, padded with general recency-quality if sparse.
  // Topic signal — the article's content_pillar wins; if it's null
  // (12 of 25 published articles fall here today), the hero asset's
  // pillar acts as the fallback signal. Both nullable; either being
  // present unlocks the curated branch.
  let topicPillar: string | null = anchorRow?.contentPillar || null;
  if (!topicPillar && anchorRow?.heroAssetId) {
    const [h] = await sql`
      SELECT content_pillar
      FROM media_assets
      WHERE id = ${anchorRow.heroAssetId}
    `;
    topicPillar = (h?.content_pillar as string | null) || null;
  }

  const ANCHOR_PICKER_LIMIT = 20;
  let assets: Record<string, unknown>[];
  if (topicPillar) {
    const matches = await sql`
      SELECT id, storage_url, media_type, context_note, content_pillar,
             content_tags, ai_analysis, quality_score, created_at
      FROM media_assets
      WHERE site_id = ${siteId}
        AND media_type ILIKE ANY(${typePatterns}::text[])
        AND triage_status NOT IN ('quarantined', 'shelved')
        AND status NOT IN ('deleted', 'failed')
        AND (
          content_pillar = ${topicPillar}
          OR ${topicPillar} = ANY(COALESCE(content_pillars, ARRAY[]::text[]))
        )
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
      LIMIT ${ANCHOR_PICKER_LIMIT}
    `;
    if (matches.length >= ANCHOR_PICKER_LIMIT) {
      assets = matches;
    } else {
      // Sparse pillar match — pad with general recency-quality so the
      // picker still has options. Excludes already-matched ids.
      const matchedIds = matches.map((m) => m.id as string);
      const padded = await sql`
        SELECT id, storage_url, media_type, context_note, content_pillar,
               content_tags, ai_analysis, quality_score, created_at
        FROM media_assets
        WHERE site_id = ${siteId}
          AND media_type ILIKE ANY(${typePatterns}::text[])
          AND triage_status NOT IN ('quarantined', 'shelved')
          AND status NOT IN ('deleted', 'failed')
          AND id <> ALL(${matchedIds}::uuid[])
        ORDER BY quality_score DESC NULLS LAST, created_at DESC
        LIMIT ${ANCHOR_PICKER_LIMIT - matches.length}
      `;
      assets = [...matches, ...padded];
    }
  } else {
    // No topic signal (no anchor, or anchor + hero both lack pillar) —
    // fall back to general recency-quality.
    assets = await sql`
      SELECT id, storage_url, media_type, context_note, content_pillar,
             content_tags, ai_analysis, quality_score, created_at
      FROM media_assets
      WHERE site_id = ${siteId}
        AND media_type ILIKE ANY(${typePatterns}::text[])
        AND triage_status NOT IN ('quarantined', 'shelved')
        AND status NOT IN ('deleted', 'failed')
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
      LIMIT ${slotCount * 4}
    `;
  }

  // If anchor provided a hero asset, fetch it and prepend so it becomes
  // the recommended pick. If the hero is already in the candidate list,
  // promote it; otherwise pull it explicitly — without the allowedTypes
  // filter, because a hero video on an image-only template still needs
  // to surface so the subscriber can swap templates rather than be left
  // wondering why their topic's hero disappeared.
  let heroAsset: typeof assets[number] | null = null;
  let heroTypeMismatch = false;
  if (anchorRow?.heroAssetId) {
    const heroIdx = assets.findIndex((a) => a.id === anchorRow!.heroAssetId);
    if (heroIdx >= 0) {
      heroAsset = assets[heroIdx];
      assets.splice(heroIdx, 1);
    } else {
      const [r] = await sql`
        SELECT id, storage_url, media_type, context_note, content_pillar,
               content_tags, ai_analysis, quality_score, created_at
        FROM media_assets
        WHERE id = ${anchorRow.heroAssetId}
      `;
      if (r) {
        heroAsset = r;
        const heroType = String(r.media_type || "");
        heroTypeMismatch = !allowedTypes.some((t) => heroType.startsWith(t));
      }
    }
  }
  const orderedAssets = heroAsset ? [heroAsset, ...assets] : assets;

  // Pre-pick the first slotCount assets as the "recommended" set;
  // the rest become "alternatives" the subscriber can swap to.
  const recommended = orderedAssets.slice(0, slotCount).map((a) => ({
    id: a.id,
    url: a.storage_url,
    type: a.media_type,
    contextNote: a.context_note,
    qualityScore: a.quality_score,
  }));
  const alternatives = orderedAssets.slice(slotCount).map((a) => ({
    id: a.id,
    url: a.storage_url,
    type: a.media_type,
    contextNote: a.context_note,
    qualityScore: a.quality_score,
  }));

  // Caption + hashtag synthesis.
  // ── Anchor present → Brand-DNA-voiced LLM generation tailored to the
  //    platform format. Captions tease the linked URL (the anchor is
  //    the destination, the post is the vehicle).
  // ── Anchor absent OR LLM fails → static fallback (asset context note
  //    or empty caption; tag-based hashtag composition).
  let captionStub = "";
  let hashtags: string[] = [];
  const heroForCaption = heroAsset || orderedAssets[0];
  const heroContentTags = Array.isArray(heroForCaption?.content_tags)
    ? (heroForCaption!.content_tags as string[])
    : [];
  const contentPillar = anchorRow?.contentPillar
    || (orderedAssets[0]?.content_pillar as string | null)
    || null;

  if (anchorRow && anchorType) {
    try {
      const platformFormat = templateToPlatformFormat(
        template.platform as string,
        template.format as string,
      );
      const result = await composeAnchorCaption({
        siteId,
        platformFormat,
        anchor: {
          type: anchorType as "blog_post" | "project",
          title: anchorRow.title,
          excerpt: anchorRow.excerpt,
          contentPillar: anchorRow.contentPillar,
          articleTags: anchorRow.articleTags,
        },
        hero: heroForCaption ? {
          mediaType: (heroForCaption.media_type as string | null) || null,
          contextNote: (heroForCaption.context_note as string | null) || null,
          aiAnalysis: (heroForCaption.ai_analysis as Record<string, unknown> | null) || null,
        } : null,
        link: anchorUrl,
      });
      captionStub = result.caption;
      hashtags = result.hashtags;
    } catch (err) {
      console.error("composeAnchorCaption failed, falling back:", err instanceof Error ? err.message : err);
      captionStub = anchorRow.title
        || (orderedAssets[0]?.context_note as string | null)
        || "";
      hashtags = composeHashtags({
        platform: template.platform as string,
        pillar: contentPillar,
        articleTags: anchorRow.articleTags || [],
        assetTags: heroContentTags,
      });
    }
  } else {
    captionStub = (orderedAssets[0]?.context_note as string | null) || "";
    hashtags = composeHashtags({
      platform: template.platform as string,
      pillar: contentPillar,
      articleTags: [],
      assetTags: heroContentTags,
    });
  }

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
    link: anchorUrl,
    cta: { type: "LEARN_MORE", label: "Learn More", url: anchorUrl },
    hashtags,
    // When the topic's hero is a video but the chosen template is
    // image-only (or vice versa), the UI surfaces a "switch templates"
    // coaching nudge — anchor-first paradigm means topic drives format.
    heroTypeMismatch: heroTypeMismatch
      ? { heroType: heroAsset!.media_type as string, allowedTypes }
      : null,
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
/**
 * Compose a hashtag set from three signal sources.
 *
 *   1. Anchor's article tags (blog_posts.tags) — primary, most topical
 *   2. Hero asset's content_tags — secondary, visual/contextual fill
 *   3. Platform defaults via suggestHashtags() — supplemental
 *
 * Each source is normalized (lowercase, alphanumerics + hyphens only,
 * leading "#"), deduped across sources, and capped. Empty / over-long
 * candidates dropped.
 */
function composeHashtags(opts: {
  platform: string;
  pillar: string | null;
  articleTags: string[];
  assetTags: string[];
}): string[] {
  const MAX = 8;
  const MAX_TAG_LEN = 30;
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string) => {
    if (out.length >= MAX) return;
    // PascalCase normalization: split on any non-alphanumeric, capitalize
    // each word, concat. Improves readability + accessibility (screen
    // readers parse word boundaries from case changes).
    const cleaned = raw
      .normalize("NFKD")
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
    if (!cleaned || cleaned.length > MAX_TAG_LEN) return;
    const tag = `#${cleaned}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tag);
  };

  for (const t of opts.articleTags) push(t);
  for (const t of opts.assetTags) push(t);
  for (const t of suggestHashtags(opts.platform, opts.pillar)) {
    push(t.replace(/^#/, "")); // normalize back through push
  }

  return out;
}

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
