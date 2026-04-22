"use client";

import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { GeoMap, lookupCoords, type MapMarker } from "@/components/analytics/geo-map";

interface CityData {
  city: string;
  region: string;
  users: number;
  lat?: number;
  lng?: number;
}

interface DeviceData {
  category: string;
  users: number;
  percentage: number;
}

const DEVICE_COLORS: Record<string, string> = {
  mobile: "#3b82f6",
  desktop: "#22c55e",
  tablet: "#f59e0b",
};

const DEVICE_ICONS: Record<string, string> = {
  mobile: "📱",
  desktop: "🖥️",
  tablet: "📋",
};

export function AudienceClient({ siteId }: { siteId: string }) {
  const [geography, setGeography] = useState<CityData[] | null>(null);
  const [devices, setDevices] = useState<DeviceData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/analytics?site_id=${siteId}&report=geography&days=${days}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/analytics?site_id=${siteId}&report=devices&days=${days}`).then(r => r.ok ? r.json() : null),
    ])
      .then(([geo, dev]) => {
        setGeography(geo);
        setDevices(dev);
      })
      .finally(() => setLoading(false));
  }, [siteId, days]);

  const mapMarkers: MapMarker[] = useMemo(() => {
    if (!geography) return [];
    return geography
      .map((city) => {
        const coords = city.lat && city.lng
          ? [city.lat, city.lng] as [number, number]
          : lookupCoords(city.city);
        if (!coords) return null;
        return { city: city.city, region: city.region, lat: coords[0], lng: coords[1], users: city.users };
      })
      .filter((m): m is MapMarker => m !== null);
  }, [geography]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const totalGeoUsers = geography?.reduce((s, c) => s + c.users, 0) || 0;

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Who visits your site</h2>
          <p className="text-xs text-muted">Geographic location and device breakdown of your visitors</p>
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

      {/* Geographic map */}
      {mapMarkers.length > 0 && (
        <GeoMap markers={mapMarkers} height={420} />
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Geography — top cities */}
        {geography && geography.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Top Cities</h3>
            <p className="text-xs text-muted mb-4">Where your visitors are located</p>
            <div className="space-y-1">
              {geography.slice(0, 12).map((city, i) => {
                const pct = totalGeoUsers > 0 ? (city.users / totalGeoUsers) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                    <span className="w-5 text-right text-[10px] text-muted">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs truncate">{city.city}{city.region ? `, ${city.region}` : ""}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{city.users.toLocaleString()}</span>
                          <span className="text-[9px] text-muted w-8 text-right">{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="mt-0.5 h-1 rounded-full bg-surface-hover">
                        <div className="h-full rounded-full bg-accent/40" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Devices */}
        {devices && devices.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-1">Devices</h3>
            <p className="text-xs text-muted mb-4">How visitors access your site</p>

            <div className="flex items-center gap-8">
              {/* Pie chart */}
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={devices}
                      dataKey="users"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {devices.map((entry, index) => (
                        <Cell key={index} fill={DEVICE_COLORS[entry.category.toLowerCase()] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1a1a1a", border: "none", borderRadius: 8, fontSize: 12, color: "#fff" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend + stats */}
              <div className="flex-1 space-y-3">
                {devices.map((device) => (
                  <div key={device.category} className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: DEVICE_COLORS[device.category.toLowerCase()] || "#94a3b8" }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs capitalize">{device.category}</span>
                        <span className="text-xs font-medium">{device.percentage}%</span>
                      </div>
                      <p className="text-[10px] text-muted">{device.users.toLocaleString()} users</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* No data */}
      {!geography && !devices && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">Analytics are being collected</p>
          <p className="mt-1 text-xs text-muted">GA4 data takes 24-48 hours to start reporting.</p>
        </div>
      )}
    </div>
  );
}
