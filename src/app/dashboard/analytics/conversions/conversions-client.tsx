"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";

interface PerformanceData {
  websiteClicks: Array<{ date: string; value: number }>;
  callClicks: Array<{ date: string; value: number }>;
  directionRequests: Array<{ date: string; value: number }>;
}

interface Attribution {
  totalFromTracPost: number;
  byMedium: Array<{ medium: string; users: number }>;
}

interface OverviewData {
  totalUsers: number;
  sessions: number;
}

function sum(arr: Array<{ value: number }> | undefined): number {
  return (arr || []).reduce((s, v) => s + v.value, 0);
}

export function ConversionsClient({ siteId }: { siteId: string }) {
  const [gbp, setGbp] = useState<PerformanceData | null>(null);
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/google/performance?site_id=${siteId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics?site_id=${siteId}&report=attribution&days=${days}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics?site_id=${siteId}&report=overview&days=${days}`).then(r => r.ok ? r.json() : null),
    ])
      .then(([g, a, o]) => {
        setGbp(g);
        setAttribution(a);
        setOverview(o);
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

  const totalCalls = sum(gbp?.callClicks);
  const totalDirections = sum(gbp?.directionRequests);
  const totalWebClicks = sum(gbp?.websiteClicks);
  const totalConversions = totalCalls + totalDirections + totalWebClicks;
  const totalVisitors = overview?.totalUsers || 0;
  const conversionRate = totalVisitors > 0 ? ((totalConversions / totalVisitors) * 100).toFixed(1) : "0";

  const conversionData = [
    { name: "Phone Calls", value: totalCalls, color: "#22c55e" },
    { name: "Directions", value: totalDirections, color: "#8b5cf6" },
    { name: "Website Clicks", value: totalWebClicks, color: "#3b82f6" },
  ];

  // Source attribution for conversions
  const organicConversions = totalConversions - (attribution?.totalFromTracPost || 0);
  const sourceData = [
    { source: "Organic", conversions: Math.max(0, organicConversions), color: "#22c55e" },
    { source: "TracPost", conversions: attribution?.totalFromTracPost || 0, color: "#3b82f6" },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Customer Conversions</h2>
          <p className="text-xs text-muted">Actions that indicate potential customers — calls, directions, and website visits</p>
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

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-3xl font-bold">{totalConversions.toLocaleString()}</p>
          <p className="text-xs text-muted mt-1">Total Conversions</p>
          <p className="text-[10px] text-muted">Last {days} days</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-3xl font-bold text-emerald-500">{totalCalls.toLocaleString()}</p>
          <p className="text-xs text-muted mt-1">Phone Calls</p>
          <p className="text-[10px] text-muted">From Google listing</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-3xl font-bold text-violet-500">{totalDirections.toLocaleString()}</p>
          <p className="text-xs text-muted mt-1">Direction Requests</p>
          <p className="text-[10px] text-muted">From Google listing</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
          <p className="text-3xl font-bold">{conversionRate}%</p>
          <p className="text-xs text-muted mt-1">Conversion Rate</p>
          <p className="text-[10px] text-muted">{totalConversions} of {totalVisitors} visitors</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Conversion breakdown */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-4">Conversion Breakdown</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={conversionData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }} />
              <Bar dataKey="value" name="Conversions" radius={[4, 4, 0, 0]}>
                {conversionData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Organic vs TracPost attribution */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-4">Traffic Source Attribution</h3>
          <div className="space-y-6 mt-4">
            {sourceData.map((s) => (
              <div key={s.source}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                    <span className="text-sm font-medium">{s.source}</span>
                  </div>
                  <span className="text-lg font-bold">{s.conversions.toLocaleString()}</span>
                </div>
                <div className="h-3 rounded-full bg-surface-hover">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${totalConversions > 0 ? (s.conversions / totalConversions) * 100 : 0}%`,
                      backgroundColor: s.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Future: ad spend ROI */}
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-[10px] text-muted">
              Ad spend attribution will appear here when campaign management is active.
            </p>
          </div>
        </div>
      </div>

      {/* No data */}
      {!gbp && !overview && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">Conversion data is being collected</p>
          <p className="mt-1 text-xs text-muted">Connect Google Business Profile and wait for GA4 data to accumulate.</p>
        </div>
      )}
    </div>
  );
}
