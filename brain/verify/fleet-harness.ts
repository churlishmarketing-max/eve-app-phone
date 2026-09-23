// Brain-side proof for THE FLEET ROSTER FALLBACK (src/fleet.ts chooseView +
// the fleet_roster tool header in connectors.ts + data/fleet-roster.json).
//
//   cd C:\dev\eve\brain && npx tsx verify/fleet-harness.ts
//
// Pure and offline. No env, no network, no DB, no SDK call. chooseView is fed
// rows directly; the saved roster is the real file on this disk.
//
// WHY THIS SUITE EXISTS. On Sept 22, 2026 the OS answered the roster read with
// ok:true and ZERO units, and because any answer was treated as authoritative,
// EVE's fleet went to zero while fifty-six units existed. Three things are proved:
//   F1. An EMPTY OS answer serves the saved roster, labelled "os-empty" — never
//       an empty fleet — and a NON-empty answer still wins outright.
//   F2. The saved roster is the current second-brain roster (56 units, the five
//       seats added Sept 22 present), not the August one.
//   F3. The tool says which fallback happened. An OS that answered with nothing
//       is not an OS that didn't answer, and she must not say "unreachable" for it.
//
// Where a check reads SOURCE TEXT rather than driving behaviour it says SOURCE.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chooseView, type FleetUnit, type OsRow } from "../src/fleet.js";

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAVED = (JSON.parse(readFileSync(path.join(brainDir, "data", "fleet-roster.json"), "utf8")) as Array<Omit<FleetUnit, "detailed">>).map(
  (u) => ({ ...u, detailed: true }),
);
const CONNECTORS_SRC = readFileSync(path.join(brainDir, "src", "connectors.ts"), "utf8");

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  show.push(`  ${id.padEnd(6)} ${cond ? "PASS" : "****FAIL****"}  ${what}`);
}

function main() {
  // Silence the once-per-streak warning so the suite output stays readable.
  const warn = console.warn;
  const warned: string[] = [];
  console.warn = (...a: unknown[]) => void warned.push(a.map(String).join(" "));

  show.push("=== F1 — AN EMPTY ROSTER IS A FAULT, NOT A FACT ===");
  const empty = chooseView([], SAVED, 1);
  ok("F1.1", empty.units.length === SAVED.length && SAVED.length > 0, `OS answered with ZERO units → the saved roster serves (${empty.units.length} units), never an empty fleet`);
  ok("F1.2", empty.live === false && empty.why === "os-empty" && empty.osCount === 0, `…labelled as saved, not live: live=${empty.live}, why=${empty.why}, osCount=${empty.osCount}`);
  ok("F1.3", warned.length === 1 && /EMPTY roster/.test(warned[0] ?? ""), "…and the fault is logged, in words that name it");
  chooseView([], SAVED, 2);
  ok("F1.4", warned.length === 1, "…ONCE per empty streak — a second empty answer 30 s later does not log again");

  const none = chooseView(null, SAVED, 3);
  ok("F1.5", none.units.length === SAVED.length && none.live === false && none.why === "os-unreachable" && none.osCount === null, `no answer at all → saved roster, why=${none.why}, osCount=${none.osCount} (a different fault, reported differently)`);

  const row: OsRow = { key: SAVED[0].key, name: SAVED[0].name, division: SAVED[0].division, loc: SAVED[0].loc };
  const liveView = chooseView([row], SAVED, 4);
  ok("F1.6", liveView.live === true && liveView.why === "live" && liveView.osCount === 1 && liveView.units.length === 1, "a NON-empty OS answer still wins outright — membership is the OS's call, even when it is one unit");
  ok("F1.7", liveView.units[0].detailed === true && liveView.units[0].job === SAVED[0].job, "…and its unit is still enriched with the saved brief by key");
  chooseView([], SAVED, 5);
  ok("F1.8", warned.length === 2, "a fresh empty streak after a live answer logs again (the latch resets on a live read)");
  console.warn = warn;

  show.push("=== F2 — THE SAVED ROSTER IS THE CURRENT ONE ===");
  const keys = new Set(SAVED.map((u) => u.key));
  ok("F2.1", SAVED.length === 56, `the saved roster carries 56 units — the second-brain recount of Sept 21, 2026 (got ${SAVED.length})`);
  const seats = ["nightwing", "raven", "lucius-fox", "jimmy-olsen", "brainiac"];
  ok("F2.2", seats.every((k) => keys.has(k)), `the seats added Sept 22 are present: ${seats.join(", ")}`);
  ok("F2.3", keys.size === SAVED.length, "no duplicate keys");
  ok("F2.4", SAVED.every((u) => u.key && u.name && u.division), "every unit has a key, a name and a division");

  show.push("=== F3 — SHE SAYS WHICH FALLBACK HAPPENED ===");
  ok("F3.1", /why === "os-empty"/.test(CONNECTORS_SRC) && /the OS answered with an empty roster/.test(CONNECTORS_SRC), "SOURCE: the fleet_roster tool has a separate header for an EMPTY answer");
  ok("F3.2", /the OS was unreachable/.test(CONNECTORS_SRC), "SOURCE: …and keeps the unreachable wording for no answer at all");

  console.log(show.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main();
