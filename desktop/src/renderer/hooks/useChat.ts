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
import type { ChatFrame, PendingConfirm } from "@shared/contract";
import type { ChatView, DeckMsg, EveMode } from "../deck/types";
import { CONV_KEY, newId } from "../deck/format";

interface Turn {
  eveId: string;
  tokens: number;
  live: boolean;
}

export interface ChatApi extends ChatView {
  /** Confirms that arrived on an SSE frame this session (deduped by id). */
  frameConfirms: PendingConfirm[];
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
  const [liveCount, setLiveCount] = useState(0);
  const [streamingId, setStreamingId] = useState<string | null>(null);

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
    frameConfirms,
    sendMessage,
    appendYou,
    pruneConfirm,
    abortAll,
  };
}
