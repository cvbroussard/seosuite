import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { AcquisitionClient } from "./acquisition-client";

export const dynamic = "force-dynamic";

export default async function AcquisitionPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  return <AcquisitionClient siteId={session.activeSiteId} />;
}
