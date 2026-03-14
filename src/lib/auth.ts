import { sql } from "./db";
import { NextRequest, NextResponse } from "next/server";

export interface AuthContext {
  subscriberId: string;
  subscriberName: string;
  plan: string;
}

/**
 * Validate Bearer token and return subscriber context.
 * API keys are stored as bcrypt hashes in the subscribers table.
 * For performance, we use a simple hash comparison (SHA-256)
 * since API keys are high-entropy random strings.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  // Hash the incoming token and compare against stored hashes
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const rows = await sql`
    SELECT id, name, plan
    FROM subscribers
    WHERE api_key_hash = ${apiKeyHash}
      AND is_active = true
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  return {
    subscriberId: rows[0].id,
    subscriberName: rows[0].name,
    plan: rows[0].plan,
  };
}

/**
 * Hash an API key for storage using SHA-256.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
