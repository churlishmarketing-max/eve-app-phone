// THE SESSION LOG — owning stream: THE CORE.
//
// THE CORE ships five seeded log lines ("gmail · 2 drafts staged", "supabase
// memory write OK", "rustic lumber 12d quiet", "research teardown 67%", "fleet
// health 8/10 LIVE"). Every one of them is fabricated: nothing in this app has
// ever written an event stream, and four of the five report quantities that do
// not exist on the wire. All five are deleted.
//
// What is left is a log that only ever prints things that ACTUALLY HAPPENED IN
// THIS SESSION, observed as they happen:
//
//   * the link coming up or going down            (state.online)
//   * a state refresh landing                     (StateUpdate.fetchedAt)
//   * a turn being sent                           (a new "you" message)
//   * a tool being called, by name                (ChatFrame type "tool")
//   * her stream closing                          (streamingId -> null)
//   * a failure, with the brain's own message      (ChatFrame type "error")
//   * a RED confirm arriving, by kind             (PendingConfirm.kind)
//
// THE MOUNT IS NOT BOOT THEATRE. The three lines emitted on mount are not a
// dramatisation of a startup sequence — they are the true, current answers to
// "is she reachable", "when did this data land" and "is anything waiting on
// your thumb", stamped at the moment the screen was opened. Nothing else is
// seeded, and when there is nothing to say the panel says so in one sentence.

import { useEffect, useRef, useState } from "react";
import type { EveState } from "@shared/contract";
import type { ChatView } from "../deck/types";
import { pad2 } from "../deck/format";

export type LogTone = "ok" | "warn" | "red" | "dim";

export interface CoreLogEntry {
  id: string;
  /** HH:MM:SS, local, stamped when the event was observed. */
  at: string;
  text: string;
  tone: LogTone;
}

/** Newest first, and the panel is short — nothing is served by an unbounded list. */
const CAP = 40;

function stamp(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

let seq = 0;
function entry(text: string, tone: LogTone): CoreLogEntry {
  seq += 1;
  return { id: `log-${seq}`, at: stamp(new Date()), text, tone };
}

export interface CoreLogInput {
  state: EveState;
  fetchedAt: string | null;
  chat: ChatView;
}

export function useCoreLog({ state, fetchedAt, chat }: CoreLogInput): CoreLogEntry[] {
  const [rows, setRows] = useState<CoreLogEntry[]>([]);
  const push = useRef((...made: CoreLogEntry[]) => {
    if (made.length === 0) return;
    setRows((r) => [...made.reverse(), ...r].slice(0, CAP));
  });

  const seeded = useRef(false);
  const wasOnline = useRef<boolean | null>(null);
  const lastFetch = useRef<string | null>(null);
  const lastYou = useRef(0);
  const lastTool = useRef<string | null>(null);
  const lastErr = useRef<string | null>(null);
  const wasStreaming = useRef<string | null>(null);
  const seenConfirms = useRef(new Set<string>());

  // ---- the mount: three true statements about right now --------------------
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    wasOnline.current = state.online;
    lastFetch.current = fetchedAt;
    lastYou.current = chat.messages.filter((m) => m.role === "you").length;
    lastTool.current = chat.toolNote;
    lastErr.current = chat.errNote;
    wasStreaming.current = chat.streamingId;
    for (const c of state.pendingConfirms ?? []) seenConfirms.current.add(c.id);

    const made: CoreLogEntry[] = [
      state.online
        ? entry("LINK UP — her brain answered", "ok")
        : entry("LINK DOWN — her brain is unreachable", "red"),
    ];
    if (fetchedAt) made.push(entry("STATE LANDED — this board is reading it", "dim"));
    const reds = (state.pendingConfirms ?? []).length;
    if (reds > 0) made.push(entry(`${reds} RED WAITING ON YOUR THUMB`, "red"));
    push.current(...made);
    // Deliberately mount-only: this is a snapshot of the instant the screen
    // opened, and re-running it on every prop change would manufacture history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- the link ------------------------------------------------------------
  useEffect(() => {
    if (!seeded.current || wasOnline.current === null) return;
    if (wasOnline.current === state.online) return;
    wasOnline.current = state.online;
    push.current(
      state.online
        ? entry("LINK UP — her brain answered", "ok")
        : entry("LINK DOWN — her brain is unreachable", "red"),
    );
  }, [state.online]);

  // ---- a refresh landing ---------------------------------------------------
  useEffect(() => {
    if (!seeded.current || !fetchedAt || fetchedAt === lastFetch.current) return;
    lastFetch.current = fetchedAt;
    push.current(entry("STATE REFRESHED", "dim"));
  }, [fetchedAt]);

  // ---- his turns, her tools, her failures ---------------------------------
  useEffect(() => {
    if (!seeded.current) return;
    const made: CoreLogEntry[] = [];

    const yours = chat.messages.filter((m) => m.role === "you").length;
    if (yours > lastYou.current) {
      for (let i = lastYou.current; i < yours; i++) made.push(entry("TURN SENT", "dim"));
      lastYou.current = yours;
    }

    if (chat.toolNote && chat.toolNote !== lastTool.current) {
      made.push(entry(`TOOL — ${chat.toolNote.replace(/_/g, " ").toUpperCase()}`, "ok"));
    }
    lastTool.current = chat.toolNote;

    if (chat.errNote && chat.errNote !== lastErr.current) {
      made.push(entry(`FAILED — ${chat.errNote}`, "red"));
    }
    lastErr.current = chat.errNote;

    if (wasStreaming.current && !chat.streamingId) made.push(entry("STREAM CLOSED", "dim"));
    wasStreaming.current = chat.streamingId;

    // A confirm can arrive on a frame OR in a poll, so both lists are watched.
    const inbound = [
      ...(state.pendingConfirms ?? []),
      ...chat.messages.flatMap((m) => m.confirms ?? []),
    ];
    for (const c of inbound) {
      if (seenConfirms.current.has(c.id)) continue;
      seenConfirms.current.add(c.id);
      made.push(entry(`RED CONFIRM — ${c.kind.replace(/_/g, " ").toUpperCase()}`, "red"));
    }

    push.current(...made);
  }, [chat.messages, chat.toolNote, chat.errNote, chat.streamingId, state.pendingConfirms]);

  return rows;
}
