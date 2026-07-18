import { db } from "./db.js";
import { boardCalls, osTool, ready as osReady, refreshBoardNow } from "./os.js";

// THE SALES FLOOR — one number, computed one way.
//
// It used to be computed in three places with two different meanings, which is
// why the Today tile read 0/3 while the OS board read 8:
//   - the tile + context pack counted rows in the brain's OWN `touches` table
//     over a ROLLING 7 days, and
//   - EVE's actual logging went to the Churlish OS Friday Five `calls`, an ISO
//     CALENDAR week in a different database.
// Two ledgers, two window definitions, no bridge. Now:
//
// SOURCE OF TRUTH = the OS Friday Five `calls` — the same "Calls held" number
// King sees on the cockpit Command Center. The brain's `touches` table stays the
// fallback when the OS is unreachable, and remains the record client cadence and
// the pulse sweep run on (that's its real job).
//
// WINDOW = since Monday 00:00 in King's timezone, for BOTH sides, so the two can
// actually agree. The old rolling-7-days window could never line up with a
// calendar week.

const TZ = process.env.EVE_TZ || "America/Chicago";
export const FLOOR_GOAL = 3;

// How far the given instant's wall-clock in `tz` sits from UTC, in ms.
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value])) as Record<string, string>;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - date.getTime();
}

// A wall-clock time in `tz` -> the real UTC instant. Two-pass so it stays correct
// across a DST boundary (the offset at the guess may differ from the offset at
// the answer).
function zonedToUtc(y: number, m: number, d: number, hh: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, 0, 0);
  const off1 = tzOffsetMs(new Date(guess), tz);
  const off2 = tzOffsetMs(new Date(guess - off1), tz);
  return new Date(guess - off2);
}

// Monday 00:00 of the current week, in King's timezone, as an ISO instant.
export function weekStartISO(now = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const p = Object.fromEntries(dtf.formatToParts(now).map((x) => [x.type, x.value])) as Record<string, string>;
  const idx: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const since = idx[p.weekday] ?? 0;
  // midnight local on today, then walk back to Monday (DST-safe: re-resolve)
  const midnightToday = zonedToUtc(+p.year, +p.month, +p.day, 0, TZ);
  const monday = new Date(midnightToday.getTime() - since * 86400_000);
  const mp = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(monday)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return zonedToUtc(+mp.year, +mp.month, +mp.day, 0, TZ).toISOString();
}

// Conversations recorded in the brain this week (call/meeting touches). Client
// is OPTIONAL by design — a sales conversation is usually with someone who is
// NOT a client yet, which is exactly why the old client-required path could
// never log one.
export async function brainFloorCount(): Promise<number> {
  const c = db();
  if (!c) return 0;
  const { count, error } = await c
    .from("touches")
    .select("id", { count: "exact", head: true })
    .in("channel", ["call", "meeting"])
    .gte("at", weekStartISO());
  return error ? 0 : count ?? 0;
}

export interface FloorView {
  count: number;
  goal: number;
  source: "os" | "brain";
  brain: number;
  os: number | null;
}

// The number everything shows. OS wins when reachable (it's what the cockpit
// shows and what King edits by hand); the brain's own count is the fallback.
// Takes the HIGHER of the two when both exist: each is a floor-not-ceiling of
// reality (a call logged only in the cockpit is missing from the brain, and vice
// versa), so the max is the closest honest estimate — and it can never regress
// the tile below what he can already see on the board.
export async function floorView(): Promise<FloorView> {
  const brain = await brainFloorCount();
  const os = boardCalls();
  if (os === null) return { count: brain, goal: FLOOR_GOAL, source: "brain", brain, os: null };
  return { count: Math.max(os, brain), goal: FLOOR_GOAL, source: "os", brain, os };
}

export interface LogResult {
  ok: boolean;
  brainOk: boolean;
  osOk: boolean;
  osCalls?: number;
  error?: string;
}

// Record N real sales conversations. Writes BOTH ledgers so the Today tile and
// the OS board move together.
//
// The OS side is a READ-MODIFY-WRITE: log_friday_five is SET, not INCREMENT
// (churlish-os lib/rookie-tools.ts), so blindly sending {calls: n} would
// OVERWRITE the week's total instead of adding to it. We read the live board
// first — deliberately NOT the 45s warm cache, which could be stale enough to
// lose a call.
export async function logConversations(
  n: number,
  summary: string,
  clientId: string | null = null,
): Promise<LogResult> {
  const count = Math.max(1, Math.min(50, Math.round(n)));
  const c = db();
  let brainOk = false;
  let brainErr = "";

  if (c) {
    const now = new Date().toISOString();
    const rows = Array.from({ length: count }, () => ({
      client_id: clientId,
      channel: "call",
      summary,
      at: now,
    }));
    const { error } = await c.from("touches").insert(rows);
    brainOk = !error;
    if (error) brainErr = error.message;
  } else {
    brainErr = "memory spine offline";
  }

  let osOk = false;
  let osCalls: number | undefined;
  let osErr = "";
  if (osReady()) {
    try {
      const raw = await osTool("get_board");
      const j = JSON.parse(raw) as { friday_five?: unknown };
      const ff = j.friday_five && typeof j.friday_five === "object" ? (j.friday_five as { calls?: number }) : null;
      const current = typeof ff?.calls === "number" ? ff.calls : 0;
      await osTool("log_friday_five", { calls: current + count });
      osCalls = current + count;
      osOk = true;
      await refreshBoardNow(); // so the tile shows it immediately, not in 45s
    } catch (e) {
      osErr = e instanceof Error ? e.message : String(e);
    }
  } else {
    osErr = "OS not connected";
  }

  return {
    ok: brainOk || osOk,
    brainOk,
    osOk,
    osCalls,
    error: [brainOk ? "" : `brain: ${brainErr}`, osOk ? "" : `OS: ${osErr}`].filter(Boolean).join("; ") || undefined,
  };
}
