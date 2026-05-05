"use client";

import { useState, useEffect, useRef } from "react";

export interface PickedPlace {
  placeId: string;
  placeName: string;
  formattedAddress: string;
  lat: number;
  lon: number;
}

interface Prediction {
  placeId: string;
  placeName: string;
}

interface Props {
  value: PickedPlace | null;
  onChange: (place: PickedPlace | null) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export function LocationPicker({
  value,
  onChange,
  placeholder = "Search for your business or address",
  className,
  required,
  disabled,
}: Props) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleType(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/google/places-search?type=address&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        setPredictions(data.predictions || []);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  async function pickPrediction(p: Prediction) {
    // Reject synthetic manual_* placeholders — these only exist when the
    // Places API key is missing and would write garbage to canonical.
    if (p.placeId.startsWith("manual_")) return;
    setResolving(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/google/places-details/${encodeURIComponent(p.placeId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.latitude !== "number" || typeof data.longitude !== "number") return;
      onChange({
        placeId: data.placeId as string,
        placeName: (data.placeName as string) || p.placeName,
        formattedAddress: (data.formattedAddress as string) || p.placeName,
        lat: data.latitude as number,
        lon: data.longitude as number,
      });
      setQuery("");
      setPredictions([]);
    } finally {
      setResolving(false);
    }
  }

  function clearPicked() {
    onChange(null);
    setQuery("");
    setPredictions([]);
  }

  // Picked: chip-style display
  if (value) {
    return (
      <div className={`flex items-center gap-2 rounded border border-border bg-surface px-3 py-2 ${className || ""}`}>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">{value.placeName}</p>
          {value.formattedAddress && value.formattedAddress !== value.placeName && (
            <p className="text-[10px] text-muted truncate">{value.formattedAddress}</p>
          )}
        </div>
        <span className="rounded bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success shrink-0">canonical</span>
        <button
          type="button"
          onClick={clearPicked}
          disabled={disabled}
          className="text-xs text-muted hover:text-danger shrink-0 disabled:opacity-50"
          aria-label="Clear location"
        >
          ✕
        </button>
      </div>
    );
  }

  // Empty: search input + dropdown
  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full text-sm"
        required={required}
        disabled={disabled || resolving}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded border border-border bg-surface shadow-card max-h-64 overflow-auto">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted">Searching…</div>
          ) : predictions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">
              {query.length < 3 ? "Type at least 3 characters" : "No matches"}
            </div>
          ) : (
            predictions.map((p) => (
              <button
                key={p.placeId}
                type="button"
                onClick={() => pickPrediction(p)}
                disabled={p.placeId.startsWith("manual_")}
                className="block w-full text-left px-3 py-2 text-xs text-foreground hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {p.placeName}
              </button>
            ))
          )}
        </div>
      )}
      {resolving && <p className="mt-1 text-[10px] text-muted">Resolving location…</p>}
    </div>
  );
}
