"use client";

/**
 * Asset approval card — surfaces the three TracPost-canonical decisions
 * the subscriber needs to make before a cascade commit:
 *
 *   1. Promote new brands (NER caught a brand not in catalog)
 *   2. Promote new projects (NER caught a project not in catalog,
 *      optional inline LocationPicker so address lands at create time)
 *   3. Settle project ambiguity (geofence surfaced multiple project
 *      candidates that didn't auto-bind)
 *
 * GBP-canonical entities (service areas, gcids) are deliberately NOT
 * shown — TracPost matches against GBP, never authors. See
 * project_tracpost_canonical_promotion_rule.md.
 *
 * Auto-binding (matched brands/projects/service areas) commits silently;
 * those don't appear here. Subscriber sees this card ONLY when there's
 * a decision to make. Renders nothing when all three sections are empty.
 *
 * State is controlled by the parent (asset-categories-section). Parent
 * passes the current selection in `value` and reads back the same shape
 * on commit. Defaults to all-checked — low friction, subscriber unchecks
 * rare misfires.
 */

import { useState } from "react";
import { LocationPicker, type PickedPlace } from "./location-picker";

export interface BrandSuggestion {
  /** NER text exactly as caught — used as both display + DB name. */
  name: string;
  context?: string;
}

export interface ProjectSuggestion {
  name: string;
  context?: string;
}

export interface GeoCandidate {
  project_id: string;
  name: string;
  slug: string;
  distance_m: number;
}

export interface ApprovalSelection {
  /** Brand names the subscriber has checked for promotion. */
  brands_to_create: BrandSuggestion[];
  /** Project promotions, each with optional inline-picked address. */
  projects_to_create: Array<{
    name: string;
    context?: string;
    place_id?: string | null;
    gps_lat?: number | null;
    gps_lng?: number | null;
    formatted_address?: string | null;
  }>;
  /** Project IDs from geo_candidates the subscriber has checked. */
  project_bindings: string[];
}

interface Props {
  brandSuggestions: BrandSuggestion[];
  projectSuggestions: ProjectSuggestion[];
  geoCandidates: GeoCandidate[];
  value: ApprovalSelection;
  onChange: (next: ApprovalSelection) => void;
  disabled?: boolean;
}

export function AssetApprovalCard({
  brandSuggestions,
  projectSuggestions,
  geoCandidates,
  value,
  onChange,
  disabled,
}: Props) {
  // Track which project rows have their inline LocationPicker open.
  // Local state — picker visibility doesn't need to round-trip through
  // the parent.
  const [pickerOpenFor, setPickerOpenFor] = useState<Set<string>>(new Set());

  const hasAnything =
    brandSuggestions.length > 0 ||
    projectSuggestions.length > 0 ||
    geoCandidates.length > 0;
  if (!hasAnything) return null;

  const checkedBrandNames = new Set(value.brands_to_create.map((b) => b.name));
  const checkedProjectNames = new Set(value.projects_to_create.map((p) => p.name));
  const checkedBindings = new Set(value.project_bindings);

  function toggleBrand(b: BrandSuggestion) {
    if (checkedBrandNames.has(b.name)) {
      onChange({
        ...value,
        brands_to_create: value.brands_to_create.filter((x) => x.name !== b.name),
      });
    } else {
      onChange({
        ...value,
        brands_to_create: [...value.brands_to_create, b],
      });
    }
  }

  function toggleProject(p: ProjectSuggestion) {
    if (checkedProjectNames.has(p.name)) {
      onChange({
        ...value,
        projects_to_create: value.projects_to_create.filter((x) => x.name !== p.name),
      });
    } else {
      onChange({
        ...value,
        projects_to_create: [
          ...value.projects_to_create,
          { name: p.name, context: p.context },
        ],
      });
    }
  }

  function setProjectAddress(name: string, place: PickedPlace | null) {
    onChange({
      ...value,
      projects_to_create: value.projects_to_create.map((p) =>
        p.name === name
          ? {
              ...p,
              place_id: place?.placeId ?? null,
              gps_lat: place?.lat ?? null,
              gps_lng: place?.lon ?? null,
              formatted_address: place?.formattedAddress ?? null,
            }
          : p,
      ),
    });
  }

  function togglePicker(name: string) {
    setPickerOpenFor((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleBinding(projectId: string) {
    if (checkedBindings.has(projectId)) {
      onChange({
        ...value,
        project_bindings: value.project_bindings.filter((id) => id !== projectId),
      });
    } else {
      onChange({
        ...value,
        project_bindings: [...value.project_bindings, projectId],
      });
    }
  }

  function formatDistance(m: number): string {
    if (m < 1) return "0m";
    if (m < 100) return `${Math.round(m)}m`;
    if (m < 1000) return `${Math.round(m / 10) * 10}m`;
    return `${(m / 1000).toFixed(1)}km`;
  }

  return (
    <div className="mb-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
      <h4 className="mb-2 text-xs font-semibold text-accent">
        Approve suggestions
      </h4>

      {brandSuggestions.length > 0 && (
        <section className="mb-3">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            New brands
          </div>
          <ul className="space-y-1.5">
            {brandSuggestions.map((b) => {
              const checked = checkedBrandNames.has(b.name);
              return (
                <li key={b.name} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBrand(b)}
                    disabled={disabled}
                    className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
                    id={`brand-${b.name}`}
                  />
                  <label
                    htmlFor={`brand-${b.name}`}
                    className="flex-1 cursor-pointer text-xs"
                  >
                    <span className="font-medium">{b.name}</span>
                    {b.context && (
                      <span className="ml-2 text-[10px] italic text-muted">
                        “…{b.context}…”
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {projectSuggestions.length > 0 && (
        <section className="mb-3">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            New projects
          </div>
          <ul className="space-y-1.5">
            {projectSuggestions.map((p) => {
              const checked = checkedProjectNames.has(p.name);
              const picked = value.projects_to_create.find((x) => x.name === p.name);
              const hasAddress = Boolean(picked?.place_id);
              const pickerOpen = pickerOpenFor.has(p.name);
              return (
                <li key={p.name}>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProject(p)}
                      disabled={disabled}
                      className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
                      id={`project-${p.name}`}
                    />
                    <label
                      htmlFor={`project-${p.name}`}
                      className="flex-1 cursor-pointer text-xs"
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.context && (
                        <span className="ml-2 text-[10px] italic text-muted">
                          “…{p.context}…”
                        </span>
                      )}
                    </label>
                    {checked && (
                      <button
                        type="button"
                        onClick={() => togglePicker(p.name)}
                        disabled={disabled}
                        className="text-[10px] text-accent hover:underline disabled:opacity-50"
                      >
                        {hasAddress
                          ? "Edit address"
                          : pickerOpen
                            ? "Skip"
                            : "+ Address"}
                      </button>
                    )}
                  </div>
                  {checked && pickerOpen && (
                    <div className="ml-5 mt-1.5">
                      <LocationPicker
                        value={
                          picked?.place_id && picked.gps_lat != null && picked.gps_lng != null
                            ? {
                                placeId: picked.place_id,
                                placeName: picked.formatted_address || p.name,
                                formattedAddress: picked.formatted_address || "",
                                lat: picked.gps_lat,
                                lon: picked.gps_lng,
                              }
                            : null
                        }
                        onChange={(place) => setProjectAddress(p.name, place)}
                        disabled={disabled}
                        placeholder="Project address (optional)"
                      />
                    </div>
                  )}
                  {checked && hasAddress && !pickerOpen && (
                    <div className="ml-5 mt-0.5 text-[10px] text-muted">
                      📍 {picked?.formatted_address}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {geoCandidates.length > 0 && (
        <section>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            Project location {geoCandidates.length > 1 ? "(pick which apply)" : ""}
          </div>
          <p className="mb-1.5 text-[10px] text-muted">
            This asset&apos;s GPS matched {geoCandidates.length === 1 ? "a project" : `${geoCandidates.length} projects`} within 200m:
          </p>
          <ul className="space-y-1">
            {geoCandidates.map((c) => {
              const checked = checkedBindings.has(c.project_id);
              return (
                <li key={c.project_id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBinding(c.project_id)}
                    disabled={disabled}
                    className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-accent"
                    id={`bind-${c.project_id}`}
                  />
                  <label
                    htmlFor={`bind-${c.project_id}`}
                    className="flex-1 cursor-pointer text-xs"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-[10px] text-muted">
                      {formatDistance(c.distance_m)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
