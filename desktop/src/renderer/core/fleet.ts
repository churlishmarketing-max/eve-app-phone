// THE FLEET TRUTH — owning stream: THE CORE.
//
// THE ONE THING ON THIS SCREEN IT WOULD BE WORST TO GET WRONG.
//
// THE CORE's board draws eight agent cards, all identical, all with a live dot,
// a state chip and a 0-100% load bar. The roster behind this app has ~50 names.
// A strip that draws a card per name says "these all run"; a strip that draws a
// load bar says "and here is how hard each one is working". Neither is true.
//
// WHAT IS ACTUALLY TRUE, established from the code and not from the roster:
// src/renderer/deck/format.ts's AGENT_CODES is the app's own map of agent ids to
// job codes, and it holds FIVE — eve, research, jsa, justice-league,
// suicide-squad. window.eve.dispatch(task, agent?) takes a free string, so the
// wire will ACCEPT any of the fifty names; the brain will do nothing with the
// other forty-five. A card that looks dispatchable but is not is worse than no
// card at all.
//
// SO THE STRIP OBEYS THREE RULES:
//
//   1. A CARD IS A PROMISE THAT A JOB CAN BE GIVEN HERE. Only the five ids in
//      the executable set get a solid card with a live dot.
//   2. HALF-WIRED WEARS THE SHIPPED HALF-WIRED DRESS. Pennyworth is not an
//      agent id — it reaches this app only as half of the Churlish OS
//      connector's role string ("board · pennyworth"). Its card is derived FROM
//      that connector, is drawn with .node.future (the dashed border this app
//      already uses for gated nodes) and carries a hollow glyph instead of a
//      dot. If that connector is not present, the card is not drawn.
//   3. ONE TERMINAL CARD SPEAKS FOR THE REST, ONCE. THE ROSTER: dashed, no dot,
//      nine words. It carries NO numeral, because no roster manifest crosses
//      the wire and 45 or 51 would be exactly the invented figure the honesty
//      law forbids.
//
// AND THE LOAD BAR IS DELETED. There is no load, utilisation, progress or
// percentage field anywhere in shared/contract.ts. Eight percentage bars with
// no source is the literal definition of "a hub full of plausible-looking
// figures". What replaces it is the one thing that IS on the wire and is also
// the question he actually asks of an idle agent: when did it last pick
// something up (jobs[].created_at), or a dash.

import type { ConnectorStatus, EveState, JobRow } from "@shared/contract";
import { agentCode, clockStr } from "../deck/format";

/**
 * THE EXECUTABLE SET. Mirrors the keys of AGENT_CODES in deck/format.ts, which
 * is private to that module. The two-letter CODE is never spelled here — it is
 * read back through that module's own agentCode(), so the codes cannot drift
 * even though the id list is restated.
 *
 * Adding a name to this array is a claim that window.eve.dispatch(task, id)
 * reaches something that runs. Do not add one for any other reason.
 */
export const DISPATCHABLE: readonly string[] = [
  "eve",
  "research",
  "jsa",
  "justice-league",
  "suicide-squad",
];

export type UnitTone = "run" | "gold" | "dim";
export type UnitDot = "live" | "hot" | "idle" | "none";

export interface FleetUnit {
  /** React key + the string window.eve.dispatch would be given. */
  id: string;
  /** The 2-letter job code, from deck/format.ts's own map. */
  code: string;
  /** Display name: the id, humanised. Never a nickname this app cannot source. */
  name: string;
  /** The mono sub-line. For a dispatchable unit it is the literal string
   *  window.eve.dispatch() would be handed — the most useful true thing a card
   *  can say, and the one claim that cannot be wrong. Rendered with
   *  text-transform:none so the id is readable exactly as the wire spells it. */
  role: string;
  /** The state chip's words, derived from state.jobs (or "—" when offline). */
  status: string;
  statusTone: UnitTone;
  dot: UnitDot;
  /** "SINCE 13:51" off jobs[].created_at, or an honest absence. */
  lastRun: string;
  /** true -> .node.future, the shipped dashed "not all the way wired" dress. */
  future: boolean;
}

/** "justice-league" -> "JUSTICE LEAGUE". A reformat of the real id, not a name. */
export function humanise(id: string): string {
  return id.replace(/[-_]+/g, " ").toUpperCase();
}

function jobsFor(jobs: JobRow[], id: string): JobRow[] {
  // A job with no agent is hers: agentCode(null) returns "EV" in format.ts.
  return jobs.filter((j) => (j.agent ?? "eve") === id);
}

function newest(jobs: JobRow[]): string | null {
  let best: number | null = null;
  for (const j of jobs) {
    if (!j.created_at) continue;
    const t = Date.parse(j.created_at);
    if (Number.isFinite(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : clockStr(new Date(best));
}

/**
 * The Churlish OS connector, IF it names Pennyworth in its own detail string.
 * Nothing is assumed: no connector saying so means no card.
 */
export function pennyworthConnector(connectors: ConnectorStatus[]): ConnectorStatus | null {
  return connectors.find((c) => c.detail.toLowerCase().includes("pennyworth")) ?? null;
}

/**
 * The whole strip, in render order. Offline collapses every derived figure to a
 * dash — never to zero, and never to a stale-looking IDLE.
 */
export function fleetUnits(state: EveState): FleetUnit[] {
  const online = state.online;
  const jobs = state.jobs ?? [];
  const out: FleetUnit[] = [];

  for (const id of DISPATCHABLE) {
    const mine = online ? jobsFor(jobs, id) : [];
    const running = mine.find((j) => (j.status ?? "").toLowerCase() === "running");
    const approvals = mine.find((j) => (j.status ?? "").toLowerCase().includes("approval"));
    const other = mine[0];

    let status = "IDLE";
    let statusTone: UnitTone = "dim";
    let dot: UnitDot = "idle";

    if (!online) {
      status = "—";
    } else if (running) {
      status = "● RUNNING";
      statusTone = "run";
      dot = "live";
    } else if (approvals) {
      status = "IN APPROVALS";
      statusTone = "gold";
      dot = "hot";
    } else if (other) {
      status = (other.status ?? "").replace(/_/g, " ").toUpperCase() || "IN FLIGHT";
      statusTone = "gold";
      dot = "hot";
    }

    const at = newest(mine);
    out.push({
      id,
      code: agentCode(id),
      name: humanise(id),
      role: `agent: ${id}`,
      status,
      statusTone,
      dot,
      lastRun: !online ? "—" : at ? `SINCE ${at}` : mine.length > 0 ? "IN FLIGHT" : "—",
      future: false,
    });
  }

  const os = pennyworthConnector(state.connectors ?? []);
  if (os) {
    out.push({
      id: `via-${os.key}`,
      code: os.key,
      // The name comes out of the connector's own detail string, not out of a
      // roster this app cannot read.
      name: "PENNYWORTH",
      role: `reached through ${os.name}`,
      status: online ? (os.connected ? "OS LINKED" : "OS DOWN") : "—",
      statusTone: online && os.connected ? "gold" : "dim",
      dot: "none",
      lastRun: "NO DIRECT DISPATCH",
      future: true,
    });
  }

  // The one sentence of apology on the whole board, and it is nine words long.
  out.push({
    id: "the-roster",
    code: "··",
    name: "THE ROSTER",
    role: "names only — nothing dispatches here",
    status: "NO EXECUTION PATH",
    statusTone: "dim",
    dot: "none",
    lastRun: "—",
    future: true,
  });

  return out;
}
