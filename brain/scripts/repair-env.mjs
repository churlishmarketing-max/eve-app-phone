// Repair a .env line where an appended variable fused onto the previous
// value because the file had no trailing newline. Splits any VALUE that
// contains an embedded NAME= back into two lines, dedupes, and guarantees a
// trailing newline so it can't happen again.
//
//   cd C:\dev\eve\brain && node scripts/repair-env.mjs
//
// Prints only variable NAMES and lengths — never values.

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const path = ".env";
copyFileSync(path, ".env.bak");

const raw = readFileSync(path, "utf8").replace(/^﻿/, ""); // strip BOM
const out = [];
const fixed = [];

for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) {
    if (t) out.push(t);
    continue;
  }
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const name = t.slice(0, eq);
  let value = t.slice(eq + 1);

  // A fused append looks like: VALUE + "OTHER_NAME=" + othervalue
  const seam = value.match(/([A-Z][A-Z0-9_]{3,})=/);
  if (seam && seam.index > 0) {
    const realValue = value.slice(0, seam.index);
    const restName = seam[1];
    const restValue = value.slice(seam.index + seam[0].length);
    out.push(`${name}=${realValue}`);
    out.push(`${restName}=${restValue}`);
    fixed.push(`${name} (${realValue.length}) + ${restName} (${restValue.length})`);
    continue;
  }
  out.push(`${name}=${value}`);
}

// Dedupe by name, last write wins — .env has a duplicated Firebase path line.
const seen = new Map();
for (const l of out) {
  const n = l.slice(0, l.indexOf("="));
  seen.set(n, l);
}

writeFileSync(path, [...seen.values()].join("\n") + "\n", "utf8"); // trailing \n

console.log("repaired lines:");
fixed.forEach((f) => console.log("  ✓ split " + f));
if (!fixed.length) console.log("  (none — no fused values found)");
console.log(`\n${seen.size} unique variables, trailing newline guaranteed. Backup: .env.bak`);
