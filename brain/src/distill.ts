import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "./db.js";
import { embed } from "./embeddings.js";
import { matchClient } from "./memory.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";

// Nightly distillation (03 §5): she remembers the SUBSTANCE of the day, the
// way a person does — not a transcript dump. Runs at 02:00 via cron, or
// POST /job {job:"distill"}.

interface Distilled {
  summary: string;
  entries: { kind: "fact" | "decision" | "promise" | "preference" | "event" | "lesson"; content: string }[];
  superseded_ids: string[];
  touches: { client: string; channel: string; summary: string }[];
}

function extractJson(s: string): Distilled | null {
  const match = s.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Distilled;
  } catch {
    return null;
  }
}

async function runDistiller(prompt: string): Promise<string> {
  let out = "";
  const q = query({
    prompt,
    options: {
      model: MODEL,
      systemPrompt:
        "You are EVE's nightly memory distiller. You read a day of conversation and extract only what is " +
        "durable. Output STRICT JSON, nothing else. Never invent content that is not in the transcript.",
      allowedTools: [],
      disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch"],
      maxTurns: 1,
    },
  });
  for await (const m of q) {
    if (m.type === "result" && m.subtype === "success") out = m.result;
  }
  return out;
}

export interface DistillResult {
  ok: boolean;
  reason?: string;
  conversations?: number;
  entries?: number;
  superseded?: number;
  touches?: number;
}

export async function runDistill(): Promise<DistillResult> {
  const c = db();
  if (!c) return { ok: false, reason: "memory spine offline" };

  // Window starts at the last SUCCESSFUL distill, not a fixed now-24h — a
  // missed 02:00 run must not silently lose a day of memories (review C3/C16).
  // Capped at 7 days so a long outage doesn't produce a monster prompt.
  const { data: lastRun } = await c
    .from("runs")
    .select("at")
    .eq("job", "distill")
    .eq("ok", true)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const weekAgo = Date.now() - 7 * 86400_000;
  const dayAgo = Date.now() - 24 * 3600_000;
  const sinceMs = lastRun?.at ? Math.max(Date.parse(lastRun.at), weekAgo) : dayAgo;
  const since = new Date(sinceMs).toISOString();
  const { data: msgs, error } = await c
    .from("messages")
    .select("conversation_id, role, content, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, reason: error.message };
  if (!msgs?.length) return { ok: true, conversations: 0, entries: 0, superseded: 0, touches: 0 };

  // Existing active memories — so the distiller can supersede contradictions.
  const { data: existing } = await c
    .from("memory_entries")
    .select("id, kind, content")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);

  // Group by conversation.
  const byConv = new Map<string, { role: string; content: string }[]>();
  for (const m of msgs) {
    const arr = byConv.get(m.conversation_id) ?? [];
    arr.push({ role: m.role, content: m.content });
    byConv.set(m.conversation_id, arr);
  }

  let totalEntries = 0;
  let totalSuperseded = 0;
  let totalTouches = 0;

  for (const [convId, turns] of byConv) {
    const transcript = turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");
    const existingBlock = (existing ?? [])
      .map((e) => `${e.id} [${e.kind}] ${e.content}`)
      .join("\n");

    const prompt =
      `Day's transcript for one conversation:\n<transcript>\n${transcript.slice(0, 60_000)}\n</transcript>\n\n` +
      `Existing active memories (id [kind] content):\n<memories>\n${existingBlock || "(none)"}\n</memories>\n\n` +
      `Return STRICT JSON only:\n` +
      `{\n` +
      `  "summary": "2-4 sentence summary of the conversation's substance",\n` +
      `  "entries": [{"kind": "fact|decision|promise|preference|event|lesson", "content": "one self-contained sentence with names/numbers/dates"}],\n` +
      `  "superseded_ids": ["ids of existing memories this day's events contradict or replace"],\n` +
      `  "touches": [{"client": "name", "channel": "email|call|slack|meeting|app", "summary": "one line"}]\n` +
      `}\n` +
      `Rules: entries are DURABLE only (decisions, promises, preferences, real events, lessons) — no chit-chat. ` +
      `touches ONLY for client contact the transcript states actually happened (drafts do not count). ` +
      `Empty arrays are fine. Do not restate existing memories as new entries.`;

    const raw = await runDistiller(prompt);
    const d = extractJson(raw);
    if (!d) {
      console.warn(`[distill] unparseable distiller output for ${convId}`);
      continue;
    }

    await c.from("conversations").update({ summary: d.summary }).eq("id", convId);

    // Validate LLM output before it touches the DB (review C4/C12): a bad
    // kind hits the CHECK constraint, and one bad row must not kill the
    // whole batch — insert per row and LOG failures.
    const KINDS = new Set(["fact", "decision", "promise", "preference", "event", "lesson"]);
    const valid = (d.entries ?? []).filter(
      (e) => e && KINDS.has(e.kind) && typeof e.content === "string" && e.content.trim().length > 0,
    );
    if (valid.length < (d.entries?.length ?? 0)) {
      console.warn(`[distill] dropped ${(d.entries!.length - valid.length)} malformed entries for ${convId}`);
    }
    if (valid.length) {
      const vectors = await embed(valid.map((e) => e.content), "document");
      for (let i = 0; i < valid.length; i++) {
        const { error: insErr } = await c.from("memory_entries").insert({
          kind: valid[i].kind,
          content: valid[i].content,
          source_conversation: convId,
          embedding: vectors?.[i] ?? null,
        });
        if (insErr) console.warn(`[distill] entry insert failed (${convId}): ${insErr.message}`);
        else totalEntries += 1;
      }
    }

    // Supersede, never delete — history matters (03 §5). IDs are
    // LLM-supplied: validate as UUIDs so one malformed id can't abort the
    // whole update (review C13).
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const supIds = (d.superseded_ids ?? []).filter((id) => typeof id === "string" && UUID.test(id));
    if (supIds.length) {
      const { error: supErr } = await c.from("memory_entries").update({ status: "superseded" }).in("id", supIds);
      if (supErr) console.warn(`[distill] supersede failed (${convId}): ${supErr.message}`);
      else totalSuperseded += supIds.length;
    }

    for (const t of d.touches ?? []) {
      const match = await matchClient(t.client);
      if (!match || "ambiguous" in match) continue;
      // In-flight log_touch already recorded most real contact — don't
      // double-count the sales floor (review C42): skip if this client
      // already has a touch inside the distill window.
      const { data: dup } = await c
        .from("touches")
        .select("id")
        .eq("client_id", match.id)
        .gte("at", since)
        .limit(1);
      if (dup?.length) continue;
      await c.from("touches").insert({ client_id: match.id, channel: t.channel, summary: t.summary });
      await c.from("clients").update({ last_touch_at: new Date().toISOString() }).eq("id", match.id);
      totalTouches += 1;
    }
  }

  // Monthly decay (03 §5 rule 5): decay salience by 1 (floor 1) for entries
  // unrecalled in 30 days. Guarded by the runs ledger so a double-run on the
  // 1st doesn't decay twice, and a missed 1st catches up on the next run
  // (review C2/C43): decay fires when no decay-marked run exists this month.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: decayedRun } = await c
    .from("runs")
    .select("id")
    .eq("job", "distill")
    .gte("at", monthStart.toISOString())
    .contains("detail", { decayed: true })
    .limit(1);
  let decayed = false;
  if (!decayedRun?.length) {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: stale } = await c
      .from("memory_entries")
      .select("id, salience")
      .eq("status", "active")
      .gt("salience", 1)
      .or(`last_recalled_at.lt.${cutoff},and(last_recalled_at.is.null,created_at.lt.${cutoff})`);
    for (const row of stale ?? []) {
      await c.from("memory_entries").update({ salience: Math.max(1, row.salience - 1) }).eq("id", row.id);
    }
    decayed = true;
  }

  await c.from("runs").insert({
    job: "distill",
    ok: true,
    detail: { conversations: byConv.size, entries: totalEntries, superseded: totalSuperseded, touches: totalTouches, decayed },
  });

  return { ok: true, conversations: byConv.size, entries: totalEntries, superseded: totalSuperseded, touches: totalTouches };
}
