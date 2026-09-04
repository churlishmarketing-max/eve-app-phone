import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "./db.js";
import { matchClient, saveMemory, type MemoryKind } from "./memory.js";
import { readPictureTaintMany } from "./taint.js";
import { pictureIntakeOn } from "./intake.js";

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
  // missed 02:00 run must not silently lose memories (review C3/C16). THIS
  // SELECT IS WHY THE STAMP AT THE BOTTOM OF THIS FUNCTION IS CONDITIONAL:
  // `ok:true` here is the whole memory of which nights are done, so a run that
  // could not judge its window must not write one. The floor
  // is a safety valve against a monster prompt after a long outage, NOT a
  // memory limit: the raw messages persist forever regardless, and distillation
  // runs nightly so the real window is ~1 day. Floored at 45 days so even a
  // multi-week outage still gets distilled into long-term memory (King's
  // "full memory" ask, 2026-07-17).
  const { data: lastRun } = await c
    .from("runs")
    .select("at")
    .eq("job", "distill")
    .eq("ok", true)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const floorAgo = Date.now() - 45 * 86400_000;
  const dayAgo = Date.now() - 24 * 3600_000;
  const sinceMs = lastRun?.at ? Math.max(Date.parse(lastRun.at), floorAgo) : dayAgo;
  const since = new Date(sinceMs).toISOString();
  const { data: msgs, error } = await c
    .from("messages")
    .select("conversation_id, role, content, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, reason: error.message };
  if (!msgs?.length) return { ok: true, conversations: 0, entries: 0, superseded: 0, touches: 0 };

  // ---- STEP 4 OF THE D6-10 CHAIN, CLOSED (audit 6, X2) --------------------
  //
  // THIS SELECT TOOK EVERY `messages` ROW IN THE WINDOW WITH NO TAINT FILTER,
  // handed the transcript to a model, and inserted whatever came back into the
  // permanent spine. So her own reply describing a screenshot — written on the
  // exact turn picture.ts had instructed her to describe it — became a durable
  // "fact" with a folder name in it, which searchMemory then read into a fresh,
  // clean thread under "trust these over guesses".
  //
  // chat.ts no longer writes those rows at all. THIS IS THE OTHER HALF, and it
  // is not redundant: his store already holds rows written before that fix, and
  // this job's window reaches back up to 45 days.
  //
  // THE PREDICATE FOLLOWS THE SWITCH, THE WAY src/durable.ts DOES (its "ONE
  // BRANCH" block — read that before changing this one). Read ONCE, outside the
  // loop, so every conversation in one window is judged by the same rule.
  //
  //   INTAKE ON  — distilled only if PROVED clean. Unknown withholds in every
  //                direction: sql/005 unapplied, an errored select, a missing
  //                row. That is audit 6's rule, unchanged.
  //   INTAKE OFF — withheld only if PROVED tainted. No picture can reach this
  //                brain while the door is shut, so an unclassifiable
  //                conversation is unclassifiable about a picture that does not
  //                exist. A POSITIVE taint still withholds in both states.
  //
  // AND THE WINDOW SURVIVES AN ANSWER THAT CANNOT BE READ.
  //
  // The line that used to sit here said "a nightly job that skips a day is
  // recoverable". IT WAS FALSE, and the thing that falsified it is 40 lines up:
  // `since` is the `at` of the last run this job stamped ok:true. A night whose
  // taint read failed made every id "unknown", quarantined every conversation,
  // distilled nothing — and then stamped ok:true anyway, which moved the window
  // PAST the messages it had just dropped. No later run ever looked at them
  // again. One flaky select was a permanent, silent hole in her memory.
  //
  // SO A CONVERSATION WITHHELD FOR LACK OF EVIDENCE NOW FAILS THE RUN. `runs`
  // still gets a row — a night that did not process its window must be visible
  // in the ledger, not silent — but with ok:false, and the `since` select above
  // reads ok:true only. The same window is therefore re-read on the next run:
  // the recoverable skip the old comment promised, now actually true.
  //
  // A conversation withheld on a PROVED TAINT is the other thing entirely and
  // does NOT fail the run. That is a verdict, permanent and correct; re-reading
  // the window forever because of one would stall distillation instead of
  // retrying it. Only ABSENCE of an answer is a retry.
  const convIds = [...new Set(msgs.map((m) => m.conversation_id).filter((s): s is string => typeof s === "string"))];
  const convTaint = await readPictureTaintMany(convIds);
  const intakeOn = pictureIntakeOn();
  const distillable = (id: string): boolean =>
    intakeOn ? convTaint.get(id) === "clean" : convTaint.get(id) !== "tainted";
  const quarantined = convIds.filter((id) => !distillable(id));
  // The ones dropped because the answer could not be READ rather than because
  // it came back positive. Empty by construction while intake is off.
  const unreadable = quarantined.filter((id) => convTaint.get(id) === "unknown");
  if (quarantined.length) {
    console.warn(
      `[distill] ${quarantined.length} of ${convIds.length} conversation(s) in this window are not provably ` +
        `free of a picture — NOT distilled, and no summary written for them.` +
        (unreadable.length
          ? ` ${unreadable.length} of those could not be read at all, so THIS RUN DOES NOT STAMP A SUCCESSFUL ` +
            `WINDOW and the same window is distilled again on the next run.`
          : ""),
    );
  }

  // Existing active memories — so the distiller can supersede contradictions.
  const { data: existing } = await c
    .from("memory_entries")
    .select("id, kind, content")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);

  // Group by conversation — a conversation the predicate above refused never
  // enters the map, so nothing downstream (the summary update, the entry
  // inserts, the touch log) can reach it by any route. Same predicate, one
  // definition: the two used to be spelled out separately and could drift.
  const byConv = new Map<string, { role: string; content: string }[]>();
  for (const m of msgs) {
    if (!distillable(m.conversation_id)) continue;
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

    // Durable, and derived from the transcript — so it is reachable only for a
    // conversation the filter above proved clean. `byConv` never holds a
    // tainted or unreadable one, which is why this line does not need its own
    // gate and why the filter is a `continue` in the grouping loop rather than
    // a check at each write site.
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
    // THROUGH THE ONE DOOR (audit 6, X1). This used to be a raw insert into
    // `memory_entries` — a fourth durable writer, beside save_memory, save_note
    // and the vitals note, each with its own idea of what a permanent row needs.
    // It now goes through saveMemory like everything else, which re-asks the
    // taint at write time, stamps the origin the read side classifies by, and
    // applies the filename barrier. The conversation was already checked above;
    // this is the belt that does not depend on remembering the braces.
    if (valid.length) {
      for (const entry of valid) {
        const r = await saveMemory(entry.kind as MemoryKind, entry.content, {
          kind: "conversation",
          conversationId: convId,
        });
        if (r.withheld) console.warn(`[distill] entry WITHHELD (${convId}): ${r.withheld.code}`);
        else if (!r.ok) console.warn(`[distill] entry insert failed (${convId}): ${r.error}`);
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

  // THE STAMP IS A CLAIM ABOUT THE WINDOW, NOT ABOUT THE PROCESS REACHING THE
  // END OF THIS FUNCTION. `ok:true` is the only thing that moves `since`
  // forward, so it may be written only when every conversation in the window
  // was actually JUDGED. If any could not be, the row still goes in — with
  // ok:false, naming how many — and the next run reads the same window again.
  const windowIncomplete = unreadable.length > 0;
  await c.from("runs").insert({
    job: "distill",
    ok: !windowIncomplete,
    detail: {
      conversations: byConv.size,
      entries: totalEntries,
      superseded: totalSuperseded,
      touches: totalTouches,
      decayed,
      ...(windowIncomplete ? { unreadable: unreadable.length, since, windowRetried: true } : {}),
    },
  });

  if (windowIncomplete) {
    return {
      ok: false,
      reason:
        `${unreadable.length} of ${convIds.length} conversation(s) in this window could not be checked for a ` +
        `picture, so they were not distilled — this window is NOT stamped as done and is read again next run`,
      conversations: byConv.size,
      entries: totalEntries,
      superseded: totalSuperseded,
      touches: totalTouches,
    };
  }

  return { ok: true, conversations: byConv.size, entries: totalEntries, superseded: totalSuperseded, touches: totalTouches };
}
