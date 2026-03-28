/**
 * AI photo enhancement — replaces Lightroom post-production.
 * Runs every uploaded photo through Gemini with the site's image style
 * plus professional post-production directives.
 */

import { editEditorialImage } from "./gemini";
import { uploadBufferToR2 } from "@/lib/r2";
import { sql } from "@/lib/db";

const POST_PRODUCTION_PROMPT = `Enhance this photograph to professional publication quality. Apply these post-production adjustments:

EXPOSURE & TONE:
- Balanced dynamic range — recover blown highlights, lift crushed shadows
- Gentle highlight compression to retain detail in bright areas
- Open up shadow detail without washing out blacks
- Preserve natural contrast — don't flatten the image

COLOR:
- Neutral warm white balance — remove any color casts
- Rich, natural color saturation without oversaturation
- Consistent skin tones if people are present
- Clean whites, true blacks

CLARITY & DETAIL:
- Micro-contrast enhancement for material textures (wood grain, metal, tile, stone)
- Subtle sharpening — crisp but not crunchy
- Noise reduction if visible, especially in shadow areas
- Clean lens correction — remove any barrel distortion or chromatic aberration

COMPOSITION:
- Keep the scene, layout, and all elements exactly as they are
- Do NOT add, remove, or rearrange any objects
- Do NOT change the camera angle or perspective
- Only enhance what the camera captured

OUTPUT STYLE:`;

/**
 * Enhance a media asset photo to production quality.
 * Uses the site's image_style as the target aesthetic.
 * Stores the enhanced version and updates the asset record.
 */
export async function enhanceAssetPhoto(
  assetId: string
): Promise<string | null> {
  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.media_type,
           s.image_style
    FROM media_assets ma
    JOIN sites s ON s.id = ma.site_id
    WHERE ma.id = ${assetId}
  `;

  if (!asset) return null;
  if ((asset.media_type as string) !== "image") return null;

  const sourceUrl = asset.storage_url as string;
  if (!sourceUrl) return null;

  // Build enhancement prompt: post-production + site style
  const siteStyle = (asset.image_style as string) || "Clean, editorial style. Natural lighting.";
  const fullPrompt = `${POST_PRODUCTION_PROMPT} ${siteStyle}`;

  const result = await editEditorialImage(sourceUrl, fullPrompt);
  if (!result) return null;

  // Upload enhanced version to R2
  const ext = result.mimeType.includes("png") ? "png" : "jpg";
  const key = `sites/${asset.site_id}/enhanced/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const enhancedUrl = await uploadBufferToR2(key, result.data, result.mimeType);

  // Store enhanced URL on the asset — keep original as source
  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
      enhanced_url: enhancedUrl,
      original_url: sourceUrl,
    })}::jsonb
    WHERE id = ${assetId}
  `;

  return enhancedUrl;
}
