// THE COUNTERS — owning stream: THE CORE.
//
// THE HONESTY LAW, APPLIED FIGURE BY FIGURE. This module is the only place on
// the screen that turns state into a number, so it is the only place that can
// lie. Every function below either names a field it read or returns a dash.
//
// WHAT THE CORE'S OWN RAIL ASKED FOR, AND WHAT HAPPENED TO IT
// -----------------------------------------------------------
//   LEADS +40      nothing counts leads. No CRM connector exists.      DELETED
//   CLIPS 12       no clip or asset field anywhere on the wire.        DELETED
//   SPEND $0.14    no cost, token or billing field anywhere.           DELETED
//   ANGLES 7       nothing.                                           DELETED
//   TRIBUNAL 1     derivable, but "tribunal" is a concept the brain
//                  does not emit; a row must be labelled by what it
//                  actually counts.                                   DELETED
//   DRAFTS 2       state.attentionItems where ref carries a draft —
//                  the exact test OpsPane.tsx:101 already runs.        KEPT
//   SILENT 12D     state.clients days_quiet vs cadence_days —
//                  the exact test OpsPane.tsx:160 already runs.        KEPT (split in two)
//   QUIET IN 6H23M config.quietHours is a BOOLEAN; the 21:30-06:30
//                  window is a client-side string literal in another
//                  stream's file. Counting down against a duplicated
//                  literal is arithmetic on a guess.                   REDUCED TO ON/OFF
//
// Five replacements, every one of them already computed elsewhere in this app,
// so nothing here is a new claim: RED WAITING, APPROVALS, IN FLIGHT, WIRE,
// FLOOR.
//
// AND THE ONE RULE UNDER ALL OF IT: offline is a DASH, never a zero. A zero is
// a measurement. A dash is the truth when nothing was measured.

import type { EveState, Health } from "@shared/contract";

export type Tone = "acc" | "hot" | "red" | "off";

export interface Counter {
  key: string;
  label: string;
  value: string;
  tone: Tone;
}

export const DASH = "—";

/**
 * MEMORY — one reading, shared by the telemetry strip and the readout so the
 * two cells can never disagree. memoryReady is a boolean on /health; there is
 * no embedding count on the wire, so THE CORE's "VECTORS 1,204" cannot be
 * honoured and is not faked.
 *
 *   null                          not asked yet            —          off
 *   online:false / no memoryReady asked, /health failed    NO ANSWER  off
 *   memoryReady: true             measured                 READY      acc
 *   memoryReady: false            measured                 DOWN       hot
 *
 * The second row is the one that matters: api.ts resolves a failed GET /health
 * to { online:false, ok:false, error } with memoryReady ABSENT. Absent is not
 * false. Printing DOWN there would assert a measurement nobody took.
 */
export function memoryCell(health: Health | null): { value: string; tone: Tone } {
  if (!health) return { value: DASH, tone: "off" };
  if (!health.online || health.memoryReady === undefined) return { value: "NO ANSWER", tone: "off" };
  return health.memoryReady ? { value: "READY", tone: "acc" } : { value: "DOWN", tone: "hot" };
}

/** Connectors: how many are up, out of how many the brain reported. */
export function wireCount(state: EveState): { live: number; total: number } {
  const cs = state.connectors ?? [];
  return { live: cs.filter((c) => c.connected).length, total: cs.length };
}

/** Attention items whose ref carries a prepared draft (OpsPane.tsx:101). */
export function draftCount(state: EveState): number {
  return (state.attentionItems ?? []).filter(
    (a) => a.ref !== null && typeof a.ref === "object" && "draft" in (a.ref as object),
  ).length;
}

/** Clients past their own cadence, and the worst days_quiet among them. */
export function quietPulse(state: EveState): { past: number; worst: number | null } {
  let past = 0;
  let worst: number | null = null;
  for (const c of state.clients ?? []) {
    const q = c.days_quiet;
    if (q === null || q === undefined) continue;
    if (worst === null || q > worst) worst = q;
    if (q > c.cadence_days) past += 1;
  }
  return { past, worst };
}

/**
 * THE WIRE — LIVE COUNTERS. Eight rows, eight named sources.
 * Offline returns the same eight rows with every value dashed, so the rail does
 * not change shape when her brain drops — it just stops claiming things.
 */
export function railCounters(state: EveState): Counter[] {
  const online = state.online;
  const off = (key: string, label: string): Counter => ({ key, label, value: DASH, tone: "off" });
  if (!online) {
    return [
      off("red", "RED WAITING"),
      off("appr", "APPROVALS"),
      off("draft", "DRAFTS READY"),
      off("jobs", "IN FLIGHT"),
      off("past", "PAST CADENCE"),
      off("quiet", "WORST QUIET"),
      off("wire", "WIRE"),
      off("floor", "FLOOR"),
    ];
  }

  const reds = (state.pendingConfirms ?? []).length;
  const appr = (state.attentionItems ?? []).length;
  const drafts = draftCount(state);
  const jobs = (state.jobs ?? []).length;
  const { past, worst } = quietPulse(state);
  const wire = wireCount(state);
  const floor = state.floor;

  return [
    // RED is the confirm tier: this row is one of the two places red is lawful.
    // It is 9px type, so it wears --redInk and not the law hex.
    { key: "red", label: "RED WAITING", value: String(reds), tone: reds > 0 ? "red" : "acc" },
    { key: "appr", label: "APPROVALS", value: String(appr), tone: appr > 0 ? "hot" : "acc" },
    { key: "draft", label: "DRAFTS READY", value: String(drafts), tone: "acc" },
    { key: "jobs", label: "IN FLIGHT", value: String(jobs), tone: "acc" },
    // Past cadence is HOT, and hot is gold. Never red — that ruling is already
    // written into .t3row.due and the client-pulse rows.
    { key: "past", label: "PAST CADENCE", value: String(past), tone: past > 0 ? "hot" : "acc" },
    {
      key: "quiet",
      label: "WORST QUIET",
      value: worst === null ? DASH : `${worst}D`,
      tone: worst === null ? "off" : past > 0 ? "hot" : "acc",
    },
    {
      key: "wire",
      label: "WIRE",
      value: wire.total === 0 ? DASH : `${wire.live}/${wire.total}`,
      tone: wire.total === 0 ? "off" : wire.live < wire.total ? "hot" : "acc",
    },
    {
      key: "floor",
      label: "FLOOR",
      value: floor ? `${floor.count}/${floor.goal}` : DASH,
      tone: floor ? "acc" : "off",
    },
  ];
}

/**
 * THE TELEMETRY STRIP. Seven cells; the seventh is right-pinned.
 * `health` is GET /health and may be null before the first answer — in which
 * case the two cells that read it say so rather than guessing.
 */
export function telemetryCells(
  state: EveState,
  health: Health | null,
  quietHours: boolean,
): Counter[] {
  const online = state.online;
  const reds = (state.pendingConfirms ?? []).length;
  const jobs = (state.jobs ?? []).length;
  const wire = wireCount(state);
  const floor = state.floor;

  return [
    {
      key: "link",
      label: "LINK",
      value: online ? "ONLINE" : "DOWN",
      tone: online ? "acc" : "red",
    },
    {
      key: "floor",
      label: "SALES FLOOR",
      value: online && floor ? `${floor.count}/${floor.goal}` : DASH,
      tone: online && floor ? "acc" : "off",
    },
    {
      key: "red",
      label: "RED WAITING",
      value: online ? String(reds) : DASH,
      tone: !online ? "off" : reds > 0 ? "red" : "acc",
    },
    {
      key: "jobs",
      label: "IN FLIGHT",
      value: online ? String(jobs) : DASH,
      tone: online ? "acc" : "off",
    },
    {
      key: "wire",
      label: "WIRE",
      value: online && wire.total > 0 ? `${wire.live}/${wire.total}` : DASH,
      tone: !online || wire.total === 0 ? "off" : wire.live < wire.total ? "hot" : "acc",
    },
    // See memoryCell: a failed /health is NO ANSWER, never DOWN.
    { key: "mem", label: "MEMORY", ...memoryCell(health) },
    {
      key: "quiet",
      label: "QUIET HOURS",
      // config.quietHours is computed main-side and is a boolean. A countdown
      // would be arithmetic against a window this file cannot read.
      value: quietHours ? "ON" : "OFF",
      tone: quietHours ? "hot" : "acc",
    },
  ];
}
