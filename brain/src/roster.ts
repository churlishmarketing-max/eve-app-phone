// WHOSE CLIENT ROSTER — the one reader /state (the phone's client tile) and the
// 07:00 brief (slipping clients) share, so the two can never disagree with each
// other, and neither disagrees with the OS.
//
// The OS is the client spine (pulse.ts 4.6: "the brain's own `clients` table is
// a copy nobody keeps current"). So when the OS line is wired (os.ready()) the
// roster comes from the OS's GET /api/eve/clients, and the brain's own table is
// read ONLY when that read fails. The answer always says which: `source` is
// "os" or "local", and a fallback carries `osError` — the reason the OS read
// failed — so a stale tile is never mistaken for the OS's word.
//
// The row shape is the one EveApp.tsx already reads off /state.clients
// (id, name, cadence_days, last_touch_at, status, days_quiet) — the OS's
// `segment` rides beside it. days_quiet: whole days since the last touch, null
// when none is on record (the phone shows NEW).
import { db } from "./db.js";
import * as os from "./os.js";

export interface RosterClient {
  id: string;
  name: string;
  cadence_days: number;
  last_touch_at: string | null;
  status: string;
  segment: string | null;
  days_quiet: number | null;
}

export interface RosterRead {
  source: "os" | "local";
  /** null = no roster could be read at all (local table error or no spine). */
  clients: RosterClient[] | null;
  /** The local table's error, when the local read was the one that failed. */
  error: string | null;
  /** Why the OS read failed, when it was tried and we fell back. */
  osError: string | null;
}

export interface RosterDeps {
  osReady: () => boolean;
  osClients: () => Promise<os.OsRosterClient[]>;
  localClients: () => Promise<{ data: Record<string, unknown>[] | null; error: string | null }>;
}

const DAY_MS = 86_400_000;

async function localFromDb(): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> {
  const c = db();
  if (!c) return { data: null, error: "memory spine offline" };
  const { data, error } = await c.from("clients").select("id, name, cadence_days, last_touch_at, status").eq("status", "active");
  return { data: (data ?? null) as Record<string, unknown>[] | null, error: error ? error.message : null };
}

export const defaultRosterDeps: RosterDeps = { osReady: os.ready, osClients: os.osClients, localClients: localFromDb };

export async function readClientRoster(now = new Date(), deps: RosterDeps = defaultRosterDeps): Promise<RosterRead> {
  let osError: string | null = null;
  if (deps.osReady()) {
    try {
      const list = await deps.osClients();
      return {
        source: "os",
        clients: list.map((c) => ({
          id: c.id,
          name: c.name,
          cadence_days: c.cadence_days,
          last_touch_at: c.last_touch_at,
          status: c.status,
          segment: c.segment,
          days_quiet: c.days_quiet,
        })),
        error: null,
        osError: null,
      };
    } catch (e) {
      osError = e instanceof Error ? e.message : String(e);
    }
  }
  const local = await deps.localClients();
  if (local.error) return { source: "local", clients: null, error: local.error, osError };
  return {
    source: "local",
    clients: (local.data ?? []).map((cl) => {
      const last = typeof cl.last_touch_at === "string" ? cl.last_touch_at : null;
      return {
        id: String(cl.id),
        name: String(cl.name),
        cadence_days: Number(cl.cadence_days),
        last_touch_at: last,
        status: String(cl.status ?? ""),
        segment: null,
        days_quiet: last ? Math.floor((now.getTime() - new Date(last).getTime()) / DAY_MS) : null,
      };
    }),
    error: null,
    osError,
  };
}
