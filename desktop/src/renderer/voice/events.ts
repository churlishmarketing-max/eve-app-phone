// owner: stream S4
//
// Tiny typed singleton event bus for voice UI state — fully working, not a
// placeholder. Any renderer component can voiceEvents.on(cb) to react to a
// transient note or a mode change without threading props through the tree;
// the mic/PTT loop and window.eve.onPtt are the expected emitters.

// S4 extended the union ADDITIVELY (wave 2): "user-turn" is emitted the moment
// a spoken turn is handed to the brain, so the deck can draw the YOU bubble for
// a turn it did not start. Subscribers written against the original two
// variants must ignore unknown `type` values rather than switch exhaustively.
export type VoiceEvent =
  | { type: "transient-note"; text: string; ttlMs: number }
  | { type: "mode"; mode: "idle" | "listening" | "thinking" | "speaking" | "alert" }
  | { type: "user-turn"; text: string; chatId: string };

type Listener = (e: VoiceEvent) => void;

const listeners = new Set<Listener>();

/** Local fan-out ONLY. Anything arriving from another window lands here and
 *  goes no further — that is the loop guard. */
function dispatch(e: VoiceEvent): void {
  for (const cb of listeners) cb(e);
}

export const voiceEvents = {
  on(cb: Listener): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  emit(e: VoiceEvent): void {
    dispatch(e);
    // The bus is a per-window singleton, so Summon's emit would never reach the
    // deck. Relay it through main (fire-and-forget: a voice event is chrome,
    // never a write). Guarded because a shot scenario can render without the
    // bridge, and older preloads have no voiceRelay at all.
    try {
      const relay = window.eve?.voiceRelay;
      if (typeof relay === "function") void relay.call(window.eve, e).catch(() => undefined);
    } catch {
      /* no bridge in this context — local-only is the correct fallback */
    }
  },
};

// The other half of the wire: events another window relayed are dispatched to
// THIS window's listeners and are never re-relayed.
try {
  window.eve?.onVoiceEvent?.((e) => dispatch(e as VoiceEvent));
} catch {
  /* no bridge in this context */
}
