"use client";

import { useEffect, useState } from "react";

/**
 * Live countdown to a scheduled publish moment.
 *
 * The trust artifact (per project_tracpost_manual_first_rebuild memory):
 * "subscribers see TracPost has their back — 3 days, 7 hours, 13 minutes,
 * 22 seconds until delivery." Visible proof the system is alive,
 * watching, ready.
 *
 * Adaptive format:
 *   > 24h    : "3 days, 7 hours"
 *   < 24h    : "7 hours, 13 minutes"
 *   < 1h     : "13 minutes, 22 seconds"
 *   < 30s    : "22, 21, 20…" with subtle pulse
 *   t = 0    : "Publishing now…" with spinner
 *   past     : "Past due — investigating" (failure-mode hint)
 *
 * Pass `publishedState` to override the render once delivery completes
 * (e.g., "Published 5s ago — View on Facebook →"). The component itself
 * doesn't know when the publisher fired; the parent supplies that signal.
 */
interface Props {
  scheduledAt: string | Date;
  publishedState?: React.ReactNode;
  className?: string;
}

export function ScheduledCountdown({ scheduledAt, publishedState, className }: Props) {
  const target = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (publishedState) return; // Parent took over rendering.
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [publishedState]);

  if (publishedState) {
    return <span className={className}>{publishedState}</span>;
  }

  const diffMs = target.getTime() - now.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  // Past due window — publisher should have fired but hasn't yet.
  // Surface honestly rather than counting up; this is rare and worth
  // attention (cron lag, publish failure, etc.).
  if (diffSec < 0) {
    return (
      <span className={`text-warning ${className || ""}`}>
        Past due — investigating
      </span>
    );
  }

  // < 30s: big tick-down, pulse animation
  if (diffSec < 30) {
    return (
      <span className={`text-accent font-mono font-semibold animate-pulse ${className || ""}`}>
        {diffSec}s
      </span>
    );
  }

  // < 1h: minutes and seconds
  if (diffSec < 60 * 60) {
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return (
      <span className={`font-mono ${className || ""}`}>
        {mins}m {secs}s
      </span>
    );
  }

  // < 24h: hours and minutes
  if (diffSec < 60 * 60 * 24) {
    const hours = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    return (
      <span className={className}>
        {hours}h {mins}m
      </span>
    );
  }

  // > 24h: days and hours
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  return (
    <span className={className}>
      {days}d {hours}h
    </span>
  );
}
