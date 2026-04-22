import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { EngagementClient } from "./engagement-client";

export const dynamic = "force-dynamic";

export default async function EngagementPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <EngagementClient siteId={session.activeSiteId} />;
}
