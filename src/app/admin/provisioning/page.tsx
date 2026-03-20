import { sql } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS = [
  "instagram", "tiktok", "facebook", "gbp",
  "youtube", "twitter", "linkedin", "pinterest",
];

export default async function ProvisioningPage() {
  // Subscribers with sites that need provisioning
  const subscribers = await sql`
    SELECT
      sub.id AS subscriber_id,
      sub.name AS subscriber_name,
      sub.email,
      sub.plan,
      sub.created_at,
      sub.metadata,
      s.id AS site_id,
      s.name AS site_name,
      s.url AS site_url,
      s.business_type,
      s.location,
      s.brand_playbook IS NOT NULL AS has_playbook,
      (
        SELECT array_agg(DISTINCT sa.platform)
        FROM social_accounts sa
        JOIN site_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.site_id = s.id AND sa.status = 'active'
      ) AS connected_platforms,
      (
        SELECT blog_enabled FROM blog_settings WHERE site_id = s.id
      ) AS blog_enabled
    FROM subscribers sub
    JOIN sites s ON s.subscriber_id = sub.id
    WHERE sub.is_active = true
    ORDER BY sub.created_at DESC
  `;

  return (
    <div className="mx-auto max-w-5xl">
      <h1>Provisioning</h1>
      <p className="mt-2 mb-8 text-muted">New subscriber setup and social account provisioning</p>

      {subscribers.length === 0 ? (
        <p className="py-12 text-center text-muted">No subscribers to provision</p>
      ) : (
        <div>
          {subscribers.map((sub) => {
            const connected = (sub.connected_platforms as string[] | null) || [];
            const missing = ALL_PLATFORMS.filter((p) => !connected.includes(p));
            const meta = (sub.metadata || {}) as Record<string, unknown>;
            const onboardingStatus = meta.onboarding_status as string;
            const isNew = onboardingStatus === "new" || onboardingStatus === "complete";
            const allProvisioned = missing.length === 0 && sub.has_playbook && sub.blog_enabled;

            return (
              <div
                key={`${sub.subscriber_id}-${sub.site_id}`}
                className="mb-6 border-b border-border pb-6 last:border-0"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 style={{ marginTop: 0 }}>{sub.site_name || sub.subscriber_name}</h2>
                      {allProvisioned ? (
                        <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">Ready</span>
                      ) : isNew ? (
                        <span className="rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">New</span>
                      ) : (
                        <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">In progress</span>
                      )}
                    </div>
                    <p className="text-sm text-muted">
                      {sub.business_type || "No type"} · {sub.location || "No location"} · {sub.plan}
                    </p>
                    <p className="text-sm text-muted">
                      {sub.email} · {sub.site_url || "No website"}
                    </p>
                  </div>
                  <Link
                    href={`/admin/subscribers/${sub.subscriber_id}`}
                    className="text-sm text-accent hover:underline"
                  >
                    View subscriber
                  </Link>
                </div>

                {/* Provisioning checklist */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {/* Playbook */}
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%", display: "inline-flex",
                      alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600,
                      background: sub.has_playbook ? "var(--color-success)" : "var(--color-surface-hover)",
                      color: sub.has_playbook ? "#fff" : "var(--color-muted)",
                    }}>
                      {sub.has_playbook ? "✓" : ""}
                    </span>
                    Brand playbook {sub.has_playbook ? "" : "(auto-generating...)"}
                  </div>

                  {/* Blog */}
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%", display: "inline-flex",
                      alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600,
                      background: sub.blog_enabled ? "var(--color-success)" : "var(--color-surface-hover)",
                      color: sub.blog_enabled ? "#fff" : "var(--color-muted)",
                    }}>
                      {sub.blog_enabled ? "✓" : ""}
                    </span>
                    Blog enabled
                  </div>

                  {/* Each platform */}
                  {ALL_PLATFORMS.map((platform) => {
                    const isConnected = connected.includes(platform);
                    return (
                      <div key={platform} className="flex items-center gap-2 text-sm">
                        <span style={{
                          width: 16, height: 16, borderRadius: "50%", display: "inline-flex",
                          alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600,
                          background: isConnected ? "var(--color-success)" : "var(--color-surface-hover)",
                          color: isConnected ? "#fff" : "var(--color-muted)",
                        }}>
                          {isConnected ? "✓" : ""}
                        </span>
                        <span className={isConnected ? "text-muted" : ""}>
                          {platform}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Profile template */}
                {sub.has_playbook && (
                  <ProfileTemplate
                    siteName={sub.site_name as string}
                    businessType={sub.business_type as string}
                    location={sub.location as string}
                    siteUrl={sub.site_url as string}
                    siteId={sub.site_id as string}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

async function ProfileTemplate({
  siteName, businessType, location, siteUrl, siteId,
}: {
  siteName: string; businessType: string; location: string; siteUrl: string; siteId: string;
}) {
  // Pull offer statement from playbook for bio
  const [site] = await sql`
    SELECT brand_playbook FROM sites WHERE id = ${siteId}
  `;

  const playbook = site?.brand_playbook as Record<string, unknown> | null;
  const offerCore = playbook?.offerCore as Record<string, unknown> | null;
  const offerStatement = offerCore?.offerStatement as Record<string, string> | null;
  const emotionalCore = offerStatement?.emotionalCore || businessType;

  const bio = `${siteName} | ${emotionalCore} | ${location || ""}`.trim().replace(/\| $/, "");
  const linkInBio = siteUrl || `https://${siteName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.tracpost.com`;

  return (
    <div className="mt-4 rounded-lg bg-surface-hover p-4">
      <p className="mb-2 text-sm font-medium">Profile template</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Bio</span>
          <span className="max-w-xs text-right">{bio}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Link in bio</span>
          <span>{linkInBio}</span>
        </div>
      </div>
    </div>
  );
}
