import { db, isDbReady } from "./db.js";
import { embed, embeddingsAvailable } from "./embeddings.js";

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

export async function appendMessage(conversationId: string, role: "user" | "eve", content: string): Promise<void> {
  const c = db();
  if (!c) return;
  const { error } = await c.from("messages").insert({ conversation_id: conversationId, role, content });
  if (error) console.warn("[memory] appendMessage:", error.message);
}

// ---- writing memory ----

export async function saveMemory(
  kind: MemoryKind,
  content: string,
  sourceConversation?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const vectors = await embed([content], "document");
  const { data, error } = await c
    .from("memory_entries")
    .insert({
      kind,
      content,
      source_conversation: sourceConversation ?? null,
      embedding: vectors?.[0] ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

// ---- recall (03 §6) ----

export async function searchMemory(query: string, k = 6): Promise<MemoryHit[]> {
  const c = db();
  if (!c) return [];

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

  // Recall bump: +1 salience (cap 5) + last_recalled_at, per spec.
  await bumpRecalled(hits.map((h) => h.id));
  return hits;
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

export async function logTouch(
  clientName: string,
  channel: string,
  summary: string,
): Promise<{ ok: boolean; error?: string }> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
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
