// THE FLEET TRUTH — owning stream: THE CORE (P1 v0.1 hub half).
//
// THE ONE THING ON THIS SCREEN IT WOULD BE WORST TO GET WRONG.
//
// v1 of this file carried a five-name executable set in a constant, because
// nothing on the wire said which units could run. That is over. The brain now
// serves `/state.fleet` (CONTRACT-v0.1 §2) behind the bearer gate: every unit,
// with a BADGE the brain's own registry computed — RUNNABLE, DESK,
// WORKSPACE_ONLY — and a `live` bit that says whether the runner is reachable
// from that brain right now. This module reads that block and adds nothing to
// it. There is no local list of names any more; a strip that knew names the
// brain did not would be a strip that lies.
//
// FOUR RULES, RESTATED FOR THE NEW SOURCE:
//
//   1. A SOLID CARD IS A PROMISE THAT dispatch_unit(key) RUNS SOMETHING. Only
//      badge RUNNABLE gets one. DESK and WORKSPACE_ONLY wear the shipped dashed
//      no-execution dress (.node.future), whatever their names are.
//   2. THE CHIP IS THE JOB STATE; THE DOT IS READINESS. Chip from jobs[] filtered
//      by unit (running > needs you > held > failed > done > idle). Dot: pulsing
//      teal while a job runs, steady teal for a runnable unit whose runner is
//      live, grey for a runnable unit whose runner is NOT (Pennyworth with the
//      OS unwired), and the dashed hollow for anything with no runner at all.
//   3. EIGHT CARDS, NOT FIFTY-TWO. The strip shows the units with live state
//      plus every RUNNABLE unit, capped, then ONE terminal card that says how
//      many more are on the roster — a REAL number now, computed from the
//      array, because the roster crosses the wire. Click it and the whole
//      roster opens under the strip, division-grouped, every row badged.
//   4. NO FLEET BLOCK = NO ANSWER, NEVER ZEROS. An older brain, a degraded
//      return, or the link being down all produce the same honest state: a
//      header that says so and one dashed card that says why.
//
// AND THE LOAD BAR STAYS DELETED. Still no progress field on the wire. What
// replaces it is `lastRunAt` — when the unit last picked something up inside
// the 24 h window, or a dash.

import type { EveState, FleetUnitRow } from "@shared/contract";
import { agentCode, clockStr } from "../deck/format";
import { normStatus, unitOf, type JobsView } from "./jobs";

export { humanise } from "./jobs";

/** How many unit cards the strip draws before the "+N ON ROSTER" card. */
export const STRIP_CARDS = 8;

export type UnitTone = "run" | "gold" | "dim";
/** live = pulsing (a job is running) · ready = steady teal (runner reachable) ·
 *  idle = grey (runnable, runner unreachable) · none = dashed hollow (no runner). */
export type UnitDot = "live" | "ready" | "idle" | "none";

export interface FleetUnit {
  /** React key + the roster key dispatch_unit() would be given. */
  id: string;
  /** 2-letter job code, from deck/format.ts's own map (or derived from the key). */
  code: string;
  /** The roster name, as the brain spelled it. */
  name: string;
  /** The roster's one-line job. */
  role: string;
  /** RUNNABLE | DESK | WORKSPACE_ONLY — the brain's badge, verbatim. */
  badge: string;
  /** The badge, spelled for the card ("WORKSPACE ONLY"). */
  badgeWord: string;
  /** The state chip's words, derived from jobs[] for this unit. */
  status: string;
  statusTone: UnitTone;
  dot: UnitDot;
  /** "SINCE 13:51" off fleet.units[].lastRunAt, or an honest absence. */
  lastRun: string;
  /** true -> .node.future, the shipped dashed "no execution path" dress. */
  future: boolean;
  /** The unit's own runner is reachable right now (fleet.units[].live). */
  live: boolean;
  division: string;
  /** For ordering: 0 = nothing happening. */
  heat: number;
}

export interface RosterGroup {
  division: string;
  units: FleetUnit[];
}

export type FleetView =
  | { kind: "offline" }
  | { kind: "absent" }
  | {
      kind: "ready";
      registered: number;
      dispatchable: number;
      source: string;
      at: string;
      /** The cards the strip draws, in order. */
      cards: FleetUnit[];
      /** Everything not on a card. */
      rest: FleetUnit[];
      /** The whole fleet, division-grouped, for the roster panel. */
      groups: RosterGroup[];
    };

function badgeWord(b: string): string {
  return b.replace(/_/g, " ").toUpperCase();
}

function toUnit(u: FleetUnitRow, jobs: JobsView): FleetUnit {
  const runnable = u.badge === "RUNNABLE";
  const mine = jobs.rows.filter((j) => unitOf(j) === u.key);
  const has = (s: string) => mine.some((j) => normStatus(j.status) === s);
  const held = mine.filter((j) => normStatus(j.status) === "queued").length;

  let status: string;
  let statusTone: UnitTone = "dim";
  let dot: UnitDot = runnable ? (u.live ? "ready" : "idle") : "none";
  let heat = 0;

  if (has("running")) {
    status = "● RUNNING";
    statusTone = "run";
    if (runnable) dot = "live";
    heat = 6;
  } else if (has("in_approvals")) {
    status = "NEEDS YOU";
    statusTone = "gold";
    heat = 5;
  } else if (held > 0) {
    status = `${held} QUEUED`;
    statusTone = "gold";
    heat = 4;
  } else if (has("failed")) {
    status = "FAILED 24H";
    statusTone = "gold";
    heat = 3;
  } else if (has("done")) {
    status = "DONE 24H";
    statusTone = "run";
    heat = 2;
  } else if (runnable && !u.live) {
    status = "NEEDS WIRING";
    heat = 1;
  } else if (runnable) {
    status = "IDLE";
    heat = 1;
  } else if (u.badge === "DESK") {
    status = "DESK — NOT WIRED";
  } else {
    status = "NO RUNNER HERE";
  }

  const lastAt = u.lastRunAt ? Date.parse(u.lastRunAt) : NaN;
  return {
    id: u.key,
    code: agentCode(u.key),
    name: u.name,
    role: u.role,
    badge: u.badge,
    badgeWord: badgeWord(u.badge),
    status,
    statusTone,
    dot,
    lastRun: Number.isFinite(lastAt) ? `SINCE ${clockStr(new Date(lastAt))}` : "—",
    future: !runnable,
    live: u.live,
    division: u.division ?? "—",
    heat,
  };
}

/**
 * The whole strip, from the fleet block and the merged jobs view. Offline and
 * no-block are distinct states with distinct words; neither carries a number.
 */
export function fleetView(state: EveState, jobs: JobsView): FleetView {
  if (!state.online) return { kind: "offline" };
  const f = state.fleet;
  if (!f || !Array.isArray(f.units)) return { kind: "absent" };

  const units = f.units.map((u) => toUnit(u, jobs));

  // Cards: anything with live state, then every RUNNABLE unit, capped. Stable
  // within a heat band so the same fleet draws the same strip twice.
  const ranked = units
    .map((u, i) => ({ u, i }))
    .sort((a, b) => b.u.heat - a.u.heat || a.i - b.i)
    .map((x) => x.u);
  const cards = ranked.filter((u) => u.heat > 0 || !u.future).slice(0, STRIP_CARDS);
  const onCard = new Set(cards.map((u) => u.id));
  const rest = units.filter((u) => !onCard.has(u.id));

  const byDiv = new Map<string, FleetUnit[]>();
  for (const u of units) {
    const k = u.division;
    const list = byDiv.get(k);
    if (list) list.push(u);
    else byDiv.set(k, [u]);
  }
  const groups: RosterGroup[] = [...byDiv.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([division, us]) => ({ division, units: us }));

  // Both numbers are computed from the array the brain served. The brain's own
  // figures are carried only when they agree; if they ever disagree the ARRAY
  // wins, because it is the thing actually drawn.
  const registered = units.length;
  const dispatchable = units.filter((u) => u.badge === "RUNNABLE").length;

  return {
    kind: "ready",
    registered,
    dispatchable,
    source: typeof f.source === "string" ? f.source : "—",
    at: typeof f.at === "string" ? f.at : "",
    cards,
    rest,
    groups,
  };
}

/** The provenance word for the header tag. Read the true source, never assume it. */
export function sourceWord(source: string): string {
  if (source === "os") return "OS LIVE";
  if (source === "bundled") return "BUNDLED COPY";
  return source && source !== "—" ? source.toUpperCase() : "—";
}
