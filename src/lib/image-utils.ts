import sharp from "sharp";

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
