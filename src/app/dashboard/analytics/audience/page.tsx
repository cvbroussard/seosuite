import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { AudienceClient } from "./audience-client";

export const dynamic = "force-dynamic";

export default async function AudiencePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <AudienceClient siteId={session.activeSiteId} />;
}
