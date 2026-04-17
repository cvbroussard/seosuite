/**
 * Pinterest adapter.
 *
 * Publishes pins via Pinterest API v5.
 * Supports image and video pins with link attribution.
 */
import type { PlatformAdapter, PublishInput, PublishResult, TokenResult } from "./types";

const API_BASE = "https://api.pinterest.com/v5";

class PinterestAdapter implements PlatformAdapter {
  readonly platform = "pinterest";

  async publish(input: PublishInput): Promise<PublishResult> {
    const { accessToken, caption, mediaUrls, linkUrl, accountMetadata } = input;

    // Auto-create board if none exists (curtained — zero tenant friction)
    let boardId = accountMetadata?.board_id as string;
    if (!boardId) {
      boardId = await this.autoCreateBoard(accessToken, accountMetadata);
    }

    // Build pin
    const pinBody: Record<string, unknown> = {
      board_id: boardId,
      description: caption.slice(0, 500),
      title: caption.split("\n")[0].slice(0, 100) || "New Pin",
    };

    if (linkUrl) {
      pinBody.link = linkUrl;
    }

    if (mediaUrls.length > 0) {
      pinBody.media_source = {
        source_type: "url",
        url: mediaUrls[0],
      };
    }

    const res = await fetch(`${API_BASE}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pinBody),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Pinterest publish failed (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const pinId = data.id;

    return {
      platformPostId: pinId,
      platformPostUrl: pinId
        ? `https://www.pinterest.com/pin/${pinId}/`
        : undefined,
    };
  }

  /**
   * Auto-create a Pinterest board when none exists. Uses the account
   * name as the board name — derived from the tenant's business
   * during provisioning. Saves board_id to account metadata so
   * subsequent publishes don't re-create.
   */
  private async createBoard(accessToken: string, name: string, description?: string): Promise<string> {
    const res = await fetch(`${API_BASE}/boards`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name.slice(0, 50),
        description: (description || "").slice(0, 500),
        privacy: "PUBLIC",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinterest board creation failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.id as string;
  }

  private async autoCreateBoard(accessToken: string, accountMetadata?: Record<string, unknown>): Promise<string> {
    // Try to find existing boards first
    const listRes = await fetch(`${API_BASE}/boards?page_size=25`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (listRes.ok) {
      const listData = await listRes.json();
      const boards = listData.items || [];
      if (boards.length > 0) {
        // Use the first existing board
        const boardId = boards[0].id as string;
        await this.saveBoardId(accountMetadata, boardId, boards);
        return boardId;
      }
    }

    // No boards exist — create one
    const boardName = (accountMetadata?.username as string) || "My Business";
    const boardId = await this.createBoard(accessToken, boardName, "Published by TracPost");
    await this.saveBoardId(accountMetadata, boardId);
    return boardId;
  }

  private async saveBoardId(accountMetadata?: Record<string, unknown>, boardId?: string, boards?: unknown[]): Promise<void> {
    if (!boardId) return;
    try {
      const { sql } = await import("@/lib/db");
      const username = accountMetadata?.username as string;
      if (username) {
        await sql`
          UPDATE social_accounts
          SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
            board_id: boardId,
            default_board_id: boardId,
            ...(boards ? { boards } : {}),
          })}::jsonb
          WHERE platform = 'pinterest'
            AND (metadata->>'username' = ${username} OR account_name = ${username})
        `;
      }
    } catch (err) {
      console.error("Failed to save board_id:", err);
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenResult> {
    const credentials = Buffer.from(
      `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
    ).toString("base64");

    const res = await fetch(`${API_BASE}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Pinterest token refresh failed: ${err}`);
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 3600,
    };
  }

  getPostUrl(platformPostId: string): string {
    return `https://www.pinterest.com/pin/${platformPostId}/`;
  }
}

export const pinterestAdapter = new PinterestAdapter();
