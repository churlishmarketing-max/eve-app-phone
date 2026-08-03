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

// Generate the morning brief IN CHARACTER via the same persona layers. The
// ≤25-word cap is instructed here and enforced defensively below (01 §6, 04 §1).
export async function generateBrief(bodyClause = ""): Promise<string> {
  const pack = await buildContextPack("push", "morning brief: today's three, calendar, the avoided thing, floor status");
  const directive =
    `${pack}\n\n` +
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

// force=true bypasses the quiet-hours guard (for manual testing via POST /job).
export async function runMorningBrief(force = false): Promise<BriefResult> {
  if (!force && isQuietHours(new Date())) return { ok: false, reason: "quiet-hours" };

  // One push, one clause. The body read is folded INTO the brief — it never
  // becomes a second notification (04 §1: quiet mornings stay one ping).
  const vitals = await buildVitals();
  const raw = await generateBrief(briefBodyClause(vitals));
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
