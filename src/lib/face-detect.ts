/**
 * Face detection — pixel-level + age range, no identification.
 *
 * Resurrected 2026-05-19 as a detection-only helper. The prior version
 * (retired with the personas entity) also did indexFace + searchFaces
 * against a per-site biometric collection to identify WHO was in each
 * frame. That capability is gone. We never want to know whose face is
 * in the asset; we only want to know that faces ARE in the asset and
 * which ones may be minors, so the privacy pipeline can apply the
 * subscriber's face_policy + minor_face_policy per-face.
 *
 * Attributes: 'ALL' since 2026-05-19 — captures AgeRange so the
 * minor face policy (migration 133) can route per-face treatment.
 * AWS also returns gender/emotion/pose under ALL; we ignore those
 * fields and never persist them. Only AgeRange flows into the
 * pipeline as is_potential_minor. The bump from DEFAULT → ALL
 * doubles per-call cost from ~$0.0005 to ~$0.001/face — still tiny.
 *
 * Cost: ~$0.001 per image. Used at upload time (one-time-per-asset)
 * and never re-run on re-analysis — face presence is a pixel fact, not
 * an interpretation that changes with new transcripts.
 *
 * AI-generated assets are skipped upstream — synthetic faces aren't
 * real-person likenesses, so the privacy policy has nothing to
 * protect against.
 */
import "server-only";
import { RekognitionClient, DetectFacesCommand } from "@aws-sdk/client-rekognition";

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

export interface DetectedFace {
  /** Normalized bounding box [0..1]. Renderer scales to any output size. */
  box: { x: number; y: number; w: number; h: number };
  /** Detection confidence 0..1. Subscriber-facing UI may filter weak hits. */
  confidence: number;
  /** Estimated age range from Rekognition AgeRange (years). Used to
   * route per-face policy: face_policy vs minor_face_policy. */
  age_low: number;
  age_high: number;
  /** Computed flag: AgeRange.Low < MINOR_AGE_THRESHOLD. Pre-computed
   * here so the render pipeline doesn't need to re-apply the threshold
   * (which could drift if the threshold ever moves). */
  is_potential_minor: boolean;
}

/** Age threshold for flagging a face as potential minor. 18 is the
 * common legal cutoff in the US; we err on the side of catching
 * borderline cases. Rekognition AgeRange estimation has known false-
 * positive rate (young-looking adults flagged as minors, late teens
 * occasionally missed) — subscriber can verify per-asset via the
 * Privacy section in the modal. */
const MINOR_AGE_THRESHOLD = 18;

export interface FaceDetectionResult {
  face_count: number;
  faces: DetectedFace[];
  detected_at: string;
  provider: "aws-rekognition-detect";
}

/**
 * Detect faces in an image URL. Returns empty array on failure — never
 * throws (callers treat absent metadata as "unknown — apply policy
 * fallback"). Logs the error for observability.
 */
export async function detectFaces(imageUrl: string): Promise<FaceDetectionResult> {
  const result: FaceDetectionResult = {
    face_count: 0,
    faces: [],
    detected_at: new Date().toISOString(),
    provider: "aws-rekognition-detect",
  };

  if (!imageUrl) return result;

  try {
    // Fetch image bytes — Rekognition accepts S3 refs or raw bytes;
    // we pass raw bytes since our assets live on R2, not S3.
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn(`face-detect: fetch failed for ${imageUrl} (${res.status})`);
      return result;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    const command = new DetectFacesCommand({
      Image: { Bytes: buf },
      // 'ALL' attributes captures AgeRange (load-bearing for the
      // minor face policy routing). Also returns gender/emotion/pose
      // which we ignore and never persist — only AgeRange flows
      // downstream. The cost bump from DEFAULT → ALL doubles per-call
      // price (~$0.0005 → ~$0.001) but absolute numbers are tiny.
      Attributes: ["ALL"],
    });

    const response = await rekognition.send(command);
    const details = response.FaceDetails || [];

    result.face_count = details.length;
    result.faces = details
      .map((face) => {
        const bbox = face.BoundingBox;
        if (
          bbox == null ||
          bbox.Left == null ||
          bbox.Top == null ||
          bbox.Width == null ||
          bbox.Height == null
        ) {
          return null;
        }
        const ageLow = face.AgeRange?.Low ?? 0;
        const ageHigh = face.AgeRange?.High ?? 0;
        return {
          box: {
            x: bbox.Left,
            y: bbox.Top,
            w: bbox.Width,
            h: bbox.Height,
          },
          // Rekognition returns 0-100; normalize to 0-1 for downstream consumers
          confidence: (face.Confidence || 0) / 100,
          age_low: ageLow,
          age_high: ageHigh,
          is_potential_minor: ageLow < MINOR_AGE_THRESHOLD,
        };
      })
      .filter((f): f is DetectedFace => f !== null);

    return result;
  } catch (err) {
    console.warn(
      `face-detect: detection failed for ${imageUrl}:`,
      err instanceof Error ? err.message : err,
    );
    return result;
  }
}

/**
 * Predicate: should this asset get face detection at all?
 *
 * Returns false for AI-generated content (subscriber-declared or C2PA-
 * verified per #161) because synthetic faces aren't real-person
 * likenesses — the privacy framework has nothing to protect against.
 *
 * Trust the declaration model (matches the existing AI disclosure
 * trust posture for platform compliance flags). If subscriber labels
 * an AI-modified real photo as ai_generated, that's their declaration;
 * edge case is their responsibility.
 */
export function shouldDetectFaces(asset: {
  media_type: string;
  metadata: Record<string, unknown> | null;
}): boolean {
  // Only image assets in v1 — video detection works only on the poster
  // frame, which is a misleading partial signal (faces move). Defer to
  // piece 4 when we handle the variant render side.
  if (!asset.media_type?.startsWith("image")) return false;

  // Skip AI-generated content — no real-person likeness to protect
  const aiGenerated = (asset.metadata as Record<string, unknown> | null)?.ai_generated;
  if (aiGenerated === true) return false;

  return true;
}
