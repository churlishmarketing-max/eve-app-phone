import { query } from "@anthropic-ai/claude-agent-sdk";
import { staticSystemPrompt } from "./persona.js";
import { db } from "./db.js";
import { isQuietHours } from "./schedule.js";
import { sendPush, getLatestToken, isPushReady } from "./push.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";
const TZ = process.env.EVE_TZ || "America/Chicago";

// The rest of the daily cadence (04 §1): floor_check 11:45 weekdays,
// closeout 17:30, week_preview Sunday 19:00, tripwire event-driven.
// n8n carries triggers, never copy — every push body is generated here,
// in character, at send time.

function todayInTz(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

function weekdayIndex(d = new Date()): number {
  // 1 = Monday … 7 = Sunday, computed in EVE_TZ.
  const name = d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name) + 1;
}

function mondayStartIso(d = new Date()): string {
  const days = weekdayIndex(d) - 1;
  const monday = new Date(d.getTime() - days * 86400_000);
  return `${todayInTz(monday)}T00:00:00`;
}

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

// ---- 11:45 weekdays: sales-floor pace (pushes ONLY if behind) ----

export async function runFloorCheck(force = false): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, reason: "memory spine offline" };
  const { count } = await c
    .from("touches")
    .select("id", { count: "exact", head: true })
    .in("channel", ["call", "meeting"])
    .gte("at", mondayStartIso());
  const have = count ?? 0;
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
  const dayStart = `${todayInTz()}T00:00:00`;
  const dayEnd = `${todayInTz()}T23:59:59`;

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

// ---- 20:00: routine risk (attention item only — no push; the codified
//      fix for v1's nagging problem is fewer pings, not more) ----

export async function runRoutineRiskCheck(): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, reason: "memory spine offline" };
  const today = todayInTz();
  const { data: routines } = await c.from("routines").select("id, name, last_done_on").eq("cadence", "daily");
  const atRisk = (routines ?? []).filter((r) => r.last_done_on !== today);
  let created = 0;
  for (const r of atRisk) {
    const { data: existing } = await c
      .from("attention_items")
      .select("id")
      .eq("kind", "routine_risk")
      .contains("ref", { routine_id: r.id })
      .is("resolved_at", null)
      .limit(1);
    if (existing?.length) continue;
    await c.from("attention_items").insert({
      kind: "routine_risk",
      message: `${r.name} unticked today`,
      nudge_level: 1,
      ref: { routine_id: r.id, date: today },
    });
    created++;
  }
  return { ok: true, atRisk: atRisk.length, created };
}
