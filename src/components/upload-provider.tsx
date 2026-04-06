"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export interface UploadItem {
  id: string;
  file?: File;
  sourceUrl?: string;
  contextNote: string;
  siteId: string;
  projectId?: string | null;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  fileName: string;
}

interface UploadContextType {
  items: UploadItem[];
  enqueue: (items: Omit<UploadItem, "id" | "status">[]) => void;
  clear: () => void;
  activeCount: number;
  doneCount: number;
  errorCount: number;
}

const UploadContext = createContext<UploadContextType>({
  items: [],
  enqueue: () => {},
  clear: () => {},
  activeCount: 0,
  doneCount: 0,
  errorCount: 0,
});

export function useUpload() {
  return useContext(UploadContext);
}

function guessMediaType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.match(/\.(mp4|mov|avi|webm|mkv)/)) return "video/mp4";
  if (lower.match(/\.(gif)/)) return "image/gif";
  if (lower.match(/\.(png)/)) return "image/png";
  if (lower.match(/\.(webp)/)) return "image/webp";
  return "image/jpeg";
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const processing = useRef(false);
  const queueRef = useRef<UploadItem[]>([]);

  // Keep ref in sync with state for the processing loop
  useEffect(() => {
    queueRef.current = items;
  }, [items]);

  const enqueue = useCallback((newItems: Omit<UploadItem, "id" | "status">[]) => {
    const withIds: UploadItem[] = newItems.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      status: "queued" as const,
    }));
    setItems((prev) => [...prev, ...withIds]);
  }, []);

  const clear = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status === "uploading" || i.status === "queued"));
  }, []);

  // Process queue
  useEffect(() => {
    if (processing.current) return;

    const next = items.find((i) => i.status === "queued");
    if (!next) return;

    processing.current = true;

    (async () => {
      setItems((prev) =>
        prev.map((i) => (i.id === next.id ? { ...i, status: "uploading" as const } : i))
      );

      try {
        let assetId: string | null = null;

        if (next.sourceUrl) {
          // URL-based upload
          const res = await fetch("/api/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              site_id: next.siteId,
              storage_url: next.sourceUrl,
              media_type: guessMediaType(next.sourceUrl),
              context_note: next.contextNote || null,
              project_id: next.projectId || null,
              source: "url",
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to register asset");
          assetId = data.asset?.id;
        } else if (next.file) {
          // File-based upload — presign + R2 + register
          const presignRes = await fetch("/api/upload/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              site_id: next.siteId,
              content_type: next.file.type
                || (next.file.name.toLowerCase().endsWith(".heic") ? "image/heic" : "")
                || (next.file.name.toLowerCase().endsWith(".heif") ? "image/heic" : ""),
              filename: next.file.name,
            }),
          });

          if (!presignRes.ok) {
            const err = await presignRes.json();
            throw new Error(err.error || "Failed to get upload URL");
          }

          const { upload_url, public_url, media_type } = await presignRes.json();

          const uploadRes = await fetch(upload_url, {
            method: "PUT",
            headers: { "Content-Type": next.file.type },
            body: next.file,
          });

          if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

          const assetRes = await fetch("/api/assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              site_id: next.siteId,
              storage_url: public_url,
              media_type,
              context_note: next.contextNote || null,
              project_id: next.projectId || null,
            }),
          });

          const assetData = await assetRes.json();
          if (!assetRes.ok) throw new Error(assetData.error || "Failed to register asset");
          assetId = assetData.asset?.id;
        }

        setItems((prev) =>
          prev.map((i) => (i.id === next.id ? { ...i, status: "done" as const } : i))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setItems((prev) =>
          prev.map((i) => (i.id === next.id ? { ...i, status: "error" as const, error: message } : i))
        );
      }

      processing.current = false;
    })();
  }, [items]);

  const activeCount = items.filter((i) => i.status === "queued" || i.status === "uploading").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <UploadContext.Provider value={{ items, enqueue, clear, activeCount, doneCount, errorCount }}>
      {children}
    </UploadContext.Provider>
  );
}
