"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface TopPage {
  pagePath: string;
  pageViews: number;
  users: number;
  avgDuration: number;
}

interface OverviewData {
  totalUsers: number;
  sessions: number;
  pageViews: number;
  avgSessionDuration: number;
  bounceRate: number;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function friendlyPageName(path: string): string {
  if (path === "/" || path === "") return "Home";
  const clean = path.replace(/^\//, "").replace(/\/$/, "");
  const parts = clean.split("/");
  const last = parts[parts.length - 1];
  return last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 50);
}

export function EngagementClient({ siteId }: { siteId: string }) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [pages, setPages] = useState<TopPage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/analytics?site_id=${siteId}&report=overview&days=${days}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics?site_id=${siteId}&report=pages&days=${days}`).then(r => r.ok ? r.json() : null),
    ])
      .then(([ov, pg]) => {
        setOverview(ov);
        setPages(pg);
      })
      .finally(() => setLoading(false));
  }, [siteId, days]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header + date range */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">How visitors engage with your site</h2>
          <p className="text-xs text-muted">Page performance, time on site, and engagement metrics</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded border border-border bg-background px-3 py-1 text-xs"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Engagement summary cards */}
      {overview && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <p className="text-2xl font-semibold">{overview.pageViews.toLocaleString()}</p>
            <p className="text-xs text-muted">Page Views</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <p className="text-2xl font-semibold">{formatDuration(overview.avgSessionDuration)}</p>
            <p className="text-xs text-muted">Avg. Session Duration</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <p className="text-2xl font-semibold">{overview.sessions > 0 ? (overview.pageViews / overview.sessions).toFixed(1) : "0"}</p>
            <p className="text-xs text-muted">Pages per Session</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <p className="text-2xl font-semibold">{Math.round((1 - overview.bounceRate) * 100)}%</p>
            <p className="text-xs text-muted">Engagement Rate</p>
            <p className="text-[9px] text-muted mt-0.5">{Math.round(overview.bounceRate * 100)}% bounce rate</p>
          </div>
        </div>
      )}

      {/* Top pages */}
      {pages && pages.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {/* Bar chart */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-4">Top Pages by Views</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, pages.slice(0, 10).length * 32)}>
              <BarChart data={pages.slice(0, 10)} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="pagePath"
                  tickFormatter={friendlyPageName}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={140}
                />
                <Tooltip
                  contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }}
                  labelFormatter={(label) => friendlyPageName(String(label))}
                />
                <Bar dataKey="pageViews" name="Page Views" radius={[0, 4, 4, 0]}>
                  {pages.slice(0, 10).map((_, index) => (
                    <Cell key={index} fill={index === 0 ? "#3b82f6" : index < 3 ? "#60a5fa" : "#93c5fd"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-4">Page Performance</h3>
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-muted border-b border-border">
                  <th className="text-left pb-2">#</th>
                  <th className="text-left pb-2">Page</th>
                  <th className="text-right pb-2">Views</th>
                  <th className="text-right pb-2">Users</th>
                  <th className="text-right pb-2">Avg. Time</th>
                </tr>
              </thead>
              <tbody>
                {pages.slice(0, 15).map((page, i) => (
                  <tr key={page.pagePath} className="border-b border-border last:border-0">
                    <td className="py-1.5 text-[10px] text-muted w-6">{i + 1}</td>
                    <td className="py-1.5 text-xs truncate max-w-[200px]" title={page.pagePath}>
                      {friendlyPageName(page.pagePath)}
                    </td>
                    <td className="py-1.5 text-right text-xs">{page.pageViews.toLocaleString()}</td>
                    <td className="py-1.5 text-right text-xs">{page.users.toLocaleString()}</td>
                    <td className="py-1.5 text-right text-xs text-muted">{formatDuration(page.avgDuration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No data */}
      {!overview && !pages && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">Analytics are being collected</p>
          <p className="mt-1 text-xs text-muted">GA4 data takes 24-48 hours to start reporting.</p>
        </div>
      )}
    </div>
  );
}
