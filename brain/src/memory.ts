import { db, isDbReady } from "./db.js";
import { embed, embeddingsAvailable } from "./embeddings.js";
import {
  guardDurableWrite,
  withholdTaintedRows,
  type DurableOrigin,
  type DurableVerdict,
  type RowProvenance,
} from "./durable.js";
import { pictureIntakeOn } from "./intake.js";

// THIS FILE IS THE CHOKE POINT (audit 6, X1). Every write that outlives a
// conversation goes through `saveMemory`, `appendMessage` or `logTouch` below,
// and all three ask `guardDurableWrite` before they touch a table. Nothing else
// in the brain inserts into `memory_entries` or `messages`. `touches` has two
// other writers and both are covered: floor.ts `logConversations` (behind the
// GREEN `log_conversation` tool) asks the identical door for the identical
// reason, and distill.ts's touch log is unreachable for a tainted conversation
// because the grouping filter drops it before the loop body runs — the same
// structure that protects the summary update beside it.
//
// THE THREE STORES, AND WHY THOSE THREE. Each one is read back to a MODEL later
// as something King is taken to have said:
//   memory_entries  -> context.ts, under "trust these over guesses", in EVERY
//                      conversation, and in every unattended worker's brief.
//   messages        -> context.ts replays ten turns; distill.ts lifts the
//                      transcript into memory_entries.
//   touches         -> pulse.ts feeds `summary` into the prompt that drafts the
//                      client update he sends.
//
// WHAT IS DELIBERATELY NOT GATED, said out loud so the next audit reads a
// decision rather than an omission: `jobs`, `attention_items`, `tasks`,
// `routine_days`, `runs` and `app_state`. None of them is recalled to a model as
// remembered fact — they are work queues and ledgers he reads on his own screen,
// every one of them either carded before it is acted on (dispatch, ops) or
// composed from his own clicks and numbers rather than from model prose. If one
// of them ever starts feeding a prompt, it joins the list above.
//
// `saveMemory`'s third parameter is REQUIRED on purpose. It used to be an
// optional `sourceConversation?: string`, and the writer that mattered most —
// save_note — simply left it off, which is how a row landed in his permanent
// spine with nothing on it saying where it came from and nothing asking whether
// a picture had been in the room. A required ORIGIN means the next durable
// writer does not compile until someone decides which kind it is.

export type MemoryKind = "fact" | "decision" | "promise" | "preference" | "event" | "lesson";

export interface MemoryHit {
  id: string;
  kind: string;
  content: string;
  salience: number;
  created_at: string;
  similarity?: number;
}

// ---- conversation / message persistence (03 §3: every exchange appends) ----

export async function ensureConversation(id: string, surface: string): Promise<void> {
  const c = db();
  if (!c) return;
  // Idempotent: the app reuses its conversationId across messages/restarts.
  const { error } = await c.from("conversations").upsert({ id, surface }, { onConflict: "id", ignoreDuplicates: true });
  if (error) console.warn("[memory] ensureConversation:", error.message);
}

/**
 * THE TRANSCRIPT. Gated since audit 6 (X1).
 *
 * chat.ts appended HER OWN REPLY here unconditionally — on picture turns, on the
 * exact turn picture.ts had just instructed her to say what she can see in the
 * screenshot. distill.ts then read every row in the window with no filter and
 * lifted it into permanent memory, and context.ts read that back into every
 * later conversation under "trust these over guesses". That is steps 3, 4 and 5
 * of the D6-10 chain, and it starts here.
 *
 * A TAINTED CONVERSATION LOSES ITS DURABLE TRANSCRIPT, AND THAT COSTS NOTHING
 * THAT IS EVER READ: chat.ts already refuses to replay history for a
 * conversation that is not provably clean (`replayHistory = !resumeSession &&
 * cleanConversation`), so these rows had exactly one consumer left — the
 * distiller, which is the leak.
 *
 * Returns whether the row landed, so the caller logs an honest line instead of
 * assuming. Never throws.
 */
export async function appendMessage(
  conversationId: string,
  role: "user" | "eve",
  content: string,
): Promise<{ ok: boolean; code: string }> {
  const c = db();
  if (!c) return { ok: false, code: "OFFLINE" };
  const verdict = await guardDurableWrite({ kind: "conversation", conversationId });
  if (!verdict.ok) {
    console.info(
      `[durable] messages WITHHELD for ${conversationId} (${verdict.code}) — this conversation is not provably free of a picture.`,
    );
    return { ok: false, code: verdict.code };
  }
  const { error } = await c.from("messages").insert({ conversation_id: conversationId, role, content });
  if (error) {
    console.warn("[memory] appendMessage:", error.message);
    return { ok: false, code: "ERROR" };
  }
  return { ok: true, code: "" };
}

// ---- writing memory ----

/**
 * THE PERMANENT SPINE. One writer, one gate, one required origin (audit 6, X1).
 *
 * `origin` replaced an optional `sourceConversation?: string`. That optionality
 * was the bug: `save_note` — GREEN, no confirm card, documented to her as
 * needing no confirmation — called this with two arguments, so the row it wrote
 * had a null source and no gate, and `searchMemory` read it back as fact into
 * every later conversation and into every unattended worker brief.
 *
 * `withheld` is not an error and must never be reported as one. It means the
 * write was REFUSED for a stated reason, and `say` is the sentence for it.
 */
export async function saveMemory(
  kind: MemoryKind,
  content: string,
  origin: DurableOrigin,
): Promise<{ ok: boolean; id?: string; error?: string; withheld?: DurableVerdict }> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const verdict = await guardDurableWrite(origin, { content, permanent: true });
  if (!verdict.ok) return { ok: false, withheld: verdict, error: verdict.say };
  const vectors = await embed([content], "document");
  const base = {
    kind,
    content,
    // STAMPED FROM THE ORIGIN, NEVER FROM A SEPARATE ARGUMENT. The read side
    // classifies a row by these two columns, so a conversation-origin row
    // that forgets to carry them is a row nothing can ever prove clean.
    source_conversation: origin.kind === "conversation" ? origin.conversationId : null,
    embedding: vectors?.[0] ?? null,
  };
  let { data, error } = await c
    .from("memory_entries")
    .insert({ ...base, origin: origin.kind })
    .select("id")
    .single();
  // SQL/006 IS NOT APPLIED ON HIS PROJECT, AND THIS WRITE MUST STILL LAND
  // (audit 7). `origin` is a column sql/006 adds; without it Postgres rejects
  // the whole insert, and the rejection is total — every note she takes, every
  // fact the distiller lifts, every check-in line, gone, with an error message
  // about a column he has never heard of. That is not a safe failure, it is
  // amnesia with a stack trace.
  //
  // A RETRY RATHER THAN A PROBE, deliberately: `durableOriginReady()` resolves
  // at boot and would have to be threaded, ordered and trusted; the store's own
  // answer to the actual statement cannot be stale or mis-sequenced. It costs
  // one extra round trip exactly once per write on a schema that lacks the
  // column, and zero once sql/006 is applied.
  //
  // THE ROW LANDS WITH A NULL ORIGIN, WHICH IS THE TRUTH ABOUT IT: this store
  // cannot record where it came from. While intake is off that costs nothing —
  // durable.ts withholds only a PROVED taint. Turn intake on without applying
  // sql/006 and these rows are quarantined on the read side, loudly, on
  // /health.durableOriginReady. That is the fail-closed posture audit 6 asked
  // for, and it is why this is a fallback and not the default shape.
  if (error && missingOriginColumn(error.message)) {
    ({ data, error } = await c.from("memory_entries").insert(base).select("id").single());
  }
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "the memory row did not come back from the store" };
  return { ok: true, id: data.id };
}

/**
 * IS THIS ERROR "sql/006 WAS NEVER APPLIED"?
 *
 * Narrow on purpose. It must not swallow a permissions error, a constraint
 * violation or a network fault into a silent retry that drops the origin stamp
 * — the only error this may match is the column genuinely not being there.
 */
function missingOriginColumn(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("origin") && (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"));
}

// ---- recall (03 §6) ----

/**
 * RECALL, FILTERED (audit 6, X2).
 *
 * The return shape changed from `MemoryHit[]` to `{hits, withheld}` on purpose.
 * There are three callers — her `search_memory` tool, the context pack built for
 * EVERY conversation, and the brief handed to UNATTENDED fleet workers — and all
 * three had to be made to acknowledge that a recall can now be trimmed. A
 * silently shorter list is the same lie as a silently dropped write.
 *
 * GATING THE WRITE WAS NOT ENOUGH: his store already holds rows written before
 * this fix, and D6-10's card was minted off exactly such a row.
 */
export async function searchMemory(query: string, k = 6): Promise<{ hits: MemoryHit[]; withheld: number }> {
  const c = db();
  if (!c) return { hits: [], withheld: 0 };

  let hits: MemoryHit[] = [];
  if (embeddingsAvailable()) {
    const vectors = await embed([query], "query");
    if (vectors) {
      const { data, error } = await c.rpc("match_memories", {
        query_embedding: vectors[0],
        match_count: k,
      });
      if (error) console.warn("[memory] match_memories:", error.message);
      else hits = (data as MemoryHit[]) ?? [];
    }
  }
  if (hits.length === 0) {
    // FTS fallback (also covers embedding-service hiccups).
    // Pass 1: strict websearch (ANDs terms — high precision). Pass 2: if
    // nothing hits, OR the terms — natural-language queries rarely share
    // every stem with the stored sentence ("decision" and "decided" don't
    // even stem alike). Salience ordering + limit keep the net tight.
    // ⚑VERIFIED live 2026-07-16: websearch_to_tsquery honors "or".
    const orQuery = query
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .join(" or ");
    for (const q of [query, orQuery]) {
      if (!q) continue;
      const { data, error } = await c
        .from("memory_entries")
        .select("id, kind, content, salience, created_at")
        .eq("status", "active")
        .textSearch("fts", q, { type: "websearch" })
        .order("salience", { ascending: false })
        .limit(k);
      if (error) {
        console.warn("[memory] fts search:", error.message);
        break;
      }
      hits = (data as MemoryHit[]) ?? [];
      if (hits.length > 0) break;
    }
  }

  // THE TAINT FILTER. `match_memories` is an RPC whose columns this file does
  // not control, so provenance is read back explicitly by id rather than
  // assumed to be on the hit — one select, working identically for the vector
  // path and the FTS fallback.
  const filtered = await withholdTaintedSources(hits);

  // BUMPED ONLY FOR WHAT SHE ACTUALLY READ. A withheld row must not have its
  // salience raised or its last_recalled_at moved: it was not recalled, and
  // teaching the decay job otherwise would keep a quarantined row pinned at the
  // top of the spine forever.
  await bumpRecalled(filtered.kept.map((h) => h.id));
  return { hits: filtered.kept, withheld: filtered.withheld };
}

/**
 * IS EACH OF THESE MEMORY ROWS PROVABLY CLEAN? Exported because context.ts reads
 * `memory_entries` directly for his open promises and must apply the identical
 * rule — two readers of one table filtering differently is how this class of bug
 * survives a fix.
 *
 * FAILS CLOSED. If provenance cannot be read at all — the select errors, sql/006
 * was never applied, the store is unconfigured — NOTHING is provably clean and
 * everything is withheld. "I could not check" is not "there was nothing", and
 * the count travels back so she can say which one it was.
 */
export async function withholdTaintedSources<T extends { id: string }>(
  rows: readonly T[],
): Promise<{ kept: T[]; withheld: number }> {
  if (rows.length === 0) return { kept: [], withheld: 0 };
  const c = db();
  if (!c) return { kept: [], withheld: rows.length };
  const ids = rows.map((r) => r.id);
  type ProvRow = { id?: unknown; source_conversation?: unknown; origin?: unknown };
  let data: ProvRow[] | null;
  let error: { message: string } | null;
  ({ data, error } = (await c
    .from("memory_entries")
    .select("id, source_conversation, origin")
    .in("id", ids)) as { data: ProvRow[] | null; error: { message: string } | null });
  // SQL/006 IS NOT APPLIED, AND THE ROWS ARE STILL CLASSIFIABLE (audit 7).
  //
  // MEASURED, NOT ASSUMED: with the origin column absent this select errors and
  // the old code below withheld the whole batch — EVERY row in his live store,
  // none recallable, every time, silently. Stated as a proportion because his
  // store grows: `npx tsx verify/recall-measure.ts` prints the actual pair
  // against whatever store it is pointed at, which is the only honest way to
  // put a number on this.
  //
  // So the select is re-issued WITHOUT the column that is not there. A row that
  // names a `source_conversation` still classifies as `conversation` and is
  // still JOINED to conversations.saw_image — nearly all of his rows — so the
  // one signal that actually exists is still read and still obeyed. Only the
  // handful with no source at all (the save_note population) fall through to
  // `unknown`, which is the honest answer for them. durable.ts decides what `unknown` MEANS; the classification and the
  // policy stay in separate files on purpose.
  //
  // AND IT IS GATED ON THE SWITCH, WHICH MATTERS MORE THAN IT LOOKS. With
  // intake ON, a missing sql/006 must stay exactly as loud as audit 6 left it:
  // recall returns NOTHING and /health.durableOriginReady says false, so "she
  // has forgotten everything" and "a migration was never applied" are the same
  // sentence. Retrying there would quietly restore half a recall and hide the
  // missing migration, which is the silent-degradation failure this whole build
  // exists to avoid — pointed the other way.
  if (error && !pictureIntakeOn() && missingOriginColumn(error.message)) {
    ({ data, error } = await c.from("memory_entries").select("id, source_conversation").in("id", ids));
  }
  if (error || !data) {
    // WITH THE DOOR SHUT, REACHING HERE MEANS THE STORE IS BROKEN, NOT THAT A
    // MIGRATION IS MISSING (audit 7, S3). The retry above already re-issued the
    // select without `origin`, so a missing sql/006 cannot land on this line
    // while intake is off — only a real failure can. Telling him to apply a
    // migration here would be pointing at the wrong thing, and pointing him at
    // a SQL editor he does not need to open.
    console.warn(
      `[durable] memory provenance unreadable (${error?.message ?? "no rows"}) — withholding ${rows.length} recalled row(s). ` +
        (pictureIntakeOn()
          ? `Apply brain/sql/006_durable_origin.sql.`
          : `Picture intake is OFF and the no-origin retry already ran, so this is the memory spine failing, not a missing migration — do NOT apply sql/006 for it.`),
    );
    return { kept: [], withheld: rows.length };
  }
  const provById = new Map<string, RowProvenance>();
  for (const r of data as { id?: unknown; source_conversation?: unknown; origin?: unknown }[]) {
    if (typeof r.id !== "string") continue;
    if (r.origin === "system") provById.set(r.id, { kind: "system" });
    else if (r.origin === "conversation" && typeof r.source_conversation === "string") {
      provById.set(r.id, { kind: "conversation", conversationId: r.source_conversation });
    } else if (!("origin" in r) && typeof r.source_conversation === "string") {
      // SQL/006 IS NOT APPLIED — THE COLUMN WAS NOT IN THE SELECT AT ALL, so
      // `origin` is missing from the row rather than null (audit 7). That is a
      // real distinction and it is worth keeping: a row that names a source
      // conversation came out of a conversation whatever the schema can record,
      // so it is STILL JOINED to `conversations.saw_image` and a positive taint
      // there still withholds it. Nearly every row in his store carries a
      // source; only the ones that do not fall through to `unknown` below.
      //
      // This is what stops the intake-off path from being a blanket amnesty: the
      // one signal that actually exists is still read, and it is still obeyed.
      provById.set(r.id, { kind: "conversation", conversationId: r.source_conversation });
    } else {
      // NO RECORDED ORIGIN. Every row written before this build lands here, and
      // that population is exactly the one D6-10's card was minted out of —
      // save_note wrote a null source and no origin at all. Nothing in this
      // repo can classify them after the fact, so they are withheld.
      provById.set(r.id, { kind: "unknown" });
    }
  }
  const f = await withholdTaintedRows(rows, (row) => provById.get(row.id) ?? { kind: "unknown" });
  return { kept: f.kept, withheld: f.withheld };
}

async function bumpRecalled(ids: string[]): Promise<void> {
  const c = db();
  if (!c || ids.length === 0) return;
  // Two small updates beat a custom RPC at this scale.
  const { data, error } = await c
    .from("memory_entries")
    .select("id, salience")
    .in("id", ids);
  if (error || !data) return;
  await Promise.all(
    data.map((row) =>
      c
        .from("memory_entries")
        .update({ salience: Math.min(5, (row.salience ?? 3) + 1), last_recalled_at: new Date().toISOString() })
        .eq("id", row.id),
    ),
  );
}

// ---- client touches (03 §3: drafts do NOT count) ----

// Deliberate matcher instead of a bare ilike '%name%' (review C30: "Art"
// matching "Artisan Bakery" AND "Art Supply Co" filed touches on the wrong
// client). Exact → prefix → unique substring; ambiguous → no match, with the
// candidates named so EVE can ask instead of guessing.
export async function matchClient(
  name: string,
): Promise<{ id: string; name: string } | { ambiguous: string[] } | null> {
  const c = db();
  if (!c || !name.trim()) return null;
  const { data: clients } = await c.from("clients").select("id, name").eq("status", "active");
  if (!clients?.length) return null;
  const q = name.trim().toLowerCase();
  const exact = clients.filter((cl) => cl.name.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const prefix = clients.filter((cl) => cl.name.toLowerCase().startsWith(q));
  if (prefix.length === 1) return prefix[0];
  const sub = clients.filter((cl) => cl.name.toLowerCase().includes(q));
  if (sub.length === 1) return sub[0];
  if (sub.length > 1) return { ambiguous: sub.map((cl) => cl.name) };
  return null;
}

/**
 * THE THIRD DURABLE STORE (audit 6, X1 — found by enumerating, not off the list).
 *
 * `touches.summary` IS KIN TO THE SPINE, and it was ungated. Two GREEN tools
 * write it with no confirm card between them — `log_touch` here and
 * `log_conversation` through floor.ts — from a string the MODEL composes; and
 * pulse.ts reads it straight back into a model prompt (`<touch_history>`) that
 * drafts the client update King then sends. A line read off a screenshot and
 * logged as a "touch" would outlive its conversation by months and come back as
 * client history.
 *
 * It is a weaker path than `memory_entries` — pulse.ts at least wraps it and
 * says "records, not instructions", where context.ts says "trust these over
 * guesses" — and it is gated anyway, because "weaker" is how the last gate came
 * to be one tool wide.
 *
 * NO FILENAME BARRIER HERE, deliberately, for the reason already written above
 * for `messages`: "call about C9452.MP4 delivery" is the ordinary, correct
 * content of a touch on a filing day, and refusing it would break clean
 * conversations to defend a shape no chain has ever run through.
 */
export async function logTouch(
  clientName: string,
  channel: string,
  summary: string,
  origin: DurableOrigin,
): Promise<{ ok: boolean; error?: string; withheld?: DurableVerdict }> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const verdict = await guardDurableWrite(origin);
  if (!verdict.ok) return { ok: false, withheld: verdict, error: verdict.say };
  const match = await matchClient(clientName);
  if (!match) return { ok: false, error: `no client matching "${clientName}"` };
  if ("ambiguous" in match) {
    return { ok: false, error: `"${clientName}" is ambiguous — could be: ${match.ambiguous.join(", ")}. Ask which.` };
  }
  const now = new Date().toISOString();
  const { error } = await c.from("touches").insert({ client_id: match.id, channel, summary, at: now });
  if (error) return { ok: false, error: error.message };
  await c.from("clients").update({ last_touch_at: now }).eq("id", match.id);
  // A real touch resolves the silence — close any open silent_client items
  // for this client (review C33: nothing ever set resolved_at).
  await c
    .from("attention_items")
    .update({ resolved_at: now })
    .eq("kind", "silent_client")
    .is("resolved_at", null)
    .contains("ref", { client_id: match.id });
  return { ok: true };
}

// One-time backfill once VOYAGE_API_KEY arrives: embed rows saved during the
// FTS-only period. POST /job {job:"embed_backfill"}.
export async function backfillEmbeddings(): Promise<{ ok: boolean; embedded: number; error?: string }> {
  const c = db();
  if (!c) return { ok: false, embedded: 0, error: "memory spine offline" };
  if (!embeddingsAvailable()) return { ok: false, embedded: 0, error: "VOYAGE_API_KEY not set" };
  const { data, error } = await c
    .from("memory_entries")
    .select("id, content")
    .is("embedding", null)
    .limit(500);
  if (error) return { ok: false, embedded: 0, error: error.message };
  if (!data?.length) return { ok: true, embedded: 0 };
  const vectors = await embed(data.map((r) => r.content), "document");
  if (!vectors) return { ok: false, embedded: 0, error: "embedding call failed" };
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    const { error: upErr } = await c.from("memory_entries").update({ embedding: vectors[i] }).eq("id", data[i].id);
    if (!upErr) n++;
  }
  return { ok: true, embedded: n };
}

export { isDbReady };
