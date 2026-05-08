import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Asset Studio — Documents tab. Coaching content + capture playbook +
 * how-to docs. v1: catalog only; full content lives behind the listed
 * sections as they ship.
 *
 * Per project_tracpost_capture_playbook.md (#77), the capture playbook
 * is the centerpiece — industry-specific shot lists that tell subscribers
 * exactly which moments to capture. This is the natural home for it.
 */

interface DocSection {
  id: string;
  title: string;
  blurb: string;
  status: "available" | "soon";
}

const SECTIONS: DocSection[] = [
  {
    id: "capture-playbook",
    title: "Capture Playbook",
    blurb: "Industry-specific shot lists. The exact moments worth capturing in your line of work — when each shot tends to happen and what makes it stop thumbs.",
    status: "soon",
  },
  {
    id: "briefing-tutorial",
    title: "Briefing Tutorial",
    blurb: "How to write a substantive caption — what to name, what to skip, why the system needs more than 'kitchen looking great'.",
    status: "soon",
  },
  {
    id: "mobile-capture-basics",
    title: "Mobile Capture Basics",
    blurb: "Lighting, framing, audio fundamentals for shooting on a phone. The practical skills that turn an okay shot into a great one.",
    status: "soon",
  },
  {
    id: "format-guide",
    title: "Format Guide",
    blurb: "When to use Reel vs. carousel vs. still. Why the platform defaults to video-first and Reel-format. How algorithms reward each format.",
    status: "soon",
  },
  {
    id: "audio-strategy",
    title: "Why Audio Matters",
    blurb: "Audio is now first-class. Voice testimonials, voice-overs, and your own cloned voice. The leverage you get from audio assets.",
    status: "soon",
  },
  {
    id: "tool-tutorials",
    title: "Tool Tutorials",
    blurb: "How each Tools-tab tool works. When to use each one. What kind of result to expect.",
    status: "soon",
  },
];

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div>
        <h1 className="mb-1 text-lg font-semibold">Documents</h1>
        <p className="text-sm text-muted">
          Coaching content, capture playbooks, and how-to guides. The skills behind the system —
          shot lists for your industry, briefing techniques, and tool tutorials.
        </p>
      </div>

      <div className="space-y-3">
        {SECTIONS.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-sm font-semibold">{s.title}</h3>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0 ${
                s.status === "available"
                  ? "bg-success/15 text-success"
                  : "bg-muted/30 text-muted"
              }`}>
                {s.status === "available" ? "available" : "coming soon"}
              </span>
            </div>
            <p className="text-[12px] text-muted leading-snug">{s.blurb}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border p-4 text-[11px] text-muted leading-snug">
        Documents grow as the platform matures. The capture playbook lands first — your industry shot list and
        the moments worth your time. Other sections will fill in as we publish them.
      </div>
    </div>
  );
}
