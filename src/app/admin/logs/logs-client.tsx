"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface LogEntry {
  timestamp: string;
  severity: string;
  message: string;
  route: string;
  method: string;
  statusCode: number | null;
  duration: number | null;
  source: string;
  host: string;
  region: string;
}

const SEVERITY_COLORS: Record<string, { dot: string; text: string; bg: string }> = {
  error: { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" },
  warning: { dot: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-500/10" },
  info: { dot: "bg-blue-500", text: "text-blue-400", bg: "bg-blue-500/10" },
  debug: { dot: "bg-gray-500", text: "text-gray-400", bg: "bg-gray-500/10" },
};

const METHOD_COLORS: Record<string, string> = {
  GET: "text-green-400",
  POST: "text-blue-400",
  PUT: "text-amber-400",
  PATCH: "text-amber-400",
  DELETE: "text-red-400",
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function LogsClient() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState("");
  const [route, setRoute] = useState("");
  const [search, setSearch] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams();
    if (severity) params.set("severity", severity);
    if (route) params.set("route", route);
    if (search) params.set("search", search);
    params.set("minutes", String(minutes));

    try {
      const res = await fetch(`/api/admin/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [severity, route, search, minutes]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const errorCount = entries.filter((e) => e.severity === "error").length;
  const warnCount = entries.filter((e) => e.severity === "warning").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Platform Logs</h1>
          <p className="text-xs text-muted">
            {entries.length} entries
            {errorCount > 0 && <span className="ml-2 text-red-400">{errorCount} errors</span>}
            {warnCount > 0 && <span className="ml-2 text-amber-400">{warnCount} warnings</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`rounded px-2.5 py-1 text-[11px] border transition-colors ${
              autoRefresh
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {autoRefresh ? "● Live" : "○ Paused"}
          </button>
          <button
            onClick={() => { setLoading(true); fetchLogs(); }}
            className="rounded border border-border px-2.5 py-1 text-[11px] text-muted hover:text-foreground"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded border border-border bg-background px-2.5 py-1.5 text-xs"
        >
          <option value="">All severity</option>
          <option value="error">Errors & warnings</option>
          <option value="warning">Warnings</option>
          <option value="info">Info</option>
        </select>

        <select
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="rounded border border-border bg-background px-2.5 py-1.5 text-xs"
        >
          <option value={15}>Last 15 min</option>
          <option value={60}>Last hour</option>
          <option value={360}>Last 6 hours</option>
          <option value={1440}>Last 24 hours</option>
        </select>

        <input
          type="text"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          placeholder="Filter by route..."
          className="rounded border border-border bg-background px-2.5 py-1.5 text-xs w-44"
        />

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search message..."
          className="rounded border border-border bg-background px-2.5 py-1.5 text-xs w-44"
        />

        {(severity || route || search || minutes !== 60) && (
          <button
            onClick={() => { setSeverity(""); setRoute(""); setSearch(""); setMinutes(60); }}
            className="text-[11px] text-muted hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Log stream */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">No logs found</p>
          <p className="mt-1 text-xs text-muted">Try adjusting your filters or time range.</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="rounded-xl border border-border bg-surface shadow-card overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] text-muted">
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left w-20">Time</th>
                  <th className="px-3 py-2 text-left w-14">Method</th>
                  <th className="px-3 py-2 text-left">Route</th>
                  <th className="px-3 py-2 text-right w-12">Status</th>
                  <th className="px-3 py-2 text-right w-16">Duration</th>
                  <th className="px-3 py-2 text-left">Message</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[11px]">
                {entries.map((entry, i) => {
                  const colors = SEVERITY_COLORS[entry.severity] || SEVERITY_COLORS.info;
                  const isExpanded = expanded === i;
                  const statusColor = entry.statusCode
                    ? entry.statusCode >= 500 ? "text-red-400"
                    : entry.statusCode >= 400 ? "text-amber-400"
                    : "text-green-400"
                    : "text-muted";

                  return (
                    <tr
                      key={i}
                      onClick={() => setExpanded(isExpanded ? null : i)}
                      className={`border-b border-border last:border-0 cursor-pointer transition-colors hover:bg-surface-hover ${
                        isExpanded ? "bg-surface-hover" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                      </td>
                      <td className="px-3 py-1.5 text-muted whitespace-nowrap">
                        <span title={entry.timestamp}>{formatTime(entry.timestamp)}</span>
                      </td>
                      <td className={`px-3 py-1.5 font-medium ${METHOD_COLORS[entry.method] || "text-muted"}`}>
                        {entry.method}
                      </td>
                      <td className="px-3 py-1.5 truncate max-w-[280px]" title={entry.route}>
                        {entry.route}
                      </td>
                      <td className={`px-3 py-1.5 text-right ${statusColor}`}>
                        {entry.statusCode || "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-muted">
                        {entry.duration ? `${entry.duration}ms` : "—"}
                      </td>
                      <td className="px-3 py-1.5 truncate max-w-[300px]" title={entry.message}>
                        {entry.message || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Expanded detail */}
          {expanded !== null && entries[expanded] && (
            <div className="border-t border-border bg-black/20 p-4 font-mono text-[11px]">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                <div><span className="text-muted">Timestamp:</span> {entries[expanded].timestamp}</div>
                <div><span className="text-muted">Date:</span> {formatDate(entries[expanded].timestamp)}</div>
                <div><span className="text-muted">Severity:</span> <span className={SEVERITY_COLORS[entries[expanded].severity]?.text || ""}>{entries[expanded].severity}</span></div>
                <div><span className="text-muted">Source:</span> {entries[expanded].source || "—"}</div>
                <div><span className="text-muted">Region:</span> {entries[expanded].region || "—"}</div>
                <div><span className="text-muted">Host:</span> {entries[expanded].host || "—"}</div>
                <div className="col-span-2"><span className="text-muted">Route:</span> {entries[expanded].method} {entries[expanded].route}</div>
                {entries[expanded].message && (
                  <div className="col-span-2 mt-2">
                    <p className="text-muted mb-1">Message:</p>
                    <pre className="whitespace-pre-wrap rounded bg-black/30 p-2 text-[10px]">{entries[expanded].message}</pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
