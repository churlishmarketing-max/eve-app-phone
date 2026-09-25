import { query } from "@anthropic-ai/claude-agent-sdk";
import { staticSystemPrompt } from "./persona.js";
import { buildContextPack } from "./context.js";
import { isQuietHours } from "./schedule.js";
import { sendPush, getLatestToken, isPushReady } from "./push.js";
import { buildVitals } from "./vitals.js";
// checkinLogged / missedRunBefore live with the nudge ladder so "has he checked
// in" and "how many days has this slipped" have exactly ONE definition across
// the 07:00 brief and the 20:00 push.
import { checkinLogged, missedRunBefore, type VitalsForNudge } from "./proactive.js";
import { addLocalDays } from "./day.js";
// THE BRIEF PROPER (C1–C6). The 25-word push below is UNCHANGED and stays the
// nudge — he is away from the desk constantly. This is the four-section brief
// it points at: built from records in briefing.ts, served on /state, rendered
// by the deck's BRIEF pane.
import {
  buildBriefDeck,
  briefPromptBlock,
  offlineBriefDeck,
  overnightStart,
  type BriefDeck,
  type BriefInput,
  type BriefSectionKey,
} from "./briefing.js";
import { db } from "./db.js";
import { listPending } from "./confirm.js";
import { floorView } from "./floor.js";
import { recentJobsQuery, shapeJob } from "./dispatch.js";
import { triageMail, readTodayShape } from "./mail.js";
import * as google from "./google.js";
import { osSweep, ready as osReady } from "./os.js";
import type { MailSource } from "./google.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";

// The body's ONE clause inside the existing 07:00 push — never a second
// notification, and never a checklist read back at him. It names what the DAY
// needs (a non-negotiable that's actually behind, a short night, the missing
// two-tap check-in) and stays silent when the ledger has nothing to say.
// Offline vitals produce an empty string: no rows, no claims.
export function briefBodyClause(v: VitalsForNudge): string {
  if (!v.online) return "";
  const facts: string[] = [];

  const yesterday = addLocalDays(v.today, -1);
  const lastNight = v.week.find((d) => d.on_date === yesterday);
  if (lastNight?.sleep_hours != null && lastNight.sleep_hours < 6) {
    // Stated as a scheduling fact, not a health verdict — see the directive.
    facts.push(`he logged ${lastNight.sleep_hours}h sleep last night`);
  }

  // The single most-behind daily habit, and only when it was genuinely missed:
  // at 07:00 everything is unticked by definition, so "unticked today" is not
  // news and naming it would be the checklist recital this clause exists to avoid.
  const behind = v.habits
    .filter((h) => h.cadence === "daily" && !h.done_today)
    // created_on clamped, same as the 20:00 nudge: a habit added yesterday
    // cannot have "gone unticked" on the days before it existed.
    .map((h) => ({ name: h.name, ...missedRunBefore(h.days, v.today, Math.max(1, v.week.length || 7), h.created_on) }))
    .filter((h) => h.missed > 0)
    .sort((a, b) => b.missed - a.missed)[0];
  if (behind) {
    facts.push(
      behind.missed === 1
        ? `"${behind.name}" went unticked yesterday`
        : `"${behind.name}" hasn't been ticked in ${behind.missed}${behind.capped ? "+" : ""} days`,
    );
  }

  if (!checkinLogged(v.checkin)) facts.push("today's energy/sleep check-in is not logged yet (two taps)");

  if (!facts.length) return "";
  return (
    `\n\nBODY (live, from his own ledger — use only these, invent no numbers): ${facts.join("; ")}. ` +
    `Fold the ONE that matters most into the brief as a single clause. Do not recite them as a checklist, ` +
    `do not moralise and give no health advice — a short night is a scheduling fact, not a verdict.`
  );
}

// ---------------------------------------------------------------------------
// COLLECTING THE BRIEF'S EVIDENCE (C2).
//
// Every read is INDIVIDUALLY guarded. A failing source must never take the
// brief down and must never disappear silently: it contributes nothing and
// files a `blind` line naming itself, which the pane renders in place of an
// all-clear it did not earn. This is the one function in the brief that talks
// to the outside world; briefing.ts stays pure so the harness can drive it
// from fixtures with no database, no network and no mailbox.
//
// `source` is a parameter so verify/brief-harness.ts injects a FAKE Gmail /
// Calendar client. King's real mailbox is not a test fixture.
// ---------------------------------------------------------------------------
export async function collectBriefInput(now = new Date(), source: MailSource | null = null): Promise<BriefInput> {
  const blind: { section: BriefSectionKey; say: string }[] = [];
  const note = (section: BriefSectionKey, say: string) => blind.push({ section, say });

  const c = db();
  const input: BriefInput = {
    now,
    online: !!c,
    confirms: [],
    attention: [],
    tasks: [],
    jobs: [],
    runs: [],
    clients: [],
    promises: [],
    mail: null,
    shape: null,
    floor: null,
    blind,
  };

  // In-memory, always available — the RED cards survive a spine outage.
  input.confirms = listPending().map((p) => ({ id: p.id, kind: p.kind, summary: p.summary, createdAt: p.createdAt }));

  const from = overnightStart(now).toISOString();

  if (c) {
    const [attention, tasks, jobs, runs, clients, promises] = await Promise.all([
      c.from("attention_items").select("id, kind, message, nudge_level, ref, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(20),
      c.from("tasks").select("id, title, detail, priority, due_at").not("priority", "is", null).is("done_at", null).order("priority"),
      recentJobsQuery(c, now.getTime()),
      c.from("runs").select("id, job, ok, at").gte("at", from).order("at", { ascending: false }).limit(50),
      c.from("clients").select("id, name, cadence_days, last_touch_at, status").eq("status", "active"),
      c.from("memory_entries").select("content, created_at").eq("kind", "promise").eq("status", "active").order("created_at", { ascending: false }).limit(8),
    ]);

    if (attention.error) note("needs_you", `Her attention queue would not read: ${attention.error.message}`);
    else input.attention = (attention.data ?? []) as BriefInput["attention"];

    if (tasks.error) note("needs_you", `The task list would not read: ${tasks.error.message}`);
    else input.tasks = (tasks.data ?? []) as BriefInput["tasks"];

    if (jobs.error) note("overnight", `Her own job log would not read: ${jobs.error.message}. Nothing below claims she ran anything.`);
    else input.jobs = (jobs.data ?? []).map((r) => shapeJob(r as unknown as Record<string, unknown>)) as unknown as BriefInput["jobs"];

    if (runs.error) note("overnight", `The runs log would not read: ${runs.error.message}. Nothing below claims a scheduled job fired.`);
    else input.runs = (runs.data ?? []) as unknown as BriefInput["runs"];

    if (clients.error) note("slipping", `The client list would not read: ${clients.error.message}`);
    else
      input.clients = (clients.data ?? []).map((cl) => ({
        id: String(cl.id),
        name: String(cl.name),
        cadence_days: Number(cl.cadence_days),
        // Same arithmetic state.ts runs, so the pane and the brief can never
        // disagree about how quiet a client is.
        days_quiet: cl.last_touch_at ? Math.floor((now.getTime() - new Date(cl.last_touch_at as string).getTime()) / 86_400_000) : null,
      }));

    if (promises.error) note("slipping", `Her promise ledger would not read: ${promises.error.message}`);
    else input.promises = (promises.data ?? []) as unknown as BriefInput["promises"];

    try {
      const f = await floorView();
      input.floor = { count: f.count, goal: f.goal };
    } catch (e) {
      note("shape", `The sales-floor count would not read: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    note("needs_you", "Her spine did not answer — nothing in this section was measured.");
    note("overnight", "Her spine did not answer, so her own log is unreadable. She is not claiming a quiet night.");
    note("slipping", "Her spine did not answer — no client, promise or job was checked.");
    note("shape", "Her spine did not answer — no task or floor figure was read.");
  }

  // One House Step 4: the OS sweep line. Independent of her spine — it is the
  // OS's own Ledger. Not wired → no line; a failed read is said, not hidden.
  if (osReady()) {
    try {
      input.osSweep = await osSweep();
    } catch (e) {
      note("shape", `The OS sweep would not read: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Mail and calendar. triageMail / readTodayShape never throw: a failure comes
  // back as a state and a true sentence, which is exactly what `blind` wants.
  const src = source ?? (google.gmailReady() || google.calendarReady() ? google.googleSource() : null);
  if (src) {
    const [{ digest }, shape] = await Promise.all([triageMail(src, { now }), readTodayShape(src, { now })]);
    input.mail = digest;
    input.shape = shape;
    if (digest.state === "error" || digest.state === "not-wired") note("needs_you", digest.detail);
  } else {
    note("needs_you", "Gmail is not connected. She has NOT seen his inbox — no mail is reported below.");
    note("shape", "Google Calendar is not connected. She has NOT seen his day — no events are reported below.");
  }

  return input;
}

/** The whole brief, from records. Never throws — an outage is a degraded deck. */
export async function buildBrief(now = new Date(), source: MailSource | null = null): Promise<BriefDeck> {
  try {
    return buildBriefDeck(await collectBriefInput(now, source));
  } catch (e) {
    console.error("[brief] deck build failed", e);
    return offlineBriefDeck(now);
  }
}

// Generate the morning brief IN CHARACTER via the same persona layers. The
// ≤25-word cap is instructed here and enforced defensively below (01 §6, 04 §1).
//
// `briefBlock` is briefPromptBlock(deck) — the same four sections the pane
// renders, so the push and the deck can never tell him different things. It is
// pre-enveloped: every mail-derived line inside it already sits in
// <untrusted_brief_content> with a constant note (R1/C6).
export async function generateBrief(bodyClause = "", briefBlock = ""): Promise<string> {
  const pack = await buildContextPack("push", "morning brief: today's three, calendar, the avoided thing, floor status");
  const directive =
    `${pack}\n\n` +
    (briefBlock ? `${briefBlock}\n\n` : "") +
    "[System task: write King's 7:00 AM morning brief as a single push notification. " +
    "HARD LIMIT 25 words. Substance first, exactly one clause of flavour. Use the LIVE " +
    "ledger in the context pack — Today's Three, floor status, open attention items. Lead " +
    "with the one thing that actually needs him today. No markdown, no quotes, no sign-off — " +
    "output only the notification text.]" +
    bodyClause;

  let out = "";
  const q = query({
    prompt: directive,
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
  return out.trim();
}

function clampWords(s: string, max = 25): string {
  const words = s.trim().split(/\s+/);
  return words.length <= max ? s.trim() : words.slice(0, max).join(" ");
}

export interface BriefResult {
  ok: boolean;
  reason?: string;
  id?: string;
  brief?: string;
  error?: string;
}

// 04 §1: "≤25 words in the push; full brief on the Today screen." The push
// carries the compressed line; the latest full text is served via /state
// (review C38 — the brief previously existed only as the push).
let latestBrief: { text: string; at: string } | null = null;

export function getLatestBrief(): { text: string; at: string } | null {
  return latestBrief;
}

// ---------------------------------------------------------------------------
// THE DECK'S COPY OF THE BRIEF.
//
// latestBrief above is process memory only, which means a Railway redeploy at
// 08:00 erases the 07:00 brief and the pane goes blank. The four-section deck
// gets a durable home instead: app_state, the established place for brain-side
// scalars (rotation.ts, proactive.ts's ladder). Memory is the fast path;
// app_state is what survives the restart.
//
// The stored deck is a SNAPSHOT of the morning on purpose. "What she did
// overnight" recomputed at 3pm would answer a different question, and a brief
// that quietly rewrites itself during the day is not a brief.
// ---------------------------------------------------------------------------
const DECK_KEY = "brief.deck";
let latestDeck: BriefDeck | null = null;
let deckHydrated = false;

export function getLatestDeckSync(): BriefDeck | null {
  return latestDeck;
}

async function persistDeck(deck: BriefDeck): Promise<void> {
  latestDeck = deck;
  deckHydrated = true;
  const c = db();
  if (!c) return;
  try {
    await c.from("app_state").upsert({ key: DECK_KEY, value: deck, updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch (e) {
    // A brief that cannot be filed is still a brief. Say so, keep the memory copy.
    console.error("[brief] could not persist the deck", e);
  }
}

/**
 * What /state serves. Memory first; ONE lazy read of app_state after a restart,
 * so the 30-second poll does not add a query per tick. Returns null when no
 * brief has been built yet — which the pane renders as "no brief yet", never
 * as an empty brief.
 */
export async function getLatestBriefDeck(): Promise<BriefDeck | null> {
  if (latestDeck) return latestDeck;
  if (deckHydrated) return null;
  deckHydrated = true;
  const c = db();
  if (!c) return null;
  try {
    const { data } = await c.from("app_state").select("value").eq("key", DECK_KEY).maybeSingle();
    latestDeck = (data?.value as BriefDeck | undefined) ?? null;
  } catch {
    latestDeck = null;
  }
  return latestDeck;
}

// force=true bypasses the quiet-hours guard (for manual testing via POST /job).
export async function runMorningBrief(force = false): Promise<BriefResult> {
  const now = new Date();
  if (!force && isQuietHours(now)) return { ok: false, reason: "quiet-hours" };

  // THE BRIEF PROPER, first: the push is a pointer at it, so it is built from
  // the same records rather than from a second pass over the world.
  const deck = await buildBrief(now);
  await persistDeck(deck);

  // One push, one clause. The body read is folded INTO the brief — it never
  // becomes a second notification (04 §1: quiet mornings stay one ping).
  const vitals = await buildVitals();
  const raw = await generateBrief(briefBodyClause(vitals), briefPromptBlock(deck));
  const body = clampWords(raw, 25);
  if (raw) latestBrief = { text: raw, at: new Date().toISOString() };
  const token = await getLatestToken();

  if (!isPushReady() || !token) {
    // Firebase not configured or no device registered yet — return the generated
    // brief so /job is testable end-to-end before the phone exists.
    return {
      ok: false,
      reason: !isPushReady() ? "push-not-configured" : "no-registered-token",
      brief: body,
    };
  }

  try {
    const id = await sendPush(token, {
      title: "EVE",
      body,
      channelId: "brief",
      data: {
        kind: "brief",
        attention_id: `brief_${new Date().toISOString().slice(0, 10)}`,
        // When the check-in is the day's open ask, the tap lands where the ask
        // is answered. Otherwise TODAY, unchanged.
        deeplink: vitals.online && !checkinLogged(vitals.checkin) ? "eve://body" : "eve://today",
      },
    });
    // An EMPTY id is the send wall refusing to transmit (push.ts) — the only
    // way a send returns no message id. It must not be laundered into a
    // success: schedule.ts logs "sent" and stamps this result, so a blocked
    // brief reported ok:true would leave King believing a push went out that
    // never left the process. The TEXT still rides back — it was generated,
    // /state serves it, and /job stays testable.
    if (!id) return { ok: false, reason: "push-blocked", brief: body };
    return { ok: true, id, brief: body };
  } catch (err) {
    // An FCM send failure must never crash the brain — surface it instead.
    return { ok: false, reason: "send-failed", error: err instanceof Error ? err.message : String(err), brief: body };
  }
}
