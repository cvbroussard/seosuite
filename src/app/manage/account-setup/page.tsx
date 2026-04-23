"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Account Setup">{({ subscriberId }) => <div className="p-6"><p className="text-xs text-muted">Account setup for {subscriberId}</p></div>}</ManagePage>;
}
