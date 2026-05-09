"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Audio briefing hook — captures audio via MediaRecorder, uploads to R2
 * via presigned PUT, registers a recording row, returns the transcript
 * once Whisper completes.
 *
 * Per the audio-capture-floor thesis (LOCKED 2026-05-09): every dictation
 * lands as a `recordings` row, not just a transcript. The audio bytes
 * stay in R2 as the foundation for downstream derivations (speaker ID,
 * voice clone, testimonial slices, re-transcription).
 *
 * Replaces useSpeechRecognition for first-class capture. The Web Speech
 * API path was discarded because it never gave us the audio bytes —
 * transcript-only is incompatible with the capture-floor architecture.
 *
 * UX states:
 *   idle    → mic button visible, ready to record
 *   recording → red pulse + elapsed timer; user clicks stop to commit
 *   uploading → "Uploading…" while bytes go to R2
 *   transcribing → "Transcribing…" while Whisper runs (1-5s typically)
 *   done    → transcript appears via onTranscript callback
 *   error   → onError callback fires; status returns to idle
 */

export type BriefingState = "idle" | "recording" | "paused" | "uploading" | "transcribing" | "error";

interface UseAudioBriefingOpts {
  siteId: string;
  sourceAssetId?: string;
  /** Called with the final transcript text once Whisper completes. */
  onTranscript?: (text: string, recordingId: string) => void;
  /** Called on any failure. */
  onError?: (err: Error) => void;
  /** Source enum on the recordings row. Defaults to "briefing". */
  source?: "briefing" | "voice_over" | "testimonial" | "captured_ambient";
  /** Whether to auto-append transcript to media_asset.context_note. Defaults to true for briefing. */
  appendTranscriptToContext?: boolean;
}

interface UseAudioBriefingReturn {
  supported: boolean;
  state: BriefingState;
  /** Elapsed milliseconds while recording (live). */
  elapsedMs: number;
  start: () => Promise<void>;
  pauseResume: () => void;
  stop: () => Promise<void>;
  cancel: () => void;
}

export function useAudioBriefing(opts: UseAudioBriefingOpts): UseAudioBriefingReturn {
  const {
    siteId,
    sourceAssetId,
    onTranscript,
    onError,
    source = "briefing",
    appendTranscriptToContext = true,
  } = opts;

  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<BriefingState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // Stash callbacks so they can change between renders without
  // re-creating start/stop.
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined" &&
      !!navigator?.mediaDevices?.getUserMedia,
    );
  }, []);

  function pickMimeType(): string {
    // Prefer formats Whisper handles best + that browsers actually produce.
    // Order matters: webm/opus is most universally supported by MediaRecorder.
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4", // Safari produces this
      "audio/ogg;codecs=opus",
    ];
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return ""; // browser will pick its default
  }

  function teardownStream() {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }

  const start = useCallback(async () => {
    if (state !== "idle") return;
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      // 1-second chunking gives smaller intermediate buffers + lets us
      // recover partial audio if stop fails.
      recorder.start(1000);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      tickerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
      setState("recording");
    } catch (err) {
      teardownStream();
      setState("error");
      const e = err instanceof Error ? err : new Error("Mic access failed");
      onErrorRef.current?.(e);
      // Auto-recover after a beat so the UI doesn't get stuck on error
      setTimeout(() => setState("idle"), 1500);
    }
  }, [state]);

  const stop = useCallback(async () => {
    if (state !== "recording" && state !== "paused") return;
    const recorder = recorderRef.current;
    if (!recorder) return;

    // Wait for the final 'stop' event before assembling the blob.
    const finalBlob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        resolve(new Blob(chunksRef.current, { type }));
      };
      try { recorder.stop(); } catch { /* noop */ }
    });

    // Stop ticker + release mic; do this before network calls so the
    // browser stops showing the recording indicator immediately.
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (cancelledRef.current || finalBlob.size === 0) {
      teardownStream();
      setState("idle");
      setElapsedMs(0);
      return;
    }

    const durationMs = Date.now() - startedAtRef.current;

    try {
      setState("uploading");

      // Step 1 — get a presigned URL
      const presignRes = await fetch("/api/recordings/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          content_type: finalBlob.type,
        }),
      });
      if (!presignRes.ok) {
        const errBody = await presignRes.text().catch(() => "");
        throw new Error(`Presign failed (${presignRes.status}): ${errBody.slice(0, 200)}`);
      }
      const { upload_url, public_url } = await presignRes.json();

      // Step 2 — PUT bytes directly to R2
      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": finalBlob.type },
        body: finalBlob,
      });
      if (!putRes.ok) {
        throw new Error(`R2 upload failed (${putRes.status})`);
      }

      // Step 3 — register the recording row (kicks off Whisper async)
      setState("transcribing");
      const createRes = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          source_asset_id: sourceAssetId || undefined,
          storage_url: public_url,
          mime_type: finalBlob.type,
          duration_ms: durationMs,
          source,
          append_transcript_to_context: appendTranscriptToContext,
        }),
      });
      if (!createRes.ok) {
        const errBody = await createRes.text().catch(() => "");
        throw new Error(`Recording register failed (${createRes.status}): ${errBody.slice(0, 200)}`);
      }
      const { recording } = await createRes.json();

      // Step 4 — poll for transcript (Whisper runs async via waitUntil).
      // Typical voice memo finishes in 1-5s. Poll every 800ms up to ~30s.
      const recordingId = recording.id as string;
      let transcript: string | null = null;
      const pollStart = Date.now();
      while (Date.now() - pollStart < 30000) {
        await new Promise((r) => setTimeout(r, 800));
        try {
          const r = await fetch(
            `/api/recordings?source_asset_id=${sourceAssetId || ""}`,
          );
          if (r.ok) {
            const { recordings } = await r.json();
            const found = (recordings as Array<{ id: string; transcript: string | null }>).find(
              (x) => x.id === recordingId,
            );
            if (found?.transcript) {
              transcript = found.transcript;
              break;
            }
          }
        } catch { /* keep polling */ }
      }

      teardownStream();
      setState("idle");
      setElapsedMs(0);

      if (transcript) {
        onTranscriptRef.current?.(transcript, recordingId);
      } else {
        // Recording is saved; transcript will appear later. Inform caller
        // gracefully — they can refresh the asset modal to see it.
        onTranscriptRef.current?.("", recordingId);
      }
    } catch (err) {
      teardownStream();
      setState("error");
      const e = err instanceof Error ? err : new Error("Audio briefing failed");
      onErrorRef.current?.(e);
      setTimeout(() => setState("idle"), 1500);
    }
  }, [state, siteId, sourceAssetId, source, appendTranscriptToContext]);

  const pauseResume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (state === "recording") {
      try {
        recorder.pause();
        if (tickerRef.current) {
          clearInterval(tickerRef.current);
          tickerRef.current = null;
        }
        setState("paused");
      } catch { /* noop */ }
    } else if (state === "paused") {
      try {
        recorder.resume();
        // Resume timer from accumulated elapsed; advance start anchor.
        const accumulated = elapsedMs;
        startedAtRef.current = Date.now() - accumulated;
        tickerRef.current = setInterval(() => {
          setElapsedMs(Date.now() - startedAtRef.current);
        }, 250);
        setState("recording");
      } catch { /* noop */ }
    }
  }, [state, elapsedMs]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current && (state === "recording" || state === "paused")) {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    teardownStream();
    setState("idle");
    setElapsedMs(0);
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      teardownStream();
    };
  }, []);

  return { supported, state, elapsedMs, start, pauseResume, stop, cancel };
}
