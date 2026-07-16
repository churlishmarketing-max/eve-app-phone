import { query } from "@anthropic-ai/claude-agent-sdk";
import { staticSystemPrompt } from "./persona.js";
import { buildContextPack } from "./context.js";
import { isQuietHours } from "./schedule.js";
import { sendPush, getLatestToken, isPushReady } from "./push.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";

// Generate the morning brief IN CHARACTER via the same persona layers. The
// ≤25-word cap is instructed here and enforced defensively below (01 §6, 04 §1).
export async function generateBrief(): Promise<string> {
  const pack = await buildContextPack("push", "morning brief: today's three, calendar, the avoided thing, floor status");
  const directive =
    `${pack}\n\n` +
    "[System task: write King's 7:00 AM morning brief as a single push notification. " +
    "HARD LIMIT 25 words. Substance first, exactly one clause of flavour. Use the LIVE " +
    "ledger in the context pack — Today's Three, floor status, open attention items. Lead " +
    "with the one thing that actually needs him today. No markdown, no quotes, no sign-off — " +
    "output only the notification text.]";

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

  const raw = await generateBrief();
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
        deeplink: "eve://today",
      },
    });
    return { ok: true, id, brief: body };
  } catch (err) {
    // An FCM send failure must never crash the brain — surface it instead.
    return { ok: false, reason: "send-failed", error: err instanceof Error ? err.message : String(err), brief: body };
  }
}
