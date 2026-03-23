import { getSocialProfileUrl, getPlatformLabel } from "@/lib/blog/social-urls";

interface SocialAccount {
  platform: string;
  account_id: string;
  account_name: string;
  metadata: Record<string, unknown> | null;
}

interface HubHeaderProps {
  siteName: string;
  description: string;
  location?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  socialAccounts: SocialAccount[];
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📷",
  facebook: "📘",
  twitter: "𝕏",
  linkedin: "💼",
  youtube: "▶️",
  pinterest: "📌",
  tiktok: "🎵",
  gbp: "📍",
};

export default function HubHeader({
  siteName,
  description,
  location,
  phone,
  websiteUrl,
  logoUrl,
  socialAccounts,
}: HubHeaderProps) {
  return (
    <header style={{ marginBottom: 48, textAlign: "center" }}>
      {logoUrl && (
        <img
          src={logoUrl}
          alt={siteName}
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            objectFit: "cover",
            margin: "0 auto 16px",
            display: "block",
          }}
        />
      )}

      <h1 style={{ fontSize: 32, marginBottom: 8 }}>{siteName}</h1>

      {description && (
        <p className="blog-muted" style={{ fontSize: 17, maxWidth: 520, margin: "0 auto 12px" }}>
          {description}
        </p>
      )}

      {(location || phone) && (
        <p className="blog-muted" style={{ fontSize: 14, marginBottom: 12 }}>
          {location}
          {location && phone && " · "}
          {phone}
        </p>
      )}

      {websiteUrl && (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="blog-accent"
          style={{ fontSize: 14, textDecoration: "none", display: "inline-block", marginBottom: 16 }}
        >
          {websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
      )}

      {socialAccounts.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 8,
          }}
        >
          {socialAccounts.map((account) => {
            const url = getSocialProfileUrl(
              account.platform,
              account.account_id,
              account.metadata
            );
            if (!url) return null;
            return (
              <a
                key={`${account.platform}-${account.account_id}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={getPlatformLabel(account.platform)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 13,
                  color: "var(--blog-muted)",
                  textDecoration: "none",
                  padding: "4px 10px",
                  borderRadius: "var(--blog-radius)",
                  border: "1px solid var(--blog-border)",
                }}
              >
                <span>{PLATFORM_ICONS[account.platform] || "🔗"}</span>
                <span>{getPlatformLabel(account.platform)}</span>
              </a>
            );
          })}
        </div>
      )}
    </header>
  );
}
