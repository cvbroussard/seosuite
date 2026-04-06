"use client";

import { useUpload } from "./upload-provider";
import { useState } from "react";

export function UploadStatus() {
  const { items, activeCount, doneCount, errorCount, clear } = useUpload();
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const total = items.length;
  const uploading = items.find((i) => i.status === "uploading");
  const progress = total > 0 ? Math.round(((doneCount + errorCount) / total) * 100) : 0;

  return (
    <div className="border-b border-border px-4 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          )}
          <span className="text-xs font-medium">
            {activeCount > 0
              ? `Uploading ${activeCount} file${activeCount !== 1 ? "s" : ""}`
              : errorCount > 0
              ? `${doneCount} done, ${errorCount} failed`
              : `${doneCount} uploaded`}
          </span>
        </div>
        <span className="text-[10px] text-muted">{progress}%</span>
      </button>

      {/* Progress bar */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className={`h-full transition-all duration-300 ${errorCount > 0 ? "bg-warning" : "bg-accent"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current file */}
      {uploading && !expanded && (
        <p className="mt-1 truncate text-[10px] text-dim">{uploading.fileName}</p>
      )}

      {/* Expanded list */}
      {expanded && (
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
                {item.error && ` — ${item.error}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Clear button when done */}
      {activeCount === 0 && items.length > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); clear(); }}
          className="mt-2 text-[10px] text-muted hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  );
}
