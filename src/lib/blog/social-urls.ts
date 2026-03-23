/**
 * Construct canonical social profile URLs from platform + account data.
 */
export function getSocialProfileUrl(
  platform: string,
  accountId: string,
  metadata?: Record<string, unknown> | null
): string | null {
  const username =
    (metadata?.username as string) ||
    (metadata?.account_name as string) ||
    accountId;

  switch (platform) {
    case "instagram":
      return `https://instagram.com/${username}`;
    case "facebook":
      return metadata?.page_id
        ? `https://facebook.com/${metadata.page_id}`
        : `https://facebook.com/${username}`;
    case "twitter":
      return `https://x.com/${username}`;
    case "linkedin":
      return `https://linkedin.com/in/${accountId}`;
    case "youtube":
      return metadata?.channel_url
        ? String(metadata.channel_url)
        : `https://youtube.com/@${username}`;
    case "pinterest":
      return `https://pinterest.com/${username}`;
    case "tiktok":
      return `https://tiktok.com/@${username}`;
    case "gbp":
      return null; // GBP doesn't have a simple profile URL
    default:
      return null;
  }
}

/**
 * Map platform name to display icon/label.
 */
export function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    twitter: "X",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    pinterest: "Pinterest",
    tiktok: "TikTok",
    gbp: "Google Business",
  };
  return labels[platform] || platform;
}
