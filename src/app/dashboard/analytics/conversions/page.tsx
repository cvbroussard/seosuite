import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ConversionsClient } from "./conversions-client";

export const dynamic = "force-dynamic";

export default async function ConversionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <ConversionsClient siteId={session.activeSiteId} />;
}
