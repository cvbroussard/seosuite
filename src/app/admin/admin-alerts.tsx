import { sql } from "@/lib/db";
import Link from "next/link";

interface Alert {
  type: "new_subscriber" | "token_expiring" | "pipeline_error";
  severity: "warning" | "danger" | "info";
  title: string;
  detail: string;
  href: string;
  timestamp: string;
}

export async function AdminAlerts() {
  const alerts: Alert[] = [];

  const [newSubscribers, expiringTokens] = await Promise.all([
    // Sites with provisioning explicitly requested by subscriber
    sql`
      SELECT sub.id AS subscription_id, u.name AS subscriber_name,
             s.name AS site_name, s.metadata AS site_metadata, s.created_at
      FROM subscriptions sub
      JOIN users u ON u.subscription_id = sub.id AND u.role = 'owner'
      JOIN sites s ON s.subscription_id = sub.id
      WHERE s.provisioning_status = 'requested'
        AND s.is_active = true
      ORDER BY s.created_at DESC
    `,
    // Social accounts with tokens expiring in the next 7 days
    sql`
      SELECT sa.id, sa.platform, sa.account_name, sa.token_expires_at,
             sub.id AS subscription_id, u.name AS subscriber_name
      FROM social_accounts sa
      JOIN subscriptions sub ON sa.subscription_id = sub.id
      JOIN users u ON u.subscription_id = sub.id AND u.role = 'owner'
      WHERE sa.status = 'active'
        AND sa.token_expires_at IS NOT NULL
        AND sa.token_expires_at < NOW() + INTERVAL '7 days'
        AND sa.token_expires_at > NOW()
      ORDER BY sa.token_expires_at ASC
    `,
  ]);

  for (const sub of newSubscribers) {
    const meta = (sub.site_metadata || {}) as Record<string, unknown>;
    const existing = (meta.existing_accounts || []) as string[];
    const toCreate = 8 - existing.length;
    const detail = toCreate > 0
      ? `${sub.subscriber_name} — create ${toCreate} account${toCreate !== 1 ? "s" : ""}${existing.length > 0 ? `, link ${existing.length}` : ""}`
      : `${sub.subscriber_name} — link ${existing.length} existing accounts`;
    alerts.push({
      type: "new_subscriber",
      severity: "info",
      title: `Provision: ${sub.site_name}`,
      detail,
      href: `/admin/provisioning`,
      timestamp: sub.created_at as string,
    });
  }

  for (const token of expiringTokens) {
    const daysLeft = Math.ceil(
      (new Date(token.token_expires_at as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    alerts.push({
      type: "token_expiring",
      severity: daysLeft <= 2 ? "danger" : "warning",
      title: `Token expiring: ${token.account_name}`,
      detail: `${token.platform} — ${daysLeft}d left — ${token.subscriber_name}`,
      href: `/admin/subscribers/${token.subscription_id}`,
      timestamp: token.token_expires_at as string,
    });
  }

  if (alerts.length === 0) return null;

  const severityOrder = { danger: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const severityColors = {
    danger: { bg: "bg-danger/10", text: "text-danger", dot: "bg-danger" },
    warning: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" },
    info: { bg: "bg-accent/10", text: "text-accent", dot: "bg-accent" },
  };

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
      <h3 className="mb-3 text-xs font-medium text-muted">
        Action Queue ({alerts.length})
      </h3>
      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const colors = severityColors[alert.severity];
          return (
            <Link
              key={i}
              href={alert.href}
              className={`block rounded-lg ${colors.bg} p-3 transition-opacity hover:opacity-80`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}`} />
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${colors.text}`}>{alert.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">{alert.detail}</p>
                  <p className="mt-1 text-[10px] text-muted">
                    {timeAgo(alert.timestamp)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
