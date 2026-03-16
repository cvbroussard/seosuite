"use client";

import { useState, useEffect, useRef } from "react";
import { generateRedirectInstructions } from "@/lib/blog-import/redirects";
import type { RedirectInstructions } from "@/lib/blog-import/redirects";

interface DiscoveredPost {
  url: string;
  title?: string;
  publishDate?: string;
  slug: string;
}

interface ImportJob {
  id: string;
  status: string;
  imported_count: number;
  total_count: number;
  current_post: string | null;
  errors: Array<{ url: string; error: string }>;
}

type Step = "url" | "review" | "progress" | "complete";

export function BlogImport({
  siteId,
  subdomain,
  onComplete,
}: {
  siteId: string;
  subdomain: string | null;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>("url");
  const [blogUrl, setBlogUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [posts, setPosts] = useState<DiscoveredPost[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<ImportJob | null>(null);
  const [showRedirects, setShowRedirects] = useState(false);
  const [redirects, setRedirects] = useState<RedirectInstructions | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function discover() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/blog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discover", site_id: siteId, blog_url: blogUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Discovery failed");

      setImportId(data.import_id);
      setPosts(data.posts);
      setSelected(new Set(data.posts.map((p: DiscoveredPost) => p.url)));
      setStep("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setLoading(false);
    }
  }

  async function startImport() {
    if (!importId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/blog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          import_id: importId,
          selected_urls: [...selected],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start import");

      setStep("progress");
      startPolling();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/blog/import?import_id=${importId}`);
        const data = await res.json();
        setJob(data);

        if (data.status === "completed" || data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("complete");

          // Generate redirect instructions
          if (data.status === "completed" && subdomain) {
            try {
              const sourcePath = new URL(blogUrl).pathname.replace(/\/+$/, "") || "/blog";
              setRedirects(generateRedirectInstructions(sourcePath, subdomain));
            } catch {
              // non-fatal
            }
          }
        }
      } catch {
        // Continue polling on error
      }
    }, 2000);
  }

  function togglePost(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === posts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map((p) => p.url)));
    }
  }

  // Step 1: URL Entry
  if (step === "url") {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-1 text-sm font-medium">Import Existing Blog</h3>
        <p className="mb-4 text-xs text-muted">
          Enter your blog URL and we&apos;ll scan for posts to import.
        </p>

        <div className="flex gap-2">
          <input
            value={blogUrl}
            onChange={(e) => setBlogUrl(e.target.value)}
            placeholder="https://yourdomain.com/blog"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={discover}
            disabled={loading || !blogUrl.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Scanning..." : "Scan Blog"}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-xs text-error">{error}</p>
        )}
      </div>
    );
  }

  // Step 2: Review Discovered Posts
  if (step === "review") {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">
              Found {posts.length} post{posts.length === 1 ? "" : "s"}
            </h3>
            <p className="text-xs text-muted">
              {selected.size} selected for import
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleAll}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              {selected.size === posts.length ? "Deselect All" : "Select All"}
            </button>
            <button
              onClick={startImport}
              disabled={loading || selected.size === 0}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? "Starting..." : `Import ${selected.size} Posts`}
            </button>
          </div>
        </div>

        <div className="max-h-96 space-y-1 overflow-y-auto">
          {posts.map((post) => (
            <label
              key={post.url}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={selected.has(post.url)}
                onChange={() => togglePost(post.url)}
                className="accent-accent"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {post.title || post.slug}
                </p>
                <p className="truncate text-xs text-muted">{post.url}</p>
              </div>
              {post.publishDate && (
                <span className="shrink-0 text-xs text-muted">
                  {new Date(post.publishDate).toLocaleDateString()}
                </span>
              )}
            </label>
          ))}
        </div>

        <button
          onClick={() => setStep("url")}
          className="mt-3 text-xs text-muted hover:text-foreground"
        >
          &larr; Back
        </button>

        {error && (
          <p className="mt-2 text-xs text-error">{error}</p>
        )}
      </div>
    );
  }

  // Step 3: Progress
  if (step === "progress") {
    const pct = job ? Math.round((job.imported_count / Math.max(job.total_count, 1)) * 100) : 0;

    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-1 text-sm font-medium">Importing Posts...</h3>
        <p className="mb-4 text-xs text-muted">
          {job?.imported_count || 0} of {job?.total_count || selected.size} posts imported
        </p>

        {/* Progress bar */}
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {job?.current_post && (
          <p className="text-xs text-muted">
            Processing: <span className="text-foreground">{job.current_post}</span>
          </p>
        )}
      </div>
    );
  }

  // Step 4: Complete
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium">
          {job?.status === "failed" ? "Import Failed" : "Import Complete"}
        </h3>
        <p className="text-xs text-muted">
          {job?.imported_count || 0} post{(job?.imported_count || 0) === 1 ? "" : "s"} imported
          {(job?.errors?.length || 0) > 0 && `, ${job!.errors.length} error${job!.errors.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {/* Errors */}
      {job?.errors && job.errors.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs text-error">
            {job.errors.length} error{job.errors.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {job.errors.map((e, i) => (
              <div key={i} className="rounded bg-surface-hover px-3 py-1.5 text-xs">
                <span className="text-muted">{e.url}:</span> {e.error}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Redirect instructions */}
      {redirects && (
        <div className="mb-4">
          <button
            onClick={() => setShowRedirects(!showRedirects)}
            className="rounded-lg border border-accent/40 px-4 py-2 text-xs font-medium text-accent hover:bg-accent/10"
          >
            {showRedirects ? "Hide" : "View"} Redirect Setup
          </button>

          {showRedirects && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted">
                Set up a redirect from <code className="text-foreground">{redirects.sourcePath}</code> to{" "}
                <code className="text-foreground">{redirects.targetDomain}</code> to preserve your SEO.
                Choose your platform:
              </p>
              {redirects.platforms.map((p) => (
                <details key={p.platform} className="rounded-lg border border-border">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                    {p.label}
                  </summary>
                  <div className="border-t border-border px-3 py-2">
                    <p className="mb-2 text-xs text-muted">{p.instructions}</p>
                    <div className="relative">
                      <pre className="overflow-x-auto rounded bg-background p-3 text-xs">
                        {p.code}
                      </pre>
                      <button
                        onClick={() => navigator.clipboard.writeText(p.code)}
                        className="absolute right-2 top-2 rounded bg-surface-hover px-2 py-1 text-[10px] text-muted hover:text-foreground"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={onComplete}
        className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
      >
        Done
      </button>
    </div>
  );
}
