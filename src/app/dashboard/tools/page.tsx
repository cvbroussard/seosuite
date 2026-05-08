import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Asset Studio Tools — non-contextual entry point for AI tools and
 * specialty templates. Mirrors the in-asset-modal Asset Studio strip,
 * grouped by what kind of output each tool produces.
 *
 * Tools that need a source asset link to the media library; tools that
 * don't (Generate from prompt, Industry templates) can be invoked here
 * directly. Future: add the input panels inline here so subscribers can
 * use any tool without navigating away.
 *
 * Tool groupings (from project_tracpost_ai_generation_is_scaffolding.md
 * + capture-playbook spawned tools):
 * 1. Asset-level AI (Edit, Enhance, Regenerate, Animate, Variation, Generate, Caption)
 * 2. Thumb-stopping specialty (Before/After, Time-Lapse, Reaction Slow-Mo, etc.)
 * 3. Audio tools (Voice-over, Audiogram, Testimonial, Voice Clone, etc.)
 * 4. Industry templates (Demo-to-Finish, Comfort Comparison, etc.)
 *
 * Family 1 is fully wired today via /api/assets/[id]/studio (per-asset).
 * Families 2-4 are scaffolded with "coming soon" placeholders — the
 * groupings exist now so we can iteratively land tools as they ship.
 */

type ToolStatus = "ready" | "from-asset" | "soon";

interface ToolDef {
  id: string;
  label: string;
  description: string;
  status: ToolStatus;
}

interface ToolFamily {
  id: string;
  heading: string;
  blurb: string;
  tools: ToolDef[];
}

const FAMILIES: ToolFamily[] = [
  {
    id: "asset-level",
    heading: "Asset-level AI",
    blurb:
      "Modify, enhance, or build new assets from existing ones. Outputs land in your library as new assets that need briefing — originals are always preserved.",
    tools: [
      {
        id: "edit",
        label: "Edit an asset",
        description: "Make a targeted change with a text instruction. Result is a sibling — original preserved.",
        status: "from-asset",
      },
      {
        id: "enhance",
        label: "Enhance",
        description: "Polish exposure / color / clarity. Disciplined post-production, no creative editing.",
        status: "from-asset",
      },
      {
        id: "regenerate",
        label: "Regenerate",
        description: "Heavy-handed cleanup for low-quality photos.",
        status: "from-asset",
      },
      {
        id: "animate",
        label: "Animate as video",
        description: "Generate a 5–10s motion clip from a still via Kling.",
        status: "from-asset",
      },
      {
        id: "generate-variation",
        label: "Generate variation",
        description: "Make a new editorial-quality image inspired by an existing one.",
        status: "from-asset",
      },
      {
        id: "generate-from-prompt",
        label: "Generate from prompt",
        description: "Make a new asset from a text description. No source asset required.",
        status: "soon",
      },
      {
        id: "draft-caption",
        label: "Draft caption",
        description: "AI-suggest a caption for review before saving.",
        status: "soon",
      },
    ],
  },
  {
    id: "thumb-stopping",
    heading: "Thumb-stopping specialty",
    blurb:
      "Templates that convert captured moments into algorithm-preference formats. Authenticity of subject preserved; thumb-stopping tactics applied at render.",
    tools: [
      {
        id: "before-after-reel",
        label: "Before/After Reel",
        description: "First + last project asset → snap-cut Reel with transition. The transformation reveal.",
        status: "soon",
      },
      {
        id: "time-lapse",
        label: "Time-Lapse Compiler",
        description: "Sequential photos → time-lapse Reel. Speed + change visible per second.",
        status: "soon",
      },
      {
        id: "reaction-slow-mo",
        label: "Reaction Slow-Mo",
        description: "Auto-extract peak expression from a video and slow it down. Faces + emotion.",
        status: "soon",
      },
      {
        id: "hook-overlay",
        label: "Hook Overlay",
        description: "Add 'Wait for it…' / 'Nobody's talking about…' style text overlay at start.",
        status: "soon",
      },
      {
        id: "caption-pop",
        label: "Caption Pop",
        description: "Word-by-word subtitle animation for sound-off scrolling.",
        status: "soon",
      },
      {
        id: "pattern-interrupt",
        label: "Pattern Interrupt",
        description: "Sudden zoom or freeze-frame at the 1.5s mark — algorithm-rewarded micro-moment.",
        status: "soon",
      },
      {
        id: "ken-burns",
        label: "Ken Burns",
        description: "Slow zoom-and-pan on stills. Motion from a single frame.",
        status: "soon",
      },
      {
        id: "split-screen",
        label: "Split-Screen Compare",
        description: "Two clips or stills side-by-side for inherent comparison content.",
        status: "soon",
      },
      {
        id: "step-counter",
        label: "Step Counter",
        description: "Multi-shot process with annotations. Educational + anticipation.",
        status: "soon",
      },
    ],
  },
  {
    id: "audio",
    heading: "Audio tools",
    blurb:
      "Audio is now first-class. Voice-overs, testimonials, audiograms, and cloned-voice narration. Voice Clone Setup is the keystone — once your voice is cloned, every other tool can produce content in your voice.",
    tools: [
      {
        id: "voice-over",
        label: "Voice-over Recorder",
        description: "Record narration over a still or video; produces media with synced audio.",
        status: "soon",
      },
      {
        id: "audiogram",
        label: "Audiogram Generator",
        description: "Audio + image + transcript → waveform-animated video for podcast snippets.",
        status: "soon",
      },
      {
        id: "testimonial-card",
        label: "Testimonial Card",
        description: "Customer audio testimonial + image → visual quote card with playback.",
        status: "soon",
      },
      {
        id: "podcast-snippet",
        label: "Podcast Snippet",
        description: "Long-form audio + transcript → social-ready 30–60s clip with captions.",
        status: "soon",
      },
      {
        id: "voice-clone-setup",
        label: "Voice Clone Setup",
        description: "Record a few phrases; system clones your voice for future TTS narration.",
        status: "soon",
      },
      {
        id: "cloned-voice-reader",
        label: "Cloned Voice Reader",
        description: "Generated text + your cloned voice → narration for any visual.",
        status: "soon",
      },
      {
        id: "sound-bite",
        label: "Sound Bite Extractor",
        description: "Long audio → highlight clip (5–15s) for social.",
        status: "soon",
      },
    ],
  },
  {
    id: "industry-templates",
    heading: "Industry-specific templates",
    blurb:
      "Pre-configured combinations of specialty tools tuned for your industry. One click applies the right tactics for the work you do.",
    tools: [
      {
        id: "demo-to-finish",
        label: "Demo-to-Finish Reveal",
        description: "Kitchen / bath remodel: chaos shots → finished space pan.",
        status: "soon",
      },
      {
        id: "comfort-comparison",
        label: "Comfort Comparison",
        description: "HVAC: heat-wave outside footage → cool-home interior contrast.",
        status: "soon",
      },
      {
        id: "plate-close-up",
        label: "Plate Close-Up Animator",
        description: "Restaurant: food shot with food-specific lighting + slow zoom.",
        status: "soon",
      },
      {
        id: "aerial-sweep",
        label: "Aerial Sweep Generator",
        description: "Roofing: drone shot → cinematic sweep with finish reveal.",
        status: "soon",
      },
      {
        id: "mirror-finish",
        label: "Mirror Finish Slow-Mo",
        description: "Auto detailing: dirty arrival → polished reveal slow-mo.",
        status: "soon",
      },
      {
        id: "day-1-vs-day-n",
        label: "Day-1 vs Day-N Split",
        description: "Dog training, fitness, anything transformational: paired comparison.",
        status: "soon",
      },
    ],
  },
];

export default async function ToolsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="p-4 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="mb-1 text-lg font-semibold">Tools</h1>
        <p className="text-sm text-muted">
          AI tools and specialty templates for creating, enhancing, and arming your assets for high-impact duty.
          Outputs land in your library as new assets that need briefing.
        </p>
      </div>

      {/* Families */}
      <div className="space-y-8">
        {FAMILIES.map((family) => (
          <section key={family.id}>
            <div className="mb-3">
              <h2 className="text-sm font-semibold">{family.heading}</h2>
              <p className="text-[11px] text-muted leading-snug mt-0.5 max-w-3xl">{family.blurb}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {family.tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Footer note */}
      <div className="rounded-lg border border-dashed border-border p-4 text-[11px] text-muted leading-snug">
        <strong className="text-foreground font-medium">Most tools work from a specific asset.</strong>{" "}
        Open any asset in your <a href="/dashboard/media" className="underline hover:text-foreground">media library</a>,
        scroll to the bottom of the asset modal, and pick a tool from the AI Studio strip. New tool families ship
        regularly — this page is the catalog as it grows.
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolDef }) {
  const statusBadge: Record<ToolStatus, { bg: string; label: string }> = {
    ready: { bg: "bg-success/15 text-success", label: "ready" },
    "from-asset": { bg: "bg-accent/15 text-accent", label: "open from an asset" },
    soon: { bg: "bg-muted/30 text-muted", label: "coming soon" },
  };
  const s = statusBadge[tool.status];
  const muted = tool.status === "soon";

  return (
    <div className={`rounded-lg border border-border bg-surface p-3 ${muted ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-xs font-medium">{tool.label}</div>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0 ${s.bg}`}>
          {s.label}
        </span>
      </div>
      <p className="text-[10px] text-muted leading-snug">{tool.description}</p>
    </div>
  );
}
