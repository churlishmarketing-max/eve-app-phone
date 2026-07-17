import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// EVE's OWN copy of the fleet manifest — data/fleet-roster.json, parsed from the
// canonical second-brain roster on each fleet-sync handoff (build script:
// scripts/build-fleet-roster.mjs). Deliberately DECOUPLED from the Churlish OS
// roster table: the OS fleet registry is managed by its own process (King's
// call, 2026-07-17), so EVE ships its own authoritative copy and stays current
// on redeploy — no cross-system coupling, no dependency on the OS being synced.

export interface FleetUnit {
  division: string;
  key: string;
  name: string;
  alias: string;
  job: string;
  triggers: string;
  schedule: string | null;
  loc: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
let cache: FleetUnit[] | null = null;

export function fleetRoster(): FleetUnit[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(path.join(here, "..", "data", "fleet-roster.json"), "utf8")) as FleetUnit[];
  } catch {
    cache = [];
  }
  return cache;
}
