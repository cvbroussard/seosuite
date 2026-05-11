import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { uploadBufferToR2 } from "@/lib/r2";
import { randomUUID } from "node:crypto";

/**
 * Brand enrichment for the audio-first auto-tagging pipeline (#201).
 *
 * Per seed_and_enrich_principle: human commits identity (name), AI
 * completes schema (URL, description, category). Multi-stage pipeline:
 *
 *   Stage 1: Claude knowledge lookup (URL + description + category)
 *   Stage 2: Web fetch + OG meta extract (real description, og:image URL)
 *   Stage 3: Logo download → R2 upload → media_asset → brand.hero_asset_id
 *   Stage 4 (future): Web search fallback for unknown brands
 *
 * Failure modes are non-fatal at every stage — the brand row exists
 * usable from the moment it's created. Each stage layers on top.
 */

const anthropic = new Anthropic();

interface EnrichResult {
  url: string | null;
  description: string | null;
  category: string | null;
  confidence: "high" | "medium" | "low";
}

interface OGMeta {
  title: string | null;
  description: string | null;
  image: string | null;
}

/**
 * Enrich a brand row through Stages 1, 2, 3.
 *
 * Default mode (force=false): idempotent — bails if `enriched_at` is set,
 * status is 'skipped', or url is already populated. The auto-on-creation
 * path uses this.
 *
 * Force mode (force=true): bypasses all bail-outs. Used by the operator
 * backfill route to sweep every brand regardless of state. Existing
 * user-set values (url, description, hero_asset_id) are preserved via
 * COALESCE — force never overwrites truth, only fills gaps.
 */
export async function enrichBrand(
  brandId: string,
  brandName: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const { force = false } = opts;

  const [current] = await sql`
    SELECT site_id, enrichment_status, enriched_at, url, hero_asset_id
    FROM brands WHERE id = ${brandId}
  `;
  if (!current) return;

  if (!force) {
    if (current.enriched_at) return;
    if (current.enrichment_status === "skipped") return;
    if (current.url) {
      // URL already set (manually) — skip enrichment, mark as such
      await sql`
        UPDATE brands SET enrichment_status = 'skipped', enriched_at = NOW()
        WHERE id = ${brandId}
      `;
      return;
    }
  }

  await sql`
    UPDATE brands SET enrichment_attempts = enrichment_attempts + 1
    WHERE id = ${brandId}
  `;

  const siteId = current.site_id as string;
  const existingUrl = (current.url as string | null) || null;
  const existingHeroId = (current.hero_asset_id as string | null) || null;

  try {
    // Stage 1: Claude knowledge lookup
    const claudeResult = await askClaudeAboutBrand(brandName);

    // Stage 2: Web fetch + OG extract.
    // Prefer the brand's existing user-set URL over Claude's URL — the
    // subscriber's URL is ground truth, Claude's is a guess.
    const fetchTarget = existingUrl || claudeResult.url;
    let ogMeta: OGMeta = { title: null, description: null, image: null };
    if (fetchTarget) {
      ogMeta = await fetchOGMeta(fetchTarget);
    }

    // Description preference: og:description (real, scraped) > Claude's summary
    const finalDescription = ogMeta.description || claudeResult.description;

    // Stage 3: Logo capture. Skip if a hero is already set on the brand
    // (force mode would otherwise create an orphan media_asset that
    // COALESCE drops on the way out — wasteful R2 write).
    let heroAssetId: string | null = null;
    if (ogMeta.image && fetchTarget && !existingHeroId) {
      heroAssetId = await captureLogoAsHeroAsset(siteId, brandId, brandName, fetchTarget, ogMeta.image);
    }

    // Status: "enriched" if any new useful data landed (claude url,
    // og description, or logo). "no_match" if nothing came back.
    const gotNewData = !!(claudeResult.url || ogMeta.description || heroAssetId);

    await sql`
      UPDATE brands
      SET
        url = COALESCE(brands.url, ${claudeResult.url}),
        description = COALESCE(brands.description, ${finalDescription}),
        hero_asset_id = COALESCE(brands.hero_asset_id, ${heroAssetId}),
        enrichment_status = ${gotNewData ? "enriched" : "no_match"},
        enriched_at = NOW(),
        enrichment_metadata = ${JSON.stringify({
          category: claudeResult.category,
          confidence: claudeResult.confidence,
          enriched_at: new Date().toISOString(),
          provider: "claude-sonnet-4-6",
          fetch_target: fetchTarget,
          stage_2_og_extracted: !!(ogMeta.description || ogMeta.image),
          stage_3_logo_captured: !!heroAssetId,
          og_title: ogMeta.title,
          og_image_url: ogMeta.image,
          force,
        })}::jsonb
      WHERE id = ${brandId}
    `;
  } catch (err) {
    await sql`
      UPDATE brands
      SET
        enrichment_status = 'failed',
        enrichment_metadata = ${JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          attempted_at: new Date().toISOString(),
        })}::jsonb
      WHERE id = ${brandId}
    `;
    throw err;
  }
}

async function askClaudeAboutBrand(brandName: string): Promise<EnrichResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const prompt = `What can you tell me about the brand "${brandName}"? This is a real-world business or product brand likely used by a contractor, kitchen remodeler, or service business.

Return ONLY valid JSON in this exact shape:
{
  "url": "https://example.com",
  "description": "1-2 sentence factual description of the brand",
  "category": "kitchen_fixtures | appliances | cabinetry | lighting | flooring | plumbing | hardware | tile | stone | other",
  "confidence": "high" | "medium" | "low"
}

Rules:
- URL must be the brand's primary website (homepage). Use https.
- Description should be factual, no marketing language.
- Category should be the closest fit from the list above.
- confidence="high" if you're certain this is a real brand and the URL is correct.
- confidence="low" if you're guessing — return null url in this case.
- If you don't recognize the brand at all, return: {"url": null, "description": null, "category": "other", "confidence": "low"}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as EnrichResult;

  // Refuse low-confidence URL claims to avoid pollution
  if (parsed.confidence === "low") {
    parsed.url = null;
  }

  return parsed;
}

/**
 * Stage 2: fetch the URL, extract Open Graph meta tags via regex.
 * Per imperfection tolerance principle, regex is fine for the common
 * case. Edge cases (multi-line meta, unusual quoting) → falls back to
 * Claude's description.
 */
async function fetchOGMeta(url: string): Promise<OGMeta> {
  try {
    const res = await fetch(url, {
      headers: {
        // Some sites gate on User-Agent — claim a normal browser
        "User-Agent": "Mozilla/5.0 (compatible; TracPostBot/1.0; +https://tracpost.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      // Bound the network call — brand pages should respond fast
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { title: null, description: null, image: null };
    const html = await res.text();
    return {
      title: extractMeta(html, "og:title") || extractTitleTag(html),
      description: extractMeta(html, "og:description") || extractMeta(html, "description"),
      image: resolveUrl(extractMeta(html, "og:image"), url),
    };
  } catch {
    return { title: null, description: null, image: null };
  }
}

function extractMeta(html: string, prop: string): string | null {
  // Try property attribute first (Open Graph), then name attribute (standard meta)
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]*\\b(?:property|name)=["']${escaped}["'][^>]*\\bcontent=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]*\\bcontent=["']([^"']+)["'][^>]*\\b(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return decodeHTMLEntities(match[1].trim());
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeHTMLEntities(match[1].trim()) : null;
}

function decodeHTMLEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'");
}

function resolveUrl(src: string | null, base: string): string | null {
  if (!src) return null;
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

/**
 * Stage 3: download og:image, upload to R2, create media_asset row,
 * return new asset id. Asset is created with archived_at set so it
 * stays out of the orchestrator pool — it's a reference asset for the
 * brand, not a publishable creative.
 */
async function captureLogoAsHeroAsset(
  siteId: string,
  brandId: string,
  brandName: string,
  brandUrl: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TracPostBot/1.0; +https://tracpost.com)",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
    // Reject non-image content types (some sites serve HTML on bad image URLs)
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    // Cap at 5MB — logos are typically small; protects against runaway bytes
    if (buffer.length > 5 * 1024 * 1024) return null;

    const ext = contentType.split("/")[1].split("+")[0] || "png";
    const key = `brand-logos/${brandId}.${ext}`;
    const storageUrl = await uploadBufferToR2(key, buffer, contentType);

    const assetId = randomUUID();
    await sql`
      INSERT INTO media_assets (
        id, site_id, storage_url, media_type, source,
        triage_status, archived_at, context_note, metadata, created_at
      )
      VALUES (
        ${assetId},
        ${siteId},
        ${storageUrl},
        ${contentType},
        'brand_logo',
        'pending_briefing',
        NOW(),
        ${`Logo for ${brandName} (auto-fetched from ${brandUrl})`},
        ${JSON.stringify({
          brand_id: brandId,
          source_image_url: imageUrl,
          source_brand_url: brandUrl,
          fetched_at: new Date().toISOString(),
        })}::jsonb,
        NOW()
      )
    `;
    return assetId;
  } catch {
    return null;
  }
}
