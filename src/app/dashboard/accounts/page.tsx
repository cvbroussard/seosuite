import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PlatformIcon } from "@/components/platform-icons";
import { ConnectButton } from "./connect-modal";
import { AccountName } from "./account-name";
import { DisconnectButton } from "./disconnect-button";
import { OnboardingTip } from "@/components/onboarding-tip";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const subscriberId = session.subscriberId;
  const activeSiteId = session.activeSiteId;

  // Social accounts linked to the active site
  const accounts = activeSiteId
    ? await sql`
        SELECT sa.id, sa.platform, sa.account_name, sa.status, sa.token_expires_at,
               sa.created_at,
               (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'published') AS published,
               (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'scheduled') AS scheduled
        FROM social_accounts sa
        JOIN site_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.site_id = ${activeSiteId} AND sa.subscriber_id = ${subscriberId}
        ORDER BY sa.created_at DESC
      `
    : [];

  // Sites for linking
  const sites = await sql`
    SELECT id, name, url FROM sites
    WHERE subscriber_id = ${subscriberId} AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;

  // Current links for active site
  const links = activeSiteId
    ? await sql`
        SELECT ssl.social_account_id, ssl.site_id, s.name AS site_name
        FROM site_social_links ssl
        JOIN sites s ON ssl.site_id = s.id
        JOIN social_accounts sa ON ssl.social_account_id = sa.id
        WHERE ssl.site_id = ${activeSiteId}
      `
    : [];

  // Group links by account
  const linksByAccount = new Map<string, Array<{ siteId: string; siteName: string }>>();
  for (const link of links) {
    const existing = linksByAccount.get(link.social_account_id) || [];
    existing.push({ siteId: link.site_id, siteName: link.site_name });
    linksByAccount.set(link.social_account_id, existing);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <OnboardingTip
        tipKey="accounts"
        message="Every platform is a discovery channel. A client might find you on TikTok but book through Instagram. Connecting all 8 maximizes your reach and gives the autopilot the widest publishing surface."
        incomplete={accounts.length < 8}
      />
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-lg font-semibold">Social Accounts</h1>
          <p className="text-sm text-muted">Connect and link accounts to your sites</p>
        </div>
        <ConnectButton siteId={session.activeSiteId} />
      </div>

      {accounts.length > 0 ? (
        <div>
          {accounts.map((acc) => {
            const expires = acc.token_expires_at ? new Date(acc.token_expires_at) : null;
            const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;
            const urgent = daysLeft !== null && daysLeft < 7;
            const accountLinks = linksByAccount.get(acc.id) || [];

            return (
              <div key={acc.id} className="border-b border-border py-6 last:border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <PlatformIcon platform={acc.platform} size={22} />
                    <p className="font-medium">{acc.platform}</p>
                    <AccountName name={acc.account_name} />
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm ${acc.status === "active" ? "text-success" : "text-danger"}`}>
                      {acc.status}
                    </span>
                    <DisconnectButton accountId={acc.id} accountName={acc.account_name} />
                  </div>
                </div>

                <div className="mt-4 flex gap-8">
                  <div>
                    <p className="text-2xl font-semibold">{acc.published}</p>
                    <p className="text-sm text-muted">Published</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{acc.scheduled}</p>
                    <p className="text-sm text-muted">Scheduled</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-semibold ${urgent ? "text-danger" : ""}`}>
                      {daysLeft !== null ? `${daysLeft}d` : "—"}
                    </p>
                    <p className="text-sm text-muted">Token Expires</p>
                  </div>
                </div>

                {/* Linked sites */}
                {accountLinks.length > 0 && (
                  <div className="mt-4 flex items-center gap-2">
                    {accountLinks.map((link) => (
                      <span key={link.siteId} className="rounded bg-accent/10 px-2 py-1 text-xs text-accent">
                        {link.siteName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center">
          <p className="mb-2 text-3xl">◉</p>
          <h3>No accounts connected</h3>
          <p className="mt-1 text-muted">
            Connect a social account to start publishing content automatically.
          </p>
        </div>
      )}
    </div>
  );
}
