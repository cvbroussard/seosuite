import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Compare Marketing Options — TracPost",
  description:
    "DIY, solo practitioner, agency, in-house, or automation? Compare the real differences — not just cost, but who supplies the content and what happens when you're busy.",
  alternates: {
    canonical: "https://tracpost.com/compare",
  },
};

const COMPARISON_ROWS = [
  {
    label: "Who supplies the content?",
    diy: "You",
    solo: "You",
    agency: "You",
    inhouse: "You + them",
    tracpost: "Your photos (that\u2019s it)",
  },
  {
    label: "Who creates the posts?",
    diy: "You",
    solo: "Them (from what you send)",
    agency: "Them (from what you send)",
    inhouse: "Them (from what you send)",
    tracpost: "Derived from your Brand DNA",
  },
  {
    label: "Platforms covered",
    diy: "1\u20132 (whatever you have time for)",
    solo: "2\u20133",
    agency: "3\u20134",
    inhouse: "3\u20135",
    tracpost:
      "All 8: Instagram, TikTok, Facebook, YouTube, Pinterest, LinkedIn, X, Google Business Profile",
  },
  {
    label: "Blog articles",
    diy: "No",
    solo: "No",
    agency: "Sometimes (extra cost)",
    inhouse: "Maybe",
    tracpost: "Yes, from your project photos",
  },
  {
    label: "Website generated",
    diy: "No",
    solo: "No",
    agency: "No",
    inhouse: "No",
    tracpost: "Yes, SEO-optimized and hosted",
  },
  {
    label: "GBP management",
    diy: "No",
    solo: "Rarely",
    agency: "Sometimes",
    inhouse: "If trained",
    tracpost: "Yes, posts + photos + review responses",
  },
  {
    label: "Consistency",
    diy: "Sporadic",
    solo: "Depends on them",
    agency: "Contractual",
    inhouse: "Depends on management",
    tracpost: "Automatic",
  },
  {
    label: "Content sounds like you?",
    diy: "Yes (you wrote it)",
    solo: "Sometimes",
    agency: "Rarely",
    inhouse: "Over time",
    tracpost: "Yes (derived from Brand DNA)",
  },
  {
    label: "Your time per week",
    diy: "5\u201310 hours",
    solo: "1\u20132 hours sourcing photos",
    agency: "1\u20132 hours sourcing photos",
    inhouse: "1 hour managing",
    tracpost: "Minutes (capture photos)",
  },
  {
    label: "Paid amplification",
    diy: "DIY if you know how",
    solo: "Not usually",
    agency: "Separate retainer",
    inhouse: "If skilled",
    tracpost: "Built in",
  },
  {
    label: "What happens when you\u2019re busy?",
    diy: "Nothing gets posted",
    solo: "Quality drops",
    agency: "Generic content",
    inhouse: "Backlog",
    tracpost: "Engine keeps running",
  },
];

const COLUMN_KEYS = ["diy", "solo", "agency", "inhouse", "tracpost"] as const;
const COLUMN_HEADERS: Record<(typeof COLUMN_KEYS)[number], string> = {
  diy: "DIY",
  solo: "Solo Practitioner",
  agency: "Agency",
  inhouse: "In-House Hire",
  tracpost: "TracPost",
};

export default function ComparePage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="mp-section cmp-hero">
        <div className="mp-container" style={{ maxWidth: 800 }}>
          <h1 className="mp-section-title" style={{ fontSize: 44, textAlign: "center" }}>
            Five Ways to Handle Your Marketing.
            <br />
            One Question That Decides.
          </h1>
          <p
            className="mp-section-subtitle"
            style={{ textAlign: "center", margin: "0 auto", maxWidth: 660 }}
          >
            Every option has a cost, a time commitment, and a content dependency.
            The question most people skip: where does the raw content come from?
          </p>
        </div>
      </section>

      {/* ── The Question ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container" style={{ maxWidth: 720 }}>
          <h2 className="mp-section-title">The Question Nobody Asks</h2>
          <div className="cmp-prose">
            <p>
              Every marketing option &mdash; whether you do it yourself, hire a solo
              practitioner, contract an agency, bring someone in-house, or use a
              system &mdash; depends on one thing: raw content from your business.
              Photos of your work, stories from your projects, proof of what you do.
            </p>
            <p>
              The option you choose determines who creates it, who supplies it, and
              how consistently it gets published.
            </p>
          </div>
        </div>
      </section>

      {/* ── Comparison Grid (desktop table) ── */}
      <section className="mp-section">
        <div className="mp-container">
          <h2
            className="mp-section-title"
            style={{ textAlign: "center", marginBottom: 48 }}
          >
            How the Options Actually Compare
          </h2>

          {/* Desktop table */}
          <div className="cmp-table-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th className="cmp-th-label" />
                  {COLUMN_KEYS.map((k) => (
                    <th
                      key={k}
                      className={`cmp-th${k === "tracpost" ? " cmp-accent-col" : ""}`}
                    >
                      {COLUMN_HEADERS[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={i}>
                    <td className="cmp-td-label">{row.label}</td>
                    {COLUMN_KEYS.map((k) => (
                      <td
                        key={k}
                        className={`cmp-td${k === "tracpost" ? " cmp-accent-col" : ""}`}
                      >
                        {row[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="cmp-cards-mobile">
            {COLUMN_KEYS.map((k) => (
              <div
                key={k}
                className={`cmp-card${k === "tracpost" ? " cmp-card-accent" : ""}`}
              >
                <h3 className="cmp-card-title">{COLUMN_HEADERS[k]}</h3>
                <dl className="cmp-card-dl">
                  {COMPARISON_ROWS.map((row, i) => (
                    <div key={i} className="cmp-card-row">
                      <dt>{row.label}</dt>
                      <dd>{row[k]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The Hidden Cost ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container" style={{ maxWidth: 720 }}>
          <h2 className="mp-section-title">The Cost Nobody Puts on the Invoice</h2>
          <div className="cmp-prose">
            <p>
              Every option except the last one has the same hidden cost &mdash; your
              time sourcing and supplying content. When you&apos;re busy (and
              you&apos;re always busy), that supply chain breaks. The agency emails
              asking for photos. The solo practitioner waits. The in-house hire sits
              idle. Your social media goes dark.
            </p>
            <p>
              The hidden cost isn&apos;t dollars. It&apos;s inconsistency &mdash; and
              inconsistency is worse than not being there at all.
            </p>
          </div>
          <blockquote className="cmp-callout">
            &ldquo;If social media silence costs you even one customer per month,
            you&apos;re leaving more on the table than any option on this list would
            cost.&rdquo;
          </blockquote>
        </div>
      </section>

      {/* ── The Sixth Option ── */}
      <section className="mp-section">
        <div className="mp-container" style={{ maxWidth: 720 }}>
          <h2 className="mp-section-title">
            The Sixth Option: Keep Doing What You&apos;re Doing
          </h2>
          <div className="cmp-prose">
            <p>
              There&apos;s always the option of maintaining your current approach.
              Posting when you remember. Going dark for weeks. Hoping word of mouth
              carries the business.
            </p>
            <p>
              This option has a cost too &mdash; it&apos;s the customers who searched
              for your service, didn&apos;t find you, and called someone else.
              You&apos;ll never know their names, but they exist.
            </p>
          </div>
        </div>
      </section>

      {/* ── The Right Fit ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container" style={{ maxWidth: 720 }}>
          <h2 className="mp-section-title">The Right Fit</h2>
          <div className="cmp-prose">
            <p>
              TracPost works best for businesses that produce visual proof of their
              work every day &mdash; restaurants, salons, med spas, HVAC companies,
              groomers, dental practices, venues, auto detailers, and hundreds of
              others where the work speaks for itself. If your team already takes
              photos on the job, you have the only input TracPost needs.
            </p>
            <p>
              If you need brand identity design, professional photography, or
              creative campaign strategy from scratch, you need human help for that.
              TracPost handles the daily engine &mdash; the consistent content that
              keeps you visible and findable.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mp-section">
        <div
          className="mp-container"
          style={{ maxWidth: 600, textAlign: "center" }}
        >
          <h2 className="mp-section-title">Ready to See Which Option Fits?</h2>
          <div className="cmp-cta-actions">
            <Link href="/how-it-works" className="mp-btn-primary mp-btn-lg">
              See How TracPost Works
            </Link>
            <Link href="/contact" className="mp-btn-outline mp-btn-lg">
              Talk to Us
            </Link>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: compareStyles }} />
    </>
  );
}

const compareStyles = `
  /* ── Shared / Reused ── */
  .mp-section { padding: 96px 0; }
  .mp-section-alt { background: #fafafa; }
  .mp-container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
  .mp-section-title {
    font-size: 36px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.02em;
    margin-bottom: 16px;
  }
  .mp-section-subtitle {
    font-size: 18px;
    color: #4b5563;
    line-height: 1.6;
  }
  .mp-btn-primary {
    display: inline-block;
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: #1a1a1a;
    border-radius: 6px;
    text-decoration: none;
    transition: background 0.15s;
  }
  .mp-btn-primary:hover { background: #333; }
  .mp-btn-outline {
    display: inline-block;
    padding: 8px 20px;
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    text-decoration: none;
    transition: all 0.15s;
  }
  .mp-btn-outline:hover { border-color: #1a1a1a; }
  .mp-btn-lg { padding: 14px 28px; font-size: 15px; }

  /* ── Hero ── */
  .cmp-hero { padding-bottom: 64px; }

  /* ── Prose blocks ── */
  .cmp-prose {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-top: 24px;
  }
  .cmp-prose p {
    font-size: 17px;
    color: #374151;
    line-height: 1.8;
  }

  /* ── Callout ── */
  .cmp-callout {
    margin: 40px 0 0;
    padding: 24px 28px;
    border-left: 4px solid #1a1a1a;
    background: #f9fafb;
    font-size: 17px;
    font-style: italic;
    color: #1a1a1a;
    line-height: 1.7;
    border-radius: 0 8px 8px 0;
  }

  /* ── CTA ── */
  .cmp-cta-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 32px;
  }

  /* ── Comparison Table (desktop) ── */
  .cmp-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }
  .cmp-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 860px;
    table-layout: fixed;
  }
  .cmp-table thead {
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .cmp-th-label {
    width: 200px;
    background: #f9fafb;
    padding: 16px 20px;
    text-align: left;
    font-size: 13px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 2px solid #e5e7eb;
    position: sticky;
    left: 0;
    z-index: 3;
  }
  .cmp-th {
    padding: 16px 16px;
    text-align: center;
    font-size: 14px;
    font-weight: 700;
    color: #1a1a1a;
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
    border-left: 1px solid #f0f0f0;
  }
  .cmp-td-label {
    padding: 14px 20px;
    font-size: 14px;
    font-weight: 600;
    color: #1a1a1a;
    background: #fff;
    border-bottom: 1px solid #f0f0f0;
    position: sticky;
    left: 0;
    z-index: 1;
  }
  .cmp-td {
    padding: 14px 16px;
    font-size: 14px;
    color: #374151;
    text-align: center;
    border-bottom: 1px solid #f0f0f0;
    border-left: 1px solid #f0f0f0;
    line-height: 1.5;
  }

  /* Accent column (TracPost) */
  .cmp-accent-col {
    background: #f0fdf4;
  }
  thead .cmp-accent-col {
    background: #ecfce5;
    color: #166534;
  }

  /* last row no bottom border */
  .cmp-table tbody tr:last-child td,
  .cmp-table tbody tr:last-child .cmp-td-label {
    border-bottom: none;
  }

  /* ── Mobile cards ── */
  .cmp-cards-mobile { display: none; }

  @media (max-width: 860px) {
    .cmp-table-wrap { display: none; }
    .cmp-cards-mobile {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .cmp-card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 24px;
      background: #fff;
    }
    .cmp-card-accent {
      border-color: #86efac;
      background: #f0fdf4;
    }
    .cmp-card-title {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #e5e7eb;
    }
    .cmp-card-accent .cmp-card-title {
      border-bottom-color: #86efac;
      color: #166534;
    }
    .cmp-card-dl {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .cmp-card-row dt {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }
    .cmp-card-row dd {
      font-size: 15px;
      color: #1a1a1a;
      line-height: 1.5;
      margin: 0;
    }
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .cmp-hero { padding: 48px 0 32px; }
    .mp-section-title { font-size: 28px; }
  }
`;
