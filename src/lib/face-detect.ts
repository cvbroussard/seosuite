/**
 * Face detection and embedding service using @vladmandic/face-api.
 *
 * Optimized for Vercel serverless — uses sharp for image decoding
 * and the WASM/JS TensorFlow backend (no native bindings).
 */
import { sql } from "@/lib/db";

let faceapi: typeof import("@vladmandic/face-api") | null = null;
let tf: typeof import("@tensorflow/tfjs") | null = null;
let modelsLoaded = false;

/**
 * Lazy-load face-api and TensorFlow to avoid import errors on Edge runtime.
 */
async function ensureLoaded() {
  if (modelsLoaded) return faceapi!;

  // Import pure JS TensorFlow (no native bindings)
  tf = await import("@tensorflow/tfjs");

  // Import face-api
  faceapi = await import("@vladmandic/face-api");

  // Load models from node_modules
  const path = await import("path");
  const modelPath = path.join(process.cwd(), "node_modules/@vladmandic/face-api/model");

  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);

  modelsLoaded = true;
  return faceapi;
}

export interface DetectedFace {
  embedding: number[];
  box: { x: number; y: number; width: number; height: number };
  score: number;
}

export interface FaceMatch {
  personaId: string;
  personaName: string;
  distance: number;
}

/**
 * Detect faces in an image and return embeddings.
 * Uses sharp for image decoding (works on Vercel, no canvas needed).
 */
export async function detectFaces(imageUrl: string): Promise<DetectedFace[]> {
  const api = await ensureLoaded();

  try {
    // Fetch image
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const buffer = Buffer.from(await res.arrayBuffer());

    // Decode with sharp to get raw pixel data
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(buffer)
      .resize({ width: 800, withoutEnlargement: true }) // Downscale for speed
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Create a tensor from raw pixels
    const tensor = tf!.tensor3d(
      new Uint8Array(data),
      [info.height, info.width, 3]
    );

    // Detect faces
    const detections = await api
      .detectAllFaces(tensor as unknown as HTMLCanvasElement)
      .withFaceLandmarks()
      .withFaceDescriptors();

    tensor.dispose();

    return detections.map((d) => ({
      embedding: Array.from(d.descriptor),
      box: {
        // Scale boxes back to original image coordinates
        x: Math.round(d.detection.box.x),
        y: Math.round(d.detection.box.y),
        width: Math.round(d.detection.box.width),
        height: Math.round(d.detection.box.height),
      },
      score: d.detection.score,
    }));
  } catch (err) {
    console.error("Face detection error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Euclidean distance between two embeddings.
 */
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

const MATCH_THRESHOLD = 0.6;

/**
 * Match detected faces against known personas for a site.
 */
export async function matchFaces(
  siteId: string,
  detectedFaces: DetectedFace[]
): Promise<{
  matched: Array<{ face: DetectedFace; persona: FaceMatch }>;
  unmatched: DetectedFace[];
}> {
  if (detectedFaces.length === 0) return { matched: [], unmatched: [] };

  const personas = await sql`
    SELECT id, name, metadata
    FROM personas
    WHERE site_id = ${siteId}
      AND metadata->>'face_embedding' IS NOT NULL
  `;

  const knownFaces = personas.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    embedding: JSON.parse((p.metadata as Record<string, unknown>).face_embedding as string) as number[],
  }));

  const matched: Array<{ face: DetectedFace; persona: FaceMatch }> = [];
  const unmatched: DetectedFace[] = [];

  for (const face of detectedFaces) {
    let bestMatch: FaceMatch | null = null;
    let bestDistance = Infinity;

    for (const known of knownFaces) {
      const distance = euclideanDistance(face.embedding, known.embedding);
      if (distance < MATCH_THRESHOLD && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = {
          personaId: known.id,
          personaName: known.name,
          distance,
        };
      }
    }

    if (bestMatch) {
      matched.push({ face, persona: bestMatch });
    } else {
      unmatched.push(face);
    }
  }

  return { matched, unmatched };
}

/**
 * Process faces for an asset: detect, match, auto-tag, store data.
 */
export async function processFaces(
  assetId: string,
  siteId: string,
  imageUrl: string
): Promise<{ matched: number; unmatched: number }> {
  const faces = await detectFaces(imageUrl);
  if (faces.length === 0) return { matched: 0, unmatched: 0 };

  const { matched, unmatched } = await matchFaces(siteId, faces);

  // Auto-tag matched personas
  for (const m of matched) {
    await sql`
      INSERT INTO asset_personas (asset_id, persona_id)
      VALUES (${assetId}, ${m.persona.personaId})
      ON CONFLICT DO NOTHING
    `;
  }

  // Store face data on the asset
  const faceData = {
    faces: faces.map((f, i) => {
      const match = matched.find((m) => m.face === f);
      return {
        box: f.box,
        score: f.score,
        personaId: match?.persona.personaId || null,
        personaName: match?.persona.personaName || null,
        distance: match?.persona.distance || null,
        embedding: f.embedding,
        index: i,
      };
    }),
    processedAt: new Date().toISOString(),
  };

  await sql`
    UPDATE media_assets
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ faces: faceData })}::jsonb
    WHERE id = ${assetId}
  `;

  return { matched: matched.length, unmatched: unmatched.length };
}

/**
 * Store a face embedding on a persona record.
 */
export async function setPersonaEmbedding(
  personaId: string,
  embedding: number[]
): Promise<void> {
  await sql`
    UPDATE personas
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ face_embedding: JSON.stringify(embedding) })}::jsonb
    WHERE id = ${personaId}
  `;
}
