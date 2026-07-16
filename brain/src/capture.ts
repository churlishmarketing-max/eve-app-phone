import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "./db.js";
import { matchClient } from "./memory.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";

// POST /capture — any door in (01 §5). Phase 2: app text / voice-note
// transcript. Email webhook joins in Phase 3 via the same endpoint.
// Parses → task, files to the right client, keeps the source link.
// Unmatchable → still lands as a task in the inbox (the inbox exists to be emptied).

interface Parsed {
  title: string;
  detail?: string;
  client?: string;
  due?: string; // ISO date if stated
}

function extractJson(s: string): Parsed | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Parsed;
  } catch {
    return null;
  }
}

export async function runCapture(
  text: string,
  sourceLink?: string,
): Promise<{ ok: boolean; task?: Record<string, unknown>; error?: string }> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };

  let out = "";
  const q = query({
    prompt:
      `Today is ${new Date().toISOString().slice(0, 10)} (${process.env.EVE_TZ || "America/Chicago"}).\n` +
      `Captured input (may be rambling — find the ask inside it):\n<input>\n${text}\n</input>\n\n` +
      `Return STRICT JSON only: {"title": "imperative task title", "detail": "context worth keeping or null", ` +
      `"client": "client name if one is clearly referenced else null", "due": "ISO date (resolve relative dates like 'Friday' using today) if a deadline is stated else null"}`,
    options: {
      model: MODEL,
      systemPrompt: "You turn raw captured notes into one clean task. JSON only, no commentary.",
      allowedTools: [],
      maxTurns: 1,
    },
  });
  for await (const m of q) {
    if (m.type === "result" && m.subtype === "success") out = m.result;
  }
  // Unmatchable still lands in the inbox (04 §6) — fall back to the raw text
  // as the task title rather than losing the capture.
  const parsed = extractJson(out) ?? { title: text.trim().slice(0, 120) };
  if (!parsed.title) parsed.title = text.trim().slice(0, 120) || "(empty capture)";

  let clientId: string | null = null;
  if (parsed.client) {
    const match = await matchClient(parsed.client);
    if (match && !("ambiguous" in match)) clientId = match.id;
  }

  const { data: task, error } = await c
    .from("tasks")
    .insert({
      title: parsed.title,
      detail: parsed.detail ?? null,
      client_id: clientId,
      source_link: sourceLink ?? null,
      // LLM output — validate before converting; a bad date degrades to a
      // task with no due date instead of a RangeError losing the capture.
      // Date-only strings get local noon appended: bare "2026-07-18" parses
      // as UTC midnight, which lands a day EARLY in Central time (review C8).
      due_at: (() => {
        if (!parsed.due) return null;
        const raw = /^\d{4}-\d{2}-\d{2}$/.test(parsed.due) ? `${parsed.due}T12:00:00` : parsed.due;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d.toISOString();
      })(),
    })
    .select("id, title, detail, client_id, due_at")
    .single();
  if (error) return { ok: false, error: error.message };

  // Unmatched captures surface in the inbox with an attention item (04 §6) —
  // the inbox exists to be emptied, not to hide things (review C41).
  if (!clientId && parsed.client) {
    await c.from("attention_items").insert({
      kind: "capture_inbox",
      message: `Captured "${parsed.title}" — couldn't match client "${parsed.client}". File it.`,
      nudge_level: 1,
      ref: { task_id: (task as { id?: string })?.id ?? null, claimed_client: parsed.client },
    });
  }
  return { ok: true, task };
}
