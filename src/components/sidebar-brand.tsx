"use client";

import { useState, useRef, useEffect } from "react";
import { PlatformIcon } from "./platform-icons";

interface SiteInfo {
  id: string;
  name: string;
  url: string;
}

interface ChannelInfo {
  id: string;
  platform: string;
  account_name: string;
}

interface SidebarBrandProps {
  sites: SiteInfo[];
  activeSiteId: string | null;
  channels: ChannelInfo[];
}

export function SidebarBrand({ sites, activeSiteId, channels }: SidebarBrandProps) {
  const [channelOpen, setChannelOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeSite = sites.find((s) => s.id === activeSiteId) || sites[0];
  const activeChannel = channels[0]; // Primary channel

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setChannelOpen(false);
      }
    }
    if (channelOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [channelOpen]);

  return (
    <div className="border-b border-border px-4 py-3">
      {/* Business brand */}
      <p className="text-sm font-semibold text-foreground">
        {activeSite?.name || "No site"}
      </p>

      {/* Channel badge / picker */}
      <div className="relative mt-1.5" ref={dropdownRef}>
        <button
          onClick={() => setChannelOpen(!channelOpen)}
          className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          {activeChannel ? (
            <>
              <PlatformIcon platform={activeChannel.platform} size={12} />
              <span>{activeChannel.account_name}</span>
            </>
          ) : (
            <span className="text-dim">No channels linked</span>
          )}
          {channels.length > 0 && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`ml-0.5 transition-transform ${channelOpen ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </button>

        {/* Dropdown */}
        {channelOpen && channels.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 w-56 border border-border bg-surface py-1">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className={`flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                  ch.id === activeChannel?.id
                    ? "bg-accent-muted text-accent"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <PlatformIcon platform={ch.platform} size={14} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{ch.account_name}</p>
                  <p className="text-[10px] text-dim">{ch.platform}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
