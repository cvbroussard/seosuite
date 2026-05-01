/**
 * Coaching walkthrough types.
 *
 * A walkthrough is a directed graph of nodes. The user starts at `start`
 * and traverses by answering questions or completing instructions until
 * they reach a terminal node (which renders the actual Connect/OAuth
 * action or signals completion).
 *
 * Power user with everything already set up: 2-3 question nodes → terminal
 * Brand-new user: same questions plus 4-8 instruction nodes → terminal
 *
 * All paths converge at the same terminal node — single source of truth
 * for the Connect button.
 */

export type PlatformKey =
  | "meta"
  | "gbp"
  | "linkedin"
  | "youtube"
  | "pinterest"
  | "tiktok"
  | "twitter";

export interface QuestionOption {
  /** Button label shown to user (e.g., "Yes", "No, I need to create one") */
  label: string;
  /** Node id to navigate to on this answer */
  next: string;
  /** Optional fine-print under the button */
  hint?: string;
}

export interface QuestionNode {
  type: "question";
  /** Stable node id used for persistence + deep-linking */
  id: string;
  /** Headline question text */
  question: string;
  /** Optional context paragraph below the question */
  help?: string;
  /** Available answers, each pointing to next node */
  options: QuestionOption[];
}

/**
 * Gallery item — polymorphic step entry rendered inside the coaching
 * lightbox. An "image" step shows an actual screenshot at full size; a
 * "button" step represents a verbal action that has no useful screenshot
 * (e.g., "wait for verification email", "click the Continue dropdown").
 *
 * The gallery is the modern replacement for the single-screenshot model.
 * Existing nodes that still set `screenshot` continue to work — the
 * editor surfaces both fields and prefers `gallery` if present.
 */
export interface GalleryImageItem {
  type: "image";
  /** Public URL (assets.tracpost.com/...) */
  url: string;
  /** Caption shown beneath the image inside the lightbox */
  caption?: string;
  /** Alt-text for accessibility */
  alt?: string;
}

export interface GalleryButtonItem {
  type: "button";
  /** Numbered/labeled chip text inside the lightbox strip */
  label: string;
  /** Caption shown when this step is active */
  caption?: string;
}

export type GalleryItem = GalleryImageItem | GalleryButtonItem;

export interface InstructionNode {
  type: "instruction";
  id: string;
  /** Step heading (e.g., "Create your business page") */
  title: string;
  /** Body paragraph explaining what to do */
  body: string;
  /** Optional URL the instruction points to (e.g., facebook.com/pages/create) */
  deep_link?: string;
  /** CTA label for the deep_link button */
  deep_link_label?: string;
  /** Legacy single-screenshot URL (still honored if gallery is empty). */
  screenshot?: string;
  /** Legacy alt-text for the single screenshot. */
  screenshot_alt?: string;
  /** Multi-step walkthrough gallery — preferred over `screenshot`. */
  gallery?: GalleryItem[];
  /** Bulleted prerequisites or sub-steps shown beneath the body */
  bullets?: string[];
  /** Where to go after the user clicks "I'm done with this step" */
  next: string;
}

export interface TerminalNode {
  type: "terminal";
  id: string;
  /** What the terminal does. `connect` triggers the actual OAuth flow.
   *  `done` simply closes the modal (used for branches that complete with
   *  no further action — e.g., "this platform isn't supported for you"). */
  action: "connect" | "done";
  /** Heading on the terminal screen */
  title: string;
  /** Body explaining what happens when they click the action button */
  body: string;
  /** Override label for the action button (defaults to "Connect") */
  action_label?: string;
}

export type WalkthroughNode = QuestionNode | InstructionNode | TerminalNode;

export interface PlatformWalkthrough {
  platform: PlatformKey;
  /** Display name shown in the modal header (e.g., "Facebook + Instagram") */
  title: string;
  /** Short subtitle / tagline shown under the title */
  subtitle?: string;
  /** Approximate setup time, displayed to user (e.g., "5-10 minutes") */
  estimated_time?: string;
  /** Entry node id */
  start: string;
  /** All nodes keyed by id */
  nodes: Record<string, WalkthroughNode>;
}

/** Persistence shape returned/sent to the coaching API */
export interface CoachingProgressPayload {
  last_node_id: string;
  path_taken: string[];
  reached_terminal: boolean;
  completed_at: string | null;
}
