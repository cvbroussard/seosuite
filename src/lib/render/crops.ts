/**
 * Platform-aware smart cropping using sharp.
 * Uses attention-based strategy to keep the subject centered.
 */
import sharp from "sharp";
import { type AspectRatio, ASPECT_DIMENSIONS } from "./types";

export async function cropForPlatform(
  inputBuffer: Buffer,
  aspect: AspectRatio,
): Promise<Buffer> {
  const { w, h } = ASPECT_DIMENSIONS[aspect];

  return sharp(inputBuffer)
    .resize(w, h, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}
