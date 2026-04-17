/**
 * Text overlay compositing using sharp + inline SVG.
 * Renders headline, CTA, and watermark text/logo onto images.
 */
import sharp from "sharp";
import { type TextOverlay, type OverlayPosition } from "./types";

function positionToGravity(pos: OverlayPosition): string {
  const map: Record<OverlayPosition, string> = {
    "top-left": "northwest",
    "top-right": "northeast",
    "bottom-left": "southwest",
    "bottom-right": "southeast",
    "center": "centre",
    "bottom-center": "south",
  };
  return map[pos] || "south";
}

function textToSvg(
  text: string,
  width: number,
  opts: {
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
  } = {},
): Buffer {
  const fontSize = opts.fontSize || 32;
  const fontWeight = opts.fontWeight || "bold";
  const color = opts.color || "#ffffff";
  const bgColor = opts.backgroundColor || "rgba(0,0,0,0.5)";
  const padding = 16;
  const maxWidth = width - padding * 4;

  const svg = `
    <svg width="${width}" height="${fontSize * 3 + padding * 2}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${padding}" y="0" width="${maxWidth + padding * 2}" height="${fontSize * 3 + padding * 2}"
            rx="8" fill="${bgColor}" />
      <text x="${padding * 2}" y="${fontSize + padding}"
            font-family="system-ui, sans-serif"
            font-size="${fontSize}" font-weight="${fontWeight}"
            fill="${color}">
        ${escapeXml(text.slice(0, 60))}
      </text>
    </svg>
  `;
  return Buffer.from(svg);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function applyTextOverlays(
  inputBuffer: Buffer,
  overlays: TextOverlay[],
): Promise<Buffer> {
  if (overlays.length === 0) return inputBuffer;

  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width || 1080;

  let pipeline = sharp(inputBuffer);

  for (const overlay of overlays) {
    const svgBuffer = textToSvg(overlay.text, width, {
      fontSize: overlay.fontSize,
      fontWeight: overlay.fontWeight,
      color: overlay.color,
      backgroundColor: overlay.backgroundColor,
    });

    pipeline = sharp(await pipeline.toBuffer()).composite([
      {
        input: svgBuffer,
        gravity: positionToGravity(overlay.position) as sharp.Gravity,
      },
    ]);
  }

  return pipeline.jpeg({ quality: 90 }).toBuffer();
}

export async function applyWatermark(
  inputBuffer: Buffer,
  logoBuffer: Buffer,
  position: OverlayPosition = "bottom-right",
): Promise<Buffer> {
  const metadata = await sharp(inputBuffer).metadata();
  const imgWidth = metadata.width || 1080;
  const logoSize = Math.round(imgWidth * 0.08);

  const resizedLogo = await sharp(logoBuffer)
    .resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .toBuffer();

  return sharp(inputBuffer)
    .composite([
      {
        input: resizedLogo,
        gravity: positionToGravity(position) as sharp.Gravity,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
