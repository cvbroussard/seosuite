interface SpotlightSession {
  photo_url: string;
  customer_name: string | null;
  caption: string | null;
  completed_at: string;
}

interface HubSpotlightsProps {
  sessions: SpotlightSession[];
}

export default function HubSpotlights({ sessions }: HubSpotlightsProps) {
  if (sessions.length === 0) return null;

  return (
    <section style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 20, marginTop: 0, marginBottom: 16 }}>Customer Spotlights</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {sessions.map((session, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              paddingBottom: "100%",
              borderRadius: "var(--blog-radius)",
              overflow: "hidden",
              background: "#f3f4f6",
            }}
          >
            <img
              src={session.photo_url}
              alt={session.customer_name || "Customer spotlight"}
              loading="lazy"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
