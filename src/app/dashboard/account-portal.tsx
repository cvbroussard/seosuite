"use client";

import { useState } from "react";
import { AddSiteForm } from "./add-site";

interface Site {
  id: string;
  name: string;
  url: string;
  is_active?: boolean;
}

export function AccountPortal({
  subscriberName,
  sites,
  plan,
}: {
  subscriberName: string;
  sites: Site[];
  plan: string;
}) {
  const [showAddSite, setShowAddSite] = useState(false);
  const [localSites, setLocalSites] = useState(sites);
  const [toggling, setToggling] = useState<string | null>(null);

  const activeSites = localSites.filter(s => s.is_active !== false);
  const inactiveSites = localSites.filter(s => s.is_active === false);

  async function toggleSite(siteId: string) {
    setToggling(siteId);
    try {
      const res = await fetch(`/api/sites/${siteId}/toggle`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLocalSites(prev => prev.map(s =>
          s.id === siteId ? { ...s, is_active: data.is_active } : s
        ));
        // Refresh session
        await fetch("/api/auth/refresh-session", { method: "POST" });
      } else {
        const err = await res.json();
        alert(err.error || "Failed");
      }
    } catch { /* ignore */ }
    setToggling(null);
  }

  async function selectSite(siteId: string) {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeSiteId: siteId }),
    });
    window.location.href = "/dashboard";
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-semibold">Welcome, {subscriberName}</h1>
      <p className="mb-8 text-sm text-muted">{plan} plan · {sites.length} site{sites.length !== 1 ? "s" : ""}</p>

      {/* Sites */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Your Sites</h2>
          {!showAddSite && (
            <button
              onClick={() => setShowAddSite(true)}
              className="text-xs text-accent hover:underline"
            >
              + Add Site
            </button>
          )}
        </div>

        {localSites.length > 0 ? (
          <div className="space-y-2">
            {/* Active sites */}
            {activeSites.map((site) => (
              <div
                key={site.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/40"
              >
                <button
                  onClick={() => selectSite(site.id)}
                  className="flex-1 text-left"
                >
                  <p className="text-sm font-medium">{site.name}</p>
                  <p className="text-xs text-muted">{site.url || "No domain set"}</p>
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleSite(site.id)}
                    disabled={toggling === site.id}
                    className="text-[10px] text-muted hover:text-warning"
                  >
                    {toggling === site.id ? "..." : "Deactivate"}
                  </button>
                  <span className="text-xs text-muted">Open →</span>
                </div>
              </div>
            ))}

            {/* Inactive sites */}
            {inactiveSites.map((site) => (
              <div
                key={site.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 opacity-50"
              >
                <button
                  onClick={() => selectSite(site.id)}
                  className="flex-1 text-left"
                >
                  <p className="text-sm font-medium">{site.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted">{site.url || "No domain set"}</p>
                    <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[9px] text-muted">inactive</span>
                  </div>
                </button>
                <button
                  onClick={() => toggleSite(site.id)}
                  disabled={toggling === site.id}
                  className="rounded bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {toggling === site.id ? "..." : "Reactivate"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
            <span className="mb-3 block text-3xl">◆</span>
            <h3 className="mb-1 text-sm font-medium">No sites yet</h3>
            <p className="mb-4 text-xs text-muted">Add your first site to start generating content.</p>
          </div>
        )}

        {showAddSite && (
          <div className="mt-4 rounded-lg border border-border bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium">Add New Site</h3>
              <button onClick={() => setShowAddSite(false)} className="text-xs text-muted hover:text-foreground">Cancel</button>
            </div>
            <AddSiteForm />
          </div>
        )}
      </section>

      {/* Quick links */}
      <section>
        <h2 className="mb-4 text-sm font-medium">Account</h2>
        <div className="grid grid-cols-2 gap-3">
          <a
            href="/dashboard/account"
            className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
          >
            <p className="text-sm font-medium">My Account</p>
            <p className="text-xs text-muted">Profile and settings</p>
          </a>
          <a
            href="/dashboard/account/vendors"
            className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
          >
            <p className="text-sm font-medium">Vendors</p>
            <p className="text-xs text-muted">Manage vendor directory</p>
          </a>
          <a
            href="/dashboard/account/mobile-app"
            className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
          >
            <p className="text-sm font-medium">Team</p>
            <p className="text-xs text-muted">Users and mobile app</p>
          </a>
        </div>
      </section>
    </div>
  );
}
