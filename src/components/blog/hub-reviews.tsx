interface ReviewAggregate {
  count: number;
  avgRating: number;
}

interface Review {
  reviewer_name: string | null;
  rating: number;
  body: string;
  created_at: string;
}

interface HubReviewsProps {
  aggregate: ReviewAggregate;
  reviews: Review[];
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const stars = "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
  return <span style={{ color: "#f59e0b", letterSpacing: 1 }}>{stars}</span>;
}

export default function HubReviews({ aggregate, reviews }: HubReviewsProps) {
  if (aggregate.count === 0) return null;

  return (
    <section style={{ marginBottom: 48 }}>
      {/* Aggregate badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
          padding: "16px 20px",
          borderRadius: "var(--blog-radius)",
          border: "1px solid var(--blog-border)",
          background: "#fefce8",
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 700 }}>{aggregate.avgRating}</span>
        <div>
          <StarRating rating={aggregate.avgRating} />
          <p className="blog-muted" style={{ fontSize: 13, marginTop: 2 }}>
            {aggregate.count} review{aggregate.count !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Featured reviews */}
      {reviews.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {reviews.map((review, i) => (
            <blockquote
              key={i}
              style={{
                margin: 0,
                padding: "12px 16px",
                borderLeft: "3px solid #f59e0b",
                fontSize: 15,
              }}
            >
              <p style={{ margin: "0 0 8px", lineHeight: 1.6 }}>
                &ldquo;{review.body}&rdquo;
              </p>
              <footer className="blog-muted" style={{ fontSize: 13 }}>
                — {review.reviewer_name || "Customer"}
                {review.created_at && (
                  <>, {new Date(review.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}</>
                )}
              </footer>
            </blockquote>
          ))}
        </div>
      )}
    </section>
  );
}
