"use client";

export interface PillarTag {
  id: string;
  label: string;
}

export interface PillarGroup {
  id: string;
  label: string;
  description: string;
  tags: PillarTag[];
}

interface TagPickerProps {
  pillarConfig: PillarGroup[];
  selectedPillar: string;
  selectedTags: string[];
  onPillarChange: (pillarId: string) => void;
  onTagsChange: (tags: string[]) => void;
}

/**
 * Two-tier content tag picker.
 * Pillars shown as top-level groups, tags as selectable chips within.
 * Selecting a tag auto-selects its parent pillar.
 */
export function TagPicker({
  pillarConfig,
  selectedPillar,
  selectedTags,
  onPillarChange,
  onTagsChange,
}: TagPickerProps) {
  function toggleTag(pillarId: string, tagId: string) {
    const isSelected = selectedTags.includes(tagId);

    if (isSelected) {
      // Remove tag
      const newTags = selectedTags.filter((t) => t !== tagId);
      onTagsChange(newTags);

      // If no tags left in this pillar, clear pillar
      const pillar = pillarConfig.find((p) => p.id === pillarId);
      const remainingInPillar = newTags.filter((t) =>
        pillar?.tags.some((pt) => pt.id === t)
      );
      if (remainingInPillar.length === 0 && selectedPillar === pillarId) {
        onPillarChange("");
      }
    } else {
      // Add tag
      onTagsChange([...selectedTags, tagId]);
      // Auto-select parent pillar if not already set
      if (selectedPillar !== pillarId) {
        onPillarChange(pillarId);
      }
    }
  }

  function selectPillarOnly(pillarId: string) {
    if (selectedPillar === pillarId) {
      onPillarChange("");
    } else {
      onPillarChange(pillarId);
    }
  }

  if (pillarConfig.length === 0) return null;

  return (
    <div className="space-y-3">
      {pillarConfig.map((pillar) => {
        const isActivePillar = selectedPillar === pillar.id;
        const hasSelectedTags = pillar.tags.some((t) => selectedTags.includes(t.id));

        return (
          <div key={pillar.id}>
            {/* Pillar header */}
            <button
              onClick={() => selectPillarOnly(pillar.id)}
              className={`mb-1.5 flex items-center gap-2 text-xs font-medium transition-colors ${
                isActivePillar || hasSelectedTags
                  ? "text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <span style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: isActivePillar || hasSelectedTags ? "var(--color-accent)" : "var(--color-border)",
              }} />
              {pillar.label}
            </button>

            {/* Tags */}
            <div className="ml-3.5 flex flex-wrap gap-1.5">
              {pillar.tags.map((tag) => {
                const isTagSelected = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(pillar.id, tag.id)}
                    className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                      isTagSelected
                        ? "bg-accent/20 text-accent"
                        : "bg-surface-hover text-muted hover:text-foreground"
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
