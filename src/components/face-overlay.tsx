"use client";

import { useState, useRef, useEffect } from "react";

interface FaceData {
  box: { x: number; y: number; width: number; height: number };
  score: number;
  personaId: string | null;
  personaName: string | null;
  distance: number | null;
  embedding: number[];
  index: number;
}

interface Persona {
  id: string;
  name: string;
  type: string;
}

interface FaceOverlayProps {
  imageUrl: string;
  faces: FaceData[];
  personas: Persona[];
  assetId: string;
  onFaceNamed: (faceIndex: number, personaId: string, personaName: string) => void;
}

export function FaceOverlay({ imageUrl, faces, personas, assetId, onFaceNamed }: FaceOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });
  const [activeFace, setActiveFace] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("person");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  function updateSize() {
    if (imgRef.current && imgRef.current.naturalWidth > 0) {
      setImgSize({
        width: imgRef.current.clientWidth,
        height: imgRef.current.clientHeight,
        naturalWidth: imgRef.current.naturalWidth,
        naturalHeight: imgRef.current.naturalHeight,
      });
    }
  }

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    if (img.complete && img.naturalWidth > 0) {
      updateSize();
    }
    img.addEventListener("load", updateSize);
    window.addEventListener("resize", updateSize);

    // Fallback: poll until dimensions are available
    const poll = setInterval(() => {
      if (img.naturalWidth > 0 && imgSize.naturalWidth === 0) {
        updateSize();
        clearInterval(poll);
      }
    }, 100);

    return () => {
      img.removeEventListener("load", updateSize);
      window.removeEventListener("resize", updateSize);
      clearInterval(poll);
    };
  }, []);

  // Scale face boxes to displayed image coordinates.
  // Boxes are stored relative to the detection image (800px wide).
  // We scale from natural image dimensions to displayed dimensions.
  // Since detection downscales proportionally, natural coords work if
  // face coordinates are stored relative to the original image.
  // For pipeline-detected faces (800px width), we scale from natural image.
  function scaleBox(box: FaceData["box"]) {
    if (!imgSize.width || !imgSize.naturalWidth) return { left: 0, top: 0, width: 0, height: 0 };
    // Detection runs on an 800px-wide resize. Scale box coords from
    // the 800px detection space to the original natural image, then to display.
    const detectionWidth = Math.min(800, imgSize.naturalWidth);
    const detectionScale = imgSize.naturalWidth / detectionWidth;
    const displayScaleX = imgSize.width / imgSize.naturalWidth;
    const displayScaleY = imgSize.height / imgSize.naturalHeight;
    return {
      left: box.x * detectionScale * displayScaleX,
      top: box.y * detectionScale * displayScaleY,
      width: box.width * detectionScale * displayScaleX,
      height: box.height * detectionScale * displayScaleY,
    };
  }

  async function assignToPersona(faceIndex: number, personaId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/assets/${assetId}/faces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faceIndex, personaId }),
      });
      if (res.ok) {
        const persona = personas.find((p) => p.id === personaId);
        onFaceNamed(faceIndex, personaId, persona?.name || "");
        setActiveFace(null);
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function createAndAssign(faceIndex: number) {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/assets/${assetId}/faces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faceIndex, newPersonaName: newName.trim(), personaType: newType }),
      });
      if (res.ok) {
        const data = await res.json();
        onFaceNamed(faceIndex, data.personaId, newName.trim());
        setActiveFace(null);
        setNewName("");
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  const filteredPersonas = searchQuery
    ? personas.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : personas;

  if (!faces || faces.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        className="h-full w-full object-contain"
        style={{ maxHeight: "45vh" }}
      />

      {/* Face bounding boxes */}
      {faces.map((face, i) => {
        const box = scaleBox(face.box);
        const isMatched = !!face.personaId;
        const isActive = activeFace === i;

        return (
          <div key={i}>
            {/* Bounding box */}
            <button
              onClick={() => setActiveFace(isActive ? null : i)}
              className={`absolute border-2 transition-colors ${
                isMatched
                  ? "border-success hover:border-success/80"
                  : "border-warning hover:border-warning/80"
              }`}
              style={{
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
              }}
              title={face.personaName || "Unknown — click to name"}
            >
              {/* Label */}
              <span className={`absolute -bottom-5 left-0 whitespace-nowrap rounded px-1 py-0.5 text-[9px] font-medium ${
                isMatched ? "bg-success text-white" : "bg-warning text-white"
              }`}>
                {face.personaName || "?"}
              </span>
            </button>

            {/* Name popup */}
            {isActive && (
              <div
                className="absolute z-20 w-56 rounded border border-border bg-surface p-3 shadow-lg"
                style={{
                  left: Math.min(box.left, imgSize.width - 230),
                  top: box.top + box.height + 8,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {isMatched ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-success">{face.personaName}</p>
                    <p className="text-[10px] text-dim">Match confidence: {((1 - (face.distance || 0)) * 100).toFixed(0)}%</p>
                    <button
                      onClick={() => setActiveFace(null)}
                      className="mt-2 text-[10px] text-muted hover:text-foreground"
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="mb-2 text-xs font-medium text-warning">Unknown face</p>

                    {/* Assign to existing persona */}
                    {personas.length > 0 && (
                      <div className="mb-3">
                        <input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search existing..."
                          className="mb-1 w-full text-[11px]"
                        />
                        <div className="max-h-24 overflow-y-auto">
                          {filteredPersonas.slice(0, 5).map((p) => (
                            <button
                              key={p.id}
                              onClick={() => assignToPersona(i, p.id)}
                              disabled={saving}
                              className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] text-muted hover:bg-surface-hover hover:text-foreground"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                              {p.name}
                              <span className="text-[9px] text-dim">{p.type}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Create new persona */}
                    <div className="border-t border-border pt-2">
                      <p className="mb-1 text-[10px] text-dim">Or create new:</p>
                      <div className="flex gap-1">
                        <input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && createAndAssign(i)}
                          placeholder="Name"
                          className="flex-1 text-[11px]"
                          autoFocus
                        />
                        <select
                          value={newType}
                          onChange={(e) => setNewType(e.target.value)}
                          className="text-[11px]"
                        >
                          <option value="person">Person</option>
                          <option value="group">Group</option>
                          <option value="role">Role</option>
                          <option value="pet">Pet</option>
                        </select>
                      </div>
                      <button
                        onClick={() => createAndAssign(i)}
                        disabled={saving || !newName.trim()}
                        className="mt-1 w-full bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        {saving ? "..." : "Create & Assign"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Face count badge */}
      <div className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        {faces.filter((f) => f.personaId).length}/{faces.length} identified
      </div>
    </div>
  );
}
