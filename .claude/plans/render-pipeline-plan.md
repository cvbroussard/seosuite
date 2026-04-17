# Render Pipeline — Full Implementation Plan

## Overview

Adds the RENDER step to the content pipeline:
**Capture → Triage → RENDER → Caption → Publish**

27 enhancements (22 auto, 5 manual), platform playbook decision engine,
per-platform variant storage, Unipost dashboard for unified viewing.

---

## Phase 1 — Foundation (Schema + Basic Infra)

### DB Schema

```sql
-- Variant inventory on media_assets
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '{}';
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS render_status TEXT DEFAULT 'pending';
-- render_status: 'pending' | 'rendered' | 'failed' | 'skipped'

-- Per-tenant render preferences
ALTER TABLE sites ADD COLUMN IF NOT EXISTS render_config JSONB DEFAULT '{}';
-- { watermark_enabled: bool, watermark_position: "br"|"bl"|"tr"|"tl",
--   grade_warmth: "warm"|"cool"|"neutral"|"auto",
--   text_overlay_font: "brand"|"system",
--   cta_defaults: { instagram: "Link in bio", pinterest: "Visit site", ... } }

-- Brand assets for overlays (logo file, fonts)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS brand_assets JSONB DEFAULT '{}';
-- { logo_url: string, logo_light_url: string, brand_font_url: string,
--   color_palette: { primary: "#hex", accent: "#hex", ... } }

-- Platform-wide render templates (Phase 2 evolution, create now)
CREATE TABLE IF NOT EXISTS render_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL,           -- 'instagram' | 'tiktok' | 'pinterest' | etc
  content_type TEXT,                -- 'kitchen' | 'portrait' | 'food' | null (any)
  business_type TEXT,               -- 'contractor' | 'salon' | null (any)
  config JSONB NOT NULL,            -- full render plan config
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Render history for performance tracking (Phase 3 learning)
CREATE TABLE IF NOT EXISTS render_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  social_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  config JSONB NOT NULL,            -- what render config was used
  variant_url TEXT NOT NULL,
  rendered_at TIMESTAMPTZ DEFAULT NOW(),
  engagement JSONB                  -- filled later by analytics sync
);
CREATE INDEX IF NOT EXISTS idx_render_history_asset ON render_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_render_history_platform ON render_history(platform);

-- Carousel compositions
CREATE TABLE IF NOT EXISTS carousel_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  slide_assets UUID[] NOT NULL,     -- ordered array of media_asset IDs
  slide_configs JSONB NOT NULL,     -- per-slide render config
  status TEXT DEFAULT 'draft',      -- 'draft' | 'rendered' | 'published'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### R2 Variant Key Convention

```
Source:   sites/{siteId}/{date}/{filename}.jpg
Variants: sites/{siteId}/{date}/{filename}--ig-1x1.jpg
          sites/{siteId}/{date}/{filename}--ig-4x5.jpg
          sites/{siteId}/{date}/{filename}--pin-2x3.jpg
          sites/{siteId}/{date}/{filename}--tiktok-9x16.mp4
          sites/{siteId}/{date}/{filename}--blog-16x9.jpg
          sites/{siteId}/{date}/{filename}--gbp-16x9.jpg
```

Double-dash `--` separator distinguishes variant suffix from the original filename.

### Backend: lib/render/

```
src/lib/render/
  types.ts          — RenderPlan, VariantConfig, PlatformKey types
  engine.ts         — renderAsset(assetId, plans[]) → variant URLs
  crops.ts          — platform crop functions (sharp-based)
  grade.ts          — auto color grade (sharp adjustments)
  storage.ts        — variant R2 upload + JSONB update
```

### Pipeline Hook

```
src/lib/pipeline/render-step.ts
  — Called after triage, before caption
  — Queries platform playbook for render plans
  — Calls engine.renderAsset() for each plan
  — Updates media_assets.variants + render_status
```

### Migration Script

```
scripts/migrate-038-render-pipeline.js
```

---

## Phase 2 — Core Image Renders

### Enhancements built in this phase:
- #1 Auto color grade (+ #14 HDR, folded in)
- #2 Platform crop (1:1, 4:5, 9:16, 16:9, 2:3)
- #7 Text overlay — headline
- #8 Text overlay — CTA
- #9 Brand watermark

### Implementation:

```
src/lib/render/
  crops.ts        — sharp resize + crop per aspect ratio
                    Smart crop using sharp's attention/entropy strategy
                    to keep subject centered
  grade.ts        — sharp modulate (brightness, saturation, hue)
                    + HDR: sharp normalize + linear stretch for 
                    high-contrast scenes
  overlay.ts      — sharp composite for text overlays
                    Render text to SVG → composite onto image
                    Brand font loaded from sites.brand_assets
                    CTA text from sites.render_config.cta_defaults
  watermark.ts    — sharp composite logo overlay
                    Logo from sites.brand_assets.logo_url
                    Position from sites.render_config.watermark_position
                    Opacity: 60-80%, sized proportionally
```

### Admin UI (platform):
- Site controls → new "Render Settings" pane
  - Watermark on/off + position picker
  - Grade warmth preference (warm/cool/neutral/auto)
  - CTA defaults per platform
  - Logo upload for watermark
  - Preview: show a sample photo with current render settings applied

---

## Phase 3 — Before/After + Background Cleanup

### Enhancements:
- #3 Background cleanup (edge debris removal) — Authority+
- #6 Before/after composite

### Implementation:

```
src/lib/render/
  cleanup.ts      — AI-powered edge cleanup
                    Send image to Gemini with inpainting prompt:
                    "Remove construction debris, tools, and 
                    distracting objects visible at the edges of 
                    this photo. Preserve the main subject."
  composite.ts    — Before/after side-by-side
                    Input: two asset IDs (earliest + latest in project)
                    Sharp: resize both to same dimensions, 
                    concatenate horizontally with thin divider
                    Optional: "BEFORE" / "AFTER" text labels
```

### Auto-detection for before/after:
- Pipeline detects: project has 2+ photos with quality_score > 0.7
- First photo (by date_taken) = before
- Last photo = after
- Auto-compose if scene_type matches (both "kitchen", both "bathroom")

---

## Phase 4 — Carousel Composition

### Enhancements:
- #18 Auto-carousel from project
- #19 Before/after carousel (2-slide)
- #20 Slide text overlays

### Implementation:

```
src/lib/render/
  carousel.ts     — composeCarousel(projectId, platform)
                    1. Query project photos, order by date_taken
                    2. Select best N by quality_score (5 for IG, 
                       varies by platform)
                    3. Ensure visual diversity (no two consecutive 
                       shots of same scene_type)
                    4. Render each slide per platform aspect ratio
                    5. Apply per-slide overlays:
                       - Slide 1: "BEFORE" or "SWIPE →"
                       - Middle slides: clean
                       - Final slide: hero treatment + CTA
                    6. Store in carousel_compositions table
                    7. Update media_assets.variants with carousel flag
```

### Trigger conditions (auto):
- Project has 5+ triaged photos spanning 7+ days
- OR project end_date is set (project marked complete)
- OR no new photos for 14 days (inferred completion)

### Publishing integration:
- Instagram carousel API: send array of media URLs
- Pinterest idea pin: multi-image pin format
- Facebook album: publish as album post
- Others: publish hero shot only (single image) with link to project page

---

## Phase 5 — Video Transforms

### Enhancements:
- #23 Ken Burns from stills
- #24 Timelapse from photo series (Authority+)
- #25 Auto-trim/highlight (Manual, Authority+)
- #26 Aspect reformat (H→V)
- #27 Text overlay on video
- #28 Caption/subtitle burn-in
- #31 Thumbnail generation

### Implementation:

```
src/lib/render/
  video.ts        — Ken Burns: ffmpeg with zoompan filter
                    Input: 3-5 photos from project
                    Output: 15-30s vertical video (9:16) as MP4
                    Each photo gets 3-5s with slow pan/zoom
                    Crossfade transitions between photos
                    ONE rendered MP4 stored in R2, served everywhere:
                    social platforms get it as file upload, web pages
                    get it as <video> tag. No CSS fallback. Social-first.
                    
  timelapse.ts    — ffmpeg concat from project photo series
                    Input: all project photos chronologically
                    Output: 10-30s timelapse (framerate = total/duration)
                    
  reformat.ts     — ffmpeg crop with subject tracking
                    Input: horizontal video
                    Output: vertical 9:16 crop
                    Use ffmpeg cropdetect or AI-based subject tracking
                    
  subtitles.ts    — Web Speech API or Whisper transcription
                    → SRT/VTT generation
                    → ffmpeg burn-in with styled text
                    
  thumbnail.ts    — Extract best frame by sharpness/composition
                    OR composite: best frame + text overlay + branding
```

### Dependencies:
- ffmpeg must be available in the runtime environment
- Vercel serverless has ffmpeg via ffmpeg-static npm package
- Video processing is CPU-intensive → may need background job queue
  (Inngest, or a separate worker)

---

## Phase 6 — Platform Playbook (Decision Engine)

### Phase 6a — Rules engine (launch)

```
src/lib/render/
  playbook.ts     — generateRenderPlans(asset, tenant, platforms[])
                    Returns: RenderPlan[] (one per platform)
                    
                    Decision tree:
                    1. Read asset signals (quality, scene_type, project, media_type)
                    2. Read tenant signals (business_type, brand_playbook, tier, render_config)
                    3. For each connected platform:
                       a. Select base template from render_templates (match by platform + business_type + content_type)
                       b. Override with tenant render_config preferences
                       c. Apply tier gates (skip Authority+ enhancements for Growth)
                       d. Output: RenderPlan { crop, grade, overlays[], watermark, carousel?, video? }
```

### Phase 6b — Template library (6 months)

- Seed render_templates table with defaults per business_type × platform
- Admin UI: template editor (preview render + save)
- Tenant UI: template gallery (browse, preview, select preferred template per platform)

### Phase 6c — Learning engine (12 months)

- render_history tracks: config used → engagement received
- Analytics sync fills render_history.engagement from social_post_analytics
- Nightly job: aggregate performance by config dimension (crop × grade × overlay)
- Recommendation engine: "warm grade + text overlay outperforms clean by 23% for kitchen photos on Instagram for your market"
- A/B framework: randomly assign 20% of posts to variant configs, measure, converge

---

## Phase 7 — Manual Tools (Edit Modal)

### Enhancements:
- #5 Product-shot hero (Authority+)
- #13 Object removal (Enterprise)
- #15 Perspective render — dark isometric (Enterprise)
- #25 Auto-trim video (Authority+)

### Implementation:

```
src/components/asset-edit-modal.tsx
  — New "Enhance" dropdown button (next to "Generate caption" + "Dictate")
  — Tier-gated menu items:
    - "Product shot" (Authority+) → POST /api/assets/:id/render/product-shot
    - "Remove objects" (Enterprise) → POST /api/assets/:id/render/object-removal
    - "Perspective render" (Enterprise) → POST /api/assets/:id/render/perspective
    - "Trim video" (Authority+) → POST /api/assets/:id/render/trim

src/app/api/assets/[id]/render/[type]/route.ts
  — Shared route handler per render type
  — Auth + tier check
  — Calls appropriate render function
  — Stores result as variant or new linked asset
  — Returns { success, variant_url }
```

### Perspective render uses the locked Gemini prompt from
reference_screenshot_perspective_prompt.md

---

## Phase 8 — Unipost Dashboard

### Three view modes:

**8a — Firehose (individual posts)**
```
src/app/dashboard/unipost/page.tsx
  — Query: social_posts ORDER BY published_at DESC
  — Each row: platform icon + rendered variant image + caption preview + engagement stats
  — Click → post detail (full caption, all metrics, link to platform)
```

**8b — Campaign view (source → all platforms)**
```
  — Query: social_posts GROUP BY source_asset_id
  — Each row: source thumbnail + platform badges + aggregate engagement
  — Expand: per-platform variant + individual metrics
  — Compare: "Instagram got 340 likes, Pinterest got 12 saves, TikTok got 2.1k views"
```

**8c — Channel view (platform → posts)**
```
  — Tab bar: All | Instagram | TikTok | Facebook | Pinterest | LinkedIn | X | YouTube | GBP
  — Filtered feed per platform
  — Platform-specific metrics (IG: likes/comments/saves, TikTok: views/shares, etc.)
  — Platform health strip at top: follower count, engagement rate, posting frequency
```

### Default: Campaign view (#8b) — most "brand-first"

### Engagement stream (right sidebar or bottom panel):
- Live feed of interactions across all platforms
- "Sarah commented on Instagram: 'What stone is that?'" (3h ago)
- "Your TikTok hit 10k views" (5h ago)
- "New ⭐⭐⭐⭐⭐ review on Google" (8h ago)

### Schema for engagement aggregation:
```sql
-- Already exists: social_post_analytics
-- May need: unified_engagement_feed table or view
CREATE VIEW unified_engagement AS
  SELECT 'like' AS type, platform, count, recorded_at FROM social_post_analytics WHERE ...
  UNION ALL
  SELECT 'comment' AS type, ...
  UNION ALL
  ...
```

---

## Phase 9 — Platform-Specific Features

### Enhancements:
- #34 Stat overlay (Authority+)
- #36 Location tag (All)
- #38 Pinterest tall pins (All)
- #40 GBP post types (All)

### Implementation:

```
src/lib/render/
  stat-overlay.ts   — Pull stats from project metadata
                      ("Built in 3 weeks", "$45k kitchen", "12 five-star reviews")
                      Render as styled text block on image
                      
  location.ts       — Auto-tag posts with business location
                      Read from sites.location or asset GPS EXIF
                      Platform API: include location_id in publish payload
                      
  pinterest.ts      — Tall pin (2:3) with headline text overlay
                      Text from caption headline or article title
                      Optimized for Pinterest visual search
                      
  gbp-posts.ts      — Format for GBP post types
                      Offer: includes coupon/discount fields
                      Update: standard photo + description
                      Event: includes date range + CTA
                      Product: includes price + category
```

---

## Phase 10 — Publishing Integration

### Changes to existing publishing pipeline:

```
src/lib/pipeline/social-publisher.ts (or equivalent)
  
  BEFORE:
    publishPost(platform, {
      media_url: asset.storage_url,  // source photo
      caption: generatedCaption,
    })
    
  AFTER:
    const variant = asset.variants?.[platformKey];
    publishPost(platform, {
      media_url: variant?.url || asset.storage_url,  // rendered variant
      caption: generatedCaption,
      carousel_urls: carousel?.slide_urls,  // if carousel composition exists
      location_id: resolvedLocationId,
      post_type: gbpPostType,  // for GBP
    })
```

### social_posts row stores:
- `media_urls`: array of variant URLs (what was actually sent)
- `render_config_used`: JSONB snapshot of the render plan (for performance tracking)

---

## Build Sequence (recommended order)

| Order | Phase | Effort | Unlocks |
|-------|-------|--------|---------|
| 1 | Phase 1 (schema + infra) | 1 week | Everything else |
| 2 | Phase 2 (crop + grade + overlay) | 1 week | Visually competitive output immediately |
| 3 | Phase 6a (rules engine) | 3 days | Auto-render without manual config |
| 4 | Phase 10 (publish integration) | 2 days | Rendered variants actually go to platforms |
| 5 | Phase 3 (before/after + cleanup) | 3 days | High-engagement composite content |
| 6 | Phase 4 (carousel) | 1 week | Highest-engagement format on Instagram |
| 7 | Phase 7 (manual tools) | 3 days | Enterprise value, edit-modal enhancements |
| 8 | Phase 8 (Unipost) | 2 weeks | Unified dashboard, the marketing centerpiece |
| 9 | Phase 5 (video) | 2 weeks | TikTok/Reels/Shorts output |
| 10 | Phase 9 (platform-specific) | 1 week | Pinterest/GBP optimization |
| 11 | Phase 6b (templates) | 1 week | Template gallery, tenant customization |
| 12 | Phase 6c (learning) | 2 weeks | Performance optimization, the moat |

**Total estimated: ~12 weeks for full pipeline**
**MVP (Phases 1-4 + 6a + 10): ~4 weeks** — delivers auto-rendered, platform-cropped, graded, overlaid, carousel-composing output across all 8 platforms.
