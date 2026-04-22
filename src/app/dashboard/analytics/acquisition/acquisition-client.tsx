"use client";

import { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";

interface TrendPoint {
  date: string;
  users: number;
  sessions: number;
  pageViews: number;
}

interface AcquisitionChannel {
  channel: string;
  users: number;
  sessions: number;
  newUsers: number;
}

interface Attribution {
  totalFromTracPost: number;
  byMedium: Array<{ medium: string; users: number }>;
}

const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search": "#22c55e",
  "Direct": "#3b82f6",
  "Paid Search": "#f59e0b",
  "Referral": "#8b5cf6",
  "Organic Social": "#ec4899",
  "Cross-network": "#06b6d4",
  "Unassigned": "#94a3b8",
};

const MEDIUM_COLORS: Record<string, string> = {
  gbp: "#4285F4",
  instagram: "#E4405F",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  pinterest: "#E60023",
  youtube: "#FF0000",
  email: "#22c55e",
  blog: "#8b5cf6",
};

export function AcquisitionClient({ siteId }: { siteId: string }) {
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [channels, setChannels] = useState<AcquisitionChannel[] | null>(null);
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/analytics?site_id=${siteId}&report=trend&days=${days}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics?site_id=${siteId}&report=acquisition&days=${days}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics?site_id=${siteId}&report=attribution&days=${days}`).then(r => r.ok ? r.json() : null),
    ])
      .then(([tr, ch, attr]) => {
        setTrend(tr);
        setChannels(ch);
        setAttribution(attr);
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

  const totalUsers = channels?.reduce((s, c) => s + c.users, 0) || 0;

  return (
    <div className="p-4 space-y-6">
      {/* Date range */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Where your traffic comes from</h2>
          <p className="text-xs text-muted">Breakdown by channel, source, and TracPost attribution</p>
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

      {/* Traffic trend by users + sessions */}
      {trend && trend.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-4">Users & Sessions Over Time</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="acqUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="acqSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="users" stroke="#3b82f6" fill="url(#acqUsers)" strokeWidth={2} name="Users" />
              <Area type="monotone" dataKey="sessions" stroke="#22c55e" fill="url(#acqSessions)" strokeWidth={2} name="Sessions" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Two-column: Channel pie + Channel table */}
      <div className="grid grid-cols-2 gap-4">
        {/* Channel distribution pie */}
        {channels && channels.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-4">Channel Distribution</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={channels}
                  dataKey="users"
                  nameKey="channel"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {channels.map((entry, index) => (
                    <Cell key={index} fill={CHANNEL_COLORS[entry.channel] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {channels.map((c) => (
                <div key={c.channel} className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[c.channel] || "#94a3b8" }} />
                  <span className="text-[10px] text-muted">{c.channel}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Channel detail table */}
        {channels && channels.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-4">Channel Performance</h3>
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-muted border-b border-border">
                  <th className="text-left pb-2">Channel</th>
                  <th className="text-right pb-2">Users</th>
                  <th className="text-right pb-2">New Users</th>
                  <th className="text-right pb-2">Sessions</th>
                  <th className="text-right pb-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channel} className="border-b border-border last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[c.channel] || "#94a3b8" }} />
                        <span className="text-xs">{c.channel}</span>
                      </div>
                    </td>
                    <td className="text-right text-xs">{c.users.toLocaleString()}</td>
                    <td className="text-right text-xs">{c.newUsers.toLocaleString()}</td>
                    <td className="text-right text-xs">{c.sessions.toLocaleString()}</td>
                    <td className="text-right text-xs text-muted">{totalUsers > 0 ? `${Math.round((c.users / totalUsers) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TracPost attribution detail */}
      {attribution && attribution.byMedium.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-2">TracPost Content Attribution</h3>
          <p className="text-xs text-muted mb-4">
            {attribution.totalFromTracPost} visitors arrived through TracPost-published content
            {totalUsers > 0 && ` (${Math.round((attribution.totalFromTracPost / totalUsers) * 100)}% of total traffic)`}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={attribution.byMedium}>
              <XAxis dataKey="medium" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }} />
              <Bar dataKey="users" name="Users" radius={[4, 4, 0, 0]}>
                {attribution.byMedium.map((entry, index) => (
                  <Cell key={index} fill={MEDIUM_COLORS[entry.medium] || "#3b82f6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* No data */}
      {!channels && !trend && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">Analytics are being collected</p>
          <p className="mt-1 text-xs text-muted">GA4 data takes 24-48 hours to start reporting.</p>
        </div>
      )}
    </div>
  );
}
