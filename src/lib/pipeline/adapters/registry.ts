import type { PlatformAdapter } from "./types";
import { instagramAdapter } from "./instagram";
import { facebookAdapter } from "./facebook";

/**
 * Adapter registry — maps platform name to adapter instance.
 *
 * To add a new platform:
 * 1. Create src/lib/pipeline/adapters/{platform}.ts implementing PlatformAdapter
 * 2. Register it here
 * 3. Add platform-specific caption rules in caption-generator.ts
 */
const adapters = new Map<string, PlatformAdapter>();

adapters.set(instagramAdapter.platform, instagramAdapter);
adapters.set(facebookAdapter.platform, facebookAdapter);

export function getAdapter(platform: string): PlatformAdapter | undefined {
  return adapters.get(platform);
}

export function hasAdapter(platform: string): boolean {
  return adapters.has(platform);
}

export function listPlatforms(): string[] {
  return Array.from(adapters.keys());
}
