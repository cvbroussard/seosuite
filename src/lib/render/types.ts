/**
 * Render pipeline types. Each photo produces N render plans
 * (one per connected platform), each plan produces one variant
 * stored in R2 + indexed in media_assets.variants JSONB.
 */

export type PlatformKey =
  | "instagram"
  | "instagram_story"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "pinterest"
  | "linkedin"
  | "gbp"
  | "blog";

export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9" | "2:3";

export type GradePreset = "warm_bright" | "warm_natural" | "cool_crisp" | "clean_natural" | "auto";

export type OverlayPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "bottom-center";

export interface TextOverlay {
  text: string;
  position: OverlayPosition;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  color?: string;
  backgroundColor?: string;
}

export interface RenderPlan {
  platform: PlatformKey;
  crop: AspectRatio;
  grade: GradePreset;
  textOverlays: TextOverlay[];
  watermark: boolean;
  watermarkPosition?: OverlayPosition;
  carousel?: {
    slideAssetIds: string[];
    slideOverlays: TextOverlay[][];
  };
  videoTransform?: "ken_burns" | "timelapse" | "reformat";
  videoSources?: string[];
  videoDurationSec?: number;
}

export interface VariantRecord {
  url: string;
  rendered_at: string;
  plan: RenderPlan;
  size_bytes?: number;
}

export type VariantsMap = Partial<Record<PlatformKey, VariantRecord>>;

export interface RenderConfig {
  watermark_enabled?: boolean;
  watermark_position?: OverlayPosition;
  grade_warmth?: GradePreset;
  cta_defaults?: Partial<Record<PlatformKey, string>>;
}

export interface BrandAssets {
  logo_url?: string;
  logo_light_url?: string;
  brand_font_url?: string;
  color_palette?: {
    primary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
}

export const PLATFORM_ASPECTS: Record<PlatformKey, AspectRatio> = {
  instagram: "4:5",
  instagram_story: "9:16",
  tiktok: "9:16",
  facebook: "1:1",
  youtube: "16:9",
  pinterest: "2:3",
  linkedin: "1:1",
  gbp: "16:9",
  blog: "16:9",
};

export const ASPECT_DIMENSIONS: Record<AspectRatio, { w: number; h: number }> = {
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
  "2:3": { w: 1000, h: 1500 },
};
