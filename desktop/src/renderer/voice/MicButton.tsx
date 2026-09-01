// owner: stream S4
//
// THE MIC. Rendered by S2 in the deck's input row; it owns the whole in-deck
// voice turn (mic -> transcribe -> chat -> speak) through useVoiceTurn.
//
// FROZEN interface: props are `{ disabled? }` and nothing else.
//
// Gesture — ONE control, two contracts, decided by how long the pointer is down:
//   * quick click (< 300ms)   -> tap-toggle. Click starts, click again sends.
//   * press-and-hold (>= 300ms) -> hold-to-talk. Release sends.
// This is the ONE true hold path in the app: globalShortcut has no keyup, so
// the hotkey can only ever be a toggle (see electron/main.ts:76-94).
//
// Colour law (eve-desktop.css, fused M2 amendment): the live mic is RED, not
// teal — red owns both hot moments, the open mic and the RED tier.

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useVoiceTurn } from "./useVoiceTurn";

export interface MicButtonProps {
  disabled?: boolean;
}

const HOLD_MS = 300;

/** Verbatim from the design boards (A-deck.html / C-confirm.html). */
const MIC_PATH =
  "M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Zm6-4a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.94V22h2v-3.06A8 8 0 0 0 20 11h-2Z";

export default function MicButton({ disabled = false }: MicButtonProps): JSX.Element {
  const turn = useVoiceTurn({ surface: "deck" });
  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);
  const consumed = useRef(false);

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
      if (turn.recording) {
        // Second tap of a tap-toggle: send now, and ignore the matching up.
        consumed.current = true;
        void turn.stopAndSend();
        return;
      }
      consumed.current = false;
      held.current = false;
      void turn.start();
      clearHold();
      holdTimer.current = window.setTimeout(() => {
        held.current = true;
      }, HOLD_MS);
    },
    [clearHold, disabled, turn],
  );

  const onPointerUp = useCallback(() => {
    clearHold();
    if (consumed.current) return;
    // Held long enough to mean "hold-to-talk": release sends. A quick click
    // leaves the recorder running and waits for the next tap.
    if (held.current) void turn.stopAndSend();
  }, [clearHold, turn]);

  const cls = `micv6${turn.recording ? " on" : ""}`;
  const label = turn.recording ? "Stop and send" : "Talk to EVE";

  return (
    <div
      className={cls}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-pressed={turn.recording}
      aria-disabled={disabled}
      title={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void turn.toggle();
        }
      }}
      style={disabled ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
    >
      <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor" }} aria-hidden="true">
        <path d={MIC_PATH} />
      </svg>
    </div>
  );
}
