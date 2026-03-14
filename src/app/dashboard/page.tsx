import Link from "next/link";

const sections = [
  {
    label: "Social Accounts",
    href: "/dashboard/social",
    icon: "◉",
    desc: "Connected platforms & scheduled posts",
  },
  {
    label: "SEO Audits",
    href: "/dashboard/seo",
    icon: "◈",
    desc: "Page audits, meta content & scores",
  },
  {
    label: "Google Business Profile",
    href: "/dashboard/gbp",
    icon: "◎",
    desc: "Locations, credentials & sync status",
  },
  {
    label: "Media Library",
    href: "/dashboard/media",
    icon: "▣",
    desc: "Captured photos, videos & voice memos",
  },
];

export default function DashboardOverview() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Dashboard</h1>
      <p className="mb-8 text-sm text-muted">
        SEO Suite service overview
      </p>

      <div className="grid grid-cols-2 gap-4">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-accent/30 hover:bg-surface-hover"
          >
            <span className="text-lg">{s.icon}</span>
            <h2 className="text-sm font-medium text-foreground group-hover:text-accent">
              {s.label}
            </h2>
            <p className="text-xs text-muted">{s.desc}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium">Quick Stats</h2>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Sites", value: "—" },
            { label: "Social Accounts", value: "—" },
            { label: "Scheduled Posts", value: "—" },
            { label: "SEO Score", value: "—" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-xs text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
