"use client";

interface FilterBarProps {
  activeStatus: string | null;
  activeRating: string | null;
  counts: {
    total: number;
    needs_reply: number;
    draft_ready: number;
    replied: number;
  };
  onStatusChange: (status: string | null) => void;
  onRatingChange: (rating: string | null) => void;
}

const STATUS_FILTERS = [
  { key: null, label: "All" },
  { key: "needs_reply", label: "Needs Reply" },
  { key: "draft_ready", label: "Draft Ready" },
  { key: "replied", label: "Replied" },
] as const;

const RATING_FILTERS = [
  { key: null, label: "All Ratings" },
  { key: "negative", label: "1-3 Stars" },
  { key: "positive", label: "4-5 Stars" },
] as const;

export function ReviewFilterBar({
  activeStatus,
  activeRating,
  counts,
  onStatusChange,
  onRatingChange,
}: FilterBarProps) {
  function countFor(key: string | null) {
    if (!key) return counts.total;
    return (counts as Record<string, number>)[key] ?? 0;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <div className="flex gap-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key ?? "all"}
            onClick={() => onStatusChange(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeStatus === f.key
                ? "bg-accent text-white"
                : "bg-surface-hover text-muted hover:text-foreground"
            }`}
          >
            {f.label}
            {f.key !== null && (
              <span className="ml-1 opacity-70">{countFor(f.key)}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mx-2 h-4 w-px bg-border" />

      <div className="flex gap-1">
        {RATING_FILTERS.map((f) => (
          <button
            key={f.key ?? "all-ratings"}
            onClick={() => onRatingChange(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeRating === f.key
                ? "bg-accent text-white"
                : "bg-surface-hover text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
