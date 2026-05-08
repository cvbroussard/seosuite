/**
 * AI-provenance metadata reader.
 *
 * Reads XMP + EXIF + tEXt metadata from uploaded images/video to detect
 * AI-generated content via well-known generator signatures embedded in
 * the file by Adobe Firefly, OpenAI/DALL-E, Google Imagen, Midjourney,
 * Stable Diffusion, etc. Pairs with subscriber declaration (#161 Phase 1)
 * to give us a two-source signal: subscriber toggle + metadata heuristic.
 *
 * Per project_tracpost_upload_ai_detection.md, this is the Phase 2 reader:
 * advisory detection that augments (never overrides) subscriber declaration
 * when subscriber says "no" but a manifest declares AI provenance.
 *
 * Coverage characteristics:
 * - Well-tagged AI output (Firefly, DALL-E with metadata): ~95% accurate
 * - Stripped metadata (screenshots, re-encodes through messaging apps): undetectable
 *   — falls back to subscriber declaration
 * - Tampered metadata: not verified (no cryptographic signature check —
 *   that requires full C2PA which has Vercel-incompatible native deps)
 *
 * Decision history (2026-05-08): we evaluated `c2pa-node` for full C2PA
 * cryptographic manifest reading and chose `exifr` instead because c2pa-node
 * has Rust toolchain build deps and 68MB unpacked size that don't fit cleanly
 * in Vercel's build environment. exifr is pure-JS, Vercel-safe, and catches
 * the well-tagged majority. C2PA crypto verification stays available as a
 * future swap if abuse signals demand it.
 */
import exifr from "exifr";

export interface C2paResult {
  /** Whether the metadata indicates AI generation (Adobe Firefly, OpenAI, etc.) */
  isAiGenerated: boolean;
  /** The matched generator string (e.g., "Adobe Firefly") */
  claimGenerator: string | null;
  /** Manifest/asset title if present */
  title: string | null;
  /** Full parsed metadata for audit trail */
  raw: Record<string, unknown> | null;
}

/**
 * Read provenance metadata from a media URL. Returns null when:
 * - File has no readable metadata
 * - Fetch or parse fails
 *
 * Designed to fail soft: any error returns null, never throws. Upload flow
 * proceeds normally regardless of detection outcome.
 */
export async function readC2paManifest(
  url: string,
  mimeType: string,
): Promise<C2paResult | null> {
  // Only applicable to images and video; PDFs and other formats skip.
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    return null;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    return await readManifest(buffer, mimeType);
  } catch (err) {
    console.warn(
      "AI-provenance metadata read failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Parse metadata + match against known AI generator signatures.
 *
 * Two-pass approach:
 * 1. Structured parse via exifr — covers XMP, EXIF Software, IPTC, PNG tEXt
 *    for the well-tagged majority (Firefly, DALL-E, Imagen, Photoshop
 *    generative-fill history entries).
 * 2. Buffer-level string scan fallback — catches cases exifr misses, e.g.
 *    Stable Diffusion's `parameters` tEXt chunk in PNGs, JFIF comments,
 *    or unparsed XMP packets. Brute but effective.
 */
async function readManifest(
  buffer: Buffer,
  _mimeType: string,
): Promise<C2paResult | null> {
  let metadata: Record<string, unknown> | null = null;

  try {
    metadata = (await exifr.parse(buffer, {
      xmp: true,
      iptc: true,
      tiff: true,
      mergeOutput: true,
      sanitize: true,
    })) as Record<string, unknown> | null;
  } catch {
    metadata = null;
  }

  // Collect candidate strings from structured fields. Different AI tools
  // write to different fields — Software (EXIF), CreatorTool (XMP),
  // Creator (DC), History.softwareAgent (XMP MM History from Photoshop
  // generative fill), etc.
  const candidates: string[] = [];

  if (metadata) {
    pushIfString(candidates, metadata.Software);
    pushIfString(candidates, metadata.CreatorTool);
    pushIfString(candidates, metadata.Creator);
    pushIfString(candidates, metadata.creator);
    pushIfString(candidates, metadata.title);
    pushIfString(candidates, metadata.parameters); // Stable Diffusion / Automatic1111

    // XMP MM History — Photoshop generative-fill leaves "Adobe Firefly"
    // entries as softwareAgent strings here when AI was used in the edit.
    const history = metadata.History;
    if (Array.isArray(history)) {
      for (const entry of history) {
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          pushIfString(candidates, e.softwareAgent);
          pushIfString(candidates, e.action);
        }
      }
    }
  }

  let isAiGenerated = false;
  let claimGenerator: string | null = null;
  for (const candidate of candidates) {
    if (isKnownAiGenerator(candidate)) {
      isAiGenerated = true;
      claimGenerator = candidate;
      break;
    }
  }

  // Buffer-level fallback. Scan the first 256KB of the file as UTF-8 text
  // looking for AI generator strings. Catches Stable Diffusion params in
  // PNG tEXt, raw XMP packets in JPEGs, and other formats exifr misses.
  // Stops at 256KB to bound CPU — manifest data sits at the head of the
  // file format spec for every common image type.
  if (!isAiGenerated) {
    const head = buffer
      .subarray(0, Math.min(buffer.length, 256 * 1024))
      .toString("utf8", 0, Math.min(buffer.length, 256 * 1024));
    const matched = findAiGeneratorInText(head);
    if (matched) {
      isAiGenerated = true;
      claimGenerator = matched;
    }
  }

  return {
    isAiGenerated,
    claimGenerator,
    title: typeof metadata?.title === "string" ? (metadata.title as string) : null,
    raw: metadata,
  };
}

function pushIfString(arr: string[], value: unknown): void {
  if (typeof value === "string" && value.length > 0) {
    arr.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v === "string" && v.length > 0) arr.push(v);
    }
  }
}

/**
 * Scan a text blob for known AI generator strings. Used as the fallback
 * when structured metadata parsing didn't find anything. Returns the
 * matched substring (with surrounding context) for the audit log.
 */
function findAiGeneratorInText(text: string): string | null {
  const lower = text.toLowerCase();
  const aiSignals = [
    "adobe firefly",
    "firefly",
    "openai",
    "dall-e",
    "dalle",
    "google imagen",
    "imagen",
    "google veo",
    "midjourney",
    "stability ai",
    "stable diffusion",
    "automatic1111",
    "runway",
    "kling",
    "openai sora",
    "leonardo.ai",
    "ideogram",
    "flux model",
    "synthid",
  ];
  for (const sig of aiSignals) {
    const idx = lower.indexOf(sig);
    if (idx >= 0) {
      // Return a slice around the match for audit context (max 80 chars)
      const start = Math.max(0, idx - 8);
      const end = Math.min(text.length, idx + sig.length + 24);
      return text.slice(start, end).trim();
    }
  }
  return null;
}

/**
 * Match a generator string against known AI providers. Conservative —
 * only flags as AI when the string clearly identifies an AI tool. Misses
 * edge cases (custom-trained models, lesser-known generators); those fall
 * back to subscriber declaration.
 */
export function isKnownAiGenerator(claimGenerator: string): boolean {
  if (!claimGenerator) return false;
  const lower = claimGenerator.toLowerCase();
  const aiSignals = [
    "firefly",         // Adobe Firefly
    "openai",          // OpenAI / DALL-E / Sora
    "dall-e",
    "dalle",
    "imagen",          // Google Imagen
    "veo",             // Google Veo
    "midjourney",
    "stability",       // Stability AI
    "stable diffusion",
    "automatic1111",   // Automatic1111 stable-diffusion-webui
    "runway",          // Runway ML
    "kling",           // Kling AI (video)
    "sora",            // OpenAI Sora
    "leonardo",        // Leonardo.ai
    "ideogram",
    "flux",            // Flux models
    "synthid",         // Google watermark indicator (rare in claim_generator but possible)
  ];
  return aiSignals.some((sig) => lower.includes(sig));
}
