// useChat — owning stream: S2.
//
// The frame reducer, ported from the shipped phone client (EveApp.tsx:412-485)
// because those patterns are proven in the field:
//
//   * a `busy` REF guards re-entrancy (:413) — state would be a frame late and
//     let a double-Enter start two turns;
//   * tokens append into one bubble by id (:434);
//   * a failed turn drops the empty EVE shell (:481) so a failure never reads
//     as her saying nothing — but ONLY when no tokens arrived, otherwise a
//     mid-stream error would delete what she already said;
//   * the conversationId is persisted on `done` (:439).
//
// Desktop-only: frames arrive for chats this window did NOT start (a voice turn
// from S4's summon, a tray turn). Those get an EVE bubble created on their first
// frame and stream into it exactly like a local turn.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatFrame, ChatLock, PendingConfirm } from "@shared/contract";
import type { ChatView, DeckMsg, EveMode, SeenJobFrame } from "../deck/types";

/** Job frames kept per window. The feed caps lower; this is the reducer's ceiling. */
const JOB_FRAME_CAP = 200;
let jobSeq = 0;
import { CONV_KEY, newId } from "../deck/format";

interface Turn {
  eveId: string;
  tokens: number;
  live: boolean;
}

export interface ChatApi extends ChatView {
  /** Confirms that arrived on an SSE frame this session (deduped by id). */
  frameConfirms: PendingConfirm[];
  /**
   * W2 — THE THREAD IS LOCKED. Set from the brain's `locked` frame, which fires
   * because an authority tool refused in code. Null until one does.
   */
  lock: ChatLock | null;
  /**
   * START A FRESH THREAD, and hand back THE LAST THING HE TYPED, verbatim, for
   * the composer.
   *
   * THE STRING COMES FROM THIS PROCESS, NOT FROM THE BRAIN. It is the exact
   * argument his last sendMessage was called with — it has never been near the
   * model, the mailbox or her prose — which is the entire reason it is safe to
   * put in the box he sends as his own words. If there is nothing recorded
   * (a voice turn, a restart), it returns "" and he types it again; a blank box
   * is the correct fallback, and a composed sentence never is.
   */
  resetThread: () => string;
  sendMessage: (text: string, opts?: { hidden?: boolean }) => Promise<void>;
  /** S4 emits a user-turn event just before a voice turn: show his line. */
  appendYou: (text: string) => void;
  /** Drop a confirm from the local list once it has been resolved. */
  pruneConfirm: (id: string) => void;
  abortAll: () => void;
}

export function useChat(): ChatApi {
  const [messages, setMessages] = useState<DeckMsg[]>([]);
  const [mode, setMode] = useState<EveMode>("idle");
  const [toolNote, setToolNote] = useState<string | null>(null);
  const [errNote, setErrNote] = useState<string | null>(null);
  const [frameConfirms, setFrameConfirms] = useState<PendingConfirm[]>([]);
  const [jobFrames, setJobFrames] = useState<SeenJobFrame[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [lock, setLock] = useState<ChatLock | null>(null);
  // HIS OWN WORDS, HELD IN A REF ON PURPOSE: it must not re-render anything and
  // it must not be derived from a message bubble (bubbles can be seeded by S4's
  // voice path and by frames from other windows). It is only ever written from
  // the `text` argument of sendMessage below.
  const lastTyped = useRef("");

  const busy = useRef(false);
  const turns = useRef(new Map<string, Turn>());
  const convId = useRef<string | undefined>(undefined);

  useEffect(() => {
    try {
      convId.current = localStorage.getItem(CONV_KEY) ?? undefined;
    } catch {
      convId.current = undefined;
    }
  }, []);

  const endTurn = useCallback((rec: Turn) => {
    if (!rec.live) return;
    rec.live = false;
    setLiveCount((n) => Math.max(0, n - 1));
  }, []);

  // ---- the single frame subscription -------------------------------------
  useEffect(() => {
    const unsub = window.eve.onChatFrame(({ chatId, frame }) => {
      let rec = turns.current.get(chatId);
      if (!rec) {
        // A turn this window did not start (S4 voice, summon, tray). Give it a
        // bubble on its first frame and stream into it like any other.
        rec = { eveId: newId(), tokens: 0, live: true };
        turns.current.set(chatId, rec);
        const eveId = rec.eveId;
        setMessages((ms) => [...ms, { id: eveId, role: "eve", text: "" }]);
        setLiveCount((n) => n + 1);
        setMode("thinking");
        setStreamingId(eveId);
      }
      const eveId = rec.eveId;
      applyFrame(frame, rec, eveId);
    });

    function applyFrame(frame: ChatFrame, rec: Turn, eveId: string): void {
      switch (frame.type) {
        case "state":
          if (frame.state === "speaking") setMode("speaking");
          else if (frame.state === "thinking") setMode("thinking");
          else setMode("idle");
          break;
        case "token":
          rec.tokens += 1;
          setStreamingId(eveId);
          setMessages((ms) => ms.map((m) => (m.id === eveId ? { ...m, text: m.text + frame.text } : m)));
          break;
        case "tool":
          setToolNote(frame.name);
          break;
        case "confirm_request": {
          const c = frame.confirm;
          setFrameConfirms((cs) => (cs.some((x) => x.id === c.id) ? cs : [...cs, c]));
          setMessages((ms) =>
            ms.map((m) =>
              m.id === eveId
                ? { ...m, confirms: (m.confirms ?? []).some((x) => x.id === c.id) ? m.confirms : [...(m.confirms ?? []), c] }
                : m,
            ),
          );
          break;
        }
        case "locked":
          // W2 — THE DESKTOP OWNS THE AFFORDANCE. The button below exists
          // because this frame arrived, not because she offered one.
          setLock(frame.lock);
          break;
        case "job": {
          // DISPATCH v0.1 — one line per frame, never merged here: the CORE's
          // feed wants every transition, and its rail upserts by id itself.
          // A frame with no id is a torn frame and is dropped, not guessed at.
          const j = frame.job;
          if (!j || typeof j.id !== "string" || !j.id) break;
          jobSeq += 1;
          const seen: SeenJobFrame = { frame: j, at: new Date().toISOString(), seq: jobSeq };
          setJobFrames((fs) => (fs.length >= JOB_FRAME_CAP ? [...fs.slice(1), seen] : [...fs, seen]));
          break;
        }
        case "done":
          convId.current = frame.conversationId;
          try {
            localStorage.setItem(CONV_KEY, frame.conversationId);
          } catch {
            /* private mode / storage full — the turn still landed */
          }
          setMode("idle");
          setToolNote(null);
          setStreamingId((cur) => (cur === eveId ? null : cur));
          busy.current = false;
          endTurn(rec);
          break;
        case "error":
          setErrNote(frame.message);
          setMode("idle");
          setToolNote(null);
          setStreamingId((cur) => (cur === eveId ? null : cur));
          busy.current = false;
          endTurn(rec);
          // Only when nothing arrived: a mid-stream failure must not delete
          // what she already said.
          if (rec.tokens === 0) setMessages((ms) => ms.filter((m) => m.id !== eveId));
          break;
        default:
          break;
      }
    }

    return unsub;
  }, [endTurn]);

  // ---- send ---------------------------------------------------------------
  const sendMessage = useCallback(async (text: string, opts?: { hidden?: boolean }) => {
    if (busy.current || !text.trim()) return;
    busy.current = true;
    setErrNote(null);
    setToolNote(null);

    // F3 · A HIDDEN SEND IS NOT HIS WORDS, AND THIS LINE USED TO SAY IT WAS.
    // It was unconditional, and App.tsx seeds a hidden GREETING_SEED turn on
    // every non-harness launch — so on a real boot where his first turn is
    // voice, the reset button put "[King just opened the desktop deck...]" in
    // his composer under a banner reading YOUR WORDS CAME WITH YOU. Nothing
    // leaked (the seed is a desktop constant), but the panel lied about whose
    // words those were, which is the one thing this ref exists to be right
    // about. Hidden/system sends are OURS: they never become his.
    if (!opts?.hidden) lastTyped.current = text;
    const eveId = newId();
    setMessages((ms) => [
      ...ms,
      ...(opts?.hidden ? [] : [{ id: newId(), role: "you" as const, text }]),
      { id: eveId, role: "eve" as const, text: "" },
    ]);
    setMode("thinking");
    setStreamingId(eveId);
    setLiveCount((n) => n + 1);

    try {
      const { chatId } = await window.eve.chat.start({
        message: text,
        viaVoice: false,
        conversationId: convId.current,
      });
      const raced = turns.current.get(chatId);
      if (raced) {
        // Frames beat the invoke reply home: adopt the bubble they already made
        // and drop ours, so the turn never renders twice.
        setMessages((ms) => ms.filter((m) => m.id !== eveId));
        setStreamingId((cur) => (cur === eveId ? raced.eveId : cur));
        setLiveCount((n) => Math.max(0, n - 1));
      } else {
        turns.current.set(chatId, { eveId, tokens: 0, live: true });
      }
    } catch (err) {
      busy.current = false;
      setMode("idle");
      setStreamingId((cur) => (cur === eveId ? null : cur));
      setLiveCount((n) => Math.max(0, n - 1));
      setErrNote(err instanceof Error ? err.message : String(err));
      setMessages((ms) => ms.filter((m) => m.id !== eveId));
    }
  }, []);

  const appendYou = useCallback((text: string) => {
    setMessages((ms) => [...ms, { id: newId(), role: "you", text }]);
  }, []);

  const pruneConfirm = useCallback((id: string) => {
    setFrameConfirms((cs) => cs.filter((c) => c.id !== id));
    setMessages((ms) =>
      ms.map((m) => (m.confirms?.some((c) => c.id === id) ? { ...m, confirms: m.confirms.filter((c) => c.id !== id) } : m)),
    );
  }, []);

  const resetThread = useCallback(() => {
    // A NEW CONVERSATION IS THE WHOLE MECHANISM. The brain's lock is keyed on
    // the conversationId, so dropping the id IS the reset: the next turn mints
    // a fresh row, reads clean/"new", and takes authority normally. Nothing
    // else is cleared and nothing is asked of the brain.
    convId.current = undefined;
    try {
      localStorage.removeItem(CONV_KEY);
    } catch {
      /* private mode — the id is already gone from this process */
    }
    setLock(null);
    setMessages([]);
    setErrNote(null);
    // F4 · THE CARD IS NOT THE THREAD'S TO DROP, AND THE PANEL NOW SAYS SO.
    // `frameConfirms` is deliberately NOT cleared here, and that is a decision
    // with two pieces of evidence behind it rather than an oversight:
    //   1. CLEARING IT WOULD BE COSMETIC AND BRIEF. The same card is registered
    //      in the brain's pending map (confirm.ts, 30-minute TTL) and comes
    //      back down the very next /state poll inside state.pendingConfirms —
    //      App.tsx unions the two. A card that vanishes on click and returns a
    //      second later is a worse lie than one that stays.
    //   2. SUPPRESSING IT WOULD DESYNC THE DECK FROM ITSELF. CorePane, OpsPane
    //      and the CORE's red counter all count that same brain-side queue. A
    //      thread-local drop would leave the deck showing no card and the CORE
    //      showing one red.
    // A card is a REQUEST FOR A SIGNATURE, not an action (authority.ts
    // CONFIRM_CARD_RULING): untrusted text may cause one to be DRAWN and can
    // never cause one to be SENT, and the card shows the real payload he is
    // signing. So the queue outliving the thread is correct, and the half that
    // was wrong was the panel, which implied everything here was closed. The
    // lock panel now COUNTS what is still waiting and says it will still be
    // waiting afterwards (TalkColumn's .lockcards line).
    return lastTyped.current;
  }, []);

  const abortAll = useCallback(() => {
    for (const [chatId, rec] of turns.current) {
      if (rec.live) void window.eve.chat.abort(chatId);
    }
  }, []);

  return {
    messages,
    streamingId,
    mode,
    toolNote,
    errNote,
    busy: liveCount > 0,
    jobFrames,
    frameConfirms,
    lock,
    resetThread,
    sendMessage,
    appendYou,
    pruneConfirm,
    abortAll,
  };
}
