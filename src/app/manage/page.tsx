"use client";

import { useState, useEffect } from "react";
import { useManageContext } from "@/components/manage/manage-context";

interface SiteOverview {
  site: {
    name: string;
    url: string | null;
    business_type: string;
    location: string;
    autopilot_enabled: boolean;
    provisioning_status: string;
    subscriber_name: string;
    plan: string;
  };
  counts: {
    total_assets: number;
    uploads: number;
    ai_assets: number;
    total_posts: number;
    published_posts: number;
    draft_posts: number;
    vendors: number;
    projects: number;
    personas: number;
  };
  platforms: Array<{ platform: string; account_name: string; status: string }>;
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-hover p-3">
      <p className={`text-lg font-semibold ${accent ? "text-success" : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-border last:border-0">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="text-xs font-medium">{String(value)}</span>
    </div>
  );
}

function SiteOverviewContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<SiteOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/manage/site?site_id=${siteId}&view=overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) return <p className="p-6 text-xs text-muted">Failed to load site data.</p>;

  const { site, counts, platforms } = data;

  return (
    <div className="p-4 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Total Assets" value={counts.total_assets} />
            <Stat label="Uploads" value={counts.uploads} />
            <Stat label="AI Generated" value={counts.ai_assets} />
            <Stat label="Published" value={counts.published_posts} accent />
            <Stat label="Drafts" value={counts.draft_posts} />
            <Stat label="Total Articles" value={counts.total_posts} />
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Connected Platforms ({platforms.length})</h3>
            {platforms.length > 0 ? (
              <div className="space-y-1.5">
                {platforms.map(p => (
                  <div key={p.platform} className="flex items-center justify-between py-1">
                    <span className="text-xs capitalize">{p.platform}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted">{p.account_name}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-success" : "bg-muted"}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted">No platforms connected.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Identity</h3>
            <Row label="Business Name" value={site.name} />
            <Row label="Website" value={site.url || "—"} />
            <Row label="Industry" value={site.business_type} />
            <Row label="Location" value={site.location} />
            <Row label="Autopilot" value={site.autopilot_enabled ? "Active" : "Off"} />
            <Row label="Status" value={site.provisioning_status} />
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Content Pipeline</h3>
            <Row label="Vendors" value={counts.vendors} />
            <Row label="Projects" value={counts.projects} />
            <Row label="Personas" value={counts.personas} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface SubscriberData {
  subscriber: { id: string; name: string; email: string; plan: string; isActive: boolean; createdAt: string };
  sites: Array<{
    id: string; name: string; url: string | null; customDomain: string | null;
    autopilot: boolean; status: string; assets: number; published: number; connections: number;
  }>;
}

function SubscriberOverview({ subscriberId }: { subscriberId: string }) {
  const [data, setData] = useState<SubscriberData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/manage/subscriber?id=${subscriberId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [subscriberId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) return <p className="p-6 text-xs text-muted">Failed to load subscriber.</p>;

  const { subscriber, sites } = data;
  const totalAssets = sites.reduce((s, x) => s + x.assets, 0);
  const totalPublished = sites.reduce((s, x) => s + x.published, 0);
  const totalConnections = sites.reduce((s, x) => s + x.connections, 0);

  return (
    <div className="p-4 space-y-4">
      {/* Rollup stats */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Sites" value={sites.length} />
        <Stat label="Total Assets" value={totalAssets} />
        <Stat label="Published" value={totalPublished} accent />
        <Stat label="Connections" value={totalConnections} />
      </div>

      {/* Subscriber info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Subscriber</h3>
          <Row label="Email" value={subscriber.email || "—"} />
          <Row label="Since" value={new Date(subscriber.createdAt).toLocaleDateString()} />
        </div>

        {/* Sites list */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Sites ({sites.length})</h3>
          <div className="space-y-2">
            {sites.map(site => (
              <div key={site.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div>
                  <p className="text-xs font-medium">{site.name}</p>
                  <p className="text-[10px] text-muted">{site.customDomain || site.url || "No domain"}</p>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span>{site.assets} assets</span>
                  <span className="text-success">{site.published} published</span>
                  <span className={`rounded px-1.5 py-0.5 ${
                    site.status === "complete" ? "bg-success/10 text-success"
                    : site.status === "in_progress" ? "bg-accent/10 text-accent"
                    : "bg-muted/10 text-muted"
                  }`}>{site.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManageDashboard() {
  const { subscriberId, siteId } = useManageContext();

  if (subscriberId === "all") return null;
  if (siteId === "all") return <SubscriberOverview subscriberId={subscriberId} />;

  return <SiteOverviewContent siteId={siteId} />;
}
