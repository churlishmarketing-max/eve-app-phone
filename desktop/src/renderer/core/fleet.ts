// THE FLEET TRUTH — owning stream: THE CORE (P1 v0.2 hub half).
//
// THE ONE THING ON THIS SCREEN IT WOULD BE WORST TO GET WRONG.
//
// v1 of this file carried a five-name executable set in a constant, because
// nothing on the wire said which units could run. That is over. The brain now
// serves `/state.fleet` (CONTRACT-v0.1 §2, §v0.2.1) behind the bearer gate:
// every unit, with a BADGE the brain's own registry computed — RUNNABLE, DESK,
// WORKSPACE_ONLY — a `live` bit that says whether the runner is reachable from
// that brain right now, and (v0.2) the runner `kind`, the brain's default
// `pinned` flag, the `triggers` line and the unit's default `tier`. This
// module reads that block and adds nothing to it. There is no local list of
// names; a strip that knew names the brain did not would be a strip that lies.
//
// FIVE RULES:
//
//   1. A SOLID CARD IS A PROMISE THAT dispatch_unit(key) RUNS SOMETHING. Only
//      badge RUNNABLE gets one. DESK and WORKSPACE_ONLY wear the shipped dashed
//      no-execution dress (.node.future), whatever their names are.
//   2. THE CHIP IS THE JOB STATE; THE DOT IS READINESS. Chip from jobs[] filtered
//      by unit (running > needs you > held > failed > done > idle). Dot: pulsing
//      teal while a job runs, steady teal for a runnable unit whose runner is
//      live, grey for a runnable unit whose runner is NOT (Pennyworth with the
//      OS unwired), and the dashed hollow for anything with no runner at all.
//   3. THE CARDS ARE THE PINNED UNITS, AT MOST EIGHT. v0.2: the brain's
//      `pinned` default, overridden by his local pins (pins.ts), runnable
//      first, then by activity, then in the brain's order. If nothing at all is
//      pinned the strip falls back to the RUNNABLE set, same cap, and SAYS so.
//      One terminal card carries the rest as a REAL number computed from the
//      array, and it is the door to the FLEET tab (key 6).
//   4. NO FLEET BLOCK = NO ANSWER, NEVER ZEROS. An older brain, a degraded
//      return, or the link being down all produce the same honest state: a
//      header that says so and one dashed card that says why.
//   5. LAST RUN READS THE JOBS FIRST. The newest job for the unit in the merged
//      24 h view wins; the brain's own `lastRunAt` is the fallback; neither is
//      a dash. Both are the same fact from two doors, and the one this window
//      has actually watched move is the fresher.
//
// AND THE LOAD BAR STAYS DELETED. Still no progress field on the wire.

import type { EveState, FleetUnitRow } from "@shared/contract";
import { agentCode, clockStr } from "../deck/format";
import { normStatus, unitOf, type JobsView } from "./jobs";
import { NO_PINS, isPinned, type PinOverrides } from "./pins";

export { humanise } from "./jobs";

/** How many unit cards the strip draws before the "+N ON ROSTER" card. */
export const STRIP_CARDS = 8;

export type UnitTone = "run" | "gold" | "dim";
/** live = pulsing (a job is running) · ready = steady teal (runner reachable) ·
 *  idle = grey (runnable, runner unreachable) · none = dashed hollow (no runner). */
export type UnitDot = "live" | "ready" | "idle" | "none";
export type UnitKind = "worker" | "tool" | "skill" | null;

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
  /** "SINCE 13:51" off the newest job for the unit, else fleet.units[].lastRunAt, else a dash. */
  lastRun: string;
  /** The instant behind `lastRun`, or null. */
  lastRunMs: number | null;
  /** true -> .node.future, the shipped dashed "no execution path" dress. */
  future: boolean;
  /** The unit's own runner is reachable right now (fleet.units[].live). */
  live: boolean;
  division: string;
  /** For ordering: 0 = nothing happening. */
  heat: number;
  /** v0.2 — runner kind; null for WORKSPACE_ONLY; null too on a v0.1 brain. */
  kind: UnitKind;
  /** v0.2 — the brain's default pin. false on a v0.1 brain. */
  pinnedDefault: boolean;
  /** The EFFECTIVE pin: the brain's default through his local overrides. */
  pinned: boolean;
  /** v0.2 — " · "-joined trigger phrases; "" when the brain has none. */
  triggers: string;
  /** v0.2 — the unit's default tier, or null (WORKSPACE_ONLY, or a v0.1 brain). */
  tier: string | null;
}

export interface RosterGroup {
  division: string;
  units: FleetUnit[];
}

export interface KindCounts {
  worker: number;
  tool: number;
  skill: number;
}

export type FleetView =
  | { kind: "offline" }
  | { kind: "absent" }
  | {
      kind: "ready";
      registered: number;
      dispatchable: number;
      workspaceOnly: number;
      desk: number;
      /** Units pinned after his overrides. */
      pinnedCount: number;
      /** Runner kinds, counted from the rows; null when no row carries `kind` (a v0.1 brain). */
      kinds: KindCounts | null;
      source: string;
      at: string;
      /** The cards the strip draws, in order. */
      cards: FleetUnit[];
      /** true when nothing is pinned and the cards are the RUNNABLE fallback. */
      fallback: boolean;
      /** Everything not on a card. */
      rest: FleetUnit[];
      /** The whole fleet, division-grouped, for the FLEET tab. */
      groups: RosterGroup[];
      /** Every unit in the brain's order. */
      units: FleetUnit[];
    };

function badgeWord(b: string): string {
  return b.replace(/_/g, " ").toUpperCase();
}

function kindOf(u: FleetUnitRow): UnitKind {
  return u.kind === "worker" || u.kind === "tool" || u.kind === "skill" ? u.kind : null;
}

function toUnit(u: FleetUnitRow, jobs: JobsView, pins: PinOverrides): FleetUnit {
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

  // Rule 5: the newest job this window knows of wins; the brain's stamp is the
  // fallback. Neither is guessed — both are real instants or nothing.
  let lastRunMs: number | null = null;
  for (const j of mine) {
    const t = j.created_at ? Date.parse(j.created_at) : NaN;
    if (Number.isFinite(t) && (lastRunMs === null || t > lastRunMs)) lastRunMs = t;
  }
  if (lastRunMs === null) {
    const t = u.lastRunAt ? Date.parse(u.lastRunAt) : NaN;
    if (Number.isFinite(t)) lastRunMs = t;
  }

  const pinnedDefault = u.pinned === true;
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
    lastRun: lastRunMs === null ? "—" : `SINCE ${clockStr(new Date(lastRunMs))}`,
    lastRunMs,
    future: !runnable,
    live: u.live,
    division: u.division ?? "—",
    heat,
    kind: kindOf(u),
    pinnedDefault,
    pinned: isPinned(u.key, pinnedDefault, pins),
    triggers: typeof u.triggers === "string" ? u.triggers : "",
    tier: runnable && typeof u.tier === "string" && u.tier ? u.tier : null,
  };
}

/**
 * Rule 3, as a pure function the harness can hold to account. The pool is the
 * pinned units, or — when nothing at all is pinned — the RUNNABLE units.
 * Order: runnable before name-only, then hotter first, then the brain's own
 * order, so the same fleet draws the same strip twice.
 */
export function selectCards(units: FleetUnit[], cap = STRIP_CARDS): { cards: FleetUnit[]; fallback: boolean } {
  const pinned = units.filter((u) => u.pinned);
  const fallback = pinned.length === 0;
  const pool = fallback ? units.filter((u) => !u.future) : pinned;
  const cards = pool
    .map((u, i) => ({ u, i }))
    .sort((a, b) => Number(a.u.future) - Number(b.u.future) || b.u.heat - a.u.heat || a.i - b.i)
    .map((x) => x.u)
    .slice(0, cap);
  return { cards, fallback };
}

/**
 * The whole strip, from the fleet block, the merged jobs view and his local
 * pins. Offline and no-block are distinct states with distinct words; neither
 * carries a number.
 */
export function fleetView(state: EveState, jobs: JobsView, pins: PinOverrides = NO_PINS): FleetView {
  if (!state.online) return { kind: "offline" };
  const f = state.fleet;
  if (!f || !Array.isArray(f.units)) return { kind: "absent" };

  const units = f.units.map((u) => toUnit(u, jobs, pins));
  const { cards, fallback } = selectCards(units);
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

  // Every number is computed from the array the brain served. The brain's own
  // figures are carried only when they agree; if they ever disagree the ARRAY
  // wins, because it is the thing actually drawn.
  const registered = units.length;
  const dispatchable = units.filter((u) => u.badge === "RUNNABLE").length;
  const desk = units.filter((u) => u.badge === "DESK").length;
  const workspaceOnly = units.filter((u) => u.badge === "WORKSPACE_ONLY").length;
  const pinnedCount = units.filter((u) => u.pinned).length;

  let kinds: KindCounts | null = null;
  for (const u of units) {
    if (!u.kind) continue;
    if (!kinds) kinds = { worker: 0, tool: 0, skill: 0 };
    kinds[u.kind] += 1;
  }

  return {
    kind: "ready",
    registered,
    dispatchable,
    workspaceOnly,
    desk,
    pinnedCount,
    kinds,
    source: typeof f.source === "string" ? f.source : "—",
    at: typeof f.at === "string" ? f.at : "",
    cards,
    fallback,
    rest,
    groups,
    units,
  };
}

/** The provenance word for the header tag. Read the true source, never assume it. */
export function sourceWord(source: string): string {
  if (source === "os") return "OS LIVE";
  if (source === "bundled") return "BUNDLED COPY";
  return source && source !== "—" ? source.toUpperCase() : "—";
}

/** "4 WORKERS · 1 TOOL · 37 SKILLS" — only the kinds that are actually there. */
export function kindsLine(k: KindCounts | null): string {
  if (!k) return "";
  return (
    [
      [k.worker, "WORKER", "WORKERS"],
      [k.tool, "TOOL", "TOOLS"],
      [k.skill, "SKILL", "SKILLS"],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join(" · ");
}
