"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface PageHeaderProps {
  siteName: string;
  children?: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  "": "Dashboard",
  "/brand": "Brand",
  "/capture": "Capture",
  "/media": "Media",
  "/calendar": "Calendar",
  "/seo": "SEO",
  "/accounts": "Accounts",
  "/settings": "Settings",
};

export function PageHeader({ siteName, children }: PageHeaderProps) {
  const pathname = usePathname();

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";
  const relative = pathname.replace(prefix, "") || "";

  // Build breadcrumb segments from path
  const segments = relative.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; href: string }> = [];

  let accumulated = prefix;
  for (const seg of segments) {
    accumulated += `/${seg}`;
    const label = PAGE_TITLES[`/${seg}`] || seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, href: accumulated });
  }

  // Current page is the last crumb (or Dashboard if at root)
  const currentPage = crumbs.length > 0 ? crumbs.pop()! : null;

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-5 py-3">
      <div className="flex items-center gap-2 text-sm">
        <Link href={prefix || "/"} className="font-medium text-foreground hover:text-accent">
          {siteName}
        </Link>
        {crumbs.map((crumb) => (
          <span key={crumb.href} className="flex items-center gap-2">
            <span className="text-dim">/</span>
            <Link href={crumb.href} className="text-muted hover:text-foreground">
              {crumb.label}
            </Link>
          </span>
        ))}
        {currentPage && (
          <>
            <span className="text-dim">/</span>
            <span className="text-muted">{currentPage.label}</span>
          </>
        )}
        {!currentPage && (
          <>
            <span className="text-dim">/</span>
            <span className="text-muted">Dashboard</span>
          </>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
