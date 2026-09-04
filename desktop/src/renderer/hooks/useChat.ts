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
import type { ChatFrame, ChatImage, HandoffOffer, PictureFrame, PendingConfirm } from "@shared/contract";
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
   * THE HANDOFF she offered on the last turn that offered one, or null.
   *
   * Main has already resolved it against this machine's index, so these are
   * filenames this disk holds — not strings the brain sent and not words read
   * out of a picture. The deck turns it into ONE button: start a fresh thread
   * with these names as CHIPS BESIDE AN EMPTY BOX — the box holds his
   * keystrokes and nothing else.
   */
  handoff: HandoffOffer | null;
  /**
   * WHETHER FILING IS REFUSED IN THIS CONVERSATION, AND WHY — the brain's
   * `picture` frame, emitted once per turn before the model runs, off the
   * DURABLE bit on the conversation row.
   *
   * THE EXIT HANGS OFF THIS AND NOT OFF `handoff` (audit 5, F4). The button used
   * to appear only when she remembered to call desk_handoff; on a natural
   * picture turn she read the picture and asked a question instead, and with
   * filing switched OFF her refusal pointed him at a button that cannot exist.
   * A frame the brain emits unconditionally does not depend on her.
   *
   * Null until the first frame of a conversation arrives.
   */
  picture: PictureFrame | null;
  /**
   * START A FRESH THREAD. Drops the conversation id (so the brain mints a new
   * one, with a new ledger row and a new SDK session, and no picture in it),
   * clears the transcript, and clears the offer.
   *
   * IT SENDS NOTHING. The names go into the composer as a DRAFT for him to edit
   * — TalkColumn owns that half — because the instruction on that turn has to
   * be his, and a message that sends itself is not his.
   */
  startFreshThread: () => void;
  /** Put the offer away without taking it. */
  dismissHandoff: () => void;
  sendMessage: (text: string, opts?: { hidden?: boolean; image?: ChatImage; names?: string[] }) => Promise<void>;
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
  const [handoff, setHandoff] = useState<HandoffOffer | null>(null);
  const [picture, setPicture] = useState<PictureFrame | null>(null);

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
        case "picture":
          // ONE FRAME PER TURN, and the newest is the truth. Nothing brain-side
          // ever writes the taint back to false, so within one conversation id
          // this goes clean -> blocked and stays there; a new conversation is
          // the only way out (below). It can also go to a BLOCKED that means "I
          // could not tell" rather than "there is a picture" — audit 6, D6-B: a
          // lost conversation row reads unknown and refuses. The frame carries
          // its own reason; this hook does not need to know which.
          setPicture(frame.picture);
          break;
        case "handoff":
          // Main resolved this against the live index before it got here, and
          // dropped everything it could not confirm. An offer with no names
          // never becomes a frame at all (api.ts), so anything that arrives
          // here has something in it. The newest offer replaces the previous
          // one: two buttons for two different lists is a choice he did not ask
          // for, and the one he just watched her make is the one he means.
          setHandoff(frame.handoff);
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
          // W1 — THE TURN IS OVER, so what it raised is now a fact rather than
          // a work in progress. TalkColumn prints THIS TURN RAISED NO CARD
          // under a finished turn whose `confirms` list is empty; until this
          // flag is set it says nothing, because "no card yet" is not "no
          // card". Every confirm_request for this turn has already landed above
          // — the brain emits them during the stream, never after `done`.
          setMessages((ms) => ms.map((m) => (m.id === eveId ? { ...m, done: true } : m)));
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
  const sendMessage = useCallback(async (text: string, opts?: { hidden?: boolean; image?: ChatImage; names?: string[] }) => {
    if (busy.current || !text.trim()) return;
    busy.current = true;
    setErrNote(null);
    setToolNote(null);

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
        // ONE turn. The bag is not held anywhere in this hook, so a resumed
        // conversation cannot re-attach it and the next turn is a turn without
        // a picture, exactly as it was before this feature existed.
        ...(opts?.image ? { image: opts.image } : {}),
        // THE CARRIED NAMES, AS THEIR OWN FIELD (audit 5, B2). They are NOT in
        // `message` and they never will be: `message` is the one string the
        // brain treats as King's own words, and a filename is written by
        // whoever made the file. Main re-checks each one against the live index
        // and the brain renders them inside <untrusted_filenames>.
        ...(opts?.names && opts.names.length > 0 ? { names: opts.names } : {}),
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

  // ---- the fresh thread ----------------------------------------------------
  // THE PICTURE IS IN THE OLD CONVERSATION AND IT STAYS THERE. Dropping the id
  // is what makes this real rather than cosmetic: with no `conversationId` on
  // the next /chat body the brain mints a new one, which is a new image-ledger
  // row and a new SDK session with an empty transcript — so the turn he is
  // about to send genuinely has no picture in it, and desk_file_plan works.
  //
  // The transcript is cleared too, because leaving the old turns on screen
  // under a new conversation would show him a thread that no longer exists.
  // Confirms are NOT cleared: a card waiting for him is still waiting for him,
  // and the header counter must not drop by one because he opened a thread.
  const startFreshThread = useCallback(() => {
    convId.current = undefined;
    try {
      localStorage.removeItem(CONV_KEY);
    } catch {
      /* private mode: the ref above is what the next turn actually reads */
    }
    turns.current.clear();
    setMessages([]);
    setStreamingId(null);
    setErrNote(null);
    setToolNote(null);
    setHandoff(null);
    // THE PICTURE STATE BELONGS TO THE CONVERSATION HE JUST LEFT. Clearing it
    // is not optimism — the new conversation has no id yet, so nothing is known
    // about it until its first `picture` frame lands. Leaving the old verdict up
    // would tell him the new thread is tainted before it has had a turn.
    setPicture(null);
  }, []);

  const dismissHandoff = useCallback(() => setHandoff(null), []);

  const appendYou = useCallback((text: string) => {
    setMessages((ms) => [...ms, { id: newId(), role: "you", text }]);
  }, []);

  const pruneConfirm = useCallback((id: string) => {
    setFrameConfirms((cs) => cs.filter((c) => c.id !== id));
    setMessages((ms) =>
      ms.map((m) => (m.confirms?.some((c) => c.id === id) ? { ...m, confirms: m.confirms.filter((c) => c.id !== id) } : m)),
    );
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
    handoff,
    picture,
    startFreshThread,
    dismissHandoff,
    sendMessage,
    appendYou,
    pruneConfirm,
    abortAll,
  };
}
