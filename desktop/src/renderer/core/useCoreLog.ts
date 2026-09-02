// THE SESSION LOG — owning stream: THE CORE (P1 v0.1: the job event feed).
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
//   * A JOB CHANGING STATE                        (SSE `job` frame, OR a
//                                                  /state poll disagreeing
//                                                  with the last known status)
//
// THE JOB FEED HAS TWO INPUTS AND ONE LEDGER. A frame is the fast path: one
// line per frame, the instant it lands. The 30 s poll is the truth: every row
// it carries is checked against the last status this log printed for that id,
// and a difference prints a line — so a worker finishing ten minutes after its
// stream closed, or a card approved from the phone, still shows up here, and a
// row never goes stale. Both paths write the same ledger, so a transition the
// frame already printed is NOT printed again when the poll confirms it.
//
// THE MOUNT IS NOT BOOT THEATRE. The lines emitted on mount are the true,
// current answers to "is she reachable", "when did this data land", "is
// anything waiting on your thumb" and "what is the jobs list saying right now",
// stamped at the moment the screen was opened. Nothing else is seeded, and when
// there is nothing to say the panel says so in one sentence.
//
// THE CAP IS HONEST. Forty lines are kept; when a forty-first arrives the
// oldest is dropped AND COUNTED, and the panel prints how many it let go.

import { useEffect, useRef, useState } from "react";
import type { EveState } from "@shared/contract";
import type { ChatView, SeenJobFrame } from "../deck/types";
import { pad2 } from "../deck/format";
import { jobCounts, normStatus, statusWord, unitOf, type JobsView } from "./jobs";

export type LogTone = "ok" | "warn" | "red" | "dim";

export interface CoreLogEntry {
  id: string;
  /** HH:MM:SS, local, stamped when the event was observed. */
  at: string;
  text: string;
  tone: LogTone;
  /** Set on job lines: clicking the line opens that job's detail. */
  jobId?: string;
  /** The status the line reported, normalised — the detail's timeline reads it. */
  jobStatus?: string;
}

/** Newest first, and the panel is short — nothing is served by an unbounded list. */
const CAP = 40;

function stamp(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

let seq = 0;
function entry(text: string, tone: LogTone, extra?: Pick<CoreLogEntry, "jobId" | "jobStatus">): CoreLogEntry {
  seq += 1;
  return { id: `log-${seq}`, at: stamp(new Date()), text, tone, ...extra };
}

/** Gold for failed and needs-you, teal for running/done, dim for the rest.
 *  Never red: red is the RED confirm tier's line, and a job is not one. */
function jobTone(status: string): LogTone {
  const s = normStatus(status);
  if (s === "running" || s === "done") return "ok";
  if (s === "failed" || s === "in_approvals") return "warn";
  return "dim";
}

/** `pennyworth · NEEDS YOU · email Acacia about moving the shoot` */
function jobLine(unit: string | null, status: string, title: string): string {
  return `${unit ?? "—"} · ${statusWord(status)} · ${title || "—"}`;
}

export interface CoreLogInput {
  state: EveState;
  fetchedAt: string | null;
  chat: ChatView;
  /** The merged poll+frame rows (jobs.ts) — the reconciliation input. */
  jobs: JobsView;
  /** Every `job` frame this window has seen, in arrival order. */
  frames: SeenJobFrame[];
}

export interface CoreLog {
  rows: CoreLogEntry[];
  /** Lines the cap let go this session. Printed, never hidden. */
  dropped: number;
}

export function useCoreLog({ state, fetchedAt, chat, jobs, frames }: CoreLogInput): CoreLog {
  // One state for both figures, so the updater stays pure (StrictMode runs
  // updaters twice; a second setState inside one would double-count drops).
  const [log, setLog] = useState<CoreLog>({ rows: [], dropped: 0 });
  const push = useRef((...made: CoreLogEntry[]) => {
    if (made.length === 0) return;
    setLog((l) => {
      const next = [...made.slice().reverse(), ...l.rows];
      const over = Math.max(0, next.length - CAP);
      return { rows: over > 0 ? next.slice(0, CAP) : next, dropped: l.dropped + over };
    });
  });

  const seeded = useRef(false);
  const wasOnline = useRef<boolean | null>(null);
  const lastFetch = useRef<string | null>(null);
  const lastYou = useRef(0);
  const lastTool = useRef<string | null>(null);
  const lastErr = useRef<string | null>(null);
  const wasStreaming = useRef<string | null>(null);
  const seenConfirms = useRef(new Set<string>());
  // THE ONE LEDGER: job id -> the last status this log printed (or saw at mount).
  const known = useRef(new Map<string, string>());
  const lastFrameSeq = useRef(0);

  // ---- the mount: true statements about right now --------------------------
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
    for (const j of jobs.rows) known.current.set(j.id, normStatus(j.status));
    for (const f of frames) lastFrameSeq.current = Math.max(lastFrameSeq.current, f.seq);

    const made: CoreLogEntry[] = [
      state.online
        ? entry("LINK UP — her brain answered", "ok")
        : entry("LINK DOWN — her brain is unreachable", "red"),
    ];
    if (fetchedAt) made.push(entry("STATE LANDED — this board is reading it", "dim"));
    const reds = (state.pendingConfirms ?? []).length;
    if (reds > 0) made.push(entry(`${reds} RED WAITING ON YOUR THUMB`, "red"));
    if (state.online && !jobs.absent) {
      const c = jobCounts(jobs.rows);
      made.push(
        entry(
          `JOBS 24H — ${jobs.rows.length} ROWS · ${c.inFlight} IN FLIGHT · ${c.failed} FAILED`,
          c.waiting > 0 || c.failed > 0 ? "warn" : "dim",
        ),
      );
    }
    if (jobs.error) made.push(entry(`JOBS READ FAILED — ${jobs.error}`, "warn"));
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

  // ---- the job feed, fast path: one line per frame -------------------------
  useEffect(() => {
    if (!seeded.current) return;
    const made: CoreLogEntry[] = [];
    for (const f of frames) {
      if (f.seq <= lastFrameSeq.current) continue;
      lastFrameSeq.current = f.seq;
      const s = normStatus(f.frame.status);
      known.current.set(f.frame.id, s);
      made.push(
        entry(jobLine(f.frame.unit || null, s, f.frame.title), jobTone(s), { jobId: f.frame.id, jobStatus: s }),
      );
    }
    push.current(...made);
  }, [frames]);

  // ---- the job feed, truth path: reconcile every poll against the ledger ---
  useEffect(() => {
    if (!seeded.current || !state.online) return;
    const made: CoreLogEntry[] = [];
    for (const j of jobs.rows) {
      const s = normStatus(j.status);
      if (known.current.get(j.id) === s) continue;
      known.current.set(j.id, s);
      made.push(entry(jobLine(unitOf(j), s, j.title), jobTone(s), { jobId: j.id, jobStatus: s }));
    }
    push.current(...made);
  }, [jobs.rows, state.online]);

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
      made.push(
        entry(`RED CONFIRM — ${c.kind.replace(/_/g, " ").toUpperCase()}${c.jobId ? " · FOR A JOB" : ""}`, "red", {
          jobId: c.jobId,
        }),
      );
    }

    push.current(...made);
  }, [chat.messages, chat.toolNote, chat.errNote, chat.streamingId, state.pendingConfirms]);

  return log;
}

/** For the detail's timeline: every line this log printed for one job, oldest first. */
export function eventsFor(rows: CoreLogEntry[], jobId: string): CoreLogEntry[] {
  return rows.filter((e) => e.jobId === jobId && e.jobStatus).reverse();
}
