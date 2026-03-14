"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { label: "Overview", href: "/dashboard", icon: "◆" },
  { label: "Social", href: "/dashboard/social", icon: "◉" },
  { label: "SEO", href: "/dashboard/seo", icon: "◈" },
  { label: "GBP", href: "/dashboard/gbp", icon: "◎" },
  { label: "Media", href: "/dashboard/media", icon: "▣" },
  { label: "Settings", href: "/dashboard/settings", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center px-5">
        <span className="text-sm font-semibold tracking-wider text-foreground">
          SEO SUITE
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {nav.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <span className="text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted">v0.1.0</p>
      </div>
    </aside>
  );
}
