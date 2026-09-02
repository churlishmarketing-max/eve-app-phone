// THE JOB TRUTH — owning stream: THE CORE (P1 v0.1 hub half).
//
// One module turns `/state.jobs[]` + the `job` SSE frames into the rows every
// surface on this screen reads — the fleet chips, THE WIRE's four counters,
// the JOBS rail, the session log's reconciliation and the detail panel. It is
// the only place that merges the two sources, so it is the only place that can
// get the merge wrong, and the rule is written once:
//
//   /state IS THE TRUTH. A frame is the fast path. A frame that arrived AFTER
//   the last poll landed may move a row forward; a frame older than the poll
//   is history the poll already knows about and is ignored. A frame for an id
//   the poll has never returned opens a row on its own (the poll will carry it
//   on the next beat — the list is every job of the last 24 h).
//
// Built against CONTRACT-v0.1.md §1 / §3. Nothing here invents a field: a
// missing unit is null (never "eve", never "?"), a missing cost is null.

import type { EveState, JobResult, JobRow, PendingConfirm } from "@shared/contract";
import type { ChatView, SeenJobFrame } from "../deck/types";
import { pad2 } from "../deck/format";

/** The five statuses v0.1 emits, in ladder order. Anything else is rendered raw. */
export const STATUS_LADDER = ["queued", "running", "in_approvals", "done", "failed"] as const;

export function normStatus(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** "in flight" = queued | running | in_approvals — CONTRACT §1, "Counting". */
export function isInFlight(status: string | null | undefined): boolean {
  const s = normStatus(status);
  return s === "queued" || s === "running" || s === "in_approvals";
}

export function isTerminal(status: string | null | undefined): boolean {
  const s = normStatus(status);
  return s === "done" || s === "failed";
}

export type StatTone = "run" | "gold" | "dim";

/** The chip word for a status. Gold is "hot", never red: red is the confirm tier's. */
export function statusWord(status: string | null | undefined): string {
  const s = normStatus(status);
  if (s === "running") return "● RUNNING";
  if (s === "in_approvals") return "NEEDS YOU";
  if (s === "queued") return "QUEUED";
  if (s === "done") return "DONE";
  if (s === "failed") return "FAILED";
  return s ? s.replace(/_/g, " ").toUpperCase() : "—";
}

export function statusTone(status: string | null | undefined): StatTone {
  const s = normStatus(status);
  if (s === "running" || s === "done") return "run";
  if (s === "in_approvals" || s === "failed") return "gold";
  return "dim";
}

/** The roster key on a row, or null. v0.1 always sets `unit`; an older brain
 *  set only `agent`. Neither present → null, rendered as a dash. No default. */
export function unitOf(j: Pick<JobRow, "unit" | "agent">): string | null {
  const u = (j.unit ?? j.agent ?? "").trim();
  return u ? u : null;
}

/** "justice-league" -> "JUSTICE LEAGUE". A reformat of the real key, not a name. */
export function humanise(id: string): string {
  return id.replace(/[-_]+/g, " ").toUpperCase();
}

export interface JobsView {
  /** Newest first. Empty when nothing is known. */
  rows: JobRow[];
  /** true when the brain served no `jobs` key at all (older brain, degraded
   *  return, or offline) AND no frame has opened a row. Counters dash on it. */
  absent: boolean;
  /** `jobsWindow.error` when the brain said its jobs read failed. */
  error: string | null;
}

function rowFromFrame(f: SeenJobFrame): JobRow {
  const j = f.frame;
  return {
    id: j.id,
    unit: j.unit,
    agent: j.unit,
    title: j.title,
    status: j.status,
    host: j.host,
    why: j.why ?? null,
    tier: j.tier ?? null,
    confirm_id: j.confirmId ?? null,
    created_at: f.at,
  };
}

function createdMs(j: JobRow): number {
  const t = j.created_at ? Date.parse(j.created_at) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Merge the poll and the frames. `fetchedAt` is when the poll landed; a frame
 * stamped after it may advance a row, a frame stamped before it may not.
 */
export function jobsView(
  state: EveState,
  fetchedAt: string | null,
  frames: SeenJobFrame[] = [],
): JobsView {
  if (!state.online) return { rows: [], absent: true, error: null };
  const polled = state.jobs;
  const map = new Map<string, JobRow>();
  for (const r of polled ?? []) if (r && typeof r.id === "string") map.set(r.id, r);

  const pollT = fetchedAt ? Date.parse(fetchedAt) : NaN;
  for (const f of frames) {
    const id = f.frame.id;
    const cur = map.get(id);
    if (!cur) {
      map.set(id, rowFromFrame(f));
      continue;
    }
    const at = Date.parse(f.at);
    if (Number.isFinite(pollT) && Number.isFinite(at) && at <= pollT) continue;
    map.set(id, {
      ...cur,
      status: f.frame.status,
      unit: f.frame.unit || cur.unit,
      title: cur.title || f.frame.title,
      host: f.frame.host || cur.host,
      why: f.frame.why ?? cur.why,
      tier: f.frame.tier ?? cur.tier,
      confirm_id: f.frame.confirmId ?? cur.confirm_id,
    });
  }

  const rows = [...map.values()].sort((a, b) => createdMs(b) - createdMs(a));
  return {
    rows,
    absent: polled === undefined && rows.length === 0,
    error: state.jobsWindow?.error ?? null,
  };
}

export interface JobCounts {
  running: number;
  /** in_approvals — waiting on his thumb. */
  waiting: number;
  /** queued — opened, not yet picked up. */
  held: number;
  failed: number;
  inFlight: number;
}

export function jobCounts(rows: JobRow[]): JobCounts {
  const c: JobCounts = { running: 0, waiting: 0, held: 0, failed: 0, inFlight: 0 };
  for (const j of rows) {
    const s = normStatus(j.status);
    if (s === "running") c.running += 1;
    else if (s === "in_approvals") c.waiting += 1;
    else if (s === "queued") c.held += 1;
    else if (s === "failed") c.failed += 1;
    if (isInFlight(s)) c.inFlight += 1;
  }
  return c;
}

/** "4M 12S" / "1H 03M" / "—". Only ever arithmetic on two real stamps. */
export function elapsed(fromIso: string | null | undefined, toIso: string | null | undefined, nowMs: number): string {
  if (!fromIso) return "—";
  const a = Date.parse(fromIso);
  if (!Number.isFinite(a)) return "—";
  const b = toIso ? Date.parse(toIso) : nowMs;
  if (!Number.isFinite(b)) return "—";
  const s = Math.max(0, Math.floor((b - a) / 1000));
  if (s < 60) return `${s}S`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}M ${pad2(s % 60)}S`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}H ${pad2(m % 60)}M`;
  return `${Math.floor(h / 24)}D ${pad2(h % 24)}H`;
}

/** The card a job is waiting on: by the row's confirm_id first, then by the
 *  card's own jobId (CONTRACT §5). Null when neither matches. */
export function confirmFor(job: JobRow, confirms: PendingConfirm[]): PendingConfirm | null {
  if (job.confirm_id) {
    const byId = confirms.find((c) => c.id === job.confirm_id);
    if (byId) return byId;
  }
  return confirms.find((c) => c.jobId === job.id) ?? null;
}

/** Every pending card this window knows about — the poll's list and the ones
 *  that arrived on a frame — deduped by id. Same union App.tsx builds. */
export function pendingConfirmsOf(state: EveState, chat: Pick<ChatView, "messages">): PendingConfirm[] {
  const seen = new Set<string>();
  const out: PendingConfirm[] = [];
  const all = [...chat.messages.flatMap((m) => m.confirms ?? []), ...(state.online ? state.pendingConfirms ?? [] : [])];
  for (const c of all) {
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** "$0.4172" for a measured spend; null for unmeasured. Never "$0.00" for null. */
export function costLabel(cost: number | null | undefined): string | null {
  if (cost === null || cost === undefined || !Number.isFinite(cost)) return null;
  return `$${cost.toFixed(4)}`;
}

/** Read the result union without trusting it: an unknown `kind` is shown raw. */
export function resultKind(r: JobResult | null | undefined): string | null {
  if (!r || typeof r !== "object" || typeof (r as { kind?: unknown }).kind !== "string") return null;
  return (r as { kind: string }).kind;
}
