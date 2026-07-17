import { db } from "./db.js";
import { listLooksAsync, setWearing } from "./wardrobe.js";

// Automatic wardrobe rotation (King's request, 2026-07-17): three scheduled
// look-changes a day (morning / evening / night), the pool discovered LIVE
// every run so any newly-imported outfit is eligible instantly — zero code
// changes, zero redeploy. Runs as durable node-cron in the always-on brain
// (schedule.ts), so it survives restarts and is not tied to any chat session.
//
// Config + state live in app_state (JSONB key-value, editable in the Supabase
// dashboard with NO redeploy):
//   wardrobe.holidays -> { dates: ["2026-01-01", ...] }   day-type = holiday
//   wardrobe.tags     -> { "FILE.png": { time_of_day?: [...], day_type?: [...] } }
//   wardrobe.rotation -> { last: "FILE.png", log: [ ...last 30 changes ] }

const TZ = process.env.EVE_TZ || "America/Chicago";

export type Slot = "morning" | "evening" | "night";
type DayType = "weekday" | "weekend" | "holiday";
type Tag = { time_of_day?: string[]; day_type?: string[] };

const HOLIDAYS_KEY = "wardrobe.holidays";
const TAGS_KEY = "wardrobe.tags";
const ROT_KEY = "wardrobe.rotation";

// Starter US federal-ish holidays for 2026 — SEEDED into app_state at boot so
// King can add/remove dates in the Supabase dashboard without a redeploy. Only
// seeded if the key is absent; his edits are never overwritten.
const DEFAULT_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Jr. Day
  "2026-02-16", // Presidents' Day
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed)
  "2026-07-04", // Independence Day
  "2026-09-07", // Labor Day
  "2026-11-11", // Veterans Day
  "2026-11-26", // Thanksgiving
  "2026-11-27", // Day after Thanksgiving
  "2026-12-24", // Christmas Eve
  "2026-12-25", // Christmas Day
  "2026-12-31", // New Year's Eve
];

async function getState<T>(key: string, fallback: T): Promise<T> {
  const c = db();
  if (!c) return fallback;
  const { data } = await c.from("app_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? fallback;
}

async function setState(key: string, value: unknown): Promise<void> {
  const c = db();
  if (!c) return;
  await c
    .from("app_state")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// Local date (YYYY-MM-DD) and day-of-week in King's timezone — so "holiday"
// and "weekend" reflect his calendar, not the server's UTC clock.
function todayInTz(): { date: string; dow: number } {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // en-CA → YYYY-MM-DD
  const dowName = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date, dow: dowMap[dowName] ?? 0 };
}

async function currentDayType(): Promise<DayType> {
  const { date, dow } = todayInTz();
  const holidays = await getState<{ dates?: string[] }>(HOLIDAYS_KEY, { dates: DEFAULT_HOLIDAYS_2026 });
  if (holidays.dates?.includes(date)) return "holiday"; // holiday wins over weekend
  return dow === 0 || dow === 6 ? "weekend" : "weekday";
}

// Untagged outfits are ALWAYS eligible (the core rule: a new import works with
// zero setup). A tagged outfit is eligible only when its tags don't exclude
// this slot / day-type.
function eligibleByTag(tag: Tag | undefined, slot: Slot, dt: DayType): boolean {
  if (!tag) return true;
  const timeOk = !tag.time_of_day?.length || tag.time_of_day.includes(slot);
  const dayOk = !tag.day_type?.length || tag.day_type.includes(dt);
  return timeOk && dayOk;
}

export interface RotationResult {
  ok: boolean;
  slot: Slot;
  dayType?: DayType;
  chosen?: string;
  poolSize?: number;
  reason?: string;
}

// One rotation: discover the live pool, resolve day-type, apply optional tag
// preference, avoid repeating the last look, pick one, wear it, log it.
export async function rotateLook(slot: Slot): Promise<RotationResult> {
  const pool = await listLooksAsync();
  const dt = await currentDayType();

  if (!pool.length) {
    console.warn(`[wardrobe-rotate] ${slot} / ${dt}: closet is empty — skipping this change`);
    return { ok: false, slot, dayType: dt, reason: "empty pool" };
  }

  const tags = await getState<Record<string, Tag>>(TAGS_KEY, {});
  const rot = await getState<{ last?: string; log?: unknown[] }>(ROT_KEY, {});

  // Tag preference: keep untagged + tag-matching outfits. If tags exclude
  // everything (all tagged, none match this slot), fall back to the full pool.
  let candidates = pool.filter((f) => eligibleByTag(tags[f], slot, dt));
  const tagNarrowed = candidates.length > 0 && candidates.length < pool.length;
  if (!candidates.length) candidates = pool.slice();

  // Don't repeat the last look when there's a real choice.
  if (rot.last && candidates.length > 1) {
    candidates = candidates.filter((f) => f !== rot.last);
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const r = await setWearing(chosen);

  const entry = {
    at: new Date().toISOString(),
    slot,
    day_type: dt,
    chosen,
    pool_size: pool.length,
    eligible: candidates.length,
    tag_preference_used: tagNarrowed,
    ok: r.ok,
    error: r.error ?? null,
  };
  console.log("[wardrobe-rotate]", JSON.stringify(entry));

  // Persist state + a rolling debug log (last 30) in app_state.
  const log = [entry, ...((rot.log as unknown[]) ?? [])].slice(0, 30);
  await setState(ROT_KEY, { last: r.ok ? chosen : rot.last, log });

  return r.ok
    ? { ok: true, slot, dayType: dt, chosen, poolSize: pool.length }
    : { ok: false, slot, dayType: dt, reason: r.error, poolSize: pool.length };
}

// Seed the editable holiday list into app_state on first boot only — so King
// can maintain it in the dashboard. Never overwrites his edits.
export async function initRotationConfig(): Promise<void> {
  const c = db();
  if (!c) return;
  const { data } = await c.from("app_state").select("key").eq("key", HOLIDAYS_KEY).maybeSingle();
  if (!data) {
    await setState(HOLIDAYS_KEY, { dates: DEFAULT_HOLIDAYS_2026 });
    console.log(`[wardrobe-rotate] seeded ${DEFAULT_HOLIDAYS_2026.length} 2026 holidays into app_state (edit in Supabase)`);
  }
}
