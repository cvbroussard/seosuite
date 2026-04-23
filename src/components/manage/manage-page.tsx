"use client";

import { useManageContext } from "./manage-context";

interface ManagePageProps {
  title: string;
  requireSite?: boolean;
  children: (ctx: { subscriberId: string; siteId: string }) => React.ReactNode;
}

export function ManagePage({ title, requireSite, children }: ManagePageProps) {
  const { subscriberId, siteId } = useManageContext();

  if (subscriberId === "all") {
    return (
      <div className="p-6">
        <h2 className="text-sm font-medium mb-2">{title}</h2>
        <p className="text-xs text-muted">Select a subscriber to view {title.toLowerCase()}.</p>
      </div>
    );
  }

  if (requireSite && siteId === "all") {
    return (
      <div className="p-6">
        <h2 className="text-sm font-medium mb-2">{title}</h2>
        <p className="text-xs text-muted">Select a site to view {title.toLowerCase()}.</p>
      </div>
    );
  }

  return <>{children({ subscriberId, siteId })}</>;
}
