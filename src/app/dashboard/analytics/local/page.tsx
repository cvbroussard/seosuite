import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { LocalClient } from "./local-client";

export const dynamic = "force-dynamic";

export default async function LocalPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <LocalClient siteId={session.activeSiteId} />;
}
