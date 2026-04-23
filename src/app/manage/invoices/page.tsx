"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Invoices">{({ subscriberId }) => <div className="p-6"><p className="text-xs text-muted">Invoices for {subscriberId}</p></div>}</ManagePage>;
}
