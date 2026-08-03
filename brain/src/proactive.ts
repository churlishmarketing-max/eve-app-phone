import { query } from "@anthropic-ai/claude-agent-sdk";
import { staticSystemPrompt } from "./persona.js";
import { db } from "./db.js";
import { isQuietHours } from "./schedule.js";
import { sendPush, getLatestToken, isPushReady, type SendPushArgs } from "./push.js";
import { floorView } from "./floor.js";
import { localDay, addLocalDays } from "./day.js";
import { buildVitals } from "./vitals.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";
const TZ = process.env.EVE_TZ || "America/Chicago";

// The rest of the daily cadence (04 §1): floor_check 11:45 weekdays,
// closeout 17:30, week_preview Sunday 19:00, tripwire event-driven.
// n8n carries triggers, never copy — every push body is generated here,
// in character, at send time.

// (todayInTz removed — "what day is it for King" now lives ONCE, in day.ts, so
// this file, ops.ts and vitals.ts can never disagree about the boundary.)

function weekdayIndex(d = new Date()): number {
  // 1 = Monday … 7 = Sunday, computed in EVE_TZ.
  const name = d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name) + 1;
}

// (mondayStartIso removed — the week boundary now lives ONCE, in floor.ts, so
// the tile, the context pack and this nudge cannot drift apart again.)

async function generateLine(task: string): Promise<string> {
  let out = "";
  const q = query({
    prompt: `[System task: ${task} HARD LIMIT 25 words. Substance first, exactly one clause of flavour. No markdown, no quotes — output only the notification text.]`,
    options: {
      model: MODEL,
      systemPrompt: staticSystemPrompt,
      allowedTools: [],
      disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch"],
      maxTurns: 1,
    },
  });
  for await (const m of q) {
    if (m.type === "result" && m.subtype === "success") out = m.result;
  }
  const words = out.trim().split(/\s+/);
  return words.length <= 25 ? out.trim() : words.slice(0, 25).join(" ");
}

async function push(title: string, body: string, channelId: "brief" | "nudge" | "tripwire", kind: string, deeplink: string): Promise<string | null> {
  if (!isPushReady()) return null;
  const token = await getLatestToken();
  if (!token) return null;
  return sendPush(token, { title, body, channelId, data: { kind, attention_id: kind, deeplink } });
}

// Same send, but the payload is built by an exported function (bodyPushPayload)
// so the exact notification — deeplink included — is inspectable without a
// device, and the two no-send paths say what WOULD have gone out instead of
// silently returning null.
async function sendArgs(payload: SendPushArgs): Promise<string | null> {
  if (!isPushReady()) {
    console.log("[body_nudge] dry-run — push not configured:", JSON.stringify(payload));
    return null;
  }
  const token = await getLatestToken();
  if (!token) {
    console.log("[body_nudge] dry-run — no registered token:", JSON.stringify(payload));
    return null;
  }
  return sendPush(token, payload);
}

// ---- 11:45 weekdays: sales-floor pace (pushes ONLY if behind) ----

export async function runFloorCheck(force = false): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, reason: "memory spine offline" };
  // Same unified number as the Today tile and the OS board (floor.ts) — this
  // used to run its own Monday-start query while /state ran a rolling-7-day one,
  // so the nudge could disagree with the tile it was nudging about.
  const have = (await floorView()).count;
  const day = Math.min(weekdayIndex(), 5); // weekends don't add expectation
  const expectedByNow = Math.ceil((3 * day) / 5);
  const behind = have < expectedByNow;
  if (!behind && !force) return { ok: true, have, expectedByNow, pushed: false };

  const body = await generateLine(
    `Sales-floor check: King has ${have} sales conversations this week against a floor of 3; by ${["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]} pace expects ${expectedByNow}. Nudge him to book/hold one today — shrink the task to one concrete next move. Do NOT invent assets you don't have (no claimed lists, drafts, or booked slots — nothing beyond the numbers given here).`,
  );
  const id = await push("EVE · FLOOR", body, "nudge", "floor_check", "eve://today");
  return { ok: true, have, expectedByNow, pushed: !!id, body };
}

// ---- 17:30 daily: close-out (shipped vs slipped; slipped auto-reschedule) ----

export async function runCloseout(force = false): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, reason: "memory spine offline" };
  const dayStart = `${localDay()}T00:00:00`;
  const dayEnd = `${localDay()}T23:59:59`;

  const [shipped, dueToday] = await Promise.all([
    c.from("tasks").select("id, title").gte("done_at", dayStart).lte("done_at", dayEnd),
    c.from("tasks").select("id, title, due_at").is("done_at", null).gte("due_at", dayStart).lte("due_at", dayEnd),
  ]);
  const slipped = dueToday.data ?? [];

  // Auto-reschedule slipped to tomorrow (04 §1) — once, without nagging.
  for (const t of slipped) {
    const tomorrow = new Date(new Date(t.due_at).getTime() + 86400_000).toISOString();
    await c.from("tasks").update({ due_at: tomorrow }).eq("id", t.id);
  }

  const body = await generateLine(
    `Day close-out for King. Shipped today: ${(shipped.data ?? []).map((t) => t.title).join("; ") || "nothing logged"}. ` +
      `Slipped (auto-moved to tomorrow): ${slipped.map((t) => t.title).join("; ") || "nothing"}. ` +
      `State shipped vs slipped honestly, then the go-be-a-person line — tell him to clock out and be with his people.`,
  );
  const id = force || !isQuietHours(new Date()) ? await push("EVE · CLOSE-OUT", body, "brief", "closeout", "eve://today") : null;
  return { ok: true, shipped: shipped.data?.length ?? 0, slipped: slipped.length, pushed: !!id, body };
}

// ---- Sunday 19:00: week preview (optional per 04 §1) ----

export async function runWeekPreview(force = false): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, reason: "memory spine offline" };
  const weekAhead = new Date(Date.now() + 7 * 86400_000).toISOString();
  const [tasks, clients] = await Promise.all([
    c.from("tasks").select("title, due_at").is("done_at", null).lte("due_at", weekAhead).order("due_at").limit(10),
    c.from("clients").select("name, cadence_days, last_touch_at").eq("status", "active"),
  ]);
  const quiet = (clients.data ?? []).filter(
    (cl) => cl.last_touch_at && (Date.now() - new Date(cl.last_touch_at).getTime()) / 86400_000 > cl.cadence_days,
  );
  const body = await generateLine(
    `Sunday week preview for King. Due this week: ${(tasks.data ?? []).map((t) => t.title).join("; ") || "nothing dated"}. ` +
      `Clients past cadence: ${quiet.map((q) => q.name).join(", ") || "none"}. Sales floor is 3 conversations. ` +
      `Give him the week's shape — sales blocks named first.`,
  );
  const id = force || !isQuietHours(new Date()) ? await push("EVE · WEEK AHEAD", body, "brief", "week_preview", "eve://today") : null;
  return { ok: true, pushed: !!id, body };
}

// ---- Event-driven: tripwire (the ONLY red-styled alert; 04 §1) ----

export async function fireTripwire(message: string, data?: Record<string, unknown>, force = false): Promise<Record<string, unknown>> {
  const c = db();
  const body = await generateLine(
    `TRIPWIRE for King — genuinely urgent, red-alert class: ${message}. State the break and the single fastest action. No flavour beyond one clause.`,
  );
  let attentionId: string | null = null;
  if (c) {
    const { data: item } = await c
      .from("attention_items")
      .insert({ kind: "tripwire", message: body, nudge_level: 1, ref: { source: data ?? null, raw: message } })
      .select("id")
      .single();
    attentionId = item?.id ?? null;
  }
  // Quiet hours: tripwires queue for the morning brief unless forced (04 §1).
  const id = force || !isQuietHours(new Date()) ? await push("EVE · TRIPWIRE", body, "tripwire", "tripwire", "eve://ops") : null;
  return { ok: true, pushed: !!id, attentionId, body };
}

// ---- 20:00: the BODY check — ONE consolidated push, laddered ----
//
// v1 filed attention items and pushed NOTHING ("the fix for the nagging
// problem is fewer pings, not more"). King's call: a tracker he forgets to
// open is worthless. So this slot now sends AT MOST ONE push naming
// everything still open — never one push per habit, which is the failure mode
// that gets notifications switched off forever. Everything done → silence.
// Silence is the reward; "well done, all clear!" is exactly the noise that
// kills adoption.
//
// Escalation law (doctrine-digest.md:32-34): N1 inform → N2 shrink the task →
// N3 thumb-only. NO N4. Escalation is by CONSECUTIVE MISSED DAYS on the same
// habit, never by repeating inside one evening — a habit that is merely "not
// yet today" at 20:00 is N1, he still has the evening. Past N3 the level
// HOLDS at N3 (thumb-only, once a day); it never gets louder.
//
// HONESTY WALL: every name and number below comes from buildVitals (the
// daily_checkins / routine_days rows). If those tables aren't live yet,
// vitals.online is false and she pushes NOTHING rather than guessing at his
// habits, and never claims he did or didn't do something she has no row for.

const LADDER_KEY = "body.nudge_ladder";

// app_state is the established home for durable brain-side scalars (same
// getState/setState shape as rotation.ts:46-59) so the ladder level survives a
// brain restart and a redeploy.
async function getState<T>(key: string, fallback: T): Promise<T> {
  const c = db();
  if (!c) return fallback;
  const { data } = await c.from("app_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? fallback;
}

async function setState(key: string, value: unknown): Promise<void> {
  const c = db();
  if (!c) return;
  await c.from("app_state").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export interface LadderMemory {
  /** Local day of the last BODY push — at most one per day, ever. */
  last_push_day?: string;
  /** routine_id → the level she reached and the miss-run behind it. */
  habits?: Record<string, { level: number; missed: number; day: string }>;
  checkin?: { level: number; missed: number; day: string };
}

// The slice of buildVitals() this decision needs. Declared structurally rather
// than importing the Vitals interface so a fabricated payload can be fed
// straight in (the decision is pure and unit-testable; the I/O lives in
// runRoutineRiskCheck below).
export interface VitalsForNudge {
  online: boolean;
  today: string;
  checkin: { energy: number | null; sleep_hours: number | null } | null;
  week: { on_date: string; energy: number | null; sleep_hours: number | null }[];
  habits: {
    id: string;
    name: string;
    cadence: string;
    done_today: boolean;
    streak: number;
    days: string[];
    /** Local day the habit was created — nothing before it can be "missed". */
    created_on?: string | null;
  }[];
  error?: string;
}

export interface OpenHabit {
  id: string;
  name: string;
  /** Consecutive days BEFORE today with no tick. Today is not counted — it isn't over. */
  missed: number;
  /** True when the miss-run ran off the end of the window; `missed` is a floor. */
  capped: boolean;
  /** Created today — it cannot be late, and she must not imply it is. */
  newToday: boolean;
  level: 1 | 2 | 3;
  streak: number;
}

export interface BodyNudge {
  push: boolean;
  reason: string;
  level: 0 | 1 | 2 | 3;
  title: string;
  /** Deterministic text — also the fallback if in-character generation fails. */
  body: string;
  /** Task handed to generateLine() so the sent line is in character. */
  directive: string;
  deeplink: string;
  open: OpenHabit[];
  checkinMissing: boolean;
  checkinMissed: number;
  next: LadderMemory;
}

const BODY_DEEPLINK = "eve://body";

/** Has he logged energy or sleep for the given day's row? One owner for that question. */
export function checkinLogged(row: { energy: number | null; sleep_hours: number | null } | null | undefined): boolean {
  return !!row && (row.energy !== null || row.sleep_hours !== null);
}

/**
 * Consecutive days before `today` with no tick, walking back from yesterday.
 *
 * `ticked` is the in-window tick list from buildVitals, so the answer is
 * bounded by the window: at the boundary it is a floor, flagged `capped`.
 *
 * `createdOn` is the local day the habit was created, and it is the reason this
 * function exists rather than a one-liner. routine_days has NO rows for a day
 * the habit did not exist, so an unclamped walk reads absence as failure: add
 * "Wind down by 11" at 09:00 and at 20:00 she says "6+ days missed" about a
 * habit that is eleven hours old. A day before creation is not a miss, and the
 * CREATION DAY ITSELF is never a miss either — the most it can be is "still
 * open tonight" (N1), because he has had it for part of one day.
 */
export function missedRunBefore(
  ticked: string[],
  today: string,
  window = 7,
  createdOn?: string | null,
): { missed: number; capped: boolean } {
  const set = new Set(ticked);
  let cursor = addLocalDays(today, -1);
  let n = 0;
  let capped = false;
  for (;;) {
    // YYYY-MM-DD compares correctly as a string.
    if (createdOn && cursor <= createdOn) break; // didn't exist yet, or was born that day
    if (set.has(cursor)) break; // ticked — the miss-run ends here
    if (n >= window - 1) {
      capped = true; // ran off the end of the window; `missed` is a floor
      break;
    }
    n++;
    cursor = addLocalDays(cursor, -1);
  }
  return { missed: n, capped };
}

/** N1 on the first evening it's open, N2 after one missed day, N3 after two — then HOLD. */
export function ladderLevel(missed: number): 1 | 2 | 3 {
  if (missed <= 0) return 1;
  if (missed === 1) return 2;
  return 3;
}

function missedPhrase(m: number, capped: boolean): string {
  if (m <= 0) return "still open";
  if (m === 1) return "missed yesterday";
  return `${m}${capped ? "+" : ""} days missed`;
}

function nameList(names: string[]): string {
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

function clamp25(s: string): string {
  const w = s.trim().split(/\s+/);
  return w.length <= 25 ? s.trim() : w.slice(0, 25).join(" ");
}

/**
 * THE DECISION — pure. No db, no clock, no push. Everything it says is derived
 * from the payload it was handed, which is why the honesty wall can be tested.
 */
export function decideBodyNudge(v: VitalsForNudge, prior: LadderMemory = {}, force = false): BodyNudge {
  const silent = (reason: string, next: LadderMemory = prior): BodyNudge => ({
    push: false,
    reason,
    level: 0,
    title: "EVE · BODY",
    body: "",
    directive: "",
    deeplink: BODY_DEEPLINK,
    open: [],
    checkinMissing: false,
    checkinMissed: 0,
    next,
  });

  // The wall: no rows, no claims. Not "probably fine", not a guess — nothing.
  if (!v.online) {
    return silent(`vitals offline (${v.error ?? "no reason given"}) — no rows to read, so nothing to say`);
  }

  const today = v.today;
  const window = Math.max(1, v.week.length || 7);

  // Only daily habits are watched here — a weekly routine is not "still open
  // tonight" and must never be nudged as if it were.
  const open: OpenHabit[] = v.habits
    .filter((h) => h.cadence === "daily" && !h.done_today)
    .map((h) => {
      const { missed, capped } = missedRunBefore(h.days, today, window, h.created_on);
      return {
        id: h.id,
        name: h.name,
        missed,
        capped,
        newToday: h.created_on === today,
        level: ladderLevel(missed),
        streak: h.streak,
      };
    })
    .sort((a, b) => b.missed - a.missed);

  const checkinMissing = !checkinLogged(v.checkin);
  // Same ladder for the check-in ask, from the same rows: consecutive days
  // before today with neither energy nor sleep logged.
  //
  // COLD START — the same "absence is not failure" law as created_on above,
  // and it bit for real: 003_body.sql landed at 19:17 on 2026-08-02 with
  // daily_checkins empty, and the unclamped walk read six blank days as six
  // missed ones, framing the very first BODY push as thumb-only N3. If he has
  // never logged a check-in inside the window there is no run to count — the
  // ledger simply didn't exist yet — so the ask starts at N1.
  const byDay = new Map(v.week.map((d) => [d.on_date, d]));
  const loggedBefore = v.week.some((d) => d.on_date < today && checkinLogged(d));
  let cursor = addLocalDays(today, -1);
  let checkinMissed = 0;
  while (loggedBefore && !checkinLogged(byDay.get(cursor)) && byDay.has(cursor) && checkinMissed < window - 1) {
    checkinMissed++;
    cursor = addLocalDays(cursor, -1);
  }

  const next: LadderMemory = {
    ...prior,
    habits: Object.fromEntries(open.map((h) => [h.id, { level: h.level, missed: h.missed, day: today }])),
    ...(checkinMissing ? { checkin: { level: ladderLevel(checkinMissed), missed: checkinMissed, day: today } } : {}),
  };

  if (!open.length && !checkinMissing) {
    return silent("everything ticked and the check-in is logged — nothing to say", next);
  }
  if (prior.last_push_day === today && !force) {
    return silent(`already nudged today (${today}) — one BODY push a day, never two`, next);
  }

  const checkinLevel = checkinMissing ? ladderLevel(checkinMissed) : 0;
  const level = Math.max(checkinLevel, ...open.map((h) => h.level)) as 1 | 2 | 3;
  const lead = open[0];
  const others = open.slice(1).map((h) => h.name);
  const othersClause = others.length ? ` Also open: ${nameList(others)}.` : "";

  let body: string;
  if (!lead) {
    body =
      level === 1
        ? "No energy or sleep logged today — two taps in BODY."
        : level === 2
          ? `Energy and sleep unlogged, ${missedPhrase(checkinMissed, false)}. Two taps in BODY.`
          : `Check-in: ${missedPhrase(checkinMissed, false)}. Two taps and it's closed.`;
  } else {
    const checkinClause = checkinMissing ? " Energy and sleep still unlogged." : "";
    body =
      level === 1
        ? `Still open tonight: ${nameList(open.map((h) => h.name))}.${checkinClause}`
        : level === 2
          ? `${lead.name}: ${missedPhrase(lead.missed, lead.capped)}. The smallest honest version still counts.${othersClause}${checkinClause}`
          : `${lead.name}: ${missedPhrase(lead.missed, lead.capped)}. One tap in BODY closes it.${othersClause}${checkinClause}`;
  }

  // The three levels must SOUND different or the ladder is decorative — the
  // model will otherwise reach for the thumb line at every level.
  const intent =
    level === 1
      ? "inform — name what's open and stop. No shrinking, no tap-or-thumb talk; he still has the evening"
      : level === 2
        ? "shrink the task — name the smallest honest version HE could still do tonight so the remaining work feels small. Do not say 'one tap' or 'thumb'; that is the next level's line"
        : "thumb-only — the only thing left is his tap in the app; say that and stop. Do not escalate past this";

  const facts = [
    ...open.map(
      (h) =>
        `"${h.name}" is unticked today${
          h.newToday
            ? " (he ADDED IT TODAY — it cannot be late, do not imply he is behind on it)"
            : h.missed > 0
              ? ` and was missed the previous ${h.missed}${h.capped ? "+" : ""} day(s)`
              : " (first day open — the evening is still his)"
        }${h.streak > 0 ? `, current streak ${h.streak}d` : ""}`,
    ),
    checkinMissing
      ? `no energy or sleep logged today${checkinMissed > 0 ? ` (nor the previous ${checkinMissed} day(s))` : ""} — logging it is two taps`
      : "",
  ]
    .filter(Boolean)
    .join("; ");

  const directive =
    `20:00 BODY check for King — ONE notification, nudge level N${level} per the escalation law (${intent}). ` +
    `These are the ONLY facts you may use, taken from his own ledger: ${facts}. ` +
    `Name what is still open in one line.${checkinMissing ? " Carry the energy/sleep check-in ask in the same line — it is two taps, not a second notification." : ""} ` +
    `No health advice, no wellness talk, no moralising, no praise, no "you should really". Chief of staff, not a doctor. ` +
    `Do not claim he did or did not do anything beyond the facts above, and invent no numbers. ` +
    // Observed 2026-08-02: without this line the N2 generation produced "I've
    // queued the choice — keep or archive", an action she never took. Same
    // guard as the floor check at :70.
    `You have taken NO action on his behalf here — claim no drafts, no queued choices, no bookings, nothing you did not do.`;

  return {
    push: true,
    reason: `N${level}`,
    level,
    title: "EVE · BODY",
    body: clamp25(body),
    directive,
    deeplink: BODY_DEEPLINK,
    open,
    checkinMissing,
    checkinMissed,
    next,
  };
}

/** The exact notification, built in one place so the deeplink can't drift. */
export function bodyPushPayload(d: BodyNudge, body: string): SendPushArgs {
  return {
    title: d.title,
    body,
    channelId: "nudge",
    data: { kind: "routine_risk", attention_id: "routine_risk", deeplink: d.deeplink },
  };
}

/**
 * Quiet hours are absolute (04 §1, doctrine-digest.md:40-42): 21:30–06:30,
 * nothing fires. Checked through schedule.ts's isQuietHours — never
 * reimplemented — and checked AGAIN immediately before the send, because the
 * in-character generation between the two can take minutes and a 20:00 start
 * must not be able to drift past 21:30.
 */
export function mayPushNow(now = new Date(), force = false): boolean {
  return force || !isQuietHours(now);
}

export async function runRoutineRiskCheck(force = false): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, reason: "memory spine offline" };

  const vitals = await buildVitals();
  const prior = await getState<LadderMemory>(LADDER_KEY, {});
  const d = decideBodyNudge(vitals, prior, force);

  if (!vitals.online) {
    // Nothing filed, nothing pushed, nothing claimed.
    return { ok: true, online: false, pushed: false, reason: d.reason, atRisk: 0, created: 0 };
  }

  // Attention items stay one-per-habit (the app's OPS list is a list); the
  // PUSH is the thing that must stay singular. Level is kept in step with the
  // ladder so the list and the notification never disagree.
  let created = 0;
  for (const h of d.open) {
    const { data: existing } = await c
      .from("attention_items")
      .select("id, nudge_level")
      .eq("kind", "routine_risk")
      .contains("ref", { routine_id: h.id })
      .is("resolved_at", null)
      .limit(1);
    if (existing?.length) {
      if ((existing[0].nudge_level ?? 1) < h.level) {
        await c.from("attention_items").update({ nudge_level: h.level }).eq("id", existing[0].id);
      }
      continue;
    }
    await c.from("attention_items").insert({
      kind: "routine_risk",
      message: `${h.name} unticked today`,
      nudge_level: h.level,
      ref: { routine_id: h.id, date: vitals.today },
    });
    created++;
  }

  if (!d.push) {
    await setState(LADDER_KEY, d.next);
    return { ok: true, online: true, pushed: false, reason: d.reason, atRisk: d.open.length, created };
  }
  if (!mayPushNow(new Date(), force)) {
    await setState(LADDER_KEY, d.next);
    return { ok: true, online: true, pushed: false, reason: "quiet-hours", level: d.level, atRisk: d.open.length, created };
  }

  let body = d.body;
  try {
    body = (await generateLine(d.directive)) || d.body;
  } catch (err) {
    // An LLM hiccup must not cost him the reminder — the deterministic line is
    // built from the same rows and is already honest.
    console.warn("[routine_risk] generation failed, using the plain line:", err instanceof Error ? err.message : err);
  }
  // Second gate: generation is slow, and 20:00 + a long call must never land
  // inside quiet hours.
  if (!mayPushNow(new Date(), force)) {
    await setState(LADDER_KEY, d.next);
    return { ok: true, online: true, pushed: false, reason: "quiet-hours-after-generation", level: d.level, atRisk: d.open.length, created };
  }

  const payload = bodyPushPayload(d, body);
  const id = await sendArgs(payload);
  await setState(LADDER_KEY, id ? { ...d.next, last_push_day: vitals.today } : d.next);
  return {
    ok: true,
    online: true,
    pushed: !!id,
    level: d.level,
    atRisk: d.open.length,
    created,
    open: d.open.map((h) => ({ name: h.name, missed: h.missed, level: h.level })),
    checkinMissing: d.checkinMissing,
    body,
    deeplink: d.deeplink,
  };
}
