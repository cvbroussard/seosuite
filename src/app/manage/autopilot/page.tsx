"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Autopilot" requireSite>{({ siteId }) => <div className="p-6"><p className="text-xs text-muted">Autopilot settings for site {siteId}</p></div>}</ManagePage>;
}
