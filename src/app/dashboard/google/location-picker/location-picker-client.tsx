"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Location {
  socialAccountId: string;
  name: string;
  address: string | null;
  currentSiteId: string | null;
}

interface Site {
  id: string;
  name: string;
}

interface Props {
  locations: Location[];
  sites: Site[];
  source: string;
  initiatingSiteId: string | null;
}

export function LocationPickerClient({ locations, sites, source, initiatingSiteId }: Props) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};

    for (const loc of locations) {
      if (loc.currentSiteId) {
        // Already linked — preserve
        initial[loc.socialAccountId] = loc.currentSiteId;
      } else {
        // Try auto-match by name similarity
        const match = sites.find((s) =>
          s.name.toLowerCase().includes(loc.name.toLowerCase().split(",")[0].split(" ")[0]) ||
          loc.name.toLowerCase().includes(s.name.toLowerCase().split(" ")[0])
        );
        if (match) {
          initial[loc.socialAccountId] = match.id;
        }
      }
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);

    try {
      const res = await fetch("/api/google/link-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => {
          if (source === "admin" && initiatingSiteId) {
            router.push(`/admin/sites/${initiatingSiteId}`);
          } else {
            router.push("/dashboard/accounts?connected=Google%20Business");
          }
        }, 1000);
      }
    } catch { /* ignore */ }

    setSaving(false);
  }

  const allAssigned = locations.every((loc) => assignments[loc.socialAccountId]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-card">
        <div className="mb-1 text-center">
          <span className="text-2xl">G</span>
        </div>
        <h2 className="text-center text-lg font-medium mb-1">Link Google Business Locations</h2>
        <p className="text-center text-xs text-muted mb-6">
          We found {locations.length} locations on your Google account. Assign each to the correct site.
        </p>

        <div className="space-y-3">
          {locations.map((loc) => {
            const currentAssignment = assignments[loc.socialAccountId];
            const assignedSite = sites.find((s) => s.id === currentAssignment);

            return (
              <div
                key={loc.socialAccountId}
                className={`rounded-lg border p-4 transition-colors ${
                  currentAssignment ? "border-accent/30 bg-accent/5" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{loc.name}</p>
                    {loc.address && (
                      <p className="mt-0.5 text-[10px] text-muted">{loc.address}</p>
                    )}
                  </div>
                  <select
                    value={currentAssignment || ""}
                    onChange={(e) => {
                      setAssignments((prev) => ({
                        ...prev,
                        [loc.socialAccountId]: e.target.value,
                      }));
                    }}
                    className={`rounded border px-3 py-1.5 text-xs ${
                      currentAssignment
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-surface-hover text-muted"
                    }`}
                  >
                    <option value="">Select a site...</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </div>
                {assignedSite && (
                  <p className="mt-2 text-[10px] text-accent">
                    → {assignedSite.name}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-[10px] text-muted">
            {Object.values(assignments).filter(Boolean).length} of {locations.length} assigned
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/dashboard/accounts")}
              className="rounded px-4 py-2 text-xs text-muted hover:text-foreground"
            >
              Skip for now
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !allAssigned}
              className="rounded bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : saved ? "Linked!" : "Link Locations"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
