"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { AutopilotControls } from "@/app/admin/sites/[siteId]/website-pane";

interface Connection {
  platform: string;
  account_name: string;
  status: string;
}

function SocialConfigContent({ siteId }: { siteId: string }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/site?site_id=${siteId}&view=overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setConnections(d?.platforms || []);
        setAutopilotEnabled(d?.site?.autopilot_enabled || false);
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  async function toggleAutopilot() {
    const next = !autopilotEnabled;
    setSaving(true);
    await fetch("/api/admin/image-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, autopilotEnabled: next }),
    });
    setAutopilotEnabled(next);
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const activeCount = connections.filter(c => c.status === "active").length;
  const allPlatforms = ["instagram", "facebook", "tiktok", "youtube", "pinterest", "linkedin", "twitter", "gbp"];

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Left — Connections */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Social Connections ({activeCount}/8)</h3>
            <div className="space-y-1">
              {allPlatforms.map(platform => {
                const conn = connections.find(c => c.platform === platform);
                return (
                  <div key={platform} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <span className="text-xs capitalize">{platform === "gbp" ? "Google Business" : platform === "twitter" ? "X (Twitter)" : platform}</span>
                    {conn ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted">{conn.account_name}</span>
                        <span className={`h-1.5 w-1.5 rounded-full ${conn.status === "active" ? "bg-success" : "bg-warning"}`} />
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted">Not connected</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right — Autopilot */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Autopilot</h3>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={toggleAutopilot}
                disabled={saving}
                className={`rounded px-4 py-1.5 text-xs font-medium ${
                  autopilotEnabled ? "bg-success text-white" : "bg-surface-hover text-muted"
                }`}
              >
                {autopilotEnabled ? "Active" : "Off"}
              </button>
              {saving && <span className="text-[10px] text-muted">Saving...</span>}
            </div>
            <AutopilotControls siteId={siteId} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Social & Autopilot" requireSite>
      {({ siteId }) => <SocialConfigContent siteId={siteId} />}
    </ManagePage>
  );
}
