import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "./db.js";

// HISTORY — her transcript, read back for the OS (King: "there's no history, so
// I can't go back and check what I asked her to do").
//
//   GET /conversations?limit=30
//     → { conversations: [{ id, surface, started_at, last_at, preview, count }] }
//   GET /conversations/:id/messages?limit=200
//     → { id, surface, started_at, messages: [{ role, content, created_at }] }
//
// READ-ONLY, AND ONLY THAT. Nothing here inserts, updates, upserts, deletes or
// calls an RPC; it does not distill, bump salience or mark anything read. The
// harness (verify/history-harness.ts) runs every read against a fake client that
// records any write and asserts there were none.
//
// NOTHING ABOUT A MESSAGE IS LOGGED. There is no console call in this file.
// Content goes back exactly as stored — the OS renders it as text.
//
// BEARER-ONLY. index.ts mounts both routes behind the one bearer middleware and
// os-ticket.ts does NOT list them, so a browser holding an OS ticket gets a 401
// here: the OS proxies history from its own server with its server bearer.
//
// WHY THE LIST IS BUILT THE WAY IT IS (no view, no migration):
//   1. Scan the newest message rows — (conversation_id, created_at) only, no
//      content — a page at a time, until `limit` distinct conversations are
//      found. Rows come newest-first, so a conversation first seen later can
//      never outrank one already seen: the first `limit` found ARE the newest.
//      Paged because Supabase's PostgREST cuts any select at its max-rows
//      setting (1000 by default) without an error, so a bare .limit(2000)
//      would quietly return 1000. Bounded by SCAN_MAX rows in total.
//   2. For each of those (≤ 100, a few at a time): an exact count and the first
//      `user` message. Per conversation, not from the scan, because the phone
//      keeps one conversationId in localStorage across days — a single thread
//      can be thousands of rows, and a count or "first message" read off a
//      bounded window would be wrong for exactly the thread he uses most.
//   3. The conversation rows (surface, started_at) in one `in` select.

export const LIST_DEFAULT = 30;
export const LIST_MAX = 100;
export const MESSAGES_DEFAULT = 200;
export const MESSAGES_MAX = 500;
export const PREVIEW_MAX = 100;
/** One scan page. Supabase's default PostgREST max-rows; a larger request is cut to this silently. */
export const SCAN_PAGE = 1000;
/** The most recent-activity rows one list call will scan. */
export const SCAN_MAX = 5000;
/** How many conversations' counts/previews are read at once. */
export const STATS_CONCURRENCY = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConversationSummary {
  id: string;
  surface: string;
  started_at: string | null;
  last_at: string;
  preview: string;
  count: number;
}

export interface HistoryMessage {
  role: string;
  content: string;
  created_at: string;
}

export interface ConversationMessages {
  id: string;
  surface: string;
  started_at: string | null;
  messages: HistoryMessage[];
}

export interface ActivityRow {
  conversation_id: string | null;
  created_at: string | null;
}

export interface ConversationRow {
  id: string;
  surface: string;
  started_at: string | null;
}

export interface ConversationStats {
  count: number;
  /** The first `user` message's content as stored, or null when there is none. */
  firstUser: string | null;
}

/**
 * The five reads history needs, and nothing else. The live one is
 * supabaseHistoryStore; the harness passes an in-memory one. Every method
 * THROWS on a store error — the route turns that into a 500.
 */
export interface HistoryStore {
  /** Message rows newest-first (created_at desc, id desc), rows offset..offset+n-1. */
  activityPage(offset: number, n: number): Promise<ActivityRow[]>;
  conversations(ids: string[]): Promise<ConversationRow[]>;
  conversation(id: string): Promise<ConversationRow | null>;
  stats(id: string): Promise<ConversationStats>;
  /** The newest `n` messages of one conversation, newest-first. */
  lastMessages(id: string, n: number): Promise<HistoryMessage[]>;
}

// ---- pure pieces -----------------------------------------------------------

/** A query-string limit → an integer in 1..max. Missing, blank or non-numeric → def. */
export function clampLimit(raw: unknown, def: number, max: number): number {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string" && raw.trim() !== "") n = Number(raw);
  else return def;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(1, Math.round(n)));
}

export function isUuid(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}

/**
 * Whitespace collapsed to single spaces, then cut to PREVIEW_MAX characters
 * (code points, so an emoji is never split); a cut preview ends in "…" and is
 * still PREVIEW_MAX long. No user message → "".
 */
export function previewOf(content: string | null | undefined): string {
  if (!content) return "";
  const flat = content.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= PREVIEW_MAX) return flat;
  return chars.slice(0, PREVIEW_MAX - 1).join("") + "…";
}

function ms(t: string | null | undefined): number {
  const v = t ? Date.parse(t) : NaN;
  return Number.isNaN(v) ? -Infinity : v;
}

/**
 * Newest-first activity rows → the ids of the newest `limit` conversations,
 * with the time of each one's last message. Stops taking NEW ids at `limit`:
 * the rows are newest-first, so anything first seen after that is older.
 * Rows with no conversation_id are skipped.
 */
export function takeNewest(
  rows: readonly ActivityRow[],
  limit: number,
  into: Map<string, string | null> = new Map(),
): Map<string, string | null> {
  for (const r of rows) {
    const id = r.conversation_id;
    if (typeof id !== "string" || !id) continue;
    const had = into.get(id);
    if (had === undefined) {
      if (into.size >= limit) continue;
      into.set(id, r.created_at);
    } else if (ms(r.created_at) > ms(had)) {
      into.set(id, r.created_at);
    }
  }
  return into;
}

export interface ListCandidate {
  row: ConversationRow;
  /** Time of its newest message, or null when it has none. */
  lastMessageAt: string | null;
  stats: ConversationStats;
}

/**
 * THE LIST'S SHAPE. Zero-message conversations are dropped; last_at is the last
 * message's time (started_at only if that is somehow missing); newest last_at
 * first, id as the tie-break; at most `limit`.
 */
export function shapeConversationList(candidates: readonly ListCandidate[], limit: number): ConversationSummary[] {
  const out: ConversationSummary[] = [];
  for (const c of candidates) {
    if (!(c.stats.count > 0)) continue;
    const last = c.lastMessageAt ?? c.row.started_at;
    if (!last) continue;
    out.push({
      id: c.row.id,
      surface: c.row.surface,
      started_at: c.row.started_at,
      last_at: last,
      preview: previewOf(c.stats.firstUser),
      count: c.stats.count,
    });
  }
  out.sort((a, b) => ms(b.last_at) - ms(a.last_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out.slice(0, Math.max(0, limit));
}

/** Newest-first rows → the newest `limit` of them, oldest first. */
export function chronologicalWindow(newestFirst: readonly HistoryMessage[], limit: number): HistoryMessage[] {
  return newestFirst
    .slice(0, Math.max(0, limit))
    .reverse()
    .map((m) => ({ role: m.role, content: m.content, created_at: m.created_at }));
}

async function mapPool<T, R>(items: readonly T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// ---- the two reads ---------------------------------------------------------

/** The newest conversations, newest first. [] when the memory spine is offline. */
export async function listConversations(
  limit: number,
  store: HistoryStore | null = defaultHistoryStore(),
): Promise<ConversationSummary[]> {
  if (!store) return [];
  const want = clampLimit(limit, LIST_DEFAULT, LIST_MAX);
  const newest = new Map<string, string | null>();
  for (let offset = 0; offset < SCAN_MAX && newest.size < want; ) {
    const page = await store.activityPage(offset, Math.min(SCAN_PAGE, SCAN_MAX - offset));
    if (page.length === 0) break;
    takeNewest(page, want, newest);
    // Advance by what came back, not by what was asked for: a store capped
    // below SCAN_PAGE must not be mistaken for the end of the table.
    offset += page.length;
  }
  if (newest.size === 0) return [];
  const ids = [...newest.keys()];
  const [rows, stats] = await Promise.all([
    store.conversations(ids),
    mapPool(ids, STATS_CONCURRENCY, (id) => store.stats(id)),
  ]);
  const statsById = new Map(ids.map((id, i) => [id, stats[i]] as const));
  const candidates: ListCandidate[] = [];
  for (const row of rows) {
    const s = statsById.get(row.id);
    if (!s) continue;
    candidates.push({ row, lastMessageAt: newest.get(row.id) ?? null, stats: s });
  }
  return shapeConversationList(candidates, want);
}

/** One conversation's newest `limit` messages, oldest first. null = no such conversation (or spine offline). */
export async function conversationMessages(
  id: string,
  limit: number,
  store: HistoryStore | null = defaultHistoryStore(),
): Promise<ConversationMessages | null> {
  if (!store || !isUuid(id)) return null;
  const conv = await store.conversation(id);
  if (!conv) return null;
  const want = clampLimit(limit, MESSAGES_DEFAULT, MESSAGES_MAX);
  const rows = await store.lastMessages(id, want);
  return { id: conv.id, surface: conv.surface, started_at: conv.started_at, messages: chronologicalWindow(rows, want) };
}

// ---- the route logic (index.ts is a two-line shell around these) -----------

export interface RouteAnswer {
  status: number;
  body: unknown;
}

function failed(err: unknown): RouteAnswer {
  return { status: 500, body: { error: `history read failed: ${err instanceof Error ? err.message : String(err)}` } };
}

export function defaultHistoryStore(): HistoryStore | null {
  const c = db();
  return c ? supabaseHistoryStore(c) : null;
}

export async function conversationsRoute(
  rawLimit: unknown,
  store: HistoryStore | null = defaultHistoryStore(),
): Promise<RouteAnswer> {
  if (!store) return { status: 503, body: { error: "memory spine offline" } };
  try {
    const conversations = await listConversations(clampLimit(rawLimit, LIST_DEFAULT, LIST_MAX), store);
    return { status: 200, body: { conversations } };
  } catch (err) {
    return failed(err);
  }
}

export async function conversationMessagesRoute(
  rawId: unknown,
  rawLimit: unknown,
  store: HistoryStore | null = defaultHistoryStore(),
): Promise<RouteAnswer> {
  if (!isUuid(rawId)) return { status: 400, body: { error: "id must be a uuid" } };
  if (!store) return { status: 503, body: { error: "memory spine offline" } };
  try {
    // Lowercased: Postgres reads a uuid in either case, and the fake store in
    // the harness should not disagree with it.
    const id = rawId.toLowerCase();
    const found = await conversationMessages(id, clampLimit(rawLimit, MESSAGES_DEFAULT, MESSAGES_MAX), store);
    if (!found) return { status: 404, body: { error: "not found" } };
    return { status: 200, body: found };
  } catch (err) {
    return failed(err);
  }
}

// ---- the live store --------------------------------------------------------

class HistoryReadError extends Error {}

function check(error: { message: string } | null): void {
  if (error) throw new HistoryReadError(error.message);
}

export function supabaseHistoryStore(c: SupabaseClient): HistoryStore {
  return {
    async activityPage(offset, n) {
      const { data, error } = await c
        .from("messages")
        .select("conversation_id, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + n - 1);
      check(error);
      return (data ?? []) as ActivityRow[];
    },

    async conversations(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await c.from("conversations").select("id, surface, started_at").in("id", ids);
      check(error);
      return (data ?? []) as ConversationRow[];
    },

    async conversation(id) {
      const { data, error } = await c
        .from("conversations")
        .select("id, surface, started_at")
        .eq("id", id)
        .maybeSingle();
      check(error);
      return (data as ConversationRow | null) ?? null;
    },

    // One round trip in the usual case: the exact count rides the Content-Range
    // header of a one-row select of the conversation's FIRST message, which is
    // his (chat.ts appends his line before her reply). Only when that first row
    // is hers does a second select look for his first line.
    async stats(id) {
      const first = await c
        .from("messages")
        .select("role, content", { count: "exact" })
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1);
      check(first.error);
      const count = first.count ?? 0;
      const row = (first.data?.[0] ?? null) as { role?: unknown; content?: unknown } | null;
      if (!row) return { count, firstUser: null };
      if (row.role === "user") return { count, firstUser: typeof row.content === "string" ? row.content : null };
      const user = await c
        .from("messages")
        .select("content")
        .eq("conversation_id", id)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1);
      check(user.error);
      const u = (user.data?.[0] ?? null) as { content?: unknown } | null;
      return { count, firstUser: u && typeof u.content === "string" ? u.content : null };
    },

    async lastMessages(id, n) {
      const { data, error } = await c
        .from("messages")
        .select("role, content, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(n);
      check(error);
      return (data ?? []) as HistoryMessage[];
    },
  };
}
