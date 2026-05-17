"use client";

import { useState } from "react";

/**
 * Reusable JSON tree viewer.
 *
 * Designed for inspecting structured artifacts across the dashboard —
 * cascade analysis, generator output, API responses, debugging.
 *
 * UX principles:
 *   - Every object/array node has a clickable ▸/▾ chevron handle.
 *   - When collapsed, a node still surfaces its IMMEDIATE child keys
 *     as a one-line peek (e.g. `{ entities: {…}, scene_types: [2] }`)
 *     so structure stays visible without expanding. This means even a
 *     fully-collapsed tree shows two depths of label at a glance:
 *     the parent's keys (because the root stays open) and each value's
 *     own keys (via the peek).
 *   - Expand all / Collapse all bumps a key on the wrapping container
 *     to re-mount the tree with a new defaultOpenDepth.
 *
 * Phase 1 = read-only. `editable` prop is reserved but not wired —
 * inline editing lands in Phase 2 once we've used the viewer in a few
 * surfaces and learned the right ergonomics.
 */

export interface JsonViewerProps {
  value: unknown;
  /** How many nesting levels open by default. 0 = everything collapsed
   * (root still shows its key peek). 1 = root open, children collapsed.
   * 999 = fully expanded. Default 1 — the natural "I want to see the
   * shape" entry view. */
  defaultOpenDepth?: number;
  /** Reserved for Phase 2 — not yet wired. */
  editable?: boolean;
  /** Reserved for Phase 2 — not yet wired. */
  onChange?: (next: unknown) => void;
  /** Optional className passthrough on the outer container. */
  className?: string;
}

/**
 * Top-level viewer with built-in Expand all / Collapse all toolbar.
 * Use this when you want the controls; use `<JsonNode>` directly when
 * you want bare tree rendering inside your own chrome.
 */
export function JsonViewer({
  value,
  defaultOpenDepth = 1,
  className = "",
}: JsonViewerProps) {
  const [openDepth, setOpenDepth] = useState(defaultOpenDepth);
  const [treeKey, setTreeKey] = useState(0);

  // Flex layout so the inner scroll viewport actually owns the
  // height constraint passed in via className (e.g. `max-h-[28rem]`).
  // Without `flex-1 min-h-0 overflow-auto` on the inner, the tree
  // grows to fit and parent modals end up scrolling instead of the
  // viewer's own content. `min-h-0` is required to defeat flexbox's
  // default min-content sizing inside a constrained column.
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="mb-2 flex shrink-0 items-center justify-end gap-2 text-[11px] text-muted">
        <button
          onClick={() => {
            setOpenDepth(999);
            setTreeKey((k) => k + 1);
          }}
          className="hover:text-accent"
        >
          Expand all
        </button>
        <span className="text-muted/40">·</span>
        <button
          onClick={() => {
            setOpenDepth(1);
            setTreeKey((k) => k + 1);
          }}
          className="hover:text-accent"
        >
          Collapse all
        </button>
      </div>
      <div
        key={treeKey}
        className="min-h-0 flex-1 overflow-auto overscroll-contain rounded border border-border bg-background p-3 font-mono text-xs leading-relaxed"
      >
        <JsonNode value={value} depth={0} defaultOpenDepth={openDepth} />
      </div>
    </div>
  );
}

/**
 * Recursive node renderer. Exported separately for callers that want
 * to compose their own toolbar / scroll container around the tree.
 */
export function JsonNode({
  value,
  depth = 0,
  defaultOpenDepth = 1,
}: {
  value: unknown;
  depth?: number;
  defaultOpenDepth?: number;
}) {
  if (value === null) return <PrimitiveSpan kind="null">null</PrimitiveSpan>;
  if (value === undefined) return <PrimitiveSpan kind="null">undefined</PrimitiveSpan>;
  if (typeof value === "boolean") return <PrimitiveSpan kind="bool">{String(value)}</PrimitiveSpan>;
  if (typeof value === "number") return <PrimitiveSpan kind="number">{value}</PrimitiveSpan>;
  if (typeof value === "string") return <PrimitiveSpan kind="string">&quot;{value}&quot;</PrimitiveSpan>;

  if (Array.isArray(value)) {
    return (
      <ArrayNode value={value} depth={depth} defaultOpenDepth={defaultOpenDepth} />
    );
  }

  if (typeof value === "object") {
    return (
      <ObjectNode
        value={value as Record<string, unknown>}
        depth={depth}
        defaultOpenDepth={defaultOpenDepth}
      />
    );
  }

  return <span>{String(value)}</span>;
}

// ----- internals -----

function PrimitiveSpan({
  kind,
  children,
}: {
  kind: "null" | "bool" | "number" | "string";
  children: React.ReactNode;
}) {
  const color =
    kind === "null"
      ? "text-muted"
      : kind === "bool"
      ? "text-amber-700"
      : kind === "number"
      ? "text-accent"
      : "text-success";
  return <span className={color}>{children}</span>;
}

function Chevron({ open }: { open: boolean }) {
  // SVG chevron — larger and crisper than inline ▸/▾ glyphs which
  // rendered too small against text-xs body copy. Single icon
  // rotated 90° on open keeps it cheap and avoids glyph-substitution
  // differences across OSs.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 align-text-bottom text-muted transition-transform ${open ? "rotate-90" : ""}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ObjectNode({
  value,
  depth,
  defaultOpenDepth,
}: {
  value: Record<string, unknown>;
  depth: number;
  defaultOpenDepth: number;
}) {
  const entries = Object.entries(value);
  const [open, setOpen] = useState(depth < defaultOpenDepth);

  if (entries.length === 0) return <span className="text-muted">{"{}"}</span>;

  if (!open) {
    return (
      <span className="inline-flex items-baseline gap-1">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-baseline gap-1 hover:text-accent"
        >
          <Chevron open={false} />
          <span className="text-muted">{"{"}</span>
        </button>
        <span className="text-muted/80">
          {entries.map(([k, v], i) => (
            <span key={k}>
              <span className="text-foreground/70">{k}</span>
              <span className="text-muted">: </span>
              <PeekValue value={v} />
              {i < entries.length - 1 ? <span className="text-muted">, </span> : null}
            </span>
          ))}
        </span>
        <span className="text-muted">{"}"}</span>
      </span>
    );
  }

  const indent = (depth + 1) * 12;
  return (
    <>
      <button
        onClick={() => setOpen(false)}
        className="inline-flex items-baseline gap-1 hover:text-accent"
      >
        <Chevron open={true} />
        <span className="text-muted">{"{"}</span>
      </button>
      {entries.map(([k, v], i) => (
        <div key={k} style={{ paddingLeft: indent }}>
          <span className="text-foreground/90">&quot;{k}&quot;</span>
          <span className="text-muted">: </span>
          <JsonNode value={v} depth={depth + 1} defaultOpenDepth={defaultOpenDepth} />
          {i < entries.length - 1 ? <span className="text-muted">,</span> : null}
        </div>
      ))}
      <div style={{ paddingLeft: depth * 12 }} className="text-muted">
        {"}"}
      </div>
    </>
  );
}

function ArrayNode({
  value,
  depth,
  defaultOpenDepth,
}: {
  value: unknown[];
  depth: number;
  defaultOpenDepth: number;
}) {
  const [open, setOpen] = useState(depth < defaultOpenDepth);

  if (value.length === 0) return <span className="text-muted">[]</span>;

  if (!open) {
    // For arrays, peek inline: primitives shown literally (truncated
    // after 3); objects/arrays as their type-glyph.
    const PEEK_LIMIT = 3;
    const preview = value.slice(0, PEEK_LIMIT);
    const remainder = value.length - preview.length;
    return (
      <span className="inline-flex items-baseline gap-1">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-baseline gap-1 hover:text-accent"
        >
          <Chevron open={false} />
          <span className="text-muted">[</span>
        </button>
        <span className="text-muted/80">
          {preview.map((item, i) => (
            <span key={i}>
              <PeekValue value={item} />
              {i < preview.length - 1 ? <span className="text-muted">, </span> : null}
            </span>
          ))}
          {remainder > 0 ? (
            <span className="text-muted">, +{remainder} more</span>
          ) : null}
        </span>
        <span className="text-muted">]</span>
      </span>
    );
  }

  const indent = (depth + 1) * 12;
  return (
    <>
      <button
        onClick={() => setOpen(false)}
        className="inline-flex items-baseline gap-1 hover:text-accent"
      >
        <Chevron open={true} />
        <span className="text-muted">[</span>
      </button>
      {value.map((item, i) => (
        <div key={i} style={{ paddingLeft: indent }}>
          <span className="text-muted">{i}: </span>
          <JsonNode value={item} depth={depth + 1} defaultOpenDepth={defaultOpenDepth} />
          {i < value.length - 1 ? <span className="text-muted">,</span> : null}
        </div>
      ))}
      <div style={{ paddingLeft: depth * 12 }} className="text-muted">
        {"]"}
      </div>
    </>
  );
}

/**
 * One-glyph preview for use inside a parent's collapsed-peek summary.
 * Never recurses past one level — keeps the inline peek scannable.
 */
function PeekValue({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted">null</span>;
  if (value === undefined) return <span className="text-muted">undefined</span>;
  if (typeof value === "boolean") return <span className="text-amber-700">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-accent">{value}</span>;
  if (typeof value === "string") {
    const display = value.length > 24 ? value.slice(0, 24) + "…" : value;
    return <span className="text-success">&quot;{display}&quot;</span>;
  }
  if (Array.isArray(value)) return <span className="text-muted">[{value.length}]</span>;
  if (typeof value === "object") {
    const keyCount = Object.keys(value as Record<string, unknown>).length;
    return <span className="text-muted">{`{${keyCount}}`}</span>;
  }
  return <span>{String(value)}</span>;
}
