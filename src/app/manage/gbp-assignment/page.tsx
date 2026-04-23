"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="GBP Assignment">{({ subscriberId }) => <div className="p-6"><p className="text-xs text-muted">GBP location assignment for {subscriberId}</p></div>}</ManagePage>;
}
