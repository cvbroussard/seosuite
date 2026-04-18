"use client";

import { useState } from "react";
import { PlatformIcon } from "@/components/platform-icons";

interface Review {
  id: string;
  platform: string;
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
  rating: number | null;
  body: string | null;
  reviewed_at: string;
  is_read: boolean;
  our_reply: string | null;
  our_reply_at: string | null;
  suggested_reply: string | null;
  reply_status: string;
  auto_drafted: boolean;
}

interface ReviewCardProps {
  review: Review;
  onReplied: () => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  needs_reply: { label: "Needs Reply", className: "bg-amber-100 text-amber-800" },
  draft_ready: { label: "Draft Ready", className: "bg-blue-100 text-blue-800" },
  replied: { label: "Replied", className: "bg-emerald-100 text-emerald-800" },
  ignored: { label: "Ignored", className: "bg-gray-100 text-gray-500" },
};

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <span className="text-sm">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < rating ? "text-yellow-500" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ReviewCard({ review, onReplied }: ReviewCardProps) {
  const [showReply, setShowReply] = useState(
    review.reply_status === "draft_ready" && review.auto_drafted
  );
  const [replyText, setReplyText] = useState(review.suggested_reply || "");
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");

  const badge = STATUS_BADGE[review.reply_status] || STATUS_BADGE.needs_reply;

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/inbox/reviews/${review.id}/suggest`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setReplyText(data.suggestion);
      }
    } catch { /* ignore */ }
    setSuggesting(false);
  }

  async function handleSend() {
    if (!replyText.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/inbox/reviews/${review.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send reply");
        return;
      }

      onReplied();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleIgnore() {
    try {
      await fetch(`/api/inbox/reviews/${review.id}/ignore`, { method: "POST" });
      onReplied();
    } catch { /* ignore */ }
  }

  return (
    <div className={`border-b border-border p-4 ${!review.is_read ? "bg-accent/5" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-surface-hover">
          {review.reviewer_avatar_url ? (
            <img src={review.reviewer_avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted">
              {(review.reviewer_name || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{review.reviewer_name || "Anonymous"}</span>
            <PlatformIcon platform={review.platform} size={14} />
            <span className="text-xs text-muted">{timeAgo(review.reviewed_at)}</span>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>

          <div className="mt-1">
            <Stars rating={review.rating} />
          </div>

          {review.body && (
            <p className="mt-1.5 text-sm whitespace-pre-wrap">{review.body}</p>
          )}

          {/* Our published reply */}
          {review.our_reply && (
            <div className="mt-3 rounded bg-surface-hover p-3 text-sm">
              <span className="text-xs font-medium text-muted">Your response</span>
              <p className="mt-0.5">{review.our_reply}</p>
            </div>
          )}

          {/* Reply actions — for unreplied reviews */}
          {!review.our_reply && review.reply_status !== "ignored" && (
            <>
              {!showReply && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setShowReply(true);
                      if (!replyText) handleSuggest();
                    }}
                    className="text-xs text-accent hover:text-accent/80"
                  >
                    Respond
                  </button>
                  <button
                    onClick={handleIgnore}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    Ignore
                  </button>
                </div>
              )}

              {showReply && (
                <div className="mt-3 space-y-2">
                  {suggesting && (
                    <p className="text-xs text-muted">Generating suggested response...</p>
                  )}
                  {review.auto_drafted && replyText && (
                    <p className="text-xs text-blue-600">Auto-drafted reply — edit or approve as-is</p>
                  )}
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your response..."
                    rows={3}
                    className="w-full resize-none rounded border border-border bg-background p-2 text-sm focus:border-accent focus:outline-none"
                  />
                  {error && <p className="text-xs text-danger">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSend}
                      disabled={!replyText.trim() || loading}
                      className="rounded bg-accent px-3 py-1 text-xs text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                    >
                      {loading ? "Sending..." : "Approve & Send"}
                    </button>
                    <button
                      onClick={handleSuggest}
                      disabled={suggesting}
                      className="rounded border border-border px-3 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
                    >
                      {suggesting ? "Generating..." : "Regenerate"}
                    </button>
                    <button
                      onClick={handleIgnore}
                      className="rounded px-3 py-1 text-xs text-muted hover:text-foreground"
                    >
                      Ignore
                    </button>
                    <button
                      onClick={() => setShowReply(false)}
                      className="rounded px-3 py-1 text-xs text-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
