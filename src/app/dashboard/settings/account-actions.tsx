"use client";

import { useState } from "react";

export function AccountActions({
  cancelledAt,
}: {
  cancelledAt: string | null;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [redirectTarget, setRedirectTarget] = useState("");
  const [cancelled, setCancelled] = useState(!!cancelledAt);
  const [graceEnd, setGraceEnd] = useState<string | null>(
    cancelledAt ? graceEndDate(cancelledAt) : null
  );
  const [revoking, setRevoking] = useState(false);

  async function requestExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export", { method: "POST" });
      const data = await res.json();

      if (data.download_url) {
        setExportUrl(data.download_url);
      } else if (data.export_id) {
        // Poll for completion
        pollExport(data.export_id);
      }
    } catch {
      alert("Export request failed");
      setExporting(false);
    }
  }

  async function pollExport(exportId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/account/export?export_id=${exportId}`);
        const data = await res.json();
        if (data.status === "completed" && data.download_url) {
          clearInterval(interval);
          setExportUrl(data.download_url);
          setExporting(false);
        } else if (data.status === "failed") {
          clearInterval(interval);
          alert("Export failed. Please try again.");
          setExporting(false);
        }
      } catch {
        // continue polling
      }
    }, 3000);
  }

  async function confirmCancel() {
    setCancelling(true);
    try {
      const res = await fetch("/api/account/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason || undefined,
          redirect_target: redirectTarget || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCancelled(true);
        setGraceEnd(data.grace_ends);
        setShowCancelConfirm(false);
      } else {
        alert(data.error || "Cancellation failed");
      }
    } catch {
      alert("Cancellation request failed");
    } finally {
      setCancelling(false);
    }
  }

  async function revokeCancellation() {
    setRevoking(true);
    try {
      const res = await fetch("/api/account/cancel", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setCancelled(false);
        setGraceEnd(null);
      } else {
        alert(data.error || "Could not revoke cancellation");
      }
    } catch {
      alert("Request failed");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      {/* Grace period banner */}
      {cancelled && graceEnd && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium text-warning">
            Your account is scheduled for cancellation
          </p>
          <p className="mt-1 text-xs text-muted">
            Your data will remain accessible until{" "}
            {new Date(graceEnd).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            . Export your data before then.
          </p>
          <button
            onClick={revokeCancellation}
            disabled={revoking}
            className="mt-3 rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {revoking ? "Revoking..." : "Keep My Account"}
          </button>
        </div>
      )}

      {/* Data Export */}
      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-medium">Data Export</h2>
        <p className="mb-4 text-xs text-muted">
          Download all your content — blog posts, social captions, images, and
          configuration. You own everything.
        </p>

        {exportUrl ? (
          <div className="flex items-center gap-3">
            <a
              href={exportUrl}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
              download
            >
              Download Export
            </a>
            <span className="text-xs text-muted">
              Link expires in 7 days
            </span>
          </div>
        ) : (
          <button
            onClick={requestExport}
            disabled={exporting}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted hover:border-accent hover:text-foreground disabled:opacity-50"
          >
            {exporting ? "Building export..." : "Export My Data"}
          </button>
        )}
      </section>

      {/* Cancel Account */}
      {!cancelled && (
        <section className="rounded-lg border border-error/20 bg-surface p-5">
          <h2 className="mb-1 text-sm font-medium">Cancel Account</h2>
          <p className="mb-4 text-xs text-muted">
            Your account stays active for 30 days after cancellation. Blog
            redirects stay active for 120 days. Export your data first.
          </p>

          {showCancelConfirm ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Reason (optional)
                </label>
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  placeholder="Why are you leaving?"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Where is your blog moving? (optional)
                </label>
                <input
                  value={redirectTarget}
                  onChange={(e) => setRedirectTarget(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  placeholder="https://yourdomain.com/blog"
                />
                <p className="mt-1 text-[10px] text-muted">
                  We&apos;ll redirect your TracPost blog URLs here for 120 days
                  to preserve your SEO.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={confirmCancel}
                  disabled={cancelling}
                  className="rounded-lg bg-error px-4 py-2 text-xs font-medium text-white hover:bg-error/80 disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Confirm Cancellation"}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs text-muted hover:text-foreground"
                >
                  Never mind
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="rounded-lg border border-error/40 px-4 py-2 text-xs font-medium text-error hover:bg-error/10"
            >
              Cancel My Account
            </button>
          )}
        </section>
      )}
    </>
  );
}

function graceEndDate(cancelledAt: string): string {
  const d = new Date(cancelledAt);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}
