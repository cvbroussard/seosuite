"use client";

import { useUpload } from "./upload-provider";
import { useEffect } from "react";

/**
 * Full-screen overlay during browser uploads.
 * Prevents navigation and warns before unload.
 */
export function UploadOverlay() {
  const { items, uploading } = useUpload();

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const totalItems = items.length;
  const current = items.find((i) => i.status === "uploading");
  const progress = totalItems > 0 ? Math.round(((doneCount + errorCount) / totalItems) * 100) : 0;

  // Warn before unload
  useEffect(() => {
    if (!uploading) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [uploading]);

  if (!uploading) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="mb-4 text-4xl">
          {progress < 100 ? "◎" : "◆"}
        </div>
        <p className="mb-2 text-lg font-semibold">
          Uploading {totalItems - doneCount - errorCount} of {totalItems} files
        </p>
        {current && (
          <p className="mb-4 truncate text-sm text-muted">{current.fileName}</p>
        )}

        {/* Progress bar */}
        <div className="mx-auto mb-4 h-2 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-xs text-muted">
          Files are being uploaded to storage. Please don&apos;t close this tab.
        </p>
        {errorCount > 0 && (
          <p className="mt-2 text-xs text-warning">
            {errorCount} file{errorCount !== 1 ? "s" : ""} failed
          </p>
        )}
      </div>
    </div>
  );
}
