/**
 * Face detection and embedding service using @vladmandic/face-api.
 *
 * Detects faces in images, generates 128-dimensional embeddings for matching.
 * Runs in Node.js using the canvas package for image decoding.
 */
import * as faceapi from "@vladmandic/face-api";
import canvas from "canvas";
import { sql } from "@/lib/db";
import path from "path";

const { Canvas, Image, ImageData } = canvas;

// Patch face-api to use node-canvas
// @ts-expect-error — face-api expects browser Canvas types
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let modelsLoaded = false;

/**
 * Load face detection models from node_modules.
 */
async function ensureModels() {
  if (modelsLoaded) return;
  const modelPath = path.join(process.cwd(), "node_modules/@vladmandic/face-api/model");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
  modelsLoaded = true;
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
 */
export async function detectFaces(imageUrl: string): Promise<DetectedFace[]> {
  await ensureModels();

  // Fetch and decode image
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const buffer = Buffer.from(await res.arrayBuffer());

  const img = await canvas.loadImage(buffer);
  const cvs = canvas.createCanvas(img.width, img.height);
  const ctx = cvs.getContext("2d");
  ctx.drawImage(img, 0, 0);

  // Detect all faces with landmarks and embeddings
  const detections = await faceapi
    .detectAllFaces(cvs as unknown as HTMLCanvasElement)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map((d) => ({
    embedding: Array.from(d.descriptor),
    box: {
      x: Math.round(d.detection.box.x),
      y: Math.round(d.detection.box.y),
      width: Math.round(d.detection.box.width),
      height: Math.round(d.detection.box.height),
    },
    score: d.detection.score,
  }));
}

/**
 * Cosine similarity between two embedding vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Euclidean distance between two embeddings (face-api standard).
 */
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

const MATCH_THRESHOLD = 0.6; // face-api uses euclidean distance — lower = closer match

/**
 * Match detected faces against known personas for a site.
 * Returns matched persona IDs and unmatched face embeddings.
 */
export async function matchFaces(
  siteId: string,
  detectedFaces: DetectedFace[]
): Promise<{
  matched: Array<{ face: DetectedFace; persona: FaceMatch }>;
  unmatched: DetectedFace[];
}> {
  if (detectedFaces.length === 0) return { matched: [], unmatched: [] };

  // Fetch all personas with stored embeddings for this site
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
 * Process faces for an asset: detect, match, auto-tag, store unknowns.
 * Called during triage/processing pipeline.
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

  // Store face data on the asset for UI (naming unknowns, reviewing matches)
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
 * Called when a tenant names an unknown face.
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
