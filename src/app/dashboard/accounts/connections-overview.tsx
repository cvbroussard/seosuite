"use client";

import Link from "next/link";
import { PlatformIcon } from "@/components/platform-icons";
import { PLATFORMS } from "./platform-config";

interface PlatformStatus {
  status: "connected" | "pending_assignment" | "not_connected";
  accountName: string | null;
  tokenExpiresAt: string | null;
  availableAssets?: number;
}

function usePrefix() {
  const isSubdomain = typeof window !== "undefined" && window.location.hostname === "studio.tracpost.com";
  return isSubdomain ? "" : "/dashboard";
}

export function ConnectionsOverview({
  statuses,
}: {
  statuses: Record<string, PlatformStatus>;
}) {
  const prefix = usePrefix();
  const visiblePlatforms = PLATFORMS.filter((p) => p.key !== "meta");
  const connectedCount = visiblePlatforms.filter((p) => statuses[p.key]?.status === "connected").length;
  const pendingCount = visiblePlatforms.filter((p) => statuses[p.key]?.status === "pending_assignment").length;

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-lg font-semibold mb-1">Connections</h1>
        <p className="text-sm text-muted">
          {connectedCount} of {visiblePlatforms.length} platforms connected
          {pendingCount > 0 && ` · ${pendingCount} pending assignment`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {visiblePlatforms.map((platform) => {
          const status = statuses[platform.key];
          const state = status?.status || "not_connected";
          const tokenExpires = status?.tokenExpiresAt ? new Date(status.tokenExpiresAt) : null;
          const daysLeft = tokenExpires ? Math.ceil((tokenExpires.getTime() - Date.now()) / 86400000) : null;
          const tokenUrgent = daysLeft !== null && daysLeft < 7;
          const targetSlug = platform.hubTargetSlug || platform.slug;

          const dotColor =
            state === "connected" ? "bg-success" :
            state === "pending_assignment" ? "bg-warning" :
            "bg-border";

          return (
            <Link
              key={platform.key}
              href={`${prefix}/accounts/${targetSlug}`}
              className="group rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-background shrink-0">
                  <PlatformIcon platform={platform.key} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{platform.label}</h3>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                  </div>
                  {state === "connected" && status ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-[10px] text-success truncate">{status.accountName}</p>
                      {tokenUrgent && (
                        <p className="text-[10px] text-danger">Token expires in {daysLeft}d</p>
                      )}
                    </div>
                  ) : state === "pending_assignment" ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-[10px] text-warning">Pending assignment</p>
                      {status?.availableAssets && (
                        <p className="text-[10px] text-muted">{status.availableAssets} asset{status.availableAssets !== 1 ? "s" : ""} available</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-muted">
                      {platform.oauthReady ? "Not connected" : "Coming soon"}
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[10px] text-muted leading-relaxed line-clamp-2">
                {platform.why.split(".")[0]}.
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
