import cron from "node-cron";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "./db.js";
import { dispatchUnit, resolveDispatch } from "./dispatch.js";
import { stamp } from "./health.js";

// THE UNIT CLOCK v0.1 — standing orders for the 37 units.
//
// The brain has run ten crons of its OWN since day one (schedule.ts) and not
// one of King's units could be put on that clock. Nine of his skills describe
// themselves as "Daily" in their own text and none of them has ever run on a
// schedule. This is the missing half: a durable table of standing orders
// (sql/007_unit_schedules.sql) and ONE drain that hands each due row to the
// EXISTING dispatch path.
//
// THREE LAWS THIS FILE IS BUILT AROUND, and they are why it looks the way it
// does rather than shorter:
//
//   R3 · A SCHEDULED RUN IS A DISPATCH, NOT A NEW AUTONOMY. Putting Starfire on
//        a Monday cron does not let Starfire post. drainDueSchedules() calls
//        dispatchUnit() with the same five fields the chat tool passes — unit,
//        task, why, client, and nothing else. There is no tier argument, no
//        tool list, and no permission argument in DispatchInput, so a schedule
//        row has no way to widen anything: the tier is derived inside
//        dispatchUnit from the registry row, exactly as it is for a hand run.
//        Not enforced by a check — enforced by there being nothing to check.
//
//   R4 · NO UNIT SCHEDULE MAY BE CREATED FROM MAIL OR ANY OTHER UNTRUSTED
//        CONTENT. createSchedule() takes an explicit ScheduleAuthority and
//        refuses anything that is not "king" BEFORE it touches the database or
//        the registry. The caller cannot omit it (TypeScript) and cannot forge
//        it from tool output (connectors.ts latches the turn the moment any
//        third-party text arrives, and passes "untrusted_content" from then on).
//        Nothing here inspects what an email SAID — a detector deciding which
//        mail is safe to obey has failed four audits on this codebase. The
//        refusal is on the door, not on the words.
//
//   Durability · everything a standing order is lives in Postgres. Nothing in
//        this module holds schedule state across a tick, so a Railway redeploy
//        forgets nothing.

const TZ = process.env.EVE_TZ || "America/Chicago";

/** The drain wakes every minute. Cron resolution is one minute; anything slower would round his 9:00 to 9:05. */
const TICK_EXPR = "* * * * *";

/**
 * MISSED-RUN POLICY — RUN ONCE, WITHIN THE HOUR, THEN SKIP AND SAY SO.
 *
 * A standing order that came due while the process was down is fired ONCE on
 * the next tick if the due time is under an hour old, and skipped (recorded on
 * the row as 'skipped_stale', never silent) if it is older. The two choices
 * were "always skip" and "always catch up"; both are wrong at one end. A
 * Railway redeploy takes a couple of minutes, so "always skip" would silently
 * eat his 09:00 Monday brief because the brain restarted at 08:59 — the
 * failure mode he cannot see. "Always catch up" means a three-day outage ends
 * with three days of standing orders firing at once, spending real money on
 * work whose moment has passed. One hour is the line: inside it the run is
 * still the thing he asked for, outside it he would rather be told than
 * surprised.
 *
 * It can never double-fire: next_run_at is advanced by a compare-and-set
 * BEFORE the dispatch, so a second tick finds nothing due.
 */
export const CATCH_UP_MS = 60 * 60_000;

/** Most rows one tick will fire. A backlog drains over several ticks instead of stampeding. */
export const MAX_PER_TICK = 10;

/**
 * Floor on how often a standing order may fire. Every fire is a real dispatch
 * that can spend up to $1.50 of SDK budget (registry STD_COST), so "every
 * minute" is not a schedule, it is a bill. Refused at creation, in words.
 */
export const MIN_INTERVAL_MINUTES = 15;

const TABLE = "unit_schedules";
const COLS =
  "id, unit, task, why, client, cron, tz, said, enabled, created_by, created_at, updated_at, next_run_at, last_run_at, last_job_id, last_status, last_detail";

export interface UnitSchedule {
  id: string;
  unit: string;
  task: string;
  why: string | null;
  client: string | null;
  cron: string;
  tz: string;
  said: string | null;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_job_id: string | null;
  last_status: string | null;
  last_detail: string | null;
}

// ---------------------------------------------------------------------------
// R4 — the authority gate. Structural, not a classifier.
// ---------------------------------------------------------------------------

/**
 * Who is asking for a standing order.
 *
 * "king" is his own turn. "untrusted_content" is any turn that has already
 * taken third-party text into her context — mail, calendar bodies, texts,
 * notifications, filenames. Whoever wrote that text is a stranger, and a
 * stranger may not put work on his clock. The value is decided by the CALLER'S
 * position in the codebase, never by reading the text.
 */
export type ScheduleAuthority = "king" | "untrusted_content";

export interface ScheduleRefusal {
  ok: false;
  code:
    | "untrusted_source"
    | "unit_unknown"
    | "unit_not_runnable"
    | "missing_input"
    | "bad_when"
    | "too_often"
    | "spine_offline"
    | "not_found";
  say: string; // the sentence she speaks — verbatim is fine
}

export interface ScheduleCreated {
  ok: true;
  id: string;
  unit: string;
  name: string;
  cron: string;
  tz: string;
  nextRunAt: string;
  say: string;
}

const refuse = (code: ScheduleRefusal["code"], say: string): ScheduleRefusal => ({ ok: false, code, say });

// ---------------------------------------------------------------------------
// His words in, cron out. The parse is CODE, not model improvisation: she
// hands over the phrase he used and this decides what it means, or refuses and
// says what it does understand.
// ---------------------------------------------------------------------------

const DOW_WORDS: Record<string, number> = {
  sunday: 0, sun: 0, sundays: 0,
  monday: 1, mon: 1, mondays: 1,
  tuesday: 2, tue: 2, tues: 2, tuesdays: 2,
  wednesday: 3, wed: 3, weds: 3, wednesdays: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, thursdays: 4,
  friday: 5, fri: 5, fridays: 5,
  saturday: 6, sat: 6, saturdays: 6,
};
const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const UNDERSTOOD =
  'I understand "every day at 9", "weekdays at 8:30am", "every Monday at 9", "Mondays and Thursdays at 4pm", ' +
  '"the 1st of the month at 9am", "every 30 minutes", "every 2 hours" — or a plain cron expression.';

/** A clock time inside his phrase. Returns null when he named no time. */
function parseTime(s: string): { h: number; m: number } | null {
  if (/\bnoon\b/.test(s)) return { h: 12, m: 0 };
  if (/\bmidnight\b/.test(s)) return { h: 0, m: 0 };
  const m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = (m[3] ?? "").replace(/\./g, "");
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

export type WhenParse = { ok: true; cron: string } | { ok: false; say: string };

/**
 * "every Monday at 9" → "0 9 * * 1". A phrase this does not understand is a
 * refusal that lists what it does — never a guessed hour. A standing order
 * that spends money at a time he did not say is worse than no standing order.
 */
export function parseWhen(when: string): WhenParse {
  const raw = (when ?? "").trim();
  if (!raw) return { ok: false, say: `I need a "when" to put that on the clock. ${UNDERSTOOD} Nothing was scheduled.` };
  const s = raw.toLowerCase().replace(/\s+/g, " ");

  // A cron expression typed straight through (5 or 6 fields).
  const fields = s.split(" ").length;
  if ((fields === 5 || fields === 6) && cron.validate(s)) return { ok: true, cron: s };

  // Intervals first — "every 15 minutes" must not have its 15 read as 3pm.
  const mins = s.match(/\bevery (\d+) ?(?:minutes?|mins?)\b/);
  if (mins) return { ok: true, cron: `*/${Number(mins[1])} * * * *` };
  const hrs = s.match(/\bevery (\d+) ?hours?\b/);
  if (hrs) return { ok: true, cron: `0 */${Number(hrs[1])} * * *` };
  if (/\b(every hour|hourly|once an hour)\b/.test(s)) return { ok: true, cron: "0 * * * *" };

  // "the 1st of the month at 9am" — pull the ordinal OUT before reading the
  // clock, or parseTime sees the 1 in "1st" and schedules it for 1 o'clock.
  const monthly = s.match(/\b(?:the )?(\d{1,2})(?:st|nd|rd|th)\b/);
  const monthlyDom =
    monthly && /\bmonth(ly)?\b/.test(s) && Number(monthly[1]) >= 1 && Number(monthly[1]) <= 31 ? Number(monthly[1]) : null;
  const t = parseTime(monthlyDom !== null ? s.replace(monthly![0], " ") : s);
  if (!t) {
    return {
      ok: false,
      say: `"${raw}" doesn't name a time, so I'd be picking the hour myself and I won't. Say the time — "every Monday at 9". ${UNDERSTOOD} Nothing was scheduled.`,
    };
  }

  // Which days.
  let dom = "*";
  let dow = "*";
  if (/\bweekday|week days|business days?\b/.test(s)) {
    dow = "1-5";
  } else if (/\bweekends?\b/.test(s)) {
    dow = "0,6";
  } else {
    const found = new Set<number>();
    for (const [word, n] of Object.entries(DOW_WORDS)) {
      if (new RegExp(`\\b${word}\\b`).test(s)) found.add(n);
    }
    if (found.size) dow = [...found].sort((a, b) => a - b).join(",");
  }
  if (dow === "*") {
    if (monthlyDom !== null) {
      dom = String(monthlyDom);
    } else if (!/\b(every ?day|daily|each day|every morning|every evening|every night|at)\b/.test(s)) {
      // He named a time and nothing else — daily is the only honest reading,
      // and the read-back says "every day" so a wrong guess is visible at once.
      dom = "*";
    }
  }

  const expr = `${t.m} ${t.h} ${dom} * ${dow}`;
  if (!cron.validate(expr)) {
    return { ok: false, say: `I couldn't turn "${raw}" into a schedule. ${UNDERSTOOD} Nothing was scheduled.` };
  }
  return { ok: true, cron: expr };
}

// ---------------------------------------------------------------------------
// Cron out, his words back in. He never has to read cron syntax.
// ---------------------------------------------------------------------------

const clock12 = (h: number, m: number) => {
  const suffix = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${suffix}`;
};
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
const listWords = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const evenGap = (xs: number[]): number | null => {
  if (xs.length < 2) return null;
  const gap = xs[1] - xs[0];
  return xs.every((v, i) => i === 0 || v - xs[i - 1] === gap) ? gap : null;
};

/** "0 9 * * 1" → "every Monday at 9:00 AM (America/Chicago)". A3: she reads the clock back in words. */
export function describeCron(expr: string, tz: string = TZ): string {
  let f: { minute: number[]; hour: number[]; dayOfMonth: (number | string)[]; dayOfWeek: (number | string)[] };
  try {
    f = cron.parse(expr);
  } catch {
    return `on a schedule I can't read back ("${expr}") — ask me to set it again`;
  }
  // 7 IS SUNDAY, AND ONLY IN THE DAY-OF-WEEK FIELD. Folding it to 0 anywhere
  // else silently deletes 7am, the 7th of the month, and July — a schedule
  // that reads back wrong and, worse, fires on the wrong day.
  const nums = (xs: (number | string)[]) => [...new Set(xs.map(Number).filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  const dowNums = (xs: (number | string)[]) => [...new Set(xs.map(Number).filter((n) => Number.isFinite(n)).map((n) => (n === 7 ? 0 : n)))].sort((a, b) => a - b);
  const minute = nums(f.minute);
  const hour = nums(f.hour);
  const dom = nums(f.dayOfMonth);
  const dow = dowNums(f.dayOfWeek);

  // How often, in a day.
  let time: string;
  if (minute.length >= 60) {
    time = "every minute";
  } else if (minute.length > 1 && hour.length === 24) {
    const gap = evenGap(minute);
    time = gap ? `every ${gap} minutes` : `${minute.length} times an hour`;
  } else if (minute.length === 1 && hour.length === 24) {
    time = minute[0] === 0 ? "every hour, on the hour" : `every hour at :${String(minute[0]).padStart(2, "0")}`;
  } else if (minute.length === 1 && hour.length > 1) {
    const gap = evenGap(hour);
    time = gap ? `every ${gap} hours` : `at ${listWords(hour.map((h) => clock12(h, minute[0])))}`;
  } else if (minute.length === 1 && hour.length === 1) {
    time = `at ${clock12(hour[0], minute[0])}`;
  } else {
    time = `${minute.length * hour.length} times a day`;
  }

  // Which days.
  let days: string;
  const dowSet = dow.join(",");
  if (dom.length < 31) {
    days = `on the ${listWords(dom.map(ordinal))} of the month`;
  } else if (dow.length >= 7) {
    days = "every day";
  } else if (dowSet === "1,2,3,4,5") {
    days = "every weekday";
  } else if (dowSet === "0,6") {
    days = "every weekend day";
  } else {
    days = `every ${listWords(dow.map((d) => DOW_NAMES[d] ?? String(d)))}`;
  }

  const daily = days === "every day";
  const head = time.startsWith("every") ? (daily ? time : `${time}, ${days}`) : `${days} ${time}`;
  return `${head} (${tz})`;
}

// ---------------------------------------------------------------------------
// When does this fire next. Computed here rather than read off a live cron
// task, so it is a pure function of (expression, timezone, instant) — the
// harness can assert the exact timestamp, and no scheduler object is created
// just to ask a question.
// ---------------------------------------------------------------------------

/** The offset of `tz` from UTC, in ms, at the given instant (DST-correct). */
function tzOffsetMs(at: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
}

/** A wall-clock time in `tz` → the real instant. Two passes so a DST edge lands right. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const o1 = tzOffsetMs(new Date(guess), tz);
  const o2 = tzOffsetMs(new Date(guess - o1), tz);
  return new Date(guess - o2);
}

/** The local calendar day, in `tz`, `days` after `from`. */
function localDayIn(from: Date, days: number, tz: string): { y: number; mo: number; d: number; dow: number } {
  const at = new Date(from.getTime() + days * 86_400_000);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: +p.year, mo: +p.month, d: +p.day, dow: dowMap[p.weekday] ?? 0 };
}

/**
 * The first instant strictly after `from` that matches `expr` in `tz`, or null
 * if the expression matches nothing in the next 400 days (e.g. Feb 30).
 * Standard cron semantics: when BOTH day-of-month and day-of-week are
 * restricted, a day matching either one matches.
 */
export function nextRunAfter(expr: string, tz: string, from: Date = new Date()): Date | null {
  let f: { minute: number[]; hour: number[]; dayOfMonth: (number | string)[]; month: number[]; dayOfWeek: (number | string)[] };
  try {
    if (!cron.validate(expr)) return null;
    f = cron.parse(expr);
  } catch {
    return null;
  }
  // Same law as describeCron: 7 means Sunday in the day-of-week field and
  // nothing else. See the note there.
  const nums = (xs: (number | string)[]) => [...new Set(xs.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const dowNums = (xs: (number | string)[]) => [...new Set(xs.map(Number).filter(Number.isFinite).map((n) => (n === 7 ? 0 : n)))].sort((a, b) => a - b);
  const minutes = nums(f.minute);
  const hours = nums(f.hour);
  const months = nums(f.month);
  const doms = nums(f.dayOfMonth);
  const dows = dowNums(f.dayOfWeek);
  const domAll = doms.length >= 31;
  const dowAll = dows.length >= 7;

  for (let i = 0; i <= 400; i += 1) {
    const day = localDayIn(from, i, tz);
    if (!months.includes(day.mo)) continue;
    const domHit = doms.includes(day.d);
    const dowHit = dows.includes(day.dow);
    const dayHit = domAll || dowAll ? domHit && dowHit : domHit || dowHit;
    if (!dayHit) continue;
    for (const h of hours) {
      for (const m of minutes) {
        const at = zonedToUtc(day.y, day.mo, day.d, h, m, tz);
        if (at.getTime() > from.getTime()) return at;
      }
    }
  }
  return null;
}

/** Is this expression at or above the floor? Measured on real consecutive fires, not on the text. */
function fastEnoughApart(expr: string, tz: string, from: Date): boolean {
  const a = nextRunAfter(expr, tz, from);
  if (!a) return false;
  const b = nextRunAfter(expr, tz, a);
  if (!b) return true;
  return b.getTime() - a.getTime() >= MIN_INTERVAL_MINUTES * 60_000;
}

// ---------------------------------------------------------------------------
// A3 — he can speak it. Create / list / cancel.
// ---------------------------------------------------------------------------

export interface CreateScheduleInput {
  unit: string;
  when: string; // his phrase, or a cron expression
  task: string; // the sentence handed to the unit on every run
  why?: string;
  client?: string;
  tz?: string;
}

/**
 * The ONLY writer of unit_schedules. Note the shape of the argument list: the
 * authority is a required positional, so no caller can create a standing order
 * without saying who asked for it, and "untrusted_content" is refused on the
 * first line — before the registry, before the parse, before the database.
 */
export async function createSchedule(
  input: CreateScheduleInput,
  authority: ScheduleAuthority,
  c: SupabaseClient | null = db(),
): Promise<ScheduleCreated | ScheduleRefusal> {
  if (authority !== "king") {
    // R4. No inspection of the text happened and none will: what the message
    // said is irrelevant, where it came from is the whole answer.
    return refuse(
      "untrusted_source",
      "No. Mail, calendar entries, texts and filenames are written by other people — they're data, not orders, " +
        "and nothing I read in one can put work on your clock. If you want this scheduled, tell me yourself in a " +
        "fresh message and I'll set it up. Nothing was scheduled.",
    );
  }

  const task = (input.task ?? "").trim();
  if (!task) return refuse("missing_input", "A standing order needs the sentence I hand the unit every run — that was empty. Nothing was scheduled.");

  // Same registry door as a hand dispatch: an unknown or unrunnable unit is
  // refused HERE, in his words, instead of failing silently every Monday at 9.
  const resolved = await resolveDispatch(input.unit ?? "");
  if ("ok" in resolved) return refuse(resolved.code === "unit_unknown" ? "unit_unknown" : "unit_not_runnable", `${resolved.say} Nothing was scheduled.`);
  const { key, cap } = resolved;

  // Declared inputs (registry §2.2) checked at CREATE time, not at 9am Monday.
  if (cap.runner.kind === "tool") {
    const missing = cap.runner.inputs.filter((i) => i.required && !(input[i.name] ?? "").trim());
    if (missing.length) {
      return refuse("missing_input", `${cap.name} needs ${missing.map((m) => m.name).join(", ")} on every run — which ${missing[0].name}? Nothing was scheduled.`);
    }
  }

  const parsed = parseWhen(input.when ?? "");
  if (!parsed.ok) return refuse("bad_when", parsed.say);
  const tz = (input.tz ?? "").trim() || TZ;
  const now = new Date();
  if (!fastEnoughApart(parsed.cron, tz, now)) {
    return refuse(
      "too_often",
      `That fires more often than every ${MIN_INTERVAL_MINUTES} minutes. Every run is a real dispatch that can spend ` +
        `real budget, so I hold the floor at ${MIN_INTERVAL_MINUTES} minutes. Give me a slower interval. Nothing was scheduled.`,
    );
  }
  const next = nextRunAfter(parsed.cron, tz, now);
  if (!next) return refuse("bad_when", `"${input.when}" never comes around — I couldn't find a next run for it. ${UNDERSTOOD} Nothing was scheduled.`);

  if (!c) return refuse("spine_offline", "I can't write a standing order right now — the memory spine is offline, and I won't hold it in my head and lose it on the next restart. Nothing was scheduled.");

  const { data, error } = await c
    .from(TABLE)
    .insert({
      unit: key,
      task,
      why: input.why?.trim() || null,
      client: input.client?.trim() || null,
      cron: parsed.cron,
      tz,
      said: (input.when ?? "").trim() || null,
      enabled: true,
      created_by: "king",
      next_run_at: next.toISOString(),
      updated_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return refuse("spine_offline", `I couldn't write the standing order: ${error?.message ?? "the insert returned no row"}. Nothing was scheduled.`);
  }

  const words = describeCron(parsed.cron, tz);
  return {
    ok: true,
    id: data.id as string,
    unit: key,
    name: cap.name,
    cron: parsed.cron,
    tz,
    nextRunAt: next.toISOString(),
    say:
      `Standing order set: ${cap.name} runs ${words} — "${task.slice(0, 120)}". First run ${next.toISOString()}. ` +
      `It runs exactly as it does when you ask by hand: same tier, same tools, nothing new unlocked by being on a clock.`,
  };
}

/** Every standing order, in plain language. Newest first. */
export async function listSchedules(c: SupabaseClient | null = db()): Promise<{ ok: boolean; rows: UnitSchedule[]; say: string }> {
  if (!c) return { ok: false, rows: [], say: "I can't read the clock right now — the memory spine is offline." };
  const { data, error } = await c.from(TABLE).select(COLS).order("created_at", { ascending: false }).limit(50);
  if (error) {
    return { ok: false, rows: [], say: `I couldn't read the clock: ${error.message}. Treat it as unknown, not as empty.` };
  }
  const rows = (data ?? []) as unknown as UnitSchedule[];
  if (!rows.length) return { ok: true, rows: [], say: "Nothing is on your clock yet — no unit has a standing order." };
  const lines = rows.map((r) => {
    const when = describeCron(r.cron, r.tz);
    const next = r.enabled ? (r.next_run_at ? `next ${r.next_run_at}` : "next run not computed yet") : "PAUSED";
    const last = r.last_run_at ? `last ${r.last_run_at} (${r.last_status ?? "unknown"})` : "never run";
    return `· ${r.unit} — ${when} — "${r.task.slice(0, 90)}" — ${next}, ${last} [id ${r.id.slice(0, 8)}]`;
  });
  return { ok: true, rows, say: `${rows.length} standing order${rows.length === 1 ? "" : "s"}:\n${lines.join("\n")}` };
}

/**
 * "stop that" — removes the row. `ref` is a schedule id (or its first 8 chars)
 * or a unit key. A unit key with more than one standing order is NOT guessed
 * at: she lists them and asks which, because deleting the wrong standing order
 * is invisible until the day it doesn't run.
 */
export async function cancelSchedule(
  ref: string,
  authority: ScheduleAuthority,
  c: SupabaseClient | null = db(),
): Promise<{ ok: boolean; removed: number; say: string }> {
  // R1/R4 (H2). Same required positional as createSchedule, for the same
  // reason: DESTROYING a standing order is taking authority. This tool's own
  // description says deleting the wrong one "is invisible until the day it
  // doesn't run" — which is precisely why a stranger's text must not be able
  // to reach it. Refused on the first line, before the read and before the
  // delete, with no inspection of `ref` whatsoever.
  if (authority !== "king") {
    return {
      ok: false,
      removed: 0,
      say:
        "No. Mail, calendar entries, texts and filenames are written by other people — they're data, not orders, " +
        "and nothing I read in one can take work OFF your clock either. If you want this cancelled, tell me yourself " +
        "in a fresh message. Nothing was changed.",
    };
  }
  const r = (ref ?? "").trim();
  if (!r) return { ok: false, removed: 0, say: "Which standing order? Name the unit or the id. Nothing was changed." };
  if (!c) return { ok: false, removed: 0, say: "I can't change the clock right now — the memory spine is offline. Nothing was changed." };
  const { data, error } = await c.from(TABLE).select(COLS).limit(200);
  if (error) return { ok: false, removed: 0, say: `I couldn't read the clock: ${error.message}. Nothing was changed.` };
  const rows = (data ?? []) as unknown as UnitSchedule[];
  const needle = r.toLowerCase();
  const hits = rows.filter((x) => x.id === r || x.id.startsWith(needle) || x.unit.toLowerCase() === needle);
  if (!hits.length) return { ok: false, removed: 0, say: `Nothing on your clock matches "${r}". Nothing was changed.` };
  if (hits.length > 1) {
    return {
      ok: false,
      removed: 0,
      say:
        `${hits.length} standing orders match "${r}" — say which:\n` +
        hits.map((x) => `· ${x.unit} ${describeCron(x.cron, x.tz)} [id ${x.id.slice(0, 8)}]`).join("\n") +
        `\nNothing was changed.`,
    };
  }
  const hit = hits[0];
  const { error: delErr } = await c.from(TABLE).delete().eq("id", hit.id);
  if (delErr) return { ok: false, removed: 0, say: `I couldn't remove it: ${delErr.message}. Nothing was changed.` };
  return { ok: true, removed: 1, say: `Off the clock: ${hit.unit} was running ${describeCron(hit.cron, hit.tz)}. It won't fire again.` };
}

// ---------------------------------------------------------------------------
// A2 — THE DRAIN. One tick, one query, the existing dispatch path.
// ---------------------------------------------------------------------------

export interface DrainEntry {
  id: string;
  unit: string;
  dueAt: string;
  outcome: "dispatched" | "refused" | "skipped_stale" | "lost_claim" | "error";
  jobId?: string;
  detail: string;
}
export interface DrainReport {
  ok: boolean;
  at: string;
  due: number;
  fired: number;
  entries: DrainEntry[];
  adopted?: number;
  reason?: string;
}

/**
 * Rows typed straight into the Supabase dashboard have no next_run_at. Adopt
 * them (compute the first run) instead of ignoring them — same "editable in the
 * dashboard, zero redeploy" ethos as app_state in rotation.ts. Adoption never
 * dispatches: the first fire is the NEXT one, so a hand-typed row can't
 * back-fire the moment it is saved.
 */
async function adoptSchedules(c: SupabaseClient, now: Date): Promise<number> {
  const { data, error } = await c.from(TABLE).select("id, cron, tz").eq("enabled", true).is("next_run_at", null).limit(MAX_PER_TICK);
  if (error || !data?.length) return 0;
  let n = 0;
  for (const row of data as Array<{ id: string; cron: string; tz: string | null }>) {
    const next = nextRunAfter(row.cron, row.tz || TZ, now);
    await c
      .from(TABLE)
      .update(
        next
          ? { next_run_at: next.toISOString(), updated_at: now.toISOString() }
          : { enabled: false, last_status: "error", last_detail: `I can't read the cron expression "${row.cron}" — paused it rather than guess.`, updated_at: now.toISOString() },
      )
      .eq("id", row.id);
    n += 1;
  }
  return n;
}

/**
 * One tick. Reads what is due, CLAIMS each row, and hands it to dispatchUnit.
 *
 * This is the ONLY place a standing order turns into work, and it does not
 * contain a runner: dispatchUnit builds the job row, derives the tier from the
 * registry, and runs the unit exactly as it runs when King asks by hand (R3).
 * No emitJob / emitConfirm is passed because there is no SSE turn to emit on —
 * a scheduled RED action still mints its confirm card and still waits; it
 * reaches him through the job row and the attention item, like every other
 * background finish (dispatch.ts).
 */
export async function drainDueSchedules(now: Date = new Date(), c: SupabaseClient | null = db()): Promise<DrainReport> {
  const at = now.toISOString();
  if (!c) return { ok: false, at, due: 0, fired: 0, entries: [], reason: "memory spine offline" };

  const adopted = await adoptSchedules(c, now);

  const { data, error } = await c
    .from(TABLE)
    .select(COLS)
    .eq("enabled", true)
    .lte("next_run_at", at)
    .order("next_run_at", { ascending: true })
    .limit(MAX_PER_TICK);
  if (error) {
    // Missing table (007 not applied yet) is the common case — honest and quiet.
    return { ok: false, at, due: 0, fired: 0, entries: [], adopted, reason: error.message };
  }
  const rows = (data ?? []) as unknown as UnitSchedule[];
  const entries: DrainEntry[] = [];
  let fired = 0;

  for (const row of rows) {
    const dueAt = row.next_run_at ?? at;
    const next = nextRunAfter(row.cron, row.tz || TZ, now);

    // THE CLAIM. Advance next_run_at with a compare-and-set on the value we
    // read. Two overlapping ticks cannot both win this, so a row cannot
    // double-fire — and the claim happens BEFORE the dispatch, so a crash
    // mid-run loses the run rather than repeating it forever.
    const claim = await c
      .from(TABLE)
      .update(
        next
          ? { next_run_at: next.toISOString(), updated_at: at }
          : { enabled: false, next_run_at: null, last_status: "error", last_detail: `I can't read the cron expression "${row.cron}" — paused it rather than guess.`, updated_at: at },
      )
      .eq("id", row.id)
      .eq("next_run_at", dueAt)
      .eq("enabled", true)
      .select("id");
    const won = Array.isArray(claim.data) ? claim.data.length > 0 : !!claim.data;
    if (claim.error || !won) {
      entries.push({ id: row.id, unit: row.unit, dueAt, outcome: "lost_claim", detail: claim.error?.message ?? "another tick already claimed this run" });
      continue;
    }
    if (!next) {
      entries.push({ id: row.id, unit: row.unit, dueAt, outcome: "error", detail: `unreadable cron "${row.cron}" — paused` });
      continue;
    }

    // Missed-run policy (CATCH_UP_MS above).
    const lateMs = now.getTime() - new Date(dueAt).getTime();
    if (lateMs > CATCH_UP_MS) {
      const mins = Math.round(lateMs / 60_000);
      const detail = `Skipped the ${dueAt} run — I was down and it's ${mins} minutes stale. Next one is ${next.toISOString()}.`;
      await c.from(TABLE).update({ last_status: "skipped_stale", last_detail: detail, updated_at: at }).eq("id", row.id);
      entries.push({ id: row.id, unit: row.unit, dueAt, outcome: "skipped_stale", detail });
      continue;
    }

    // The existing dispatch path. Five fields — the same five the chat tool
    // passes. There is nothing here that could widen a tier or a tool grant.
    const out = await dispatchUnit({
      unit: row.unit,
      task: row.task,
      why: row.why?.trim() || `standing order — ${describeCron(row.cron, row.tz || TZ)}`,
      client: row.client ?? undefined,
      // R3. The drain carries HIS earlier authority forward: the row only
      // exists because createSchedule() refused everything that was not him.
      // Now stated rather than defaulted — DispatchInput.authority is required.
      authority: "king",
    });

    const detail = out.say.replace(/\s+/g, " ").slice(0, 300);
    await c
      .from(TABLE)
      .update({
        last_run_at: at,
        last_job_id: out.ok ? out.jobId : null,
        last_status: out.ok ? "dispatched" : "refused",
        last_detail: detail,
        updated_at: at,
      })
      .eq("id", row.id);
    if (out.ok) fired += 1;
    entries.push({ id: row.id, unit: row.unit, dueAt, outcome: out.ok ? "dispatched" : "refused", ...(out.ok ? { jobId: out.jobId } : {}), detail });
  }

  return { ok: true, at, due: rows.length, fired, entries, adopted };
}

// ---------------------------------------------------------------------------
// The tick.
// ---------------------------------------------------------------------------

let ticking = false;
/**
 * The last reason the drain gave for not draining. The tick is EVERY MINUTE,
 * so an unapplied sql/007 would otherwise write 1,440 identical warnings a day
 * into the Railway log and bury everything worth reading. Say it once, say it
 * again if it CHANGES, and say it again when it clears. The health stamp is
 * written on every tick regardless — liveness is never silenced, only repeated
 * prose is.
 */
let lastQuiet: string | null = null;

/**
 * Registered from startSchedulers() (schedule.ts) alongside the brain's own ten
 * crons. `ticking` only stops this process from overlapping ITSELF; the row
 * claim above is what actually makes a double fire impossible.
 */
export function startClock(): void {
  cron.schedule(
    TICK_EXPR,
    () => {
      if (ticking) return;
      ticking = true;
      drainDueSchedules()
        .then((r) => {
          stamp("unit_clock", { ok: r.ok, due: r.due, fired: r.fired, reason: r.reason });
          if (r.due || r.adopted) console.log("[unit-clock]", JSON.stringify(r));
          if (!r.ok) {
            const reason = r.reason ?? "unknown";
            if (reason !== lastQuiet) console.warn("[unit-clock] not draining:", reason);
            lastQuiet = reason;
          } else if (lastQuiet !== null) {
            console.log("[unit-clock] draining again — the table is reachable");
            lastQuiet = null;
          }
        })
        .catch((e) => console.error("[unit-clock] error", e))
        .finally(() => {
          ticking = false;
        });
    },
    { timezone: TZ, noOverlap: true },
  );
  console.log(`[unit-clock] armed (${TZ}): tick every minute · catch-up ${CATCH_UP_MS / 60_000}m · floor ${MIN_INTERVAL_MINUTES}m · max ${MAX_PER_TICK}/tick`);
}
