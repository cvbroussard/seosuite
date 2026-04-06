"use client";

import { useUpload } from "./upload-provider";
import { useState } from "react";

export function UploadStatus() {
  const { items, pendingProcessing, uploading } = useUpload();
  const [expanded, setExpanded] = useState(false);

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const totalItems = items.length;
  const current = items.find((i) => i.status === "uploading");

  // Nothing to show
  if (totalItems === 0 && pendingProcessing === 0) return null;

  const progress = totalItems > 0 ? Math.round(((doneCount + errorCount) / totalItems) * 100) : 100;

  return (
    <div className="border-b border-border px-4 py-3">
      {/* Upload progress (browser → R2) */}
      {uploading && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <span className="text-xs font-medium">
                Uploading {totalItems - doneCount - errorCount} of {totalItems}
              </span>
            </div>
            <span className="text-[10px] text-muted">{progress}%</span>
          </button>

          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
            <div
              className={`h-full transition-all duration-300 ${errorCount > 0 ? "bg-warning" : "bg-accent"}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {current && !expanded && (
            <p className="mt-1 truncate text-[10px] text-dim">{current.fileName}</p>
          )}
        </>
      )}

      {/* Upload complete summary */}
      {!uploading && totalItems > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {doneCount} uploaded{errorCount > 0 ? `, ${errorCount} failed` : ""}
          </span>
        </div>
      )}

      {/* Server-side processing status */}
      {pendingProcessing > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
          <span className="text-xs text-muted">
            {pendingProcessing} asset{pendingProcessing !== 1 ? "s" : ""} processing on server
          </span>
        </div>
      )}

      {/* Expanded file list */}
      {expanded && totalItems > 0 && (
        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {items.slice().reverse().map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-[10px]">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                item.status === "done" ? "bg-success"
                  : item.status === "error" ? "bg-danger"
                  : item.status === "uploading" ? "bg-accent animate-pulse"
                  : "bg-muted"
              }`} />
              <span className={`min-w-0 truncate ${item.status === "error" ? "text-danger" : "text-muted"}`}>
                {item.fileName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
