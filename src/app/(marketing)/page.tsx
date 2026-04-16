import { sql } from "@/lib/db";
import Link from "next/link";

export const revalidate = 3600;

const PIPELINE_PILLARS = [
  { n: "1.0", title: "Capture", body: "Snap photos of your work with your phone. Add a quick voice note. The engine takes it from there." },
  { n: "2.0", title: "Analyze", body: "AI scores every photo for quality, scene type, and brand fit. Weak shots get flagged. Strong ones get fast-tracked." },
  { n: "3.0", title: "Write", body: "AI writes captions, blog posts, hashtags, and alt text — all in your brand voice, drawn from the playbook we built for you." },
  { n: "4.0", title: "Publish", body: "Instagram, TikTok, Facebook, X, YouTube, Pinterest, LinkedIn, Google Business — scheduled and posted across all 8 platforms." },
  { n: "5.0", title: "Monitor", body: "One dashboard, every platform. Comments, followers, engagement — unified. No more hopping between eight different apps." },
];

const INDUSTRIES = [
  { label: "Contractors", slug: "contractors", icon: "🔨" },
  { label: "Kitchen & Bath", slug: "kitchen-bath", icon: "🏠" },
  { label: "Interior Design", slug: "interior-design", icon: "🎨" },
  { label: "Real Estate", slug: "real-estate", icon: "🏢" },
  { label: "Restaurants", slug: "restaurants", icon: "🍽" },
  { label: "Salons & Spas", slug: "salons", icon: "✂️" },
  { label: "Coaches", slug: "coaches", icon: "📋" },
  { label: "Agencies", slug: "agencies", icon: "📡" },
];

const PLATFORMS = [
  "Instagram", "TikTok", "Facebook", "X", "YouTube",
  "Pinterest", "LinkedIn", "Google Business",
];

export default async function MarketingHomePage() {
  // Live network stats — dynamic ISR
  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM blog_posts WHERE status = 'published') AS articles_published,
      (SELECT COUNT(DISTINCT site_id)::int FROM blog_posts WHERE status = 'published') AS active_tenants
  `;
  const articlesPublished = (stats?.articles_published as number) || 0;
  const activeTenants = (stats?.active_tenants as number) || 0;

  return (
    <>
      {/* ── Section 0: Announcement bar ── */}
      <div className="mp-announcement">
        <div className="mp-container">
          <span>New: GBP category intelligence for local search.</span>
          <Link href="/blog">Read the blog →</Link>
        </div>
      </div>

      {/* ── Section 2: Hero ── */}
      <section className="mp-hero">
        <div className="mp-container mp-hero-inner">
          <h1 className="mp-hero-title">Meet the team that works while you sleep.</h1>
          <p className="mp-hero-subtitle">
            You snap photos of your work. We write the captions, build the blog posts, and
            publish across 8 platforms, your website, and Google — all automatically.
          </p>
          <div className="mp-hero-actions">
            <Link href="/pricing" className="mp-btn-primary mp-btn-lg">
              Start 14-day trial
            </Link>
            <a href="#product" className="mp-btn-outline mp-btn-lg">
              See how it works
            </a>
          </div>
        </div>
        <div className="mp-hero-visual">
          <div className="mp-container">
            <div className="mp-hero-placeholder">
              <p>Hero animation — coming soon</p>
              <p className="mp-hero-placeholder-sub">
                Night-shift scene: phone capture → pipeline bots → 8 platforms lit
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Trust strip ── */}
      <section className="mp-trust">
        <div className="mp-container mp-trust-inner">
          <p className="mp-trust-label">
            Publishing for contractors, designers, and small businesses
          </p>
          <div className="mp-platform-grid">
            {PLATFORMS.map((p) => (
              <span key={p} className="mp-platform-badge">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: Unipost preview ── */}
      <section className="mp-section" id="unipost">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">Wake up to this.</h2>
          <p className="mp-section-subtitle">
            One dashboard. Every platform. Comments, followers, engagement — unified. No more hopping between eight different apps.
          </p>
          <div className="mp-unipost-placeholder">
            <p>Unipost dashboard screenshot — coming after feature ships</p>
            <p className="mp-hero-placeholder-sub">
              Unified engagement stream · aggregated metrics · brand-first, not platform-first
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 5: Pipeline pillars ── */}
      <section className="mp-section mp-section-alt" id="product">
        <div className="mp-container">
          <h2 className="mp-section-title mp-text-center">How it works</h2>
          <p className="mp-section-subtitle mp-text-center" style={{ margin: "0 auto 56px" }}>
            Five steps. One capture. You handle step one. We handle the rest.
          </p>
          <div className="mp-pillars">
            {PIPELINE_PILLARS.map((p) => (
              <div key={p.n} className="mp-pillar">
                <span className="mp-pillar-n">{p.n}</span>
                <h3 className="mp-pillar-title">{p.title}</h3>
                <p className="mp-pillar-body">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 6: Industry strip ── */}
      <section className="mp-section" id="industries">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">Built for businesses that do real work.</h2>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 40px" }}>
            If your customers find you by searching, TracPost makes sure they find you first.
          </p>
          <div className="mp-industry-grid">
            {INDUSTRIES.map((ind) => (
              <Link key={ind.slug} href={`/for/${ind.slug}`} className="mp-industry-card">
                <span className="mp-industry-icon">{ind.icon}</span>
                <span className="mp-industry-label">{ind.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 7: Metrics carousel (static for now) ── */}
      <section className="mp-section mp-section-alt">
        <div className="mp-container">
          <div className="mp-metrics-strip">
            <div className="mp-metric">
              <span className="mp-metric-value">{articlesPublished.toLocaleString()}</span>
              <span className="mp-metric-label">articles published</span>
            </div>
            <div className="mp-metric">
              <span className="mp-metric-value">8</span>
              <span className="mp-metric-label">platforms delivered to</span>
            </div>
            <div className="mp-metric">
              <span className="mp-metric-value">{activeTenants}</span>
              <span className="mp-metric-label">businesses growing</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 9: ROI calculator (placeholder) ── */}
      <section className="mp-section">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">More content. Fewer tools.</h2>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 40px" }}>
            Most businesses spend $2,000–5,000/month on a social media manager, freelance writer,
            SEO agency, and scheduling tools — separately. TracPost replaces all of them.
          </p>
          <div className="mp-roi-placeholder">
            <p>ROI calculator — interactive slider coming</p>
            <p className="mp-hero-placeholder-sub">
              "What are you spending now?" → writer + social manager + SEO + tools = $X/mo →
              "TracPost: $99–219/mo. You save $Y/yr."
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 10: Free tool callout ── */}
      <section className="mp-section mp-section-dark">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title" style={{ color: "#fff" }}>
            Not sure how Google sees your business?
          </h2>
          <p className="mp-section-subtitle" style={{ color: "rgba(255,255,255,0.75)", margin: "0 auto 32px" }}>
            Run the free GBP category diagnostic. We&apos;ll tell you which Google Business
            categories fit your business — and which ones your competitors are using.
          </p>
          <Link href="/tools/gbp-diagnostic" className="mp-btn-primary mp-btn-lg">
            Run the free diagnostic
          </Link>
        </div>
      </section>

      {/* ── Section 13: Final CTA ── */}
      <section className="mp-section">
        <div className="mp-container mp-text-center">
          <h2 className="mp-section-title">Ready to let the engine run?</h2>
          <p className="mp-section-subtitle" style={{ margin: "0 auto 32px" }}>
            Pick a plan, set up your accounts once, then shoot photos the same way you already do.
          </p>
          <div className="mp-hero-actions" style={{ justifyContent: "center" }}>
            <Link href="/pricing" className="mp-btn-primary mp-btn-lg">
              Start 14-day trial
            </Link>
            <Link href="/contact" className="mp-btn-outline mp-btn-lg">
              Talk to us
            </Link>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: homeStyles }} />
    </>
  );
}

const homeStyles = `
  /* Announcement bar */
  .mp-announcement {
    background: #1a1a1a;
    color: #fff;
    font-size: 13px;
    padding: 8px 0;
    text-align: center;
  }
  .mp-announcement a { color: #93c5fd; text-decoration: none; margin-left: 8px; }
  .mp-announcement a:hover { text-decoration: underline; }

  /* Hero */
  .mp-hero { padding: 80px 0 0; }
  .mp-hero-inner { max-width: 780px; margin: 0 auto; text-align: center; }
  .mp-hero-title {
    font-size: 56px;
    font-weight: 700;
    color: #1a1a1a;
    line-height: 1.05;
    letter-spacing: -0.03em;
    margin-bottom: 24px;
  }
  .mp-hero-subtitle {
    font-size: 20px;
    color: #6b7280;
    line-height: 1.6;
    max-width: 620px;
    margin: 0 auto 36px;
  }
  .mp-hero-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .mp-btn-lg { padding: 14px 28px; font-size: 15px; }
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
  @media (max-width: 768px) {
    .mp-hero { padding: 48px 0 0; }
    .mp-hero-title { font-size: 36px; }
    .mp-hero-subtitle { font-size: 17px; }
  }

  .mp-hero-visual { margin-top: 56px; }
  .mp-hero-placeholder, .mp-unipost-placeholder, .mp-roi-placeholder {
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 80px 32px;
    text-align: center;
    color: #9ca3af;
    font-size: 15px;
  }
  .mp-hero-placeholder-sub { font-size: 12px; margin-top: 8px; color: #d1d5db; }

  /* Trust strip */
  .mp-trust {
    padding: 40px 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .mp-trust-inner { text-align: center; }
  .mp-trust-label {
    font-size: 13px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 20px;
  }
  .mp-platform-grid {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .mp-platform-badge {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    padding: 6px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
  }

  /* Sections */
  .mp-section { padding: 96px 0; }
  .mp-section-alt { background: #fafafa; }
  .mp-section-dark { background: #1a1a1a; }
  .mp-text-center { text-align: center; }
  .mp-section-title {
    font-size: 36px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.02em;
    margin-bottom: 16px;
  }
  .mp-section-subtitle {
    font-size: 18px;
    color: #6b7280;
    line-height: 1.6;
    max-width: 640px;
  }

  /* Pipeline pillars */
  .mp-pillars {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 32px;
  }
  @media (max-width: 1024px) { .mp-pillars { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 640px) { .mp-pillars { grid-template-columns: 1fr; gap: 24px; } }
  .mp-pillar-n {
    display: block;
    font-size: 28px;
    font-weight: 700;
    color: #d1d5db;
    margin-bottom: 12px;
  }
  .mp-pillar-title {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 8px;
  }
  .mp-pillar-body {
    font-size: 14px;
    color: #6b7280;
    line-height: 1.6;
  }

  /* Industry strip */
  .mp-industry-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  @media (max-width: 768px) { .mp-industry-grid { grid-template-columns: repeat(2, 1fr); } }
  .mp-industry-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    text-decoration: none;
    transition: all 0.15s;
  }
  .mp-industry-card:hover {
    border-color: #1a1a1a;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  }
  .mp-industry-icon { font-size: 28px; }
  .mp-industry-label { font-size: 14px; font-weight: 500; color: #1a1a1a; }

  /* Metrics */
  .mp-metrics-strip {
    display: flex;
    justify-content: center;
    gap: 64px;
    flex-wrap: wrap;
  }
  .mp-metric { text-align: center; }
  .mp-metric-value {
    display: block;
    font-size: 48px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.02em;
  }
  .mp-metric-label {
    display: block;
    font-size: 14px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 4px;
  }
`;
