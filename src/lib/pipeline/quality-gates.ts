/**
 * Quality gates — pre-publish checks that determine whether an
 * asset can be auto-published or must be quarantined.
 *
 * Gates run inline at publish time. Each gate returns pass/fail
 * with a reason. Any red-severity failure triggers quarantine.
 * Yellow flags are logged but don't block publishing.
 */
import "server-only";
import { sql } from "@/lib/db";

export interface GateFlag {
  gate: string;
  severity: "red" | "yellow";
  reason: string;
  checked_at: string;
}

export interface GateResult {
  pass: boolean;
  flags: GateFlag[];
}

function flag(gate: string, severity: "red" | "yellow", reason: string): GateFlag {
  return { gate, severity, reason, checked_at: new Date().toISOString() };
}

/**
 * Check face consent — quarantine if faces detected without
 * explicit consent verification.
 */
async function checkFaceConsent(assetId: string): Promise<GateFlag | null> {
  const [asset] = await sql`
    SELECT ai_analysis->>'has_faces' AS has_faces,
           metadata->>'face_consent_verified' AS consent
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return null;

  if (asset.has_faces === "true" && asset.consent !== "true") {
    return flag("face_consent", "red", "Face detected without consent verification");
  }
  return null;
}

/**
 * Check for unverifiable claims in the caption that could
 * create liability. Scans for superlatives and absolute claims.
 */
function checkClaims(caption: string): GateFlag | null {
  if (!caption) return null;

  const claimPatterns = [
    /\b(best|#1|number one|top-rated|award.?winning|guaranteed)\b/i,
    /\b(licensed and insured|fully insured|bonded)\b/i,
    /\b(lowest price|cheapest|most affordable)\b/i,
    /\b(100%|zero risk|no risk|risk.?free)\b/i,
  ];

  for (const pattern of claimPatterns) {
    const match = caption.match(pattern);
    if (match) {
      return flag("unverifiable_claim", "yellow", `Caption contains potential claim: "${match[0]}"`);
    }
  }
  return null;
}

/**
 * Check for visible text/signage in the image that might contain
 * PII (phone numbers, addresses, license plates).
 */
async function checkPII(assetId: string): Promise<GateFlag | null> {
  const [asset] = await sql`
    SELECT ai_analysis->>'has_text_overlay' AS has_text
    FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return null;

  if (asset.has_text === "true") {
    return flag("visible_text", "yellow", "Image contains visible text — may include PII");
  }
  return null;
}

/**
 * Check quality score threshold.
 */
async function checkQuality(assetId: string, threshold = 0.5): Promise<GateFlag | null> {
  const [asset] = await sql`
    SELECT quality_score FROM media_assets WHERE id = ${assetId}
  `;
  if (!asset) return null;

  const score = Number(asset.quality_score) || 0;
  if (score < threshold) {
    return flag("quality_threshold", "red", `Quality score ${score.toFixed(2)} below publish threshold ${threshold}`);
  }
  return null;
}

/**
 * Run all quality gates on an asset + its caption.
 * Returns pass=true if no red flags. Yellow flags are logged
 * but don't block publishing.
 */
export async function runGates(
  assetId: string,
  caption: string | null,
  opts: { qualityThreshold?: number } = {},
): Promise<GateResult> {
  const flags: GateFlag[] = [];

  const checks = await Promise.all([
    checkFaceConsent(assetId),
    checkPII(assetId),
    checkQuality(assetId, opts.qualityThreshold || 0.5),
  ]);

  for (const f of checks) {
    if (f) flags.push(f);
  }

  if (caption) {
    const claimFlag = checkClaims(caption);
    if (claimFlag) flags.push(claimFlag);
  }

  // Save flags to the asset for audit
  if (flags.length > 0) {
    await sql`
      UPDATE media_assets
      SET gate_flags = ${JSON.stringify(flags)}::jsonb
      WHERE id = ${assetId}
    `;
  }

  const hasRed = flags.some((f) => f.severity === "red");
  return { pass: !hasRed, flags };
}

/**
 * Quarantine an asset — exclude from publishing, hold linked posts.
 */
export async function quarantineAsset(
  assetId: string,
  reason: string,
): Promise<void> {
  await sql`
    UPDATE media_assets
    SET triage_status = 'quarantined',
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ quarantine_reason: reason, quarantined_at: new Date().toISOString() })}::jsonb
    WHERE id = ${assetId}
  `;

  // Hold any linked social posts
  await sql`
    UPDATE social_posts
    SET status = 'held'
    WHERE source_asset_id = ${assetId} AND status IN ('draft', 'scheduled')
  `;
}

/**
 * Release a quarantined asset back to triaged.
 */
export async function releaseAsset(assetId: string): Promise<void> {
  await sql`
    UPDATE media_assets
    SET triage_status = 'triaged',
        metadata = COALESCE(metadata, '{}'::jsonb) - 'quarantine_reason' - 'quarantined_at'
    WHERE id = ${assetId} AND triage_status = 'quarantined'
  `;
}
