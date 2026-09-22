// CORE FORMAT — the three pure formatters the shared core logic needs.
//
// MOVED, NOT WRITTEN. `pad2`, `clockStr` and `agentCode` came out of
// src/renderer/deck/format.ts byte for byte (S1 · SHARE THE AUDITED LOGIC).
// They had to move because jobs.ts and fleet.ts call them at RUNTIME, and a
// module under src/shared may not reach back into src/renderer — the deck's
// format module also carries bootSession()/readPlateMode(), which touch
// localStorage and sessionStorage, and the phone must not inherit those.
//
// deck/format.ts now re-exports these three, so every deck-side importer of
// "../format" is untouched and there is still exactly one copy of each.
//
// Nothing here reads a clock, a store, a window or a network. Pure in, pure out.

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function clockStr(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Agent → 2-letter job code (handoff §4 Artboard A, verified map). */
const AGENT_CODES: Record<string, string> = {
  eve: "EV",
  research: "RS",
  jsa: "JS",
  "justice-league": "JL",
  "suicide-squad": "SQ",
};

export function agentCode(agent?: string | null): string {
  if (!agent) return "EV";
  return AGENT_CODES[agent] ?? agent.slice(0, 2).toUpperCase();
}
