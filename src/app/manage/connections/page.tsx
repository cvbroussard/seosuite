"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Connections">{({ subscriberId }) => <div className="p-6"><p className="text-xs text-muted">Social connections for {subscriberId}</p></div>}</ManagePage>;
}
