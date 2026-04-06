"use client";

import { useRouter } from "next/navigation";

interface Counts {
  total: number;
  uploads: number;
  ai_generated: number;
  high_quality: number;
  medium_quality: number;
  low_quality: number;
}

interface ProjectOption {
  id: string;
  name: string;
}

export function MediaFilters({
  sourceFilter,
  mediaTypeFilter,
  sceneFilter,
  qualityFilter,
  sortOrder,
  projectFilter,
  counts,
  projects = [],
}: {
  sourceFilter: string;
  mediaTypeFilter: string;
  sceneFilter: string;
  qualityFilter: string;
  sortOrder: string;
  projectFilter: string;
  counts: Counts;
  projects?: ProjectOption[];
}) {
  const router = useRouter();

  // On mount: restore persisted preferences if no explicit URL params
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      let needsRedirect = false;
      const persistedSort = localStorage.getItem("tp_media_sort");
      if (persistedSort && !url.searchParams.has("sort") && persistedSort !== "newest") {
        url.searchParams.set("sort", persistedSort);
        needsRedirect = true;
      }
      const persistedProject = localStorage.getItem("tp_media_project");
      if (persistedProject && !url.searchParams.has("project")) {
        url.searchParams.set("project", persistedProject);
        needsRedirect = true;
      }
      if (needsRedirect) {
        window.location.href = url.toString();
      }
    } catch { /* ignore */ }
  }

  function persist(key: string, value: string) {
    try { localStorage.setItem(`tp_media_${key}`, value); } catch { /* ignore */ }
  }

  function updateParams(updates: Record<string, string>) {
    if (updates.sort) persist("sort", updates.sort);
    if (updates.project !== undefined) persist("project", updates.project);
    const params = new URLSearchParams();
    const merged = {
      source: sourceFilter,
      type: mediaTypeFilter,
      scene: sceneFilter,
      quality: qualityFilter,
      sort: sortOrder,
      project: projectFilter,
      ...updates,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && v !== "newest") {
        params.set(k, v);
      }
    }
    const qs = params.toString();
    const url = `/dashboard/media${qs ? `?${qs}` : ""}`;
    window.location.href = url;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {/* Source filter */}
      <div className="flex gap-1">
        {([
          { value: "all", label: "All", count: counts.total },
          { value: "upload", label: "Uploads", count: counts.uploads },
          { value: "ai_generated", label: "AI", count: counts.ai_generated },
        ]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => updateParams({ source: opt.value })}
            className={`rounded px-2.5 py-1 text-[10px] font-medium transition-colors ${
              sourceFilter === opt.value
                ? "bg-accent text-white"
                : "bg-surface-hover text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
            {opt.count > 0 && (
              <span className={`ml-1 ${sourceFilter === opt.value ? "text-white/70" : "text-muted"}`}>
                {opt.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Media type filter */}
      <select
        key="media-type"
        value={mediaTypeFilter}
        onChange={(e) => updateParams({ type: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="all">All types</option>
        <option value="image">Images</option>
        <option value="video">Videos</option>
      </select>

      {/* Scene type filter */}
      <select
        key="scene-type"
        value={sceneFilter}
        onChange={(e) => updateParams({ scene: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="all">All scenes</option>
        <option value="humans">Humans</option>
        <option value="environment">Environment</option>
        <option value="product">Product</option>
        <option value="method">Method</option>
        <option value="region">Region</option>
      </select>

      {/* Quality filter */}
      <select
        key="quality"
        value={qualityFilter}
        onChange={(e) => updateParams({ quality: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="all">All quality</option>
        <option value="high">High 80%+ ({counts.high_quality})</option>
        <option value="medium">Medium 50-79% ({counts.medium_quality})</option>
        <option value="low">Low &lt;50% ({counts.low_quality})</option>
      </select>

      {/* Sort */}
      <select
        key="sort"
        value={sortOrder}
        onChange={(e) => updateParams({ sort: e.target.value })}
        className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="quality">Quality</option>
        <option value="least_used">Least used</option>
      </select>

      {/* Project filter */}
      {projects.length > 0 && (
        <select
          key="project"
          value={projectFilter}
          onChange={(e) => updateParams({ project: e.target.value })}
          className="bg-surface-hover px-2 py-1 text-[10px] text-muted"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
