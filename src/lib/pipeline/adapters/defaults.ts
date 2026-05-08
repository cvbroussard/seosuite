/**
 * Centralized publisher defaults — explicit parameters sent to each platform's API.
 *
 * Per project_tracpost_upload_ai_detection.md guideline #1 ("Always specify all
 * parameters explicitly. Defaults can shift. Specify... Never trust an absence
 * to mean what we want."), every parameter we care about should be enumerated
 * here rather than left to platform default.
 *
 * Pairs with #159 (publisher defaults audit) and #160 (AI disclosure pipeline).
 *
 * Adding a new parameter: enumerate it here with the chosen value AND a comment
 * explaining the rationale. If you're tempted to leave it absent, ask: would
 * a platform-default change break our subscribers? If yes, set explicitly.
 */

/**
 * Encoding specs we target per platform-native template.
 * Matches the source-template-variants architecture (see #162).
 */
export const ENCODING_SPECS = {
  reel_9x16: {
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    video_codec: "h264",
    audio_codec: "aac",
    audio_bitrate_kbps: 128,
    max_duration_sec: 60,
  },
  feed_square: {
    aspect: "1:1",
    width: 1080,
    height: 1080,
    fps: 30,
    video_codec: "h264",
    audio_codec: "aac",
    audio_bitrate_kbps: 128,
    max_duration_sec: 60,
  },
  feed_portrait: {
    aspect: "4:5",
    width: 1080,
    height: 1350,
    fps: 30,
    video_codec: "h264",
    audio_codec: "aac",
    audio_bitrate_kbps: 128,
    max_duration_sec: 60,
  },
  story_9x16: {
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    video_codec: "h264",
    audio_codec: "aac",
    audio_bitrate_kbps: 128,
    max_duration_sec: 15,
  },
  pin_2x3: {
    aspect: "2:3",
    width: 1000,
    height: 1500,
    fps: null,
    video_codec: null,
    audio_codec: null,
    audio_bitrate_kbps: null,
    max_duration_sec: null,
  },
  long_16x9: {
    aspect: "16:9",
    width: 1920,
    height: 1080,
    fps: 30,
    video_codec: "h264",
    audio_codec: "aac",
    audio_bitrate_kbps: 192,
    max_duration_sec: 480, // 8 min
  },
} as const;

/**
 * Instagram (Meta Graph API) publisher defaults.
 *
 * What gets explicitly set vs. left to platform default:
 * - share_to_feed: TRUE for Reels — cross-post to the Feed surface; matches
 *   subscriber expectation that publishing a Reel makes it visible in Feed.
 *   Set explicitly to avoid platform default drift.
 * - thumb_offset / cover_url: not currently set. Subscriber doesn't pick a
 *   custom thumbnail today; Meta picks the first frame. Acceptable default
 *   as long as the variant render places a strong opening frame (which the
 *   Reel-first render policy ensures via the source asset's hero shot).
 * - tagged_users / place_id: not currently set. No tagging in v1; reach
 *   targeting handled at boost layer for paid (Quick Boost), not organic.
 * - music_audio_name: not currently set. We bake music into the source
 *   asset rather than overlaying via Meta's library. Worth revisiting per
 *   #161/discussion — Meta's library overlay avoids re-encoding artifacts
 *   on the audio track.
 */
export const INSTAGRAM_DEFAULTS = {
  REELS: {
    share_to_feed: true,         // explicit; default behavior matches but pin it
    media_type: "REELS",
  },
  IMAGE: {
    // No special defaults; image_url + caption + access_token only
  },
  STORY: {
    media_type: "STORIES",
  },
} as const;

/**
 * Facebook (Meta Graph API) publisher defaults.
 *
 * Notes:
 * - published: TRUE for organic publish (vs. published=false for draft posts)
 * - link: appended to caption when present, not as a separate field for Reels
 * - tagged_users / place: not set in v1
 */
export const FACEBOOK_DEFAULTS = {
  published: true,              // organic publish (not draft)
} as const;

/**
 * TikTok publisher defaults.
 *
 * Notes:
 * - disable_duet, disable_stitch, disable_comment: defaults to false (allow all);
 *   subscriber-configurable later
 * - video_cover_timestamp_ms: 0 (use first frame); defer thumbnail picker
 * - privacy_level: PUBLIC_TO_EVERYONE (we publish, not draft)
 * - is_ai_generated: NEW for #160 — set when asset's metadata.ai_generated=true
 */
export const TIKTOK_DEFAULTS = {
  disable_duet: false,
  disable_stitch: false,
  disable_comment: false,
  video_cover_timestamp_ms: 0,
  privacy_level: "PUBLIC_TO_EVERYONE",
} as const;

/**
 * YouTube (Shorts + long) publisher defaults.
 */
export const YOUTUBE_DEFAULTS = {
  privacyStatus: "public",
  selfDeclaredMadeForKids: false,
  // categoryId, defaultLanguage TBD per subscriber
} as const;

/**
 * LinkedIn publisher defaults.
 */
export const LINKEDIN_DEFAULTS = {
  visibility: "PUBLIC",
  lifecycleState: "PUBLISHED",
} as const;

/**
 * Pinterest publisher defaults.
 */
export const PINTEREST_DEFAULTS = {
  // alt_text, board_id, link TBD per pin
} as const;

/**
 * Convenience map for adapters to look up their own defaults.
 */
export const PLATFORM_DEFAULTS = {
  instagram: INSTAGRAM_DEFAULTS,
  facebook: FACEBOOK_DEFAULTS,
  tiktok: TIKTOK_DEFAULTS,
  youtube: YOUTUBE_DEFAULTS,
  linkedin: LINKEDIN_DEFAULTS,
  pinterest: PINTEREST_DEFAULTS,
} as const;
