"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Status-change controls for the v2 article review page.
 *
 * Renders a button group whose options reflect the article's current
 * status. After a successful PATCH, refreshes the page so the badge,
 * Compose anchor pool eligibility, and live link all update.
 */
export function ArticleActions({
  articleId,
  status,
}: {
  articleId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/articles/${articleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Update failed");
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  // Action choices vary by current status — keeps the button group concise.
  const actions: Array<{ label: string; status: string; tone: "primary" | "neutral" | "danger" }> = [];
  if (status === "draft" || status === "archived") {
    actions.push({ label: "Publish", status: "published", tone: "primary" });
  }
  if (status === "published") {
    actions.push({ label: "Unpublish", status: "draft", tone: "neutral" });
  }
  if (status !== "archived") {
    actions.push({ label: "Archive", status: "archived", tone: "danger" });
  }
  if (status === "archived") {
    actions.push({ label: "Restore", status: "draft", tone: "neutral" });
  }

  return (
    <div className="flex items-center gap-2">
      {actions.map((a) => (
        <button
          key={a.status}
          onClick={() => setStatus(a.status)}
          disabled={busy}
          className={`rounded border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            a.tone === "primary"
              ? "border-accent bg-accent text-white hover:bg-accent/90"
              : a.tone === "danger"
                ? "border-danger/40 text-danger hover:bg-danger/10"
                : "border-border text-muted hover:text-foreground hover:bg-surface-hover"
          }`}
        >
          {busy ? "…" : a.label}
        </button>
      ))}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
