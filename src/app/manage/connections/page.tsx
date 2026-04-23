"use client";
import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
function ConnectionsContent({ subscriberId }: { subscriberId: string }) {
  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/manage/site?site_id=${subscriberId}&view=overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setAccounts(d?.platforms || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subscriberId]);
  if (loading) return <div className="flex justify-center py-12"><div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>;
  return (
    <div className="p-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-3">Social Connections ({accounts.length})</h3>
        {accounts.length > 0 ? (
          <div className="space-y-1.5">
            {accounts.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-xs capitalize">{String(a.platform)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted">{String(a.account_name)}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${a.status === "active" ? "bg-success" : "bg-muted"}`} />
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-[10px] text-muted">No connections. Select a site to view platform connections.</p>}
      </div>
    </div>
  );
}
export default function Page() {
  return <ManagePage title="Connections" requireSite>{({ siteId }) => <ConnectionsContent subscriberId={siteId} />}</ManagePage>;
}
