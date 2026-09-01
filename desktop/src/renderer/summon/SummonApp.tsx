// owner: stream S4
//
// SUMMON — the 680w always-on-top overlay (Artboards B + H).
//
// Split in two on purpose:
//   * SummonPanel — pure presentation. Every state the H board draws is a props
//     combination, which is what makes the ?shot= scenarios honest: they render
//     the SAME component the live window renders, not a look-alike.
//   * SummonApp    — the live wrapper: one useVoiceTurn, the summon-shown
//     auto-start, Esc, and type-to-switch.
//
// Two deliberate departures from the comps, both ruled by the boss:
//   1. NO backdrop-filter. A transparent Electron window cannot blur the OS
//      desktop behind it — the filter would cost a GPU layer and blur nothing.
//      The border + the double shadow carry the separation instead.
//   2. The ALERT state line is RED (.stateline.alert). The H comp leaves it
//      teal, which contradicts §5's own table (alert = #C41E3A) — comp bug.
//   Plus the footer copy: the comp says HOLD, and this build cannot hold (see
//   electron/main.ts:76-94), so the copy states the gesture that exists.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import type { PendingConfirm } from "@shared/contract";
import ConfirmCard from "../confirm/ConfirmCard";
import { useVoiceTurn, type TurnPhase } from "../voice/useVoiceTurn";

// ---------------------------------------------------------------------------
// The panel shell — the ONE inline style repeated verbatim in B and H, minus
// backdrop-filter.
// ---------------------------------------------------------------------------

// STREAM FIX (theme law): `background: "#0C1417"` was the TERMINAL panel hex,
// baked in. Every word on this panel — and the whole ConfirmCard it hosts — is
// tokenised, so under PAPER near-black ink landed on a near-black plate and the
// summon confirm went unreadable exactly like the deck modal did. var(--panel)
// is the same #0C1417 in TERMINAL and follows the world everywhere else. The
// literal alphas below are the same story and are now channel tokens.
const PANEL: CSSProperties = {
  width: 680,
  background: "var(--panel)",
  border: "1px solid rgba(var(--rgbAccent),.45)",
  borderRadius: 12,
  boxShadow: "0 40px 120px rgba(0,0,0,.7), 0 0 60px rgba(var(--rgbAccentDeep),.15)",
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const HEADER: CSSProperties = { display: "flex", alignItems: "center", gap: 14 };
const ORB: CSSProperties = { width: 48, height: 48, position: "relative", flex: "none" };
const TRANSCRIPT: CSSProperties = {
  fontStyle: "italic",
  fontSize: 14.5,
  color: "rgba(var(--rgbCream),.85)",
};
const REPLY: CSSProperties = {
  borderLeft: "2px solid var(--tealHi)",
  paddingLeft: 12,
  fontSize: 13.5,
  lineHeight: 1.48,
  color: "rgba(var(--rgbCream),.92)",
  whiteSpace: "pre-wrap",
};
const FOOTER: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 9,
  letterSpacing: ".14em",
  color: "rgba(var(--rgbCream),.62)",
  textAlign: "center",
};
// 9px "LINK: <what broke>" — a failure sentence in type, so --redInk.
const LINKLINE: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 9,
  letterSpacing: ".14em",
  color: "var(--redInk)",
};

// BOSS COPY RULING: the comp's "HOLD CTRL+SPACE TO TALK" describes a gesture
// globalShortcut cannot deliver. This states the one that ships.
export const SUMMON_FOOTER = "CTRL+SPACE TO TALK · AGAIN TO SEND · TYPE TO SWITCH · ↵ SEND";

type Chrome = "none" | "ripples" | "arc";

interface Stateline {
  cls: string;
  text: string;
  chrome: Chrome;
  orbRed: boolean;
}

function statelineFor(p: SummonPanelProps): Stateline {
  // A live note owns the line for its 3s (handoff §6: "the state line shows
  // SPEECH HELD — DESK IS SILENT").
  if (p.note) {
    return { cls: "stateline", text: p.note, chrome: "none", orbRed: false };
  }
  if (p.confirm) {
    return { cls: "stateline alert", text: "▲ ALERT — NEEDS YOUR EYES", chrome: "none", orbRed: true };
  }
  if (p.phase === "listening") {
    return { cls: "stateline listen", text: "● LISTENING — GO AHEAD", chrome: "ripples", orbRed: false };
  }
  if (p.phase === "thinking" || p.phase === "transcribing") {
    // "pulse_sweep" -> " · PULSE SWEEP" (the H board's own rendering).
    const tool = p.tool ? ` · ${p.tool.replace(/_/g, " ").toUpperCase()}` : "";
    return { cls: "stateline think", text: `◐ WORKING THE PROBLEM${tool}`, chrome: "arc", orbRed: false };
  }
  if (p.phase === "streaming" || p.phase === "speaking") {
    return { cls: "stateline", text: "● SPEAKING", chrome: "none", orbRed: false };
  }
  return { cls: "stateline", text: "○ IDLE — HOLDING THE ROOM", chrome: "none", orbRed: false };
}

export interface SummonPanelProps {
  phase: TurnPhase;
  transcript: string;
  reply: string;
  tool: string | null;
  confirm: PendingConfirm | null;
  note: string | null;
  error: string | null;
  /** Type-to-switch row visible? */
  typing: boolean;
  draft: string;
  onDraft?: (v: string) => void;
  onSubmit?: () => void;
  onConfirmResolved?: (id: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}

export function SummonPanel(props: SummonPanelProps): JSX.Element {
  const line = statelineFor(props);
  const showTranscript =
    !!props.transcript || props.phase === "listening" || props.phase === "transcribing";
  const showCursor = props.phase === "streaming" || props.phase === "thinking";

  return (
    <div style={PANEL}>
      <div style={HEADER}>
        <span className={line.orbRed ? "orb red" : "orb"} style={ORB}>
          {line.chrome === "ripples" ? (
            <>
              <span className="ripple" style={{ borderRadius: "50%" }} />
              <span className="ripple" style={{ borderRadius: "50%", animationDelay: ".8s" }} />
            </>
          ) : null}
          {line.chrome === "arc" ? <span className="arc" /> : null}
        </span>
        <span
          className={line.cls}
          style={{ letterSpacing: ".22em", ...(props.note ? { color: "var(--gold)" } : {}) }}
        >
          {line.text}
        </span>
        <span className="kbd" style={{ marginLeft: "auto" }}>
          ESC
        </span>
      </div>

      {showTranscript ? (
        <div style={TRANSCRIPT}>
          {props.transcript ? (
            `“${props.transcript}”`
          ) : (
            // Never a fake interim: until Deepgram answers there is nothing true
            // to print, so this is a placeholder and reads like one.
            <span style={{ color: "rgba(var(--rgbCream),.62)", fontStyle: "normal" }}>LISTENING…</span>
          )}
        </div>
      ) : null}

      {props.error ? <div style={LINKLINE}>LINK: {props.error}</div> : null}

      {props.reply ? (
        <div style={REPLY}>
          {props.reply}
          {showCursor ? <span className="cur">▌</span> : null}
        </div>
      ) : null}

      {props.confirm ? (
        <ConfirmCard
          confirm={props.confirm}
          variant="summon"
          onResolved={props.onConfirmResolved ?? (() => undefined)}
        />
      ) : null}

      {props.typing ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={props.inputRef}
            className="cmdinput"
            style={{ minHeight: 34, padding: "8px 11px", fontSize: 13.5 }}
            value={props.draft}
            placeholder="type it instead"
            onChange={(e) => props.onDraft?.(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                props.onSubmit?.();
              }
            }}
          />
          <span className="kbd">↵</span>
        </div>
      ) : null}

      <div style={FOOTER}>{SUMMON_FOOTER}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The live window.
// ---------------------------------------------------------------------------

/** A printable single character — the trigger for type-to-switch. */
function isPrintable(e: KeyboardEvent): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

export default function SummonApp(): JSX.Element {
  const turn = useVoiceTurn({ surface: "summon" });
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const turnRef = useRef(turn);
  turnRef.current = turn;

  // The panel's own confirm slot mirrors the turn's, but survives the next
  // turn's reset so the card does not vanish out from under a thumb.
  useEffect(() => {
    if (turn.confirm) setConfirm(turn.confirm);
  }, [turn.confirm]);

  // Main shows this window on the hotkey when the deck is unfocused; the turn
  // starts the moment it appears, barge-in first (useVoiceTurn.start does it).
  useEffect(() => {
    return window.eve.onSummonShown(() => {
      const t = turnRef.current;
      // The PTT event for the very press that raised this window is still in
      // flight; swallow it so it does not immediately toggle the mic back off.
      t.suppressPtt(700);
      setTyping(false);
      setDraft("");
      setConfirm(null);
      void t.start();
    });
  }, []);

  // Esc closes. It stops the mic; it does NOT abort an in-flight reply —
  // hiding a window is not an abort (Artboard B behaviour note).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        turnRef.current.cancel();
        window.eve.summon.hide();
        return;
      }
      if (typing) return;
      if (isPrintable(e)) {
        // TYPE TO SWITCH: the keystroke that opened the row is the first
        // character, so nothing King typed is dropped.
        e.preventDefault();
        turnRef.current.cancel();
        setDraft(e.key);
        setTyping(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typing]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void turnRef.current.sendText(text);
  }, [draft]);

  useEffect(() => {
    requestAnimationFrame(() => {
      window.__RENDER_DONE = true;
    });
  }, []);

  return (
    <SummonPanel
      phase={turn.phase}
      transcript={turn.transcript}
      reply={turn.reply}
      tool={turn.tool}
      confirm={confirm}
      note={turn.note}
      error={turn.error}
      typing={typing}
      draft={draft}
      onDraft={setDraft}
      onSubmit={submit}
      onConfirmResolved={() => setConfirm(null)}
      inputRef={inputRef}
    />
  );
}
