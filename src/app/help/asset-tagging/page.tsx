import { SCENE_TYPES } from "@/lib/scene-types";

export const metadata = {
  title: "How asset tagging works — TracPost",
  description: "Story Angle and Scene Composition: how tagging an asset shapes what gets published.",
};

export default function AssetTaggingHelpPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-2 text-3xl font-semibold">How asset tagging works</h1>
      <p className="mb-8 text-muted">
        Two checkbox columns on every asset: Story Angle and Scene Composition.
        They do different jobs. AI suggests defaults; you own the final answer.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Story Angle — what the asset says</h2>
        <p className="mb-3">
          Story Angle is about <strong>intent</strong>. It tells the system which
          angle of your business this image is meant to support. That choice
          shapes how AI writes the caption when this asset goes out.
        </p>
        <p className="mb-3">
          The same kitchen detail shot could legitimately support multiple
          angles — one image can showcase your <em>design taste</em>, your
          <em> craftsmanship</em>, and your <em>process</em> all at once. Check
          every angle that genuinely applies. Don&apos;t over-check; only pick
          angles you&apos;d actually want this image associated with.
        </p>
        <p className="mb-3 text-sm text-muted">
          Your five Story Angles come from your business&apos;s pillar setup.
          AI pre-checks the one it thinks fits best — feel free to swap or add
          more.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Scene Composition — what the asset shows</h2>
        <p className="mb-3">
          Scene Composition is about what&apos;s literally in the frame. It
          helps the system pick the right slot for this image — for example,
          a wide shot belongs in the hero position, a close-up belongs in the
          detail carousel, an in-progress shot belongs in a story sequence.
        </p>
        <p className="mb-3">
          Multiple scene types usually apply. A finished kitchen reveal might
          be both <em>Wide Shot</em> and <em>After</em>. A crew working might
          be both <em>In Progress</em> and <em>People</em>.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SCENE_TYPES.map((s) => (
            <div key={s.id} className="rounded border border-border p-3">
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="mt-1 text-xs text-muted">{s.description}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xl font-semibold">Why this matters</h2>
        <p className="mb-3">
          Every published post starts as an asset in your library. The tags
          you set here drive which assets the autopilot reaches for, which
          captions it writes, and which platform format each asset becomes.
          Better tagging = more accurate, on-voice publishing. AI&apos;s
          defaults are a starting point — your edits are the truth.
        </p>
      </section>
    </main>
  );
}
