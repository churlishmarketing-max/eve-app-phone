// owner: stream S3 — her closet (handoff §5 wardrobe law).
//
// Mounted by deck/App.tsx as a sibling of <Deck/>:
//   <WardrobePanel open={closetOpen} onClose={closeCloset} busy={chat.busy}
//                   onPreviewState={setPreview} />
// — always mounted, `open` only toggles visibility, so the two-phase fetch
// pattern below (ported from app/src/EveApp.tsx :287-320) keeps a loaded
// closet across opens/closes instead of re-proving itself every time.
import { useCallback, useEffect, useRef, useState } from "react";
import type { WardrobeLook } from "@shared/contract";
import "./wardrobe.css";

export type PreviewMode = "idle" | "listening" | "thinking" | "speaking" | "alert";

export interface WardrobePanelProps {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onPreviewState: (mode: PreviewMode | null) => void;
}

const PREVIEW_STATES: PreviewMode[] = ["idle", "listening", "thinking", "speaking", "alert"];
const PLATE_MODE_KEY = "eve.plateMode";
const PREVIEW_REVERT_MS = 3600;
const REFUSE_NOTE_MS = 2000;

// "Look URLs are absolute Supabase CDN links; older brains served them
// brain-relative, so handle both" (S1's placeholder note, carried forward).
function resolveLookUrl(url: string, brainUrl: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (!brainUrl) return url;
  return `${brainUrl.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

export default function WardrobePanel({ open, onClose, busy, onPreviewState }: WardrobePanelProps) {
  const [looks, setLooks] = useState<WardrobeLook[]>([]);
  const [wearing, setWearing] = useState<string | null>(null);
  const [optimisticWearing, setOptimisticWearing] = useState<string | null>(null);
  const [brainUrl, setBrainUrl] = useState<string | null>(null);
  const [plateMode, setPlateMode] = useState<"core" | "portrait" | null>(() => {
    try {
      return (localStorage.getItem(PLATE_MODE_KEY) as "core" | "portrait" | null) ?? null;
    } catch {
      return null;
    }
  });
  const [refuseNote, setRefuseNote] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refuseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const w = await window.eve.wardrobe.get();
      // Two-phase law: a failed or empty refresh must never blank an
      // already-loaded closet.
      if (w.looks.length) {
        setLooks(w.looks);
        setWearing(w.wearing ?? null);
      }
    } catch {
      /* keep whatever closet is already on screen */
    }
  }, []);

  // Prefetch on mount, and again every time the panel is reopened.
  useEffect(() => {
    let cancelled = false;
    void refetch();
    void window.eve.config
      .get()
      .then((c) => {
        if (!cancelled) setBrainUrl(c.brainUrl ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, refetch]);

  useEffect(
    () => () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (refuseTimerRef.current) clearTimeout(refuseTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pickPlateMode = (m: "core" | "portrait") => {
    try {
      localStorage.setItem(PLATE_MODE_KEY, m);
    } catch {
      /* storage unavailable — the in-memory pick still drives this session */
    }
    setPlateMode(m);
  };

  const wear = async (file: string) => {
    setOptimisticWearing(file);
    try {
      await window.eve.wardrobe.wear(file);
    } finally {
      await refetch();
      setOptimisticWearing(null);
    }
  };

  const displayWearing = optimisticWearing ?? wearing;
  // Phone precedence (:759): his local toggle wins; auto falls to portrait
  // the moment a worn look exists, else core.
  const showPortrait = plateMode === "portrait" || (plateMode === null && !!displayWearing);

  const previewPill = (mode: PreviewMode) => {
    if (busy) {
      setRefuseNote(true);
      if (refuseTimerRef.current) clearTimeout(refuseTimerRef.current);
      refuseTimerRef.current = setTimeout(() => setRefuseNote(false), REFUSE_NOTE_MS);
      return;
    }
    onPreviewState(mode);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => onPreviewState(null), PREVIEW_REVERT_MS);
  };

  return (
    <>
      <div className="wardrobe-scrim" onClick={onClose} />
      <div className="wardrobe-panel">
        <div className="wardrobe-head">
          <span className="wardrobe-title">HER CLOSET — {looks.length} LOOKS, HERS TO CHOOSE</span>
          <button type="button" className="wardrobe-close" onClick={onClose}>
            [ CLOSE ]
          </button>
        </div>

        <div className="wardrobe-modes">
          <button type="button" className={`chipv6${!showPortrait ? " on" : ""}`} onClick={() => pickPlateMode("core")}>
            CORE
          </button>
          <button type="button" className={`chipv6${showPortrait ? " on" : ""}`} onClick={() => pickPlateMode("portrait")}>
            PORTRAIT
          </button>
        </div>

        {looks.length ? (
          <div className="wardrobe-grid">
            {looks.map((l) => {
              const url = resolveLookUrl(l.url, brainUrl);
              const isWearing = displayWearing === l.file;
              return (
                <button
                  type="button"
                  key={l.file}
                  className={`wardrobe-thumb${isWearing ? " on" : ""}`}
                  onClick={() => void wear(l.file)}
                  aria-pressed={isWearing}
                  aria-label={`Wear ${l.name}`}
                >
                  {url ? (
                    <img src={url} alt={l.name} loading="lazy" />
                  ) : (
                    <span className="wardrobe-thumb-empty" aria-hidden="true">
                      {l.name.slice(0, 1)}
                    </span>
                  )}
                  {isWearing && <span className="wardrobe-wearing-tag">WEARING</span>}
                  <span className="wardrobe-thumb-name">{l.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="shellcopy">Her closet lives on the brain — currently unreachable. It&apos;ll be here the moment she answers.</p>
        )}

        <div className="wardrobe-pills">
          {PREVIEW_STATES.map((st) => (
            <button type="button" key={st} className="chipv6" onClick={() => previewPill(st)}>
              {st.toUpperCase()}
            </button>
          ))}
        </div>
        {refuseNote && <div className="wardrobe-refuse">never fight a live turn</div>}

        <div className="footline wardrobe-footer">ACCENT — TEAL / locked. she chose it herself.</div>
      </div>
    </>
  );
}
