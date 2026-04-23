"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Inbox" requireSite>{({ siteId }) => <div className="p-6"><p className="text-xs text-muted">Inbox for site {siteId}</p></div>}</ManagePage>;
}
