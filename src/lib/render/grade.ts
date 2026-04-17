/**
 * Auto color grading using sharp. Adjusts brightness, saturation,
 * and hue based on the brand playbook's grade preset. Includes
 * HDR recovery (normalize) for high-contrast scenes.
 */
import sharp from "sharp";
import { type GradePreset } from "./types";

interface GradeParams {
  brightness: number;
  saturation: number;
  hue: number;
  normalize: boolean;
}

const PRESETS: Record<GradePreset, GradeParams> = {
  warm_bright: { brightness: 1.05, saturation: 1.15, hue: 10, normalize: false },
  warm_natural: { brightness: 1.02, saturation: 1.08, hue: 5, normalize: false },
  cool_crisp: { brightness: 1.03, saturation: 1.05, hue: -10, normalize: false },
  clean_natural: { brightness: 1.0, saturation: 1.0, hue: 0, normalize: false },
  auto: { brightness: 1.03, saturation: 1.1, hue: 0, normalize: true },
};

export async function applyGrade(
  inputBuffer: Buffer,
  preset: GradePreset,
): Promise<Buffer> {
  const params = PRESETS[preset] || PRESETS.auto;
  let pipeline = sharp(inputBuffer);

  if (params.normalize) {
    pipeline = pipeline.normalize();
  }

  pipeline = pipeline.modulate({
    brightness: params.brightness,
    saturation: params.saturation,
    hue: params.hue,
  });

  return pipeline.jpeg({ quality: 90 }).toBuffer();
}
