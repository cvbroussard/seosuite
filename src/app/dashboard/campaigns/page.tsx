import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { CampaignsClient } from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");
  // Promote module is enterprise-tier only — paid advertising features
  // must be invisible to mid-tier subscribers per brand-positioning rule.
  if (!session.plan.toLowerCase().includes("enterprise")) redirect("/dashboard");

  // Pass the active site's URL so the CTA URL input can pre-fill it
  const activeSite = session.sites.find((s) => s.id === session.activeSiteId);
  const siteUrl = activeSite?.url || "";

  return <CampaignsClient siteId={session.activeSiteId} siteUrl={siteUrl} />;
}
