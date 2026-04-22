"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface DailyMetric {
  date: string;
  value: number;
}

interface PerformanceData {
  websiteClicks: DailyMetric[];
  callClicks: DailyMetric[];
  directionRequests: DailyMetric[];
  searchImpressions: DailyMetric[];
  mapsImpressions: DailyMetric[];
  searchKeywords: Array<{ keyword: string; impressions: number }>;
}

function sum(arr: DailyMetric[]): number {
  return arr.reduce((s, v) => s + v.value, 0);
}

function mergeTimelines(search: DailyMetric[], maps: DailyMetric[], clicks: DailyMetric[], calls: DailyMetric[], directions: DailyMetric[]) {
  const dateMap = new Map<string, Record<string, number>>();
  const addTo = (arr: DailyMetric[], key: string) => {
    for (const m of arr) {
      if (!dateMap.has(m.date)) dateMap.set(m.date, {});
      dateMap.get(m.date)![key] = (dateMap.get(m.date)![key] || 0) + m.value;
    }
  };
  addTo(search, "search");
  addTo(maps, "maps");
  addTo(clicks, "clicks");
  addTo(calls, "calls");
  addTo(directions, "directions");

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));
}

export function SearchClient({ siteId }: { siteId: string }) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/google/performance?site_id=${siteId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">Connect Google Business Profile</p>
          <p className="mt-1 text-xs text-muted">Search visibility data requires an active GBP connection.</p>
        </div>
      </div>
    );
  }

  const timeline = mergeTimelines(data.searchImpressions, data.mapsImpressions, data.websiteClicks, data.callClicks, data.directionRequests);
  const totalImpressions = sum(data.searchImpressions) + sum(data.mapsImpressions);

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-sm font-medium">Google Search Visibility</h2>
        <p className="text-xs text-muted">How people discover your business through Google Search and Maps</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-2xl font-semibold">{totalImpressions.toLocaleString()}</p>
          <p className="text-xs text-muted">Total Impressions</p>
          <p className="text-[9px] text-muted mt-0.5">Search + Maps</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-2xl font-semibold">{sum(data.searchImpressions).toLocaleString()}</p>
          <p className="text-xs text-muted">Search Impressions</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-2xl font-semibold">{sum(data.mapsImpressions).toLocaleString()}</p>
          <p className="text-xs text-muted">Maps Impressions</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-2xl font-semibold">{sum(data.callClicks).toLocaleString()}</p>
          <p className="text-xs text-muted">Phone Calls</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-2xl font-semibold">{sum(data.directionRequests).toLocaleString()}</p>
          <p className="text-xs text-muted">Direction Requests</p>
        </div>
      </div>

      {/* Impressions + Actions timeline */}
      {timeline.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-4">Discovery & Actions Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="searchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mapsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="search" stroke="#3b82f6" fill="url(#searchGrad)" strokeWidth={2} name="Search" />
              <Area type="monotone" dataKey="maps" stroke="#22c55e" fill="url(#mapsGrad)" strokeWidth={2} name="Maps" />
              <Area type="monotone" dataKey="calls" stroke="#f59e0b" fill="none" strokeWidth={1.5} name="Calls" />
              <Area type="monotone" dataKey="directions" stroke="#8b5cf6" fill="none" strokeWidth={1.5} name="Directions" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Two-column: Keywords + Actions breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {/* Search keywords */}
        {data.searchKeywords.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Search Keywords</h3>
            <p className="text-xs text-muted mb-3">What people search to find your business</p>
            <div className="space-y-1.5">
              {data.searchKeywords.slice(0, 12).map((kw, i) => {
                const maxImp = data.searchKeywords[0]?.impressions || 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 text-right text-[10px] text-muted">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs">{kw.keyword}</span>
                        <span className="text-[10px] text-muted">{kw.impressions.toLocaleString()}</span>
                      </div>
                      <div className="mt-0.5 h-1 rounded-full bg-surface-hover">
                        <div className="h-full rounded-full bg-accent/50" style={{ width: `${(kw.impressions / maxImp) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions breakdown */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-1">Customer Actions</h3>
          <p className="text-xs text-muted mb-3">What people do after finding your listing</p>
          <div className="space-y-4">
            {[
              { label: "Website Clicks", value: sum(data.websiteClicks), color: "#3b82f6" },
              { label: "Phone Calls", value: sum(data.callClicks), color: "#22c55e" },
              { label: "Direction Requests", value: sum(data.directionRequests), color: "#8b5cf6" },
            ].map((action) => {
              const maxVal = Math.max(sum(data.websiteClicks), sum(data.callClicks), sum(data.directionRequests), 1);
              return (
                <div key={action.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs">{action.label}</span>
                    <span className="text-sm font-semibold">{action.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-hover">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(action.value / maxVal) * 100}%`, backgroundColor: action.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
