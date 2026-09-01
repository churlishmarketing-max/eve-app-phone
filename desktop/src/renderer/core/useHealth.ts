// GET /health for THE CORE — owning stream: THE CORE.
//
// Two figures on this screen come from /health and nowhere else:
// `fleet.count` (the brain's REGISTERED unit count) and `memoryReady`. There is
// no push channel for health, so this polls on a slow beat — slower than the
// 30s state poll in main, because neither figure moves minute to minute.
//
// `health` is null until the first answer lands, and null is never papered
// over: the cells that read it print a dash and the fleet header says SOURCE
// DOWN. A missing source is a thing the screen says out loud.
//
// A FAILED POLL IS NOT A MEASUREMENT. When GET /health fails, api.ts resolves
// (never rejects) with { online:false, ok:false, error } — memoryReady and
// fleet ABSENT, not false. Rendering that object as "DOWN" would assert
// absence as a reading, and would overwrite a good answer for a whole beat on
// a transient blip. So a no-answer poll never replaces a good answer here; it
// only sets `error`, and the screen says "no answer" plus WHY. The degraded
// object is kept only when there has never been a good answer, so the cells
// can still distinguish "not asked yet" (null) from "asked, no answer".

import { useEffect, useState } from "react";
import type { Health } from "@shared/contract";

const BEAT_MS = 60_000;

export interface HealthRead {
  /** The last answer that carried a measurement; the no-answer object only
   *  before any measurement has ever landed; null before the first poll. */
  health: Health | null;
  /** api.ts's error from the MOST RECENT poll, or null when it answered. */
  error: string | null;
}

export function useHealth(enabled: boolean): HealthRead {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    const read = () => {
      void window.eve
        .health()
        .then((h) => {
          if (dead) return;
          if (!h) {
            setError("no answer from main");
            return;
          }
          if (h.online) {
            setHealth(h);
            setError(null);
            return;
          }
          setError(h.error ?? "no answer");
          // Keep the last GOOD answer; only a screen that has never had one
          // learns the no-answer object, so it can say so instead of dashing.
          setHealth((prev) => (prev?.online ? prev : h));
        })
        .catch(() => {
          // Main never throws to the renderer; a rejection here is a dead
          // bridge. Leave the last good answer on screen rather than blanking
          // a figure he may be reading.
          if (!dead) setError("bridge did not answer");
        });
    };
    read();
    const t = setInterval(read, BEAT_MS);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [enabled]);

  return { health, error };
}
