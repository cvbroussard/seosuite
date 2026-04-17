# Autopilot Publisher — Implementation Plan

Replaces the slot-based publishing system with a cadence-driven
autopilot that publishes immediately without tenant pre-approval.

## Phase 1 — Quarantine status + quality gates

### Schema
```sql
-- Add quarantine to triage_status enum (no actual enum — it's TEXT)
-- Already TEXT, just start using 'quarantined' as a value

-- Add 'held' to social_posts.status (already TEXT)

-- Quality gate results on media_assets
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS
  gate_flags JSONB DEFAULT '[]'::jsonb;
-- Array of { gate: string, severity: "red"|"yellow", reason: string, checked_at: string }
```

### Quality gate functions (src/lib/pipeline/quality-gates.ts)
- `checkFaceConsent(assetId)` — quarantine if has_faces && no consent
- `checkClaims(caption)` — scan for unverifiable claims
- `checkPII(assetId)` — detect visible text/signage
- `runGates(assetId, caption)` → { pass: boolean, flags: GateFlag[] }

### Quarantine actions
- `quarantineAsset(assetId, reason)` — set triage_status='quarantined', hold linked posts
- `releaseAsset(assetId)` — back to 'triaged'
- `trashAsset(assetId)` — permanent removal

## Phase 2 — Cadence engine

### Cadence evaluator (src/lib/pipeline/cadence.ts)
- `shouldPublishNow(siteId, platform, config)` → boolean
  - Checks all 5 dimensions: date, day, time, frequency, max
- `getActiveCampaign(config, date)` → campaign | null
- `getContentTriggers(siteId)` → triggered assets
- `countPublishedToday(siteId, platform)` → number
- `countPublishedThisWeek(siteId, platform)` → number

### Queue selector (src/lib/pipeline/queue.ts)
- `selectNextAsset(siteId, platform, opts)` → asset | null
  - Filters: triaged, quality >= threshold, not yet published to this platform
  - Weights: campaign boost, quality score, recency, pillar diversity
  - Excludes: quarantined, already-published-to-platform

## Phase 3 — Autopilot publisher

### Publisher (src/lib/pipeline/autopilot-publisher.ts)
- `publishForSite(siteId)` — main entry, called by cron
  - For each connected platform:
    1. shouldPublishNow? → skip if no
    2. selectNextAsset → skip if none
    3. runGates → quarantine if fail
    4. Build post: caption from generated_text, media from variants
    5. Publish via adapter
    6. Create social_posts record (status='published')
    7. Create notification for tenant

### Cron integration
- Replace slot-filler + old publisher calls in cron with:
  ```
  await autopilotPublish(siteId);
  ```

## Phase 4 — Notifications

### Post-publish notification
- "TracPost published N posts today" — batched daily
- Individual push for red-flag quarantines
- Notification categories: 'publishing' (new), 'quarantine' (new)

### Daily digest
- Summary of what published, engagement delta, any quarantined items
- Email via Resend (existing infra)

## Phase 5 — Unipost UI update

### Status tabs
- Remove "Review" (no pre-approval)
- Rename to: "Recent" | "Live" | "Quarantined" | "All"
- Recent = last 24-48 hours (the post-publish review window)
- Live = all published
- Quarantined = held items needing admin attention

### Post actions
- Remove: Approve, Reject
- Keep: Take Down (quarantine + platform delete), Edit Caption
- Add: Release (admin only, for quarantined items)

## Phase 6 — Deprecate slots

### Remove
- `publishing_slots` table queries from cron
- `slot-filler.ts` (dead code)
- Slot references in social_posts (slot_id column stays for history)
- Slot UI in calendar/dashboard (if any)

### Keep
- `publishing_slots` table (historical data, don't drop)
- `social_posts.slot_id` column (nullable, historical)

## Build order

1. Phase 1 (quality gates + quarantine) — foundation
2. Phase 2 (cadence engine) — the scheduler
3. Phase 3 (autopilot publisher) — ties it together
4. Phase 4 (notifications) — tenant visibility
5. Phase 5 (Unipost update) — UI reflects new model
6. Phase 6 (deprecate slots) — cleanup
