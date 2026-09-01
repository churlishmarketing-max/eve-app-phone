// Deck-local types — owning stream: S2.
//
// src/shared/contract.ts is frozen and owned by S1, so anything the deck needs
// that the contract does not already carry is defined here (the OWNERSHIP.md
// rule: "If a type is missing, define it in your own files").

import type { PendingConfirm } from "@shared/contract";

/** Her five presence states (handoff §5). Matches voice/events.ts's mode union. */
export type EveMode = "idle" | "listening" | "thinking" | "speaking" | "alert";

/** Which surface the DATA column (or the whole frame) is showing.
 *  "core" is THE CORE — a full-frame overview that mounts the same way
 *  "settings" does (Deck.tsx branches before the three-column grid). It is an
 *  ADDITION, not a replacement: the deck still carries the conversation, the
 *  confirm cards and the approval inbox. */
export type DeckView = "deck" | "body" | "settings" | "core";

/** One line in the conversation. `role` mirrors the bubble classes .bub.eve/.you. */
export interface DeckMsg {
  id: string;
  role: "eve" | "you";
  text: string;
  /** Confirms that arrived on this turn — rendered inline under the bubble. */
  confirms?: PendingConfirm[];
}

/** What useChat hands the deck. */
export interface ChatView {
  messages: DeckMsg[];
  /** The bubble currently being streamed into, if any (carries the ▌ cursor). */
  streamingId: string | null;
  mode: EveMode;
  toolNote: string | null;
  errNote: string | null;
  busy: boolean;
}

/** What useWardrobe hands the rail. */
export interface WardrobeView {
  /** The look she is wearing, display name (e.g. "AUTHORITY"). */
  name: string | null;
  /** Absolute URL of the worn look, or null when the closet is empty/offline. */
  url: string | null;
  /** The previous look's URL while a 600ms cross-fade is running. */
  prevUrl: string | null;
  /** `SHE CHANGED — {LOOK}` for 3s after a rotation; null otherwise. */
  changedCaption: string | null;
}

/** The five states, verbatim from handoff §5 (glyph, label, colour).
 *
 * `col` IS APPLIED AS AN INLINE STYLE, so it beats every stylesheet rule —
 * which is how these five literals quietly opted the rail's state line out of
 * the entire theme system. They are TERMINAL's own values (rgba(28,185,200,.8)
 * is --rgbAccent at .8, #9BEFF7 is --ice, #1CB9C8 is --tealHi), so TERMINAL
 * looked right and nothing else did: under PAPER the line printed terminal teal
 * and pale ice onto cream, and .stateline.alert / .stateline.listen in
 * eve-desktop.css — the rules that are supposed to own these colours — never
 * applied at all, in any world.
 *
 * Tokenised. Every value below is byte-identical to the literal it replaced in
 * TERMINAL; the other three worlds now follow. The two RED states take
 * --redInk, because a state line is 10px TYPE — measured on the law hex it
 * rendered 3.34 / 3.26 / 4.69 / 3.32 across the four rail grounds. The pcard
 * corner brackets beside it keep var(--red): those are structure. */
export const ENT: Record<EveMode, { dot: string; label: string; col: string }> = {
  idle: { dot: "○", label: "IDLE — HOLDING THE ROOM", col: "rgba(var(--rgbAccent),.8)" },
  listening: { dot: "●", label: "LISTENING — GO AHEAD", col: "var(--redInk)" },
  thinking: { dot: "◐", label: "WORKING THE PROBLEM", col: "var(--ice)" },
  speaking: { dot: "●", label: "SPEAKING", col: "var(--tealHi)" },
  alert: { dot: "▲", label: "ALERT — NEEDS YOUR EYES", col: "var(--redInk)" },
};
