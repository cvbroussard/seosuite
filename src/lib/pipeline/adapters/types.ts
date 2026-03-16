/**
 * Platform adapter interface — implement this to add a new social platform.
 *
 * Each adapter handles publishing, token refresh, and post URL generation
 * for a single platform. The orchestrator selects the correct adapter
 * based on the `platform` field on social_accounts.
 */

export interface PublishResult {
  platformPostId: string;
  platformPostUrl?: string;
}

export interface TokenResult {
  accessToken: string;
  expiresIn: number; // seconds
}

export interface PublishInput {
  /** Platform-specific user/account ID (e.g., IG user ID, FB page ID) */
  platformAccountId: string;
  /** OAuth access token (long-lived) */
  accessToken: string;
  /** Full caption text including hashtags */
  caption: string;
  /** Public URLs of media files */
  mediaUrls: string[];
  /** image or video */
  mediaType: string;
  /** Optional link URL (for platforms that support link posts) */
  linkUrl?: string;
  /** Platform-specific metadata from social_accounts.metadata */
  accountMetadata?: Record<string, unknown>;
}

export interface PlatformAdapter {
  /** Platform identifier matching social_accounts.platform */
  readonly platform: string;

  /** Publish a post to this platform */
  publish(input: PublishInput): Promise<PublishResult>;

  /** Refresh an expiring OAuth token. Throw if not refreshable. */
  refreshToken(currentToken: string): Promise<TokenResult>;

  /** Build the public post URL from a platform post ID */
  getPostUrl(platformPostId: string, accountMetadata?: Record<string, unknown>): string;
}
