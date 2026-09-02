import { fleetRoster, type FleetUnit } from "./fleet.js";
import * as os from "./os.js";

// THE CAPABILITY REGISTRY (D-DISPATCH §2.2). Capability is CODE, not data the
// OS can write: a registry row can only SELECT an adapter that already exists
// here (a worker doctrine, or a named tool adapter in dispatch.ts). It cannot
// name an executable, a path, or a tool grant. Doctrine text is the only thing
// a row carries that shapes behaviour, and workers hold no send tools.
//
// Adding a runnable unit = ONE ROW below. Nothing in dispatch_unit changes.
//
// Day one (v0.1): exactly the units that already had a runner — the four SDK
// personas that used to live in dispatch.ts as PERSONAS, plus pennyworth on
// the existing os_draft_email → os_send_pending_email pair. Five. Everything
// else on the roster is badged honestly (WORKSPACE_ONLY) and is NEVER run.

export type Badge = "RUNNABLE" | "DESK" | "WORKSPACE_ONLY";
export type Host = "brain" | "desk";

export interface WorkerRunner {
  kind: "worker";
  doctrine: string; // the subagent's system prompt
  cost: { maxTurns: number; maxBudgetUsd: number; minutes: number };
}

export interface ToolRunner {
  kind: "tool";
  adapter: "os_client_email"; // a key into dispatch.ts's TOOL_ADAPTERS — code, not data
  tier: "green" | "red"; // the tier of the job's LAST step (the send card for email)
  inputs: Array<{ name: "client"; required: boolean }>;
}

export interface Capability {
  key: string; // roster key ('pennyworth') or brain-only worker key ('research')
  name: string;
  host: Host;
  does: string; // ≤ 6 words, for the ambient line and the refusal
  runner: WorkerRunner | ToolRunner;
}

const BASE_LAW =
  "Law for every deliverable: numbers beat adjectives — a finding without a number, dollar figure, or " +
  "date is an opinion, cut it or quantify it. Never fabricate proof: no results = say so, hold labeled " +
  "space for real proof, name the fastest path to earning it. Denominators must match claims. " +
  "Convert every stated timeline into the REALIZED timeline (price in the lag). Direct, concrete — " +
  "usable Monday morning without edits.";

const STD_COST = { maxTurns: 16, maxBudgetUsd: 1.5, minutes: 10 };

export const REGISTRY: readonly Capability[] = [
  {
    key: "research",
    name: "Research",
    host: "brain",
    does: "deep web research → document",
    runner: {
      kind: "worker",
      doctrine:
        "You are Churlish Media's deep-research worker, reporting to Brandon King. Sweep the topic from " +
        "multiple angles with live web search — by entity, by market, by competitor, by time — then read the " +
        "strongest sources, not just their headlines. Every claim carries its source and date inline; label " +
        "each key finding CONFIRMED (multiple independent sources) or REPORTED (single source). Prefer primary " +
        "sources over aggregators. Where sources conflict, say so and weigh them. End with a SOURCES list. " +
        BASE_LAW,
      cost: { maxTurns: 32, maxBudgetUsd: 3, minutes: 20 },
    },
  },
  {
    key: "justice-league",
    name: "Justice League",
    host: "brain",
    does: "portfolio & sequencing verdict → document",
    runner: {
      kind: "worker",
      doctrine:
        "You are the Justice League — Churlish Media's portfolio and sequencing board, advising Brandon King. " +
        "Your job is WHAT to build or sell, in WHAT order, and what to park. Rank every option by dollars and " +
        "by capacity honesty (his real hours, not aspirational ones). The pipeline outranks the build: when a " +
        "build competes with sales conversations for hours, the conversations win. Price every new idea — " +
        "buyer + number in sixty seconds or it parks itself; parked ideas enter the calendar only by " +
        "displacing something named. Every recommendation carries a pre-committed fallback trigger: if X " +
        "hasn't happened by DATE, then Y. " + BASE_LAW,
      cost: STD_COST,
    },
  },
  {
    key: "jsa",
    name: "JSA",
    host: "brain",
    does: "single-decision tribunal → verdict",
    runner: {
      kind: "worker",
      doctrine:
        "You are the JSA — Churlish Media's single-decision tribunal, ruling for Brandon King. Structure: " +
        "(1) THE QUESTION, stated as one decidable sentence; (2) THE CASE FOR — the strongest honest steelman, " +
        "with numbers; (3) THE CASE AGAINST — argued just as hard, not a strawman; (4) WHAT WOULD CHANGE THE " +
        "VERDICT — the facts that would flip it; (5) THE VERDICT — one call, plainly stated, with pre-committed " +
        "tripwires (if X hasn't happened by DATE, then Y). If the decision is really several decisions, split " +
        "them and rule on each. " + BASE_LAW,
      cost: STD_COST,
    },
  },
  {
    key: "suicide-squad",
    name: "Suicide Squad",
    host: "brain",
    does: "adversarial teardown → document",
    runner: {
      kind: "worker",
      doctrine:
        "You are the Suicide Squad — Churlish Media's adversarial teardown unit, attacking Brandon King's own " +
        "plans and assets before an enemy does. Attack like a well-funded competitor: what would they clone, " +
        "undercut, or outspend? Hunt ABSENCES, not just flaws — what's missing entirely is where the money is, " +
        "especially the target's own stated rules it isn't following. Rank every finding by dollars left on " +
        "the table. Deliver the sting WITH the fix: if nothing stings, the analysis failed; if nothing's " +
        "actionable Monday morning, it also failed. " + BASE_LAW,
      cost: STD_COST,
    },
  },
  {
    key: "pennyworth",
    name: "Pennyworth",
    host: "brain",
    does: "client email: OS draft → RED send card",
    runner: {
      kind: "tool",
      adapter: "os_client_email",
      tier: "red",
      inputs: [{ name: "client", required: true }],
    },
  },
];

const byKey = new Map(REGISTRY.map((c) => [c.key, c]));

export function capability(key: string): Capability | undefined {
  return byKey.get(key);
}

export function runnable(): readonly Capability[] {
  return REGISTRY;
}

export function badgeFor(key: string): Badge {
  const cap = byKey.get(key);
  if (!cap) return "WORKSPACE_ONLY";
  return cap.host === "desk" ? "DESK" : "RUNNABLE";
}

/** Is this unit's runner wired and reachable from THIS brain right now? */
export function runnerLive(key: string): boolean {
  const cap = byKey.get(key);
  if (!cap) return false;
  if (cap.runner.kind === "tool") return os.ready();
  return true; // SDK workers ride the same credentials the chat loop already uses
}

// "Perry White" / "perry_white" / " PERRY-WHITE " → "perry-white". Also
// resolves a roster NAME or ALIAS word-for-word to its key so "Pennyworth"
// works. Never fuzzy — a near-miss is an unknown unit, and an unknown unit is
// a spoken error, not a guess.
export function resolveUnitKey(input: string, roster: readonly FleetUnit[]): string {
  const norm = input.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/^the-/, "");
  if (byKey.has(norm)) return norm;
  const direct = roster.find((u) => u.key === norm);
  if (direct) return direct.key;
  const byName = roster.find((u) => u.name.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/^the-/, "") === norm);
  return byName ? byName.key : norm;
}

export interface DispatchRefusal {
  ok: false;
  code: "unit_unknown" | "unit_not_runnable" | "missing_input" | "spine_offline" | "run_failed";
  unit: string;
  name?: string;
  badge?: Badge;
  say: string; // the sentence she speaks — verbatim is fine
  runnable: Array<{ key: string; name: string; does: string }>;
}

function runnableList(): DispatchRefusal["runnable"] {
  return REGISTRY.map((c) => ({ key: c.key, name: c.name, does: c.does }));
}

function runnableSentence(): string {
  return REGISTRY.map((c) => `${c.key} (${c.does})`).join(", ");
}

/** The spoken error for a unit that exists but has no runner here, or does not exist at all. */
export function refuseUnit(key: string, unit: FleetUnit | undefined): DispatchRefusal {
  const who = unit ? unit.name : `"${key}"`;
  if (!unit) {
    return {
      ok: false,
      code: "unit_unknown",
      unit: key,
      say:
        `I don't have a runner for ${who} — no unit by that name is on the roster. ` +
        `Here is who can actually do that from here: ${runnableSentence()}.`,
      runnable: runnableList(),
    };
  }
  const where = unit.loc === "CC" ? "a Claude Code unit" : unit.loc === "OS" ? "an OS-side unit" : "a workspace skill";
  const trigger = unit.triggers ? ` (trigger: ${unit.triggers})` : "";
  return {
    ok: false,
    code: "unit_not_runnable",
    unit: key,
    name: unit.name,
    badge: badgeFor(key),
    say:
      `I don't have a runner for ${who} — it's ${where}${trigger}, WORKSPACE_ONLY from here. ` +
      `Here is who can actually do that from here: ${runnableSentence()}.`,
    runnable: runnableList(),
  };
}

// ---- /state.fleet — the truthful door for the hub strip (D-DISPATCH §7.1) ----

export interface FleetUnitView {
  key: string;
  name: string;
  role: string;
  badge: Badge;
  live: boolean; // the runner is wired + reachable right now (false for every WORKSPACE_ONLY unit)
  roster: boolean; // false = a brain-only worker not on the OS roster (research)
  division: string;
  loc: string;
  lastRunAt?: string; // newest job created_at for this unit INSIDE the /state jobs window; absent = none
}

export interface FleetBlock {
  registered: number; // units.length
  dispatchable: number; // badge === RUNNABLE
  source: "os" | "bundled"; // where the roster membership came from this read
  at: string; // when that roster view was built
  units: FleetUnitView[];
}

export async function buildFleetBlock(jobs: ReadonlyArray<{ unit: string | null; created_at: string }>): Promise<FleetBlock> {
  const view = await fleetRoster();
  const lastRun = new Map<string, string>();
  for (const j of jobs) {
    if (!j.unit) continue;
    const prev = lastRun.get(j.unit);
    if (!prev || j.created_at > prev) lastRun.set(j.unit, j.created_at);
  }
  const units: FleetUnitView[] = view.units.map((u) => ({
    key: u.key,
    name: u.name,
    role: u.job,
    badge: badgeFor(u.key),
    live: runnerLive(u.key),
    roster: true,
    division: u.division,
    loc: u.loc,
    ...(lastRun.has(u.key) ? { lastRunAt: lastRun.get(u.key)! } : {}),
  }));
  // Brain-only workers (research) are real runners that are not roster rows.
  for (const c of REGISTRY) {
    if (units.some((u) => u.key === c.key)) continue;
    units.push({
      key: c.key,
      name: c.name,
      role: c.does,
      badge: badgeFor(c.key),
      live: runnerLive(c.key),
      roster: false,
      division: "brain-workers",
      loc: "BRAIN",
      ...(lastRun.has(c.key) ? { lastRunAt: lastRun.get(c.key)! } : {}),
    });
  }
  return {
    registered: units.length,
    dispatchable: units.filter((u) => u.badge === "RUNNABLE").length,
    source: view.live ? "os" : "bundled",
    at: new Date(view.at).toISOString(),
    units,
  };
}

// ---- the ambient fleet line (D-DISPATCH §2.3 layer 1) — ~55 tokens, every turn ----
// Names and badges ONLY. No job descriptions, no triggers: that is what
// fleet_roster is for. This is what lets "send Pennyworth" resolve without a
// guess and lets "have Perry White…" be refused without a tool call.
export async function fleetLine(): Promise<string> {
  const view = await fleetRoster();
  const rosterKeys = new Set(view.units.map((u) => u.key));
  const run = REGISTRY.map((c) => (c.runner.kind === "tool" ? `${c.key}(${c.runner.adapter === "os_client_email" ? "email" : c.runner.adapter})` : c.key));
  const desk = REGISTRY.filter((c) => c.host === "desk").map((c) => c.key);
  const wsOnly = view.units.filter((u) => badgeFor(u.key) === "WORKSPACE_ONLY").length;
  const offRoster = REGISTRY.filter((c) => !rosterKeys.has(c.key)).length;
  return (
    `Fleet: ${view.units.length} roster units${offRoster ? ` + ${offRoster} brain-only` : ""}${view.live ? "" : " (cached)"}. ` +
    `RUNNABLE via dispatch_unit: ${run.join(", ")}. ` +
    `DESK-wired: ${desk.length ? desk.join(", ") : "none"}. ` +
    `${wsOnly} are WORKSPACE_ONLY — name the unit + trigger, never claim to run them.`
  );
}
