// Build EVE's fleet roster (data/fleet-roster.json) from the canonical
// second-brain roster.md. Run on each fleet-sync handoff:
//
//   node scripts/build-fleet-roster.mjs <path-to-roster.md>
//
// Defaults to the workspace second-brain skill copy if no path is given.
// EVE ships its OWN copy (decoupled from the Churlish OS fleet table, which a
// separate process owns), so a new/retired/renamed unit reaches her on the
// next redeploy after this regenerates the JSON.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-fleet-roster.mjs <path-to-roster.md>");
  process.exit(1);
}

const DIV = {
  COMMAND: "command",
  "WAR ROOMS": "war-rooms",
  "FLEET AGENTS": "fleet",
  "PRODUCTION ENGINES": "production",
  SYSTEMS: "systems",
  "CLIENT FILES": "clients",
  "WRITER'S ROOM": "writers-room",
};
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const md = readFileSync(src, "utf8");
let div = null;
const units = [];
for (const line of md.split(/\r?\n/)) {
  const h = line.match(/^##\s+([A-Z'&\s]+?)(?:\s+[—-])/);
  if (h) {
    const kd = Object.keys(DIV).find((k) => h[1].trim().startsWith(k));
    div = kd ? DIV[kd] : null;
    continue;
  }
  if (!div || !line.startsWith("| ")) continue;
  if (line.includes("---") || /^\|\s*Unit\s*\|/.test(line)) continue;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 6) continue;
  const name = cells[0].replace(/\*\*/g, "").trim();
  if (!name || name === "Unit") continue;
  units.push({
    division: div,
    key: kebab(name),
    name,
    alias: cells[1],
    job: cells[2],
    triggers: cells[3],
    schedule: /^[—-]$/.test(cells[4]) ? null : cells[4],
    loc: cells[5].toUpperCase(),
  });
}

const out = path.join(here, "..", "data", "fleet-roster.json");
writeFileSync(out, JSON.stringify(units, null, 2) + "\n", "utf8");
const byDiv = {};
units.forEach((u) => (byDiv[u.division] = (byDiv[u.division] || 0) + 1));
console.log(`wrote ${units.length} units → ${out}`);
console.log(JSON.stringify(byDiv));
