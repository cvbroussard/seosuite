import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PromoteHub() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const prefix = "/dashboard";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Promote</h1>
        <p className="text-xs text-muted">Paid advertising and campaign management</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href={`${prefix}/campaigns`} className="rounded-xl border border-border bg-surface p-4 shadow-card hover:border-accent/30 transition-colors">
          <p className="text-sm font-medium">Campaigns</p>
          <p className="mt-0.5 text-[10px] text-muted">Manage ad campaigns across platforms</p>
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="text-sm font-medium">Campaign management is an enterprise feature</p>
        <p className="mt-1 text-xs text-muted">
          Connect your ad accounts and let TracPost optimize your paid reach alongside organic content.
        </p>
      </div>
    </div>
  );
}
