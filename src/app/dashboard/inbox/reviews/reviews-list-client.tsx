"use client";

import { useState, useEffect, useCallback } from "react";
import { ReviewCard } from "@/components/inbox/review-card";
import { ReviewFilterBar } from "@/components/inbox/review-filter-bar";
import { EmptyState } from "@/components/empty-state";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Review = any;

interface ReviewsListClientProps {
  siteId: string;
  initialReviews: Review[];
  initialCounts: { total: number; needs_reply: number; draft_ready: number; replied: number };
}

export function ReviewsListClient({ siteId, initialReviews, initialCounts }: ReviewsListClientProps) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews);
  const [counts, setCounts] = useState(initialCounts);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ site_id: siteId });
    if (statusFilter) params.set("reply_status", statusFilter);
    if (ratingFilter === "negative") {
      params.set("min_rating", "1");
      params.set("max_rating", "3");
    } else if (ratingFilter === "positive") {
      params.set("min_rating", "4");
      params.set("max_rating", "5");
    }

    try {
      const res = await fetch(`/api/inbox/reviews?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews);
        if (data.counts) setCounts(data.counts);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [siteId, statusFilter, ratingFilter]);

  useEffect(() => {
    if (statusFilter !== null || ratingFilter !== null) {
      fetchReviews();
    }
  }, [statusFilter, ratingFilter, fetchReviews]);

  function handleRefresh() {
    fetchReviews();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ReviewFilterBar
        activeStatus={statusFilter}
        activeRating={ratingFilter}
        counts={counts}
        onStatusChange={setStatusFilter}
        onRatingChange={setRatingFilter}
      />

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <EmptyState
          icon="★"
          title="No reviews"
          description={
            statusFilter
              ? "No reviews match this filter."
              : "Reviews from Google Business Profile will appear here once synced."
          }
        />
      )}

      {!loading && reviews.map((review: Review) => (
        <ReviewCard
          key={review.id}
          review={review}
          onReplied={handleRefresh}
        />
      ))}
    </div>
  );
}
