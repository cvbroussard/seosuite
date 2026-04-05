import sharp from "sharp";
import exifReader from "exif-reader";

/**
 * Convert an image buffer to JPEG if it's HEIC/HEIF or other non-web format.
 * Returns the original buffer if already JPEG/PNG/WebP.
 */
export async function ensureWebFormat(
  buffer: Buffer,
  mimeType: string
): Promise<{ data: Buffer; mimeType: string }> {
  const needsConversion =
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    mimeType === "image/tiff" ||
    mimeType === "image/bmp";

  if (!needsConversion) {
    return { data: buffer, mimeType };
  }

  try {
    const converted = await sharp(buffer)
      .jpeg({ quality: 90 })
      .toBuffer();
    return { data: converted, mimeType: "image/jpeg" };
  } catch {
    // Sharp can't handle HEIC without libheif — fall back to Gemini
    if (mimeType === "image/heic" || mimeType === "image/heif") {
      return convertViaGemini(buffer, mimeType);
    }
    throw new Error(`Sharp conversion failed for ${mimeType}`);
  }
}

/**
 * Fall back to Gemini for HEIC conversion when sharp lacks codec support.
 */
async function convertViaGemini(
  buffer: Buffer,
  mimeType: string
): Promise<{ data: Buffer; mimeType: string }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("No GOOGLE_AI_API_KEY for HEIC conversion");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: buffer.toString("base64") } },
            { text: "Output this exact image with no changes." },
          ],
        }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!res.ok) throw new Error(`Gemini HEIC conversion failed: ${res.status}`);

  const data = await res.json();
  const imgPart = data.candidates?.[0]?.content?.parts?.find(
    (p: Record<string, unknown>) => p.inlineData
  );
  if (!imgPart?.inlineData?.data) throw new Error("Gemini returned no image data");

  return {
    data: Buffer.from(imgPart.inlineData.data, "base64"),
    mimeType: imgPart.inlineData.mimeType || "image/png",
  };
}

export interface ExifData {
  dateTaken: string | null;
  lat: number | null;
  lng: number | null;
  camera: string | null;
}

/**
 * Extract EXIF metadata from an image URL.
 * Returns date taken, GPS coordinates, and camera info.
 */
export async function extractExif(url: string): Promise<ExifData> {
  const result: ExifData = { dateTaken: null, lat: null, lng: null, camera: null };

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return result;

    const buffer = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    if (!metadata.exif) return result;

    const exif = exifReader(metadata.exif) as unknown as Record<string, Record<string, unknown>>;

    // Date taken
    const dateOriginal = exif.exif?.DateTimeOriginal as Date | undefined;
    const dateDigitized = exif.exif?.DateTimeDigitized as Date | undefined;
    const dateTime = exif.image?.DateTime as Date | undefined;
    const date = dateOriginal || dateDigitized || dateTime;
    if (date && date instanceof Date && date.getFullYear() >= 2000 && date <= new Date()) {
      result.dateTaken = date.toISOString();
    }

    // GPS coordinates
    const gps = exif.gps as Record<string, unknown> | undefined;
    if (gps?.GPSLatitude && gps?.GPSLongitude) {
      const lat = gps.GPSLatitude as number;
      const lng = gps.GPSLongitude as number;
      const latRef = (gps.GPSLatitudeRef as string) || "N";
      const lngRef = (gps.GPSLongitudeRef as string) || "E";
      result.lat = latRef === "S" ? -lat : lat;
      result.lng = lngRef === "W" ? -lng : lng;
    }

    // Camera
    const make = (exif.image?.Make as string) || "";
    const model = (exif.image?.Model as string) || "";
    if (make || model) {
      result.camera = [make, model].filter(Boolean).join(" ").trim();
    }

    return result;
  } catch {
    return result;
  }
}

/**
 * Convert an image from a URL to web-safe format if needed.
 * Downloads, converts if HEIC/HEIF, returns buffer + mime type.
 */
export async function fetchAndConvert(
  url: string
): Promise<{ data: Buffer; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";

  return ensureWebFormat(buffer, contentType);
}
