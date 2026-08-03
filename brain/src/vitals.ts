import { db } from "./db.js";
import { floorView, type FloorView } from "./floor.js";
import { saveMemory } from "./memory.js";
import { localDay, addLocalDays, lastNDays, dowLabel, zonedToUtc, TZ } from "./day.js";

// THE BODY — energy, sleep, the day's one line, and the habit ledger.
//
// ONE LAW, inherited from floor.ts: a real-world fact gets exactly ONE owner.
//   energy / sleep / the note          -> daily_checkins
//   every checkbox AND every habit     -> routines + routine_days
//   sales conversations                -> floorView(), NO STORAGE HERE
// This module never writes a conversation count and never owns one. It reads
// floorView() verbatim so the BODY screen and the Today tile can never disagree.
//
// Streaks are COMPUTED here from routine_days on every read. routines.streak
// stays a write-through cache (ops.ts refreshes it) so anything still reading
// the column keeps working — but nothing in this file trusts it.

export interface VitalsCheckin {
  on_date: string;
  energy: number | null;
  sleep_hours: number | null;
  note: string | null;
}

export interface VitalsDay {
  on_date: string;
  dow: string;
  energy: number | null;
  sleep_hours: number | null;
  has_note: boolean;
  trained: boolean;
  calls_ok: boolean;
  ticks: number;
}

export interface VitalsHabit {
  id: string;
  name: string;
  cadence: string;
  slot: string;
  sort_order: number;
  done_today: boolean;
  streak: number;
  days: string[];
  // The LOCAL day the habit was created. Nothing may be called "missed" before
  // this date — routine_days has no rows for a habit that didn't exist, and
  // without this the 20:00 nudge tells him he failed at something he added
  // this morning. Null only if the column is somehow absent (pre-003 row).
  created_on: string | null;
}

// Consecutive ticked days ending TODAY, or ending YESTERDAY when today isn't
// ticked yet. A 12-day run reads 12d at 9am with done_today:false, and only
// falls to 0 once yesterday is missed too — the UI must render `streak` and
// `done_today` together so the number is never ambiguous.
export function streakFrom(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : addLocalDays(today, -1);
  if (!days.has(cursor)) return 0;
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addLocalDays(cursor, -1);
  }
  return n;
}

// Midnight local on a YYYY-MM-DD, as an ISO instant — for windowing `touches`,
// whose `at` is a timestamptz.
function dayStartISO(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return zonedToUtc(y, m, d, 0, TZ).toISOString();
}

// ---- the daily check-in ----

// Range check lives in ONE place so the route (400) and the tool (isError)
// refuse exactly the same inputs.
export function checkinRangeError(input: { energy?: number; sleepHours?: number }): string | null {
  if (input.energy !== undefined) {
    if (!Number.isInteger(input.energy) || input.energy < 1 || input.energy > 5) {
      return "energy must be an integer 1-5";
    }
  }
  if (input.sleepHours !== undefined) {
    if (!Number.isFinite(input.sleepHours) || input.sleepHours < 0 || input.sleepHours > 24) {
      return "sleepHours must be a number 0-24";
    }
  }
  return null;
}

// Partial merge, one row per local day. An omitted field is left alone (the
// upsert_checkin RPC COALESCEs); an explicit "" clears the note. The server
// always stamps on_date = localDay() — the client never picks the day.
export async function saveCheckin(input: {
  energy?: number;
  sleepHours?: number;
  note?: string;
}): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const bad = checkinRangeError(input);
  if (bad) return { ok: false, error: bad };
  if (input.energy === undefined && input.sleepHours === undefined && input.note === undefined) {
    return { ok: false, error: "nothing to log — send energy, sleepHours or note" };
  }
  const on_date = localDay();
  const { data, error } = await c.rpc("upsert_checkin", {
    p_date: on_date,
    p_energy: input.energy ?? null,
    p_sleep: input.sleepHours ?? null,
    p_note: input.note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as VitalsCheckin | null;
  return { ok: true, on_date, checkin: row ?? null };
}

// The ONE representation of a journal note in the memory spine. The log_checkin
// tool composes the identical string (connectors.ts), so the same line typed in
// the app and said in chat can never land as two differently-shaped rows.
export function checkinNoteMemory(onDate: string, note: string): string {
  return `Check-in ${onDate}: ${note}`;
}

// King was asked how much of the journal EVE should see and chose FULL access —
// context AND memory. The tab's note box is the PRIMARY way he'll write it, so
// the spine write cannot live only in the chat tool.
//
// DEDUPE: exact match on the composed string, which already embeds the local
// day. He will blur that textarea a dozen times an evening and every blur
// re-POSTs the same text; only the first may mint a memory row.
export async function rememberCheckinNote(
  note: string,
  onDate = localDay(),
): Promise<{ ok: boolean; deduped: boolean; error?: string }> {
  const c = db();
  if (!c) return { ok: false, deduped: false, error: "memory spine offline" };
  // Trimmed so a stray trailing space between blurs isn't a "different" note.
  // note:"" is the documented CLEAR — there is nothing to remember.
  const trimmed = note.trim();
  if (!trimmed) return { ok: true, deduped: true };
  const content = checkinNoteMemory(onDate, trimmed);
  const { data: existing, error } = await c
    .from("memory_entries")
    .select("id")
    .eq("kind", "fact")
    .eq("content", content)
    .limit(1);
  if (error) return { ok: false, deduped: false, error: error.message };
  if (existing?.length) return { ok: true, deduped: true };
  const m = await saveMemory("fact", content);
  return m.ok ? { ok: true, deduped: false } : { ok: false, deduped: false, error: m.error };
}

export async function todaysCheckin(): Promise<VitalsCheckin | null> {
  const c = db();
  if (!c) return null;
  const { data, error } = await c
    .from("daily_checkins")
    .select("on_date, energy, sleep_hours, note")
    .eq("on_date", localDay())
    .maybeSingle();
  if (error) return null;
  return (data as VitalsCheckin | null) ?? null;
}

// ---- habit name resolution (same shape as memory.ts matchClient) ----

export async function resolveHabit(
  name: string,
): Promise<{ id: string; name: string } | { ambiguous: string[] } | null> {
  const c = db();
  if (!c || !name.trim()) return null;
  const { data: rows } = await c.from("routines").select("id, name").eq("active", true);
  if (!rows?.length) return null;
  const q = name.trim().toLowerCase();
  const exact = rows.filter((r) => String(r.name).toLowerCase() === q);
  if (exact.length === 1) return { id: exact[0].id as string, name: exact[0].name as string };
  const prefix = rows.filter((r) => String(r.name).toLowerCase().startsWith(q));
  if (prefix.length === 1) return { id: prefix[0].id as string, name: prefix[0].name as string };
  const sub = rows.filter((r) => String(r.name).toLowerCase().includes(q));
  if (sub.length === 1) return { id: sub[0].id as string, name: sub[0].name as string };
  if (sub.length > 1) return { ambiguous: sub.map((r) => String(r.name)) };
  return null;
}

// ---- the whole screen, one call ----

export interface Vitals {
  online: boolean;
  today: string;
  checkin: VitalsCheckin | null;
  week: VitalsDay[];
  habits: VitalsHabit[];
  floor: FloorView;
  // The six days before today can only see conversations the BRAIN logged —
  // log_friday_five stores a WEEKLY total, so a call King typed straight into
  // the cockpit is invisible to the strip. Say so rather than implying history.
  floorHistorySource: "brain-only";
  error?: string;
}

// `floor` is an optional PRE-COMPUTED FloorView (or a promise for one). The
// context pack already calls floorView() in its own parallel block, and letting
// this run a second one put a duplicate count query on the critical path of
// every reply. Callers with a floor in hand pass it; /vitals passes nothing and
// behaves exactly as before. floorView itself is unchanged.
export async function buildVitals(days = 7, floor?: FloorView | Promise<FloorView>): Promise<Vitals> {
  const span = Math.min(31, Math.max(1, Math.round(days)));
  const today = localDay();
  const window = lastNDays(span, today);
  const floorP: Promise<FloorView> = floor === undefined ? floorView() : Promise.resolve(floor);

  const c = db();
  if (!c) {
    return {
      online: false,
      today,
      checkin: null,
      week: [],
      habits: [],
      floor: await floorP,
      floorHistorySource: "brain-only",
      error: "memory spine offline",
    };
  }

  // Habit history reaches back 400 days so a long streak survives a short
  // window; the strip only ever renders `span` days.
  const since = addLocalDays(today, -400);
  const [floorR, checkinsR, routinesR, routineDaysR, touchesR] = await Promise.all([
    floorP,
    c.from("daily_checkins").select("on_date, energy, sleep_hours, note").gte("on_date", window[0]),
    c
      .from("routines")
      .select("id, name, cadence, slot, sort_order, created_at")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    c.from("routine_days").select("routine_id, on_date").gte("on_date", since),
    c.from("touches").select("at").in("channel", ["call", "meeting"]).gte("at", dayStartISO(window[0])),
  ]);

  // The BODY tables may not exist yet (003_body.sql). Degrade to an honest
  // offline payload rather than throwing a 500 at the app.
  const err = checkinsR.error || routinesR.error || routineDaysR.error;
  if (err) {
    return {
      online: false,
      today,
      checkin: null,
      week: [],
      habits: [],
      floor: floorR,
      floorHistorySource: "brain-only",
      error: err.message,
    };
  }

  const byDay = new Map<string, VitalsCheckin>();
  for (const r of checkinsR.data ?? []) byDay.set(r.on_date as string, r as VitalsCheckin);

  // routine_id -> the set of local days it was ticked
  const ticks = new Map<string, Set<string>>();
  for (const r of routineDaysR.data ?? []) {
    const id = r.routine_id as string;
    if (!ticks.has(id)) ticks.set(id, new Set<string>());
    ticks.get(id)!.add(r.on_date as string);
  }

  const habits: VitalsHabit[] = (routinesR.data ?? []).map((r) => {
    const set = ticks.get(r.id as string) ?? new Set<string>();
    return {
      id: r.id as string,
      name: r.name as string,
      cadence: (r.cadence as string) ?? "daily",
      slot: (r.slot as string) ?? "habit",
      sort_order: (r.sort_order as number) ?? 100,
      done_today: set.has(today),
      streak: streakFrom(set, today),
      days: window.filter((d) => set.has(d)),
      // timestamptz → King's local day, so "created today" means his today.
      created_on: r.created_at ? localDay(new Date(r.created_at as string)) : null,
    };
  });

  // "Trained" is a routines row with slot='checkin', not a column — one place
  // a "did he train" answer comes from.
  const trained = habits.find((h) => h.name.trim().toLowerCase() === "trained");
  const trainedDays = trained ? new Set(trained.days) : new Set<string>();

  // READ-ONLY view of the floor, bucketed by local day. This is NOT a second
  // counter: nothing here writes a conversation — log_conversation / floor.ts
  // remain the only writer, and the week's number is floorView() verbatim.
  const callDays = new Set<string>();
  for (const t of touchesR.data ?? []) {
    if (t.at) callDays.add(localDay(new Date(t.at as string)));
  }

  const week: VitalsDay[] = window.map((d) => {
    const ck = byDay.get(d);
    return {
      on_date: d,
      dow: dowLabel(d),
      energy: ck?.energy ?? null,
      sleep_hours: ck?.sleep_hours ?? null,
      has_note: !!ck?.note,
      trained: trainedDays.has(d),
      calls_ok: callDays.has(d),
      ticks: habits.filter((h) => h.days.includes(d)).length,
    };
  });

  return {
    online: true,
    today,
    checkin: byDay.get(today) ?? null,
    week,
    habits,
    floor: floorR,
    floorHistorySource: "brain-only",
  };
}
