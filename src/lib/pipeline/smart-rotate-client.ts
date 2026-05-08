/**
 * Smart Rotate service client.
 *
 * Single touchpoint between the TracPost main app and the self-hosted
 * Smart Rotate service (per project_tracpost_smart_rotate_self_host.md
 * Layer-1 discipline). Only `src/lib/pipeline/variant-render.ts` should
 * import from this module.
 *
 * Feature-flagged: when SMART_ROTATE_URL is unset, isSmartRotateEnabled()
 * returns false and callers fall back to ffmpeg center-crop. This means
 * dev/staging without the service still work; production lights up the
 * service when env vars are set.
 */

interface ReframeRequest {
  sourceUrl: string;
  targetAspect: "9:16" | "1:1" | "16:9" | "4:5" | "2:3";
  targetWidth: number;
  targetHeight: number;
  destinationKey: string;
}

interface ReframeResponse {
  destinationUrl: string;
  durationSeconds: number;
  renderSettings: Record<string, unknown>;
}

/**
 * Whether the Smart Rotate service is configured. Used by callers to
 * decide between Smart Rotate (subject-aware) and fallback (ffmpeg
 * center-crop).
 */
export function isSmartRotateEnabled(): boolean {
  return Boolean(process.env.SMART_ROTATE_URL && process.env.SMART_ROTATE_SECRET);
}

/**
 * Call the Smart Rotate service. Synchronous from the caller's view —
 * service blocks until the reframe is done (typically 15-45s for a 30s
 * source). Caller should already be inside Vercel's `waitUntil` so the
 * API response has returned to the subscriber by the time we get here.
 *
 * Throws on service error. Caller catches and falls back to ffmpeg.
 */
export async function callSmartRotate(req: ReframeRequest): Promise<ReframeResponse> {
  const url = process.env.SMART_ROTATE_URL;
  const secret = process.env.SMART_ROTATE_SECRET;
  if (!url || !secret) {
    throw new Error("Smart Rotate service not configured (SMART_ROTATE_URL/SMART_ROTATE_SECRET unset)");
  }

  // 5-minute timeout — Smart Rotate service tops out around 60s for typical
  // beta videos. 5 min is generous headroom for a longer source.
  const res = await fetch(`${url.replace(/\/$/, "")}/reframe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Smart-Rotate-Secret": secret,
    },
    body: JSON.stringify({
      source_url: req.sourceUrl,
      target_aspect: req.targetAspect,
      target_width: req.targetWidth,
      target_height: req.targetHeight,
      destination_key: req.destinationKey,
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "(no body)");
    throw new Error(`Smart Rotate service error (${res.status}): ${errBody}`);
  }

  const data = (await res.json()) as {
    destination_url: string;
    duration_seconds: number;
    render_settings: Record<string, unknown>;
  };
  return {
    destinationUrl: data.destination_url,
    durationSeconds: data.duration_seconds,
    renderSettings: data.render_settings,
  };
}

/**
 * Map a render template ID to (target_aspect, width, height) for the
 * Smart Rotate service. Templates that don't apply (image-output, audio)
 * return null — caller should not invoke Smart Rotate for those.
 */
export function smartRotateDimsForTemplate(
  templateId: string,
): { targetAspect: ReframeRequest["targetAspect"]; width: number; height: number } | null {
  switch (templateId) {
    case "reel_9x16":
    case "story_9x16":
      return { targetAspect: "9:16", width: 1080, height: 1920 };
    case "long_16x9":
      return { targetAspect: "16:9", width: 1920, height: 1080 };
    case "feed_square":
      return { targetAspect: "1:1", width: 1080, height: 1080 };
    case "feed_portrait":
      return { targetAspect: "4:5", width: 1080, height: 1350 };
    case "pin_2x3":
      return { targetAspect: "2:3", width: 1080, height: 1620 };
    default:
      return null;
  }
}
