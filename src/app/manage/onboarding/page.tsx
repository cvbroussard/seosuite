"use client";
import { ManagePage } from "@/components/manage/manage-page";
export default function Page() {
  return <ManagePage title="Onboarding">{({ subscriberId }) => <div className="p-6"><p className="text-xs text-muted">Onboarding for subscriber {subscriberId}</p></div>}</ManagePage>;
}
