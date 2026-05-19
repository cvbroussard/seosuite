/**
 * Face transforms for the variant render pipeline.
 *
 * Applies the subscriber's site-level face_policy to a source image
 * buffer BEFORE the variant's crop/resize happens. By the time the
 * transformed buffer reaches sharp's resize step, faces are already
 * blurred / boxed / left alone per policy — the downstream crop just
 * works on the privacy-protected pixels.
 *
 * Effective-policy resolution (locked 2026-05-19):
 *   - 'asis' + face_waiver_signed_at NULL  →  fall back to 'blur'
 *   - 'asis' + face_waiver_signed_at set   →  pass through
 *   - 'blur' / 'box'                        →  apply directly
 *   - 'suppress'                            →  caller skips render
 *
 * AI-generated assets are skipped upstream (face detection never ran
 * at upload time, so face_detection metadata is absent and we have
 * nothing to transform).
 *
 * Image only in v1. Video face handling deferred (poster-frame
 * detection doesn't track motion; full-runtime detection is its own
 * project).
 */
import "server-only";
import sharp from "sharp";

export type EffectiveFacePolicy = "asis" | "blur" | "box" | "suppress";

export interface DetectedFaceBox {
  box: { x: number; y: number; w: number; h: number }; // normalized 0..1
  confidence: number;
}

/**
 * Resolve the stored site policy + waiver state into an effective
 * policy. The fall-back-to-conservative rule lives here.
 */
export function resolveFacePolicy(
  storedPolicy: string,
  waiverSignedAt: Date | string | null,
): EffectiveFacePolicy {
  if (storedPolicy === "asis") {
    return waiverSignedAt ? "asis" : "blur";
  }
  if (storedPolicy === "blur" || storedPolicy === "box" || storedPolicy === "suppress") {
    return storedPolicy;
  }
  // Unknown / corrupt policy value → conservative fallback
  return "blur";
}

/**
 * Apply face transforms to an image buffer per effective policy.
 *
 * - 'asis': returns buffer unchanged
 * - 'blur': blurs each face region with strong gaussian (sigma 20)
 * - 'box':  fills each face region with solid black rectangle
 * - 'suppress': throws — caller MUST check before invoking
 *
 * Faces with confidence < 0.5 are ignored (Rekognition can return
 * weak hits; we don't want false positives blurring random regions).
 *
 * Bounding boxes are normalized [0..1] and scaled to the actual image
 * dimensions on the fly.
 */
export async function applyFaceTransforms(
  imageBuffer: Buffer,
  faces: DetectedFaceBox[],
  policy: EffectiveFacePolicy,
): Promise<Buffer> {
  if (policy === "suppress") {
    throw new Error("applyFaceTransforms called with 'suppress' policy — caller must skip render");
  }

  // No transform needed
  if (policy === "asis" || faces.length === 0) {
    return imageBuffer;
  }

  const strongFaces = faces.filter((f) => f.confidence >= 0.5);
  if (strongFaces.length === 0) return imageBuffer;

  // Get image dimensions to scale normalized boxes to pixel coords
  const metadata = await sharp(imageBuffer).rotate().metadata();
  const imgWidth = metadata.width;
  const imgHeight = metadata.height;
  if (!imgWidth || !imgHeight) {
    // Can't determine dimensions — return unchanged rather than risk
    // bad transforms. Caller's existing behavior handles unknown size.
    return imageBuffer;
  }

  if (policy === "box") {
    return applyBoxOverlay(imageBuffer, strongFaces, imgWidth, imgHeight);
  }

  // 'blur' path: extract each face region, blur it, composite back
  return applyBlurToRegions(imageBuffer, strongFaces, imgWidth, imgHeight);
}

/**
 * Black-rectangle overlay per face. Sharp's composite with create:
 * solid color works here.
 */
async function applyBoxOverlay(
  imageBuffer: Buffer,
  faces: DetectedFaceBox[],
  imgWidth: number,
  imgHeight: number,
): Promise<Buffer> {
  const overlays = faces.map((f) => {
    const px = Math.max(0, Math.round(f.box.x * imgWidth));
    const py = Math.max(0, Math.round(f.box.y * imgHeight));
    const pw = Math.min(imgWidth - px, Math.round(f.box.w * imgWidth));
    const ph = Math.min(imgHeight - py, Math.round(f.box.h * imgHeight));
    return {
      input: {
        create: {
          width: pw,
          height: ph,
          channels: 4 as const,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
      },
      left: px,
      top: py,
    };
  });

  return sharp(imageBuffer).rotate().composite(overlays).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/**
 * Gaussian blur per face region. Strategy: extract each face crop,
 * blur it heavily, composite back on top of the original. Sharp can't
 * blur a specific region directly — extract+blur+composite is the
 * idiom.
 *
 * Extract regions are slightly EXPANDED (10% padding) so the blur
 * coverage extends a bit beyond the strict box. Prevents a sharp edge
 * just outside the box where part of the face spills out of
 * Rekognition's detection.
 */
async function applyBlurToRegions(
  imageBuffer: Buffer,
  faces: DetectedFaceBox[],
  imgWidth: number,
  imgHeight: number,
): Promise<Buffer> {
  // First normalize orientation so subsequent extract math is correct
  const oriented = await sharp(imageBuffer).rotate().toBuffer();

  // Build blurred-region overlays
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const f of faces) {
    const padX = f.box.w * 0.1;
    const padY = f.box.h * 0.1;
    const x = Math.max(0, f.box.x - padX);
    const y = Math.max(0, f.box.y - padY);
    const w = Math.min(1 - x, f.box.w + 2 * padX);
    const h = Math.min(1 - y, f.box.h + 2 * padY);

    const px = Math.max(0, Math.round(x * imgWidth));
    const py = Math.max(0, Math.round(y * imgHeight));
    const pw = Math.max(1, Math.min(imgWidth - px, Math.round(w * imgWidth)));
    const ph = Math.max(1, Math.min(imgHeight - py, Math.round(h * imgHeight)));

    const blurred = await sharp(oriented)
      .extract({ left: px, top: py, width: pw, height: ph })
      .blur(20) // Sigma 20 = strong, faces unrecognizable
      .toBuffer();

    overlays.push({ input: blurred, left: px, top: py });
  }

  return sharp(oriented).composite(overlays).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
