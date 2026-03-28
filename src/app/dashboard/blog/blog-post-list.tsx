"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { markdownToHtml, blogProseStyles } from "@/lib/blog/markdown";

interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  og_image_url: string | null;
  status: string;
  content_type: string | null;
  content_pillar: string | null;
  metadata: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
}

interface Counts {
  total: number;
  draft: number;
  published: number;
  flagged: number;
}

const statusStyles: Record<string, string> = {
  draft: "bg-muted/20 text-muted",
  published: "bg-success/20 text-success",
  flagged: "bg-danger/20 text-danger",
};

export function BlogPostList({
  posts,
  statusFilter,
  sortOrder,
  currentPage,
  totalPages,
  totalCount,
  counts,
}: {
  posts: Post[];
  statusFilter: string;
  sortOrder: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  counts: Counts;
}) {
  const router = useRouter();
  const [previewing, setPreviewing] = useState<Post | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [repromptUrl, setRepromptUrl] = useState<string | null>(null);
  const [repromptNote, setRepromptNote] = useState("");
  const [reprompting, setReprompting] = useState(false);
  const proseRef = useRef<HTMLDivElement>(null);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { status: statusFilter, sort: sortOrder, page: String(currentPage), ...updates };
    // Reset to page 1 when changing filters/sort
    if (updates.status || updates.sort) merged.page = "1";
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && v !== "newest" && !(k === "page" && v === "1")) {
        params.set(k, v);
      }
    }
    const qs = params.toString();
    router.push(`/dashboard/blog${qs ? `?${qs}` : ""}`);
  }

  async function approvePost(postId: string) {
    setActing(postId);
    try {
      await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", post_id: postId }),
      });
      setPreviewing(null);
      router.refresh();
    } catch {
      alert("Failed to publish");
    } finally {
      setActing(null);
    }
  }

  async function rejectPost(postId: string) {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setActing(postId);
    try {
      await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", post_id: postId }),
      });
      setPreviewing(null);
      router.refresh();
    } catch {
      alert("Failed to delete");
    } finally {
      setActing(null);
    }
  }

  async function unpublishPost(postId: string) {
    setActing(postId);
    try {
      await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpublish", post_id: postId }),
      });
      setPreviewing(null);
      router.refresh();
    } catch {
      alert("Failed to unpublish");
    } finally {
      setActing(null);
    }
  }

  const guardFlags = (post: Post): string[] =>
    (post.metadata?.guard_flags as string[]) || [];

  const hasEditorialImages = (post: Post): boolean =>
    Array.isArray(post.metadata?.editorial_images) && (post.metadata.editorial_images as unknown[]).length > 0;

  // Attach click handlers to editorial images in the prose container
  const repromptFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!proseRef.current || !previewing) return;

    // Clean up any previously injected form
    if (repromptFormRef.current) {
      repromptFormRef.current.remove();
      repromptFormRef.current = null;
    }

    const imgs = proseRef.current.querySelectorAll("img");
    imgs.forEach((img) => {
      if (img.src.includes("/editorial/")) {
        img.style.cursor = "pointer";
        img.style.outline = repromptUrl === img.src ? "2px solid var(--accent)" : "";
        img.title = "Click to adjust this image";
        img.onclick = (e) => {
          e.preventDefault();
          setRepromptUrl(img.src);
          setRepromptNote("");
        };

        // Inject form right after the selected image
        if (repromptUrl === img.src) {
          const form = document.createElement("div");
          form.id = "reprompt-inline-form";
          form.style.cssText = "margin: 12px 0; padding: 12px; border: 1px solid var(--accent); border-radius: 8px; background: var(--surface-hover);";
          repromptFormRef.current = form;
          img.insertAdjacentElement("afterend", form);
        }
      }
    });
  }, [previewing, repromptUrl]);

  async function handleReprompt() {
    if (!previewing || !repromptUrl || !repromptNote.trim()) return;
    setReprompting(true);
    try {
      const res = await fetch("/api/blog/reprompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: previewing.id,
          image_url: repromptUrl,
          adjustment: repromptNote.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update the previewing post body with the new URL
        if (previewing.body) {
          setPreviewing({
            ...previewing,
            body: previewing.body.replace(repromptUrl, data.new_url),
          });
        }
        setRepromptUrl(null);
        setRepromptNote("");
      } else {
        const err = await res.json();
        alert(err.error || "Re-prompt failed");
      }
    } catch {
      alert("Re-prompt failed");
    } finally {
      setReprompting(false);
    }
  }

  return (
    <>
      {/* Filter bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1">
          {(["all", "draft", "published", "flagged"] as const).map((s) => {
            const count = s === "all" ? counts.total : counts[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => updateParams({ status: s })}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-accent text-white"
                    : "bg-surface-hover text-muted hover:text-foreground"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {count > 0 && (
                  <span className={`ml-1.5 ${active ? "text-white/70" : "text-muted"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <select
          value={sortOrder}
          onChange={(e) => updateParams({ sort: e.target.value })}
          className="bg-surface-hover px-3 py-1.5 text-xs text-muted"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A-Z</option>
        </select>
      </div>

      {/* Post list */}
      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-8 py-12 text-center">
          <p className="text-sm text-muted">
            {statusFilter === "all"
              ? "No blog posts yet. Posts generate automatically as you upload content."
              : `No ${statusFilter} posts.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => {
            const flags = guardFlags(post);
            return (
              <button
                key={post.id}
                onClick={() => { setPreviewing(post); setRepromptUrl(null); setRepromptNote(""); }}
                className="flex w-full items-center gap-4 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-accent/30"
              >
                {post.og_image_url && (
                  <img
                    src={post.og_image_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{post.title}</p>
                  {post.excerpt && (
                    <p className="mt-0.5 truncate text-xs text-muted">{post.excerpt}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusStyles[post.status] || statusStyles.draft}`}>
                      {post.status}
                    </span>
                    {post.content_type && (
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                        {post.content_type.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="text-[10px] text-muted">
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                    {/* Guard indicator */}
                    {post.status === "flagged" ? (
                      <span className="text-[10px] text-danger">
                        {flags.length} {flags.length === 1 ? "issue" : "issues"}
                      </span>
                    ) : (
                      <span className="text-[10px] text-success">passed</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted">Review →</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => updateParams({ page: String(currentPage - 1) })}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-30"
          >
            ← Previous
          </button>
          <span className="text-xs text-muted">
            Page {currentPage} of {totalPages} ({totalCount} posts)
          </span>
          <button
            onClick={() => updateParams({ page: String(currentPage + 1) })}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}

      {/* Preview panel */}
      {previewing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8"
          onClick={() => setPreviewing(null)}
        >
          <div
            className="w-full max-w-3xl rounded-lg border border-border bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyles[previewing.status] || statusStyles.draft}`}>
                  {previewing.status}
                </span>
                {previewing.content_type && (
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">
                    {previewing.content_type.replace(/_/g, " ")}
                  </span>
                )}
                {previewing.status === "flagged" ? (
                  <span className="text-xs text-danger">
                    {guardFlags(previewing).length} {guardFlags(previewing).length === 1 ? "issue" : "issues"} found
                  </span>
                ) : (
                  <span className="text-xs text-success">Content guard: passed</span>
                )}
              </div>
              <button onClick={() => setPreviewing(null)} className="text-muted hover:text-foreground">✕</button>
            </div>

            {/* Guard flags */}
            {previewing.status === "flagged" && guardFlags(previewing).length > 0 && (
              <div className="border-b border-border bg-danger/5 px-6 py-3">
                <p className="mb-1 text-xs font-medium text-danger">Content issues detected:</p>
                {guardFlags(previewing).map((flag, i) => (
                  <p key={i} className="text-xs text-danger/80">— {flag}</p>
                ))}
              </div>
            )}

            {/* Article preview */}
            <div className="px-6 py-6">
              <style dangerouslySetInnerHTML={{ __html: blogProseStyles }} />

              {previewing.og_image_url && (
                <img
                  src={previewing.og_image_url}
                  alt=""
                  className="mb-6 w-full rounded-lg object-cover"
                  style={{ maxHeight: 300 }}
                />
              )}

              <h1 className="mb-2 text-xl font-semibold">{previewing.title}</h1>

              {previewing.excerpt && (
                <p className="mb-6 text-sm italic text-muted">{previewing.excerpt}</p>
              )}

              {previewing.body && (
                <div
                  ref={proseRef}
                  className="preview-prose"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(previewing.body) }}
                />
              )}

              {/* Image re-prompt form — portaled inline below the clicked image */}
              {repromptUrl && hasEditorialImages(previewing) && repromptFormRef.current && createPortal(
                <div>
                  <p className="mb-1 text-xs font-medium">Adjust this image</p>
                  <p className="mb-2 text-[10px] text-muted">
                    This correction will apply to all future articles.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={repromptNote}
                      onChange={(e) => setRepromptNote(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleReprompt()}
                      className="flex-1 text-sm"
                      placeholder="e.g., spray paint line not brush"
                      autoFocus
                    />
                    <button
                      onClick={handleReprompt}
                      disabled={reprompting || !repromptNote.trim()}
                      className="bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      {reprompting ? "Generating..." : "Regenerate"}
                    </button>
                    <button
                      onClick={() => { setRepromptUrl(null); setRepromptNote(""); }}
                      className="px-2 py-1.5 text-xs text-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>,
                repromptFormRef.current
              )}
            </div>

            {/* SEO metadata preview */}
            <div className="border-t border-border px-6 py-4">
              <p className="mb-2 text-[10px] font-medium text-muted">SEO Preview</p>
              <p className="text-sm text-accent">{previewing.title}</p>
              <p className="text-xs text-success">{`blog.tracpost.com/.../` + previewing.slug}</p>
              <p className="mt-0.5 text-xs text-muted">{previewing.excerpt?.slice(0, 155)}</p>
            </div>

            {/* Review actions */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <button
                onClick={() => rejectPost(previewing.id)}
                disabled={acting === previewing.id}
                className="px-4 py-2 text-xs text-danger hover:underline disabled:opacity-50"
              >
                Delete
              </button>
              <div className="flex gap-2">
                {previewing.status === "published" ? (
                  <button
                    onClick={() => unpublishPost(previewing.id)}
                    disabled={acting === previewing.id}
                    className="rounded border border-border px-4 py-2 text-xs text-muted hover:text-foreground disabled:opacity-50"
                  >
                    Unpublish
                  </button>
                ) : (
                  <button
                    onClick={() => approvePost(previewing.id)}
                    disabled={acting === previewing.id}
                    className="rounded bg-success px-4 py-2 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
                  >
                    {acting === previewing.id ? "Publishing..." : "Approve & Publish"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
