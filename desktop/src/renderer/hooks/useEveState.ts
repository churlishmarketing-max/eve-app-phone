// useEveState — owning stream: S2.
//
// The 30s poll lives in the MAIN process (electron/poll.ts) and pushes through
// onStateUpdate. This hook does two things and no more:
//
//   1. state.get() ON MOUNT. The boot poll fires before React exists, so the
//      cache is already warm by the time we mount — waiting for the next push
//      would leave the deck blank for up to 30 seconds.
//   2. subscribes to onStateUpdate for everything after that.
//
// `refresh()` is the write-then-read path (an approve, a hold): it forces a
// main-side fetch and lands the answer in the same state slot.

import { useCallback, useEffect, useState } from "react";
import type { EveState, StateUpdate } from "@shared/contract";

/** Before the first answer we are honestly offline — never a fake online:true. */
const SHELL: EveState = { online: false };

export interface EveStateView {
  state: EveState;
  /** ISO stamp of the last successful fetch, or null before the first one. */
  fetchedAt: string | null;
  /** False until the first state.get()/push has landed. */
  ready: boolean;
  refresh: () => Promise<void>;
}

export function useEveState(): EveStateView {
  const [update, setUpdate] = useState<StateUpdate | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.eve.state
      .get()
      .then((u) => {
        if (!cancelled) setUpdate(u);
      })
      .catch(() => {
        /* main never throws to the renderer; a rejection here is a dead bridge */
      });
    const unsub = window.eve.onStateUpdate((u) => setUpdate(u));
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUpdate(await window.eve.state.refresh());
    } catch {
      /* leave the last good state on screen rather than blanking the deck */
    }
  }, []);

  return {
    state: update?.state ?? SHELL,
    fetchedAt: update?.fetchedAt ?? null,
    ready: update !== null,
    refresh,
  };
}
