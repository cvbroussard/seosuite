import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { BrandWizard } from "./brand-wizard";

export const dynamic = "force-dynamic";

export default async function BrandPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  // Check current state
  const [site] = await sql`
    SELECT brand_playbook, brand_wizard_state
    FROM sites
    WHERE id = ${siteId} AND subscriber_id = ${session.subscriberId}
  `;

  if (!site) redirect("/dashboard");

  // Determine initial phase and pre-load data
  const playbook = site.brand_playbook as Record<string, unknown> | null;
  const wizardState = site.brand_wizard_state as Record<string, unknown> | null;

  let initialPhase: string = "onboarding";
  let initialAngles: unknown[] | undefined;
  let initialHooks: unknown[] | undefined;

  if (playbook && (playbook as Record<string, unknown>).offerCore) {
    initialPhase = "complete";
  } else if (wizardState) {
    initialPhase = (wizardState.phase as string) || "onboarding";
    initialAngles = wizardState.generatedAngles as unknown[];
    initialHooks = wizardState.generatedHooks as unknown[];
  }

  return (
    <div className="py-4">
      <BrandWizard
        siteId={siteId}
        initialPhase={initialPhase as "onboarding" | "angles" | "hooks" | "complete"}
        initialAngles={initialAngles as never}
        initialHooks={initialHooks as never}
      />
    </div>
  );
}
