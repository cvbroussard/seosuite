/**
 * Face transforms for the variant render pipeline.
 *
 * Applies the subscriber's site-level face policies (adult + minor) to a
 * source image buffer BEFORE the variant's crop/resize happens. Each
 * detected face is routed to one of two policies based on the
 * is_potential_minor flag from AWS Rekognition's AgeRange (set in
 * face-detect.ts when AgeRange.Low < 18).
 *
 * Effective-policy resolution (per axis):
 *   - 'asis' + waiver NULL  →  fall back to 'blur'
 *   - 'asis' + waiver set   →  pass through
 *   - 'blur' / 'box'         →  apply directly
 *   - 'suppress'             →  caller skips render (per-axis check)
 *
 * Per-face routing rules:
 *   - is_potential_minor=true  →  minor_face_policy applies
 *   - is_potential_minor=false →  face_policy applies
 *
 * Suppress is asset-level, not per-face. If ANY face in the asset
 * resolves to 'suppress', the caller skips the render entirely — we
 * can't partially honor a "don't publish faces" promise.
 *
 * AI-generated assets are skipped upstream.
 * Image only in v1. Video face handling deferred.
 */
import "server-only";
import sharp from "sharp";

export type EffectiveFacePolicy = "asis" | "blur" | "box" | "suppress";

export interface DetectedFaceBox {
  box: { x: number; y: number; w: number; h: number }; // normalized 0..1
  confidence: number;
  /** Optional — present when face-detect.ts ran with Attributes:['ALL'].
   * Absent for legacy faces detected before 2026-05-19; those are
   * treated as adult (conservative fallback documented below). */
  is_potential_minor?: boolean;
  age_low?: number;
  age_high?: number;
}

/**
 * Resolve a stored policy + waiver state into an effective policy.
 * The fall-back-to-conservative rule lives here. Same logic applies
 * for both the adult and minor face axes.
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
  return "blur";
}

/**
 * Decide whether the render should be skipped entirely based on the
 * combination of detected faces and resolved per-axis policies.
 *
 * Returns a reason string if suppress fires, or null if the render
 * should proceed.
 *
 * Why suppress is asset-level not per-face: blurring one face while
 * publishing the asset would still publish the suppressed face's
 * presence (clothing, posture, context) — that's not what "don't
 * publish images with faces of this category" means. The whole asset
 * gets shelved.
 *
 * Legacy assets without is_potential_minor flags (detection ran
 * before the 2026-05-19 AgeRange flip) are treated as adult — the
 * conservative choice given that pre-flip subscribers had effectively
 * the same adult-only policy.
 */
export function checkSuppressGate(
  faces: DetectedFaceBox[],
  adultPolicy: EffectiveFacePolicy,
  minorPolicy: EffectiveFacePolicy,
): string | null {
  const strongFaces = faces.filter((f) => f.confidence >= 0.5);
  if (strongFaces.length === 0) return null;

  const minorCount = strongFaces.filter((f) => f.is_potential_minor === true).length;
  const adultCount = strongFaces.length - minorCount;

  if (minorCount > 0 && minorPolicy === "suppress") {
    return `minor_face_policy='suppress' + ${minorCount} potential minor face(s) detected`;
  }
  if (adultCount > 0 && adultPolicy === "suppress") {
    return `face_policy='suppress' + ${adultCount} adult face(s) detected`;
  }
  return null;
}

/**
 * Apply per-face transforms to an image buffer. Each face is routed to
 * one of two policies (adult or minor) based on is_potential_minor.
 *
 * Faces with confidence < 0.5 are ignored (Rekognition can return weak
 * hits; we don't want false positives blurring random regions).
 *
 * Caller MUST check checkSuppressGate() first — this function throws
 * if either policy is 'suppress' (asset-level skip didn't happen
 * upstream).
 */
export async function applyFaceTransforms(
  imageBuffer: Buffer,
  faces: DetectedFaceBox[],
  adultPolicy: EffectiveFacePolicy,
  minorPolicy: EffectiveFacePolicy,
): Promise<Buffer> {
  if (adultPolicy === "suppress" || minorPolicy === "suppress") {
    throw new Error(
      "applyFaceTransforms called with 'suppress' policy — caller must skip render",
    );
  }

  const strongFaces = faces.filter((f) => f.confidence >= 0.5);
  if (strongFaces.length === 0) return imageBuffer;

  // Partition into minor/adult and per-action buckets. Adult-asis +
  // minor-asis means no transform needed for that face. Box + blur
  // groups by destination treatment regardless of which axis routed them.
  const boxFaces: DetectedFaceBox[] = [];
  const blurFaces: DetectedFaceBox[] = [];

  for (const f of strongFaces) {
    const isMinor = f.is_potential_minor === true;
    const policy = isMinor ? minorPolicy : adultPolicy;
    if (policy === "box") boxFaces.push(f);
    else if (policy === "blur") blurFaces.push(f);
    // 'asis' faces drop through unmodified
  }

  if (boxFaces.length === 0 && blurFaces.length === 0) {
    return imageBuffer;
  }

  const metadata = await sharp(imageBuffer).rotate().metadata();
  const imgWidth = metadata.width;
  const imgHeight = metadata.height;
  if (!imgWidth || !imgHeight) {
    return imageBuffer;
  }

  // Single pipeline that handles both treatments: blur regions composited
  // first (so any box-overlay sits cleanly on top in the rare mixed case),
  // then box overlays on top.
  let oriented = await sharp(imageBuffer).rotate().toBuffer();

  if (blurFaces.length > 0) {
    oriented = await applyBlurToRegions(oriented, blurFaces, imgWidth, imgHeight);
  }
  if (boxFaces.length > 0) {
    oriented = await applyBoxOverlay(oriented, boxFaces, imgWidth, imgHeight);
  }

  return oriented;
}

/**
 * Black-rectangle overlay per face.
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

  return sharp(imageBuffer).composite(overlays).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/**
 * Gaussian blur per face region. Strategy: extract each face crop,
 * blur it heavily, composite back on top of the original. Sharp can't
 * blur a specific region directly — extract+blur+composite is the
 * idiom.
 *
 * Extract regions are slightly EXPANDED (10% padding) so the blur
 * coverage extends a bit beyond the strict box.
 */
async function applyBlurToRegions(
  imageBuffer: Buffer,
  faces: DetectedFaceBox[],
  imgWidth: number,
  imgHeight: number,
): Promise<Buffer> {
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

    const blurred = await sharp(imageBuffer)
      .extract({ left: px, top: py, width: pw, height: ph })
      .blur(20)
      .toBuffer();

    overlays.push({ input: blurred, left: px, top: py });
  }

  return sharp(imageBuffer).composite(overlays).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
