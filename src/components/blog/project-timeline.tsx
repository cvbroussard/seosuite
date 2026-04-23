"use client";

import { useState } from "react";
import Image from "next/image";

interface Asset {
  id: string;
  storage_url: string;
  context_note: string | null;
  display_caption: string | null;
  alt_text: string | null;
  date_taken: string | null;
  media_type: string;
}

interface MonthSection {
  month: string;
  id: string;
  captioned: Asset[];
  uncaptioned: Asset[];
}

const INITIAL_MONTHS = 1;
const GALLERY_PREVIEW = 4;

export function ProjectTimeline({ sections }: { sections: MonthSection[] }) {
  const [showAll, setShowAll] = useState(false);
  const [expandedGalleries, setExpandedGalleries] = useState<Set<string>>(new Set());

  const visibleSections = showAll ? sections : sections.slice(0, INITIAL_MONTHS);
  const hiddenCount = sections.length - INITIAL_MONTHS;
  const hiddenImageCount = sections.slice(INITIAL_MONTHS).reduce(
    (sum, s) => sum + s.captioned.length + s.uncaptioned.length, 0
  );

  function toggleGallery(month: string) {
    setExpandedGalleries(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month); else next.add(month);
      return next;
    });
  }

  return (
    <>
      {visibleSections.map((section) => {
        const galleryExpanded = expandedGalleries.has(section.month);
        const visibleUncaptioned = galleryExpanded
          ? section.uncaptioned
          : section.uncaptioned.slice(0, GALLERY_PREVIEW);
        const hiddenGalleryCount = section.uncaptioned.length - GALLERY_PREVIEW;

        return (
          <section key={section.month} id={section.id} className="pj-month">
            <h2 className="pj-month-title">{section.month}</h2>

            {section.captioned.map((asset) => {
              const isVideo = asset.media_type === "video";
              const displayCaption = asset.display_caption || asset.context_note || "";
              const altText = asset.alt_text || displayCaption;
              const dateTaken = asset.date_taken
                ? new Date(asset.date_taken).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : null;

              return (
                <div key={asset.id} className="pj-featured">
                  <div className="pj-featured-media">
                    {isVideo ? (
                      <video src={asset.storage_url} controls preload="metadata" />
                    ) : (
                      <Image src={asset.storage_url} alt={altText} width={640} height={480} sizes="(max-width: 768px) 100vw, 50vw" quality={75} />
                    )}
                  </div>
                  <div className="pj-featured-text">
                    <p className="pj-featured-caption">{displayCaption}</p>
                    {dateTaken && <span className="pj-featured-date">{dateTaken}</span>}
                  </div>
                </div>
              );
            })}

            {section.uncaptioned.length > 0 && (
              <>
                <div className="pj-gallery">
                  {visibleUncaptioned.map((asset) => (
                    <div key={asset.id} className="pj-gallery-item">
                      {asset.media_type === "video" ? (
                        <video src={asset.storage_url} controls preload="metadata" />
                      ) : (
                        <Image src={asset.storage_url} alt="" width={400} height={400} sizes="(max-width: 640px) 50vw, 33vw" quality={75} />
                      )}
                    </div>
                  ))}

                  {!galleryExpanded && hiddenGalleryCount > 0 && (
                    <button
                      onClick={() => toggleGallery(section.month)}
                      className="pj-gallery-more"
                    >
                      +{hiddenGalleryCount} more
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        );
      })}

      {!showAll && hiddenCount > 0 && (
        <button onClick={() => setShowAll(true)} className="pj-load-more">
          View full timeline — {hiddenCount} more month{hiddenCount !== 1 ? "s" : ""}, {hiddenImageCount} photos
        </button>
      )}
    </>
  );
}
