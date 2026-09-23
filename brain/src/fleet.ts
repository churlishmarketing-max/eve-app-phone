import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// EVE's fleet knowledge IS the live Churlish OS roster. The OS `fleet_roster`
// table is the single source of truth for WHO is on the fleet, and a separate
// process owns writes to it (King's call, 2026-07-17). EVE only READS it — via
// the OS's secret-gated GET /api/fleet/roster — so whatever that process
// publishes, she reflects on her next read and never drifts from the board.
//
// That GET returns thin rows (key/name/division/loc/sort). EVE ENRICHES each
// live unit with the job/alias/triggers/schedule brief from her bundled roster
// copy (data/fleet-roster.json, built from the canonical second-brain manifest
// by scripts/build-fleet-roster.mjs) matched on key — so routing detail
// survives while membership stays the OS's call. A unit the OS carries that EVE
// has no local brief for still appears (name/division/loc); she just says she
// doesn't hold its full brief. If the OS is unreachable — or answers with an
// EMPTY roster — she falls back to the bundled snapshot and labels it, saying
// which of the two happened (see chooseView).

export interface FleetUnit {
  division: string;
  key: string;
  name: string;
  alias: string;
  job: string;
  triggers: string;
  schedule: string | null;
  loc: string;
  detailed: boolean; // true = EVE holds a full brief (enriched); false = OS-thin row
}

export interface RosterView {
  units: FleetUnit[];
  live: boolean; // true = read from the OS just now; false = bundled fallback
  at: number; // when this view was built (ms)
  osCount: number | null; // count the OS reported (null when unreachable)
  // WHY this view is what it is — so nothing downstream has to guess, and the
  // tool can say which of two very different things happened. "os-empty" is
  // the OS answering ok with zero units; "os-unreachable" is no answer at all.
  why: "live" | "os-empty" | "os-unreachable";
}

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- bundled roster: enrichment sidecar + offline fallback ----
let bundledCache: FleetUnit[] | null = null;
function bundled(): FleetUnit[] {
  if (bundledCache) return bundledCache;
  try {
    const raw = JSON.parse(
      readFileSync(path.join(here, "..", "data", "fleet-roster.json"), "utf8"),
    ) as Array<Omit<FleetUnit, "detailed">>;
    bundledCache = raw.map((u) => ({ ...u, detailed: true }));
  } catch {
    bundledCache = [];
  }
  return bundledCache;
}

// ---- live OS read (secret-gated GET /api/fleet/roster) ----
const OS_URL = (process.env.CHURLISH_OS_URL || "https://churlishos.app").replace(/\/+$/, "");
function osSecret(): string | undefined {
  return process.env.CHURLISH_OS_FLEET_SECRET || process.env.FLEET_INGEST_SECRET || undefined;
}

// Whether the live-read path is even wired (the secret is present). When false,
// EVE runs on the bundled snapshot alone — honest, just not live-synced.
export function fleetReadReady(): boolean {
  return !!osSecret();
}

export interface OsRow {
  key: string;
  name: string;
  division: string;
  loc: string;
  sort?: number;
}

async function fetchOsRoster(): Promise<OsRow[] | null> {
  const secret = osSecret();
  if (!secret) return null;
  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(), 8_000);
  try {
    const r = await fetch(`${OS_URL}/api/fleet/roster`, {
      headers: { "x-os-secret": secret },
      signal: ac.signal,
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; units?: OsRow[] };
    if (!r.ok || !j.ok || !Array.isArray(j.units)) return null;
    return j.units;
  } catch (e) {
    console.warn("[fleet] live OS read failed:", e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

// Merge: OS rows are the authoritative membership set (ordered by the OS's
// `sort`); the bundled brief supplies alias/job/triggers/schedule by key. The
// OS wins on name/division/loc (they're the live values); local fills the rest.
function merge(osRows: OsRow[]): FleetUnit[] {
  const byKey = new Map(bundled().map((u) => [u.key, u]));
  return osRows.map((o) => {
    const b = byKey.get(o.key);
    if (b) {
      return {
        ...b,
        name: o.name || b.name,
        division: o.division || b.division,
        loc: o.loc || b.loc,
        detailed: true,
      };
    }
    return {
      division: o.division || "fleet",
      key: o.key,
      name: o.name,
      alias: "",
      job: "",
      triggers: "",
      schedule: null,
      loc: o.loc || "OS",
      detailed: false,
    };
  });
}

// ---- cached view ----
let view: RosterView | null = null;
let refreshing: Promise<RosterView> | null = null;
const LIVE_TTL_MS = 5 * 60_000; // the fleet changes rarely; 5-min freshness is plenty
const MISS_TTL_MS = 30_000; // after an OS miss, retry soon rather than sit on the fallback

// AN EMPTY ROSTER IS A FAULT, NOT A FACT (2026-09-22). On the night of Sept 22
// the OS answered the roster read with ok:true and zero units, and because an
// answer was treated as authoritative, EVE's fleet went to zero: "who's in the
// fleet?" got "nobody" while fifty-six units existed. An operation with no
// units is not a state the business can be in, so zero rows is handled like no
// answer: the saved roster serves, labelled as saved (live:false, why:"os-empty"),
// and the OS is retried on the short miss TTL. A NON-empty OS answer still wins
// outright — that is the sync he asked for. The warning is logged once per
// empty streak, not every 30-second retry.
let warnedEmpty = false;
export function chooseView(osRows: OsRow[] | null, saved: FleetUnit[], now = Date.now()): RosterView {
  if (osRows && osRows.length > 0) {
    warnedEmpty = false;
    return { units: merge(osRows), live: true, at: now, osCount: osRows.length, why: "live" };
  }
  if (osRows) {
    if (!warnedEmpty) {
      warnedEmpty = true;
      console.warn(`[fleet] the OS answered with an EMPTY roster — serving the saved roster (${saved.length} units) until it answers with units`);
    }
    return { units: saved, live: false, at: now, osCount: 0, why: "os-empty" };
  }
  return { units: saved, live: false, at: now, osCount: null, why: "os-unreachable" };
}

async function build(): Promise<RosterView> {
  return chooseView(await fetchOsRoster(), bundled());
}

// The live-and-in-sync fleet view. Serves the cache within its TTL; otherwise
// reads the OS, merges, and caches. A single in-flight refresh is shared. On an
// OS miss it returns the bundled fallback (labeled live:false) and retries the
// OS sooner. `force` bypasses the cache (used to warm at boot).
export async function fleetRoster(force = false): Promise<RosterView> {
  if (!force && view) {
    const ttl = view.live ? LIVE_TTL_MS : MISS_TTL_MS;
    if (Date.now() - view.at < ttl) return view;
  }
  if (refreshing) return refreshing;
  refreshing = build()
    .then((v) => {
      view = v;
      return v;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Warm the roster at boot so the first fleet question is instant and /health can
// confirm the live read landed. Never throws into the caller.
export async function warmFleet(): Promise<void> {
  await fleetRoster(true).catch(() => {});
}

// Cheap read (no refresh) — lets /health report whether the live view has landed
// and whether it came from the OS.
export function fleetViewStatus(): { ready: boolean; live: boolean; count: number; why: RosterView["why"] | null; osCount: number | null } {
  return { ready: !!view, live: !!view?.live, count: view?.units.length ?? 0, why: view?.why ?? null, osCount: view?.osCount ?? null };
}
