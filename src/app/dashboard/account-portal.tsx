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
  userName,
  subscriptionName,
  sites,
  plan,
}: {
  userName: string;
  subscriptionName: string;
  sites: Site[];
  plan: string;
}) {
  const [showAddSite, setShowAddSite] = useState(false);

  const activeSites = sites.filter(s => s.is_active !== false);
  const inactiveSites = sites.filter(s => s.is_active === false);

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
      <h1 className="mb-1 text-lg font-semibold">{subscriptionName}</h1>
      <p className="mb-8 text-sm text-muted">{plan} plan · {sites.length} site{sites.length !== 1 ? "s" : ""}</p>

      {/* Sites */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Your Businesses</h2>
          {!showAddSite && (
            <button
              onClick={() => setShowAddSite(true)}
              className="text-xs text-accent hover:underline"
            >
              + Add Site
            </button>
          )}
        </div>

        {sites.length > 0 ? (
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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{site.name}</p>
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-medium text-success">active</span>
                  </div>
                  <p className="text-xs text-muted">{site.url || "No domain set"}</p>
                </button>
                <span className="text-xs text-muted">Open →</span>
              </div>
            ))}

            {/* Inactive sites */}
            {inactiveSites.map((site) => (
              <div
                key={site.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 opacity-60"
              >
                <button
                  onClick={() => selectSite(site.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{site.name}</p>
                    <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[9px] font-medium text-muted">inactive</span>
                  </div>
                  <p className="text-xs text-muted">{site.url || "No domain set"}</p>
                </button>
                <span className="text-xs text-muted">Open →</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
            <span className="mb-3 block text-3xl">◆</span>
            <h3 className="mb-1 text-sm font-medium">No businesses yet</h3>
            <p className="mb-4 text-xs text-muted">Add your first business to start generating content.</p>
          </div>
        )}

        {showAddSite && (
          <div className="mt-4 rounded-lg border border-border bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium">Add New Business</h3>
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
            href="/dashboard/account/team"
            className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
          >
            <p className="text-sm font-medium">Team</p>
            <p className="text-xs text-muted">Users and business access</p>
          </a>
          <a
            href="/dashboard/account/subscription"
            className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/40"
          >
            <p className="text-sm font-medium">Subscription</p>
            <p className="text-xs text-muted">Plan, billing, and API key</p>
          </a>
        </div>
      </section>
    </div>
  );
}
