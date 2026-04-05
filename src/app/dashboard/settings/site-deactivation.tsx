"use client";

import { useState } from "react";

interface SiteDeactivationProps {
  siteId: string;
  siteName: string;
  isActive: boolean;
}

export function SiteDeactivation({ siteId, siteName, isActive: initialActive }: SiteDeactivationProps) {
  const [isActive, setIsActive] = useState(initialActive);
  const [toggling, setToggling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setToggling(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/toggle`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setIsActive(data.is_active);
        setShowConfirm(false);
        // Refresh session to sync site list
        await fetch("/api/auth/refresh-session", { method: "POST" });
      } else {
        setError(data.error || "Failed");
      }
    } catch {
      setError("Request failed");
    } finally {
      setToggling(false);
    }
  }

  if (!isActive) {
    return (
      <section className="mb-8">
        <div className="rounded-lg bg-warning/10 p-4">
          <p className="font-medium text-warning">This site is deactivated</p>
          <p className="mt-1 text-sm text-muted">
            Content generation is paused for <strong>{siteName}</strong>. All data is preserved.
            Reactivating will count toward your plan&apos;s site limit.
          </p>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            onClick={toggle}
            disabled={toggling}
            className="mt-3 bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {toggling ? "Reactivating..." : "Reactivate Site"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-muted">Deactivate Site</h2>
      <p className="mb-4 text-sm text-muted">
        Pause content generation for <strong>{siteName}</strong>. All data is preserved and the site
        can be reactivated at any time. Deactivating frees a slot toward your plan limit.
      </p>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {showConfirm ? (
        <div className="flex gap-3">
          <button
            onClick={toggle}
            disabled={toggling}
            className="bg-warning px-4 py-2 text-sm font-medium text-white hover:opacity-80 disabled:opacity-50"
          >
            {toggling ? "Deactivating..." : "Confirm Deactivation"}
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Never mind
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowConfirm(true)}
          className="border border-warning/40 px-4 py-2 text-sm font-medium text-warning hover:bg-warning/10"
        >
          Deactivate This Site
        </button>
      )}
    </section>
  );
}
