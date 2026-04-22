"use client";

import { useEffect, useRef, useState } from "react";

interface MapMarker {
  city: string;
  region: string;
  lat: number;
  lng: number;
  users: number;
}

interface GeoMapProps {
  markers: MapMarker[];
  height?: number;
}

// Common US cities → coordinates lookup
const CITY_COORDS: Record<string, [number, number]> = {
  "Pittsburgh": [40.4406, -79.9959],
  "New York": [40.7128, -74.0060],
  "Los Angeles": [34.0522, -118.2437],
  "Chicago": [41.8781, -87.6298],
  "Houston": [29.7604, -95.3698],
  "Phoenix": [33.4484, -112.0740],
  "Philadelphia": [39.9526, -75.1652],
  "San Antonio": [29.4241, -98.4936],
  "San Diego": [32.7157, -117.1611],
  "Dallas": [32.7767, -96.7970],
  "Austin": [30.2672, -97.7431],
  "Miami": [25.7617, -80.1918],
  "Atlanta": [33.7490, -84.3880],
  "Boston": [42.3601, -71.0589],
  "Seattle": [47.6062, -122.3321],
  "Denver": [39.7392, -104.9903],
  "Nashville": [36.1627, -86.7816],
  "Portland": [45.5152, -122.6784],
  "Las Vegas": [36.1699, -115.1398],
  "Detroit": [42.3314, -83.0458],
  "Minneapolis": [44.9778, -93.2650],
  "Tampa": [27.9506, -82.4572],
  "Charlotte": [35.2271, -80.8431],
  "San Francisco": [37.7749, -122.4194],
  "Washington": [38.9072, -77.0369],
  "Cleveland": [41.4993, -81.6944],
  "Cincinnati": [39.1031, -84.5120],
  "Columbus": [39.9612, -82.9988],
  "Indianapolis": [39.7684, -86.1581],
  "Raleigh": [35.7796, -78.6382],
  "Baltimore": [39.2904, -76.6122],
  "St. Louis": [38.6270, -90.1994],
  "Orlando": [28.5383, -81.3792],
  "San Jose": [37.3382, -121.8863],
  "Milwaukee": [43.0389, -87.9065],
  "Jacksonville": [30.3322, -81.6557],
  "Memphis": [35.1495, -90.0490],
  "London": [51.5074, -0.1278],
  "Toronto": [43.6532, -79.3832],
  "Mumbai": [19.0760, 72.8777],
  "Sydney": [-33.8688, 151.2093],
  "Berlin": [52.5200, 13.4050],
  "Paris": [48.8566, 2.3522],
  "Tokyo": [35.6762, 139.6503],
  "(not set)": [0, 0],
};

function lookupCoords(city: string): [number, number] | null {
  // Exact match
  if (CITY_COORDS[city]) return CITY_COORDS[city];
  // Partial match
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (city.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(city.toLowerCase())) {
      return coords;
    }
  }
  return null;
}

export function GeoMap({ markers, height = 400 }: GeoMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    import("mapbox-gl").then((mapboxgl) => {
      mapboxgl.default.accessToken = token;

      const map = new mapboxgl.default.Map({
        container: mapContainer.current!,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-95, 38],
        zoom: 3.5,
        attributionControl: false,
      });

      map.addControl(new mapboxgl.default.NavigationControl(), "top-right");

      map.on("load", () => {
        mapRef.current = map;
        setLoaded(true);
      });

      return () => map.remove();
    });
  }, []);

  // Add markers when map is loaded and data is available
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const map = mapRef.current;

    // Remove existing source/layers
    if (map.getLayer("markers-pulse")) map.removeLayer("markers-pulse");
    if (map.getLayer("markers-core")) map.removeLayer("markers-core");
    if (map.getLayer("markers-label")) map.removeLayer("markers-label");
    if (map.getSource("markers")) map.removeSource("markers");

    const maxUsers = Math.max(...markers.map((m) => m.users), 1);

    const features = markers
      .filter((m) => m.lat !== 0 && m.lng !== 0)
      .map((m) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [m.lng, m.lat],
        },
        properties: {
          city: m.city,
          region: m.region,
          users: m.users,
          size: Math.max(8, Math.min(40, (m.users / maxUsers) * 40)),
        },
      }));

    map.addSource("markers", {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });

    // Pulsing outer ring
    map.addLayer({
      id: "markers-pulse",
      type: "circle",
      source: "markers",
      paint: {
        "circle-radius": ["get", "size"],
        "circle-color": "rgba(59, 130, 246, 0.15)",
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(59, 130, 246, 0.3)",
      },
    });

    // Core dot
    map.addLayer({
      id: "markers-core",
      type: "circle",
      source: "markers",
      paint: {
        "circle-radius": ["*", ["get", "size"], 0.4],
        "circle-color": "#3b82f6",
        "circle-opacity": 0.9,
      },
    });

    // Labels
    map.addLayer({
      id: "markers-label",
      type: "symbol",
      source: "markers",
      layout: {
        "text-field": ["concat", ["get", "city"], "\n", ["to-string", ["get", "users"]]],
        "text-size": 10,
        "text-offset": [0, 1.5],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#94a3b8",
        "text-halo-color": "#0f172a",
        "text-halo-width": 1,
      },
    });

    // Popup on click
    map.on("click", "markers-core", (e) => {
      const props = e.features?.[0]?.properties;
      if (!props) return;
      const coords = (e.features?.[0]?.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

      import("mapbox-gl").then((mapboxgl) => {
        new mapboxgl.default.Popup({ closeButton: false, className: "tp-popup" })
          .setLngLat(coords)
          .setHTML(`
            <div style="padding:8px;font-family:system-ui;font-size:12px;color:#fff;">
              <strong>${props.city}</strong>${props.region ? `, ${props.region}` : ""}
              <br/>${props.users} visitor${props.users !== 1 ? "s" : ""}
            </div>
          `)
          .addTo(map);
      });
    });

    map.on("mouseenter", "markers-core", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "markers-core", () => { map.getCanvas().style.cursor = ""; });

    // Fit bounds to markers if we have data
    if (features.length > 1) {
      const lngs = features.map((f) => f.geometry.coordinates[0]);
      const lats = features.map((f) => f.geometry.coordinates[1]);
      map.fitBounds(
        [[Math.min(...lngs) - 2, Math.min(...lats) - 2], [Math.max(...lngs) + 2, Math.max(...lats) + 2]],
        { padding: 50, maxZoom: 10 }
      );
    }
  }, [loaded, markers]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-border shadow-card">
      <div ref={mapContainer} style={{ height }} />
      <style jsx global>{`
        .mapboxgl-popup-content {
          background: #1a1a1a !important;
          border-radius: 8px !important;
          padding: 0 !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
        }
        .mapboxgl-popup-tip {
          border-top-color: #1a1a1a !important;
        }
      `}</style>
    </div>
  );
}

export { lookupCoords };
export type { MapMarker };
