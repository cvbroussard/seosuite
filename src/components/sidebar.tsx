"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SiteInfo {
  id: string;
  name: string;
  url: string;
}

interface NavItem {
  label: string;
  path: string;
  icon: string;
  children?: { label: string; path: string }[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const siteGroups: NavGroup[] = [
  {
    label: "Configure",
    items: [
      { label: "Brand", path: "/brand", icon: "◇" },
      { label: "Connections", path: "/accounts", icon: "◉" },
      { label: "Google Profile", path: "/google/profile", icon: "G" },
      { label: "Entities", path: "/entities", icon: "◫" },
      { label: "Settings", path: "/settings", icon: "⚙" },
    ],
  },
  {
    label: "Publish",
    items: [
      { label: "Capture", path: "/capture", icon: "◎" },
      { label: "Media", path: "/media", icon: "▣" },
      { label: "Blog", path: "/blog", icon: "✎" },
      { label: "Unipost", path: "/unipost", icon: "◈" },
      { label: "Calendar", path: "/calendar", icon: "▦" },
      { label: "Photos", path: "/google/photos", icon: "▤" },
    ],
  },
  {
    label: "Promote",
    items: [
      { label: "Campaigns", path: "/campaigns", icon: "▶" },
    ],
  },
  {
    label: "Engage",
    items: [
      { label: "Inbox", path: "/inbox", icon: "▤" },
      { label: "Reviews", path: "/google/reviews", icon: "★" },
      { label: "Spotlight", path: "/spotlight", icon: "✦" },
    ],
  },
  {
    label: "Quantify",
    items: [
      {
        label: "Analytics", path: "/analytics", icon: "▥",
        children: [
          { label: "Overview", path: "/analytics" },
          { label: "Acquisition", path: "/analytics/acquisition" },
          { label: "Engagement", path: "/analytics/engagement" },
          { label: "Audience", path: "/analytics/audience" },
          { label: "Local", path: "/analytics/local" },
          { label: "Conversions", path: "/analytics/conversions" },
        ],
      },
      { label: "SEO", path: "/seo", icon: "◇" },
      { label: "GBP Performance", path: "/google/performance", icon: "G" },
    ],
  },
];

const accountNav: NavItem[] = [
  { label: "My Account", path: "/account", icon: "◯" },
  { label: "Team", path: "/account/team", icon: "◱" },
  { label: "Subscription", path: "/account/subscription", icon: "◈" },
];

const MANAGER_PATHS = new Set(["", "/brand", "/calendar", "/inbox", "/blog", "/entities", "/media", "/capture"]);
const MANAGER_ACCOUNT_PATHS = new Set(["/account"]);

interface SidebarProps {
  userName: string;
  sites: SiteInfo[];
  activeSiteId: string | null;
  role?: string;
}

export function Sidebar({ userName, sites, activeSiteId, role = "owner" }: SidebarProps) {
  const pathname = usePathname();

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";

  const isManager = role === "manager";

  const filteredAccountNav = isManager
    ? accountNav.filter((item) => MANAGER_ACCOUNT_PATHS.has(item.path))
    : accountNav;

  const accountLinks = filteredAccountNav.map((item) => ({ ...item, href: prefix + item.path || "/" }));

  function isActive(itemPath: string): boolean {
    const fullPath = prefix + itemPath;
    if (itemPath === "") return pathname === prefix || pathname === prefix + "/";
    return pathname === fullPath || pathname === fullPath + "/" || pathname.startsWith(fullPath + "/");
  }

  return (
    <aside className="flex h-full w-48 flex-col border-r border-border bg-surface overflow-y-auto">
      <nav className="flex flex-1 flex-col px-2 py-3">
        {activeSiteId ? (
          <>
            {/* Home */}
            <Link
              href={prefix || "/"}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 mb-1 transition-colors ${
                isActive("")
                  ? "bg-accent-muted text-accent"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <span className="text-xs">◆</span>
              Dashboard
            </Link>

            {/* Grouped nav */}
            {siteGroups.map((group) => {
              const items = isManager
                ? group.items.filter((item) => MANAGER_PATHS.has(item.path))
                : group.items;

              if (items.length === 0) return null;

              return (
                <div key={group.label} className="mt-3">
                  <p className="px-3 mb-1 text-[9px] font-medium uppercase tracking-wider text-muted">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {items.map((item) => {
                      const href = prefix + item.path;
                      const active = isActive(item.path);
                      return (
                        <div key={href}>
                          <Link
                            href={href}
                            className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                              active
                                ? "bg-accent-muted text-accent"
                                : "text-muted hover:bg-surface-hover hover:text-foreground"
                            }`}
                          >
                            <span className="text-xs">{item.icon}</span>
                            {item.label}
                          </Link>
                          {active && item.children && (
                            <div className="ml-6 flex flex-col gap-0.5 py-0.5">
                              {item.children.map((child) => {
                                const childPath = prefix + child.path;
                                const childActive = pathname === childPath || pathname === childPath + "/";
                                return (
                                  <Link
                                    key={childPath}
                                    href={childPath}
                                    className={`rounded-md px-3 py-1 text-xs transition-colors ${
                                      childActive
                                        ? "text-accent font-medium"
                                        : "text-muted hover:text-foreground"
                                    }`}
                                  >
                                    {child.label}
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="mx-3 my-3 border-t border-border" />
          </>
        ) : (
          <div className="mb-2 px-3 py-2">
            <p className="text-[10px] text-muted">Select a site to access content tools</p>
          </div>
        )}

        {/* Account nav */}
        <div className="flex flex-col gap-0.5">
          {accountLinks.map((item) => {
            const fullPath = prefix + item.path;
            const active = pathname === fullPath || pathname === fullPath + "/";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-accent-muted text-accent"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <span className="text-xs">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
