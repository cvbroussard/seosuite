"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

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

interface WorkerItem {
  id: string;
  fileName: string;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
}

interface UploadContextType {
  items: WorkerItem[];
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

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WorkerItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const portRef = useRef<MessagePort | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof SharedWorker === "undefined") return;

    const worker = new SharedWorker("/upload-worker.js", { name: "tracpost-upload" });
    const port = worker.port;
    portRef.current = port;

    port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setItems(msg.items);
        setActiveCount(msg.activeCount);
        setDoneCount(msg.doneCount);
        setErrorCount(msg.errorCount);
      }
    };

    port.start();

    // Request current status (reconnect after navigation/refresh)
    port.postMessage({ type: "status" });

    return () => {
      port.onmessage = null;
    };
  }, []);

  const enqueue = useCallback(async (newItems: Omit<UploadItem, "id" | "status">[]) => {
    if (!portRef.current) return;

    // Convert File objects to ArrayBuffers (can't transfer File to SharedWorker)
    const prepared = await Promise.all(
      newItems.map(async (item) => {
        const id = crypto.randomUUID();
        if (item.file) {
          const buffer = await item.file.arrayBuffer();
          return {
            id,
            fileData: buffer,
            fileType: item.file.type,
            fileName: item.fileName,
            contextNote: item.contextNote,
            siteId: item.siteId,
            projectId: item.projectId || null,
          };
        }
        return {
          id,
          sourceUrl: item.sourceUrl,
          fileName: item.fileName,
          contextNote: item.contextNote,
          siteId: item.siteId,
          projectId: item.projectId || null,
        };
      })
    );

    // Transfer ArrayBuffers for zero-copy performance
    const transferables = prepared
      .filter((p) => p.fileData)
      .map((p) => p.fileData as ArrayBuffer);

    portRef.current.postMessage(
      { type: "enqueue", items: prepared },
      transferables
    );
  }, []);

  const clear = useCallback(() => {
    portRef.current?.postMessage({ type: "clear" });
  }, []);

  return (
    <UploadContext.Provider value={{ items, enqueue, clear, activeCount, doneCount, errorCount }}>
      {children}
    </UploadContext.Provider>
  );
}
