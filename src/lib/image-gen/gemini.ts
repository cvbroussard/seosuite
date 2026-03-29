/**
 * Gemini image generation client (Nano Banana).
 * Uses Gemini 2.5 Flash Image for editorial blog images.
 */

const GEMINI_MODEL = "gemini-2.5-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeneratedImage {
  data: Buffer;
  mimeType: string;
}

/**
 * Generate an editorial image from a text prompt.
 * Returns raw image bytes for upload to R2.
 */
export async function generateEditorialImage(
  prompt: string,
  aspectRatio: string = "16:9"
): Promise<GeneratedImage | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("GOOGLE_AI_API_KEY not set — skipping image generation");
    return null;
  }

  try {
    const res = await fetch(
      `${API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }],
          }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio,
              imageSize: "1K",
            },
          },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.warn("Gemini image gen failed:", res.status, err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    // Gemini returns camelCase: inlineData, not inline_data
    const imagePart = parts.find(
      (p: Record<string, unknown>) => p.inlineData || p.inline_data
    );

    const imageData = imagePart?.inlineData || imagePart?.inline_data;
    if (!imageData?.data) {
      console.warn("Gemini returned no image data");
      return null;
    }

    return {
      data: Buffer.from(imageData.data, "base64"),
      mimeType: imageData.mimeType || imageData.mime_type || "image/png",
    };
  } catch (err) {
    console.warn(
      "Gemini image gen error:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Edit an existing image with a text instruction.
 * Sends the image + instruction to Gemini, which modifies in place.
 * Use for tweaks like "remove the sign", "change text to X", "remove person on left".
 */
export async function editEditorialImage(
  imageUrl: string,
  instruction: string
): Promise<GeneratedImage | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  try {
    // Fetch the existing image, convert HEIC if needed
    const { fetchAndConvert } = await import("@/lib/image-utils");
    let imgBuffer: Buffer;
    let imgMimeType: string;
    try {
      const converted = await fetchAndConvert(imageUrl);
      imgBuffer = converted.data;
      imgMimeType = converted.mimeType;
    } catch (err) {
      console.warn("Failed to fetch image for editing:", err instanceof Error ? err.message : err);
      return null;
    }
    const imgBase64 = imgBuffer.toString("base64");

    const res = await fetch(
      `${API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inlineData: {
                  mimeType: imgMimeType,
                  data: imgBase64,
                },
              },
              {
                text: `Edit this image: ${instruction}. Keep everything else unchanged.`,
              },
            ],
          }],
          generationConfig: {
            responseModalities: ["IMAGE"],
          },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.warn("Gemini image edit failed:", res.status, err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(
      (p: Record<string, unknown>) => p.inlineData || p.inline_data
    );

    const imageData = imagePart?.inlineData || imagePart?.inline_data;
    if (!imageData?.data) {
      console.warn("Gemini edit returned no image data");
      return null;
    }

    return {
      data: Buffer.from(imageData.data, "base64"),
      mimeType: imageData.mimeType || imageData.mime_type || "image/png",
    };
  } catch (err) {
    console.warn(
      "Gemini image edit error:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Edit an image using a reference image for guidance.
 * Sends the current image + reference image + instruction to Gemini.
 * Use for: "make it look like this reference", "match this style", "use this product".
 */
export async function editWithReference(
  imageUrl: string,
  referenceUrl: string,
  instruction: string
): Promise<GeneratedImage | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  try {
    const { fetchAndConvert } = await import("@/lib/image-utils");

    let imgBuffer: Buffer, imgMimeType: string;
    let refBuffer: Buffer, refMimeType: string;
    try {
      const imgConverted = await fetchAndConvert(imageUrl);
      imgBuffer = imgConverted.data;
      imgMimeType = imgConverted.mimeType;
      const refConverted = await fetchAndConvert(referenceUrl);
      refBuffer = refConverted.data;
      refMimeType = refConverted.mimeType;
    } catch (err) {
      console.warn("Failed to fetch images for reference edit:", err instanceof Error ? err.message : err);
      return null;
    }

    const res = await fetch(
      `${API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inlineData: {
                  mimeType: imgMimeType,
                  data: imgBuffer.toString("base64"),
                },
              },
              {
                inlineData: {
                  mimeType: refMimeType,
                  data: refBuffer.toString("base64"),
                },
              },
              {
                text: `The first image is the current scene. The second image is a reference. ${instruction}`,
              },
            ],
          }],
          generationConfig: {
            responseModalities: ["IMAGE"],
          },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.warn("Gemini reference edit failed:", res.status, err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(
      (p: Record<string, unknown>) => p.inlineData || p.inline_data
    );

    const imageData = imagePart?.inlineData || imagePart?.inline_data;
    if (!imageData?.data) {
      console.warn("Gemini reference edit returned no image data");
      return null;
    }

    return {
      data: Buffer.from(imageData.data, "base64"),
      mimeType: imageData.mimeType || imageData.mime_type || "image/png",
    };
  } catch (err) {
    console.warn("Gemini reference edit error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generate multiple editorial images from prompts.
 * Returns R2-ready image buffers with their prompt context.
 */
export async function generateEditorialImages(
  prompts: string[],
  aspectRatio: string = "16:9"
): Promise<Array<{ prompt: string; data: Buffer; mimeType: string }>> {
  const results: Array<{ prompt: string; data: Buffer; mimeType: string }> = [];

  for (const prompt of prompts) {
    const image = await generateEditorialImage(prompt, aspectRatio);
    if (image) {
      results.push({ prompt, ...image });
    }
  }

  return results;
}
