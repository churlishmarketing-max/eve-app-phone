// MUTATION TEST — DO THE GUARDS ACTUALLY CARRY THE ASSERTIONS?
//
//   cd C:\dev\eve-wardrobe\brain && node verify/wardrobe-mutation.mjs
//
// A test that still passes with the guard removed is not a test. This takes the
// two guards out of src/wardrobe-add.ts one at a time, re-runs
// verify/wardrobe-sync-harness.mjs against a real brain each time, and asserts
// the RIGHT lines go red:
//
//   M1  THE NAME VETTING IS REMOVED  -> the N block must go red.
//   M2  upsert:false BECOMES TRUE    -> the A3 no-overwrite lines must go red.
//
// The source is restored from an in-memory copy in a finally block, and the
// file is byte-compared against the original at the end, so a crash mid-run
// cannot leave a mutated guard in the tree.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const brainDir = path.resolve(here, "..");
const TARGET = path.join(brainDir, "src", "wardrobe-add.ts");
const ORIGINAL = readFileSync(TARGET, "utf8");

function runHarness() {
  const r = spawnSync(process.execPath, ["verify/wardrobe-sync-harness.mjs"], {
    cwd: brainDir,
    encoding: "utf8",
    timeout: 300_000,
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** Which checks printed RED, by their printed line. */
function redLines(out) {
  return out
    .split(/\r?\n/)
    .filter((l) => l.startsWith("  RED "))
    .map((l) => l.slice(6).trim());
}

const MUTANTS = [
  {
    id: "M1",
    what: "the name vetting is removed (no sanitiser, no separators, no extension)",
    apply(src) {
      const start = src.indexOf('  if (typeof raw !== "string" || raw === "")');
      const end = src.indexOf("  return { ok: true, file: raw };", start);
      if (start < 0 || end < 0) throw new Error("M1: could not find vetLookName's body");
      return `${src.slice(0, start)}  // MUTANT M1: every guard removed.\n${src.slice(end)}`;
    },
    // The N block is what this guard exists for.
    expectRed: (red) => red.filter((l) => l.startsWith("N refused:")).length,
    expectAtLeast: 10,
  },
  {
    id: "M2",
    what: "upsert:false becomes upsert:true (the no-overwrite rule is removed)",
    apply(src) {
      // The CODE line, not the sentence about it in the docblock above it.
      const line = "\n    upsert: false,\n";
      if (!src.includes(line)) throw new Error("M2: could not find the upsert:false argument");
      return src.replace(line, "\n    upsert: true,\n");
    },
    expectRed: (red) => red.filter((l) => l.startsWith("A3 ") || l.startsWith("A2 ")).length,
    expectAtLeast: 1,
  },
];

let failures = 0;

console.log("[mutation] baseline — the tree as written");
const base = runHarness();
console.log(`[mutation] baseline exit ${base.code}, ${redLines(base.out).length} red`);
if (base.code !== 0) {
  console.log(base.out);
  console.error("[mutation] baseline is not green; nothing below means anything.");
  process.exit(2);
}

for (const m of MUTANTS) {
  console.log(`\n[mutation] ${m.id} — ${m.what}`);
  try {
    // Let the previous brain's port actually come free before the next boot.
    await new Promise((r) => setTimeout(r, 4000));
    writeFileSync(TARGET, m.apply(ORIGINAL), "utf8");
    const r = runHarness();
    const red = redLines(r.out);
    const hit = m.expectRed(red);
    const pass = r.code !== 0 && hit >= m.expectAtLeast;
    console.log(`[mutation] ${m.id} exit ${r.code}, ${red.length} red, ${hit} of them the ones this guard owns`);
    for (const l of red.slice(0, 8)) console.log(`             RED ${l}`);
    // An exit code that is not 1 means the harness itself blew up rather than
    // failing assertions — print its tail so that is never mistaken for a pass.
    if (r.code !== 1) console.log(r.out.split(/\r?\n/).slice(-12).join("\n"));
    console.log(`[mutation] ${m.id} ${pass ? "PASS — the assertions went red without the guard" : "FAIL — the assertions survived the guard being removed"}`);
    if (!pass) failures += 1;
  } finally {
    writeFileSync(TARGET, ORIGINAL, "utf8");
  }
}

const restored = readFileSync(TARGET, "utf8") === ORIGINAL;
console.log(`\n[mutation] source restored byte-for-byte: ${restored}`);
if (!restored) failures += 1;
console.log(`[mutation] ${failures === 0 ? "ALL MUTANTS CAUGHT" : `${failures} MUTANT(S) SURVIVED`}`);
process.exit(failures === 0 ? 0 : 1);
