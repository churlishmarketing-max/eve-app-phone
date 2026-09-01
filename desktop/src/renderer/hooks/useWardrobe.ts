// useWardrobe — owning stream: S2.
//
// The desktop only DISPLAYS `GET /wardrobe.wearing` (handoff §5, wardrobe law:
// the closet is hers). She rotates herself server-side at 07:14 / 18:22 / 22:43,
// so the rail polls for the change rather than being told about it, and
// cross-fades 600ms with a one-line caption when `wearing` moves.
//
// Look URLs are absolute Supabase CDN links on current brains; older brains
// served them brain-relative, and the EVE_MOCK fixtures serve url:"" — all
// three are handled, and an empty URL honestly means "no portrait", which is
// what drives the rail's core fallback.

import { useCallback, useEffect, useRef, useState } from "react";
import type { WardrobeView } from "../deck/types";

const POLL_MS = 60_000;
const FADE_MS = 600;
const CAPTION_MS = 3000;

export interface WardrobeApi extends WardrobeView {
  refresh: () => Promise<void>;
}

export function useWardrobe(): WardrobeApi {
  const [name, setName] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [prevUrl, setPrevUrl] = useState<string | null>(null);
  const [changedCaption, setChangedCaption] = useState<string | null>(null);

  const seen = useRef<string | null>(null);
  const first = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const refresh = useCallback(async () => {
    let w;
    try {
      w = await window.eve.wardrobe.get();
    } catch {
      return;
    }
    const wearing = w?.wearing ?? null;
    const look = wearing ? (w.looks ?? []).find((l) => l.file === wearing) ?? null : null;
    const nextName = look?.name ?? (wearing ? wearing.replace(/\.[a-z0-9]+$/i, "").toUpperCase() : null);
    const nextUrl = look?.url ? look.url : null;

    if (seen.current === wearing) {
      // Same look — keep the URL fresh (signed CDN links can rotate) but never
      // re-fire the cross-fade.
      setUrl(nextUrl);
      setName(nextName);
      return;
    }

    const wasFirst = first.current;
    const oldUrl = url;
    seen.current = wearing;
    first.current = false;
    setName(nextName);
    setUrl(nextUrl);

    if (wasFirst) return; // the boot read is not "she changed"

    setPrevUrl(oldUrl);
    setChangedCaption(nextName ? `SHE CHANGED — ${nextName}` : null);
    timers.current.push(setTimeout(() => setPrevUrl(null), FADE_MS));
    timers.current.push(setTimeout(() => setChangedCaption(null), CAPTION_MS));
  }, [url]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    void refreshRef.current();
    const t = setInterval(() => void refreshRef.current(), POLL_MS);
    const pending = timers.current;
    return () => {
      clearInterval(t);
      pending.forEach(clearTimeout);
    };
  }, []);

  return { name, url, prevUrl, changedCaption, refresh };
}
