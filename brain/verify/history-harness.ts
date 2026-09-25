// Brain-side proof for HISTORY — GET /conversations and
// GET /conversations/:id/messages (src/history.ts, mounted in src/index.ts).
//
//   cd C:\dev\eve\brain && npx tsx verify/history-harness.ts
//
// Pure and offline. No env, no network, no Supabase, no server. The list and
// message reads take their world as a HistoryStore, so H1–H4 drive them against
// an in-memory store built from plain arrays. H5 drives the LIVE store
// (supabaseHistoryStore — the exact query chains the server runs) against a fake
// Supabase client that enforces PostgREST's 1000-row cap and records every
// operation, so "read-only" is checked against what was actually called.
//
// Where a check reads SOURCE TEXT rather than driving behaviour it says SOURCE.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

import { _setDbForTests } from "../src/db.js";
import {
  clampLimit,
  isUuid,
  previewOf,
  takeNewest,
  shapeConversationList,
  chronologicalWindow,
  listConversations,
  conversationsRoute,
  conversationMessagesRoute,
  supabaseHistoryStore,
  LIST_DEFAULT,
  LIST_MAX,
  MESSAGES_DEFAULT,
  MESSAGES_MAX,
  PREVIEW_MAX,
  SCAN_PAGE,
  SCAN_MAX,
  type HistoryStore,
  type ConversationSummary,
  type ConversationMessages,
} from "../src/history.js";
import { authorizeBrainRequest, osTicketRoute } from "../src/os-ticket.js";

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_SRC = readFileSync(path.join(brainDir, "src", "history.ts"), "utf8");
const INDEX_SRC = readFileSync(path.join(brainDir, "src", "index.ts"), "utf8");
const TICKET_SRC = readFileSync(path.join(brainDir, "src", "os-ticket.ts"), "utf8");

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  show.push(`  ${id.padEnd(6)} ${cond ? "PASS" : "****FAIL****"}  ${what}`);
}

// Every console line is captured, so "content is never logged" is checked
// against what was written, not against intent.
const logged: string[] = [];
const realLog = console.log;
const realWarn = console.warn;
const realError = console.error;
const realInfo = console.info;
const capture = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
console.log = capture;
console.warn = capture;
console.error = capture;
console.info = capture;

const SECRET = "Dana Whitfield";

// ---------------------------------------------------------------------------
// The world: plain arrays shaped like sql/001's conversations and messages.
// ---------------------------------------------------------------------------

interface Conv {
  id: string;
  surface: string;
  started_at: string | null;
  summary: string | null;
}
interface Msg {
  id: number;
  conversation_id: string | null;
  role: "user" | "eve";
  content: string;
  created_at: string;
}
interface World {
  conversations: Conv[];
  messages: Msg[];
  seq: number;
}

const T0 = Date.parse("2026-09-01T12:00:00.000Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

function newWorld(): World {
  return { conversations: [], messages: [], seq: 0 };
}
function conv(w: World, n: number, surface: string, startedMin: number): string {
  const id = uuid(n);
  w.conversations.push({ id, surface, started_at: at(startedMin), summary: null });
  return id;
}
function say(w: World, convId: string | null, role: "user" | "eve", content: string, min: number): void {
  w.seq += 1;
  w.messages.push({ id: w.seq, conversation_id: convId, role, content, created_at: at(min) });
}

const byTimeThenId = (a: Msg, b: Msg) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id);

interface MemCalls {
  activity: Array<{ offset: number; n: number; got: number }>;
  stats: number;
  conversations: number;
  conversation: number;
  lastMessages: number;
}

/** An in-memory HistoryStore over a World. pageCap imitates a store's max-rows. */
function memStore(w: World, opts: { pageCap?: number; throwOn?: keyof HistoryStore } = {}): { store: HistoryStore; calls: MemCalls } {
  const calls: MemCalls = { activity: [], stats: 0, conversations: 0, conversation: 0, lastMessages: 0 };
  const boom = (k: keyof HistoryStore) => {
    if (opts.throwOn === k) throw new Error("relation \"messages\" is unreachable");
  };
  const newestFirst = () => [...w.messages].sort((a, b) => byTimeThenId(b, a));
  const store: HistoryStore = {
    async activityPage(offset, n) {
      boom("activityPage");
      const take = Math.min(n, opts.pageCap ?? n);
      const rows = newestFirst()
        .slice(offset, offset + take)
        .map((m) => ({ conversation_id: m.conversation_id, created_at: m.created_at }));
      calls.activity.push({ offset, n, got: rows.length });
      return rows;
    },
    async conversations(ids) {
      boom("conversations");
      calls.conversations++;
      return w.conversations.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, surface: c.surface, started_at: c.started_at }));
    },
    async conversation(id) {
      boom("conversation");
      calls.conversation++;
      const c = w.conversations.find((x) => x.id === id);
      return c ? { id: c.id, surface: c.surface, started_at: c.started_at } : null;
    },
    async stats(id) {
      boom("stats");
      calls.stats++;
      const mine = w.messages.filter((m) => m.conversation_id === id).sort(byTimeThenId);
      return { count: mine.length, firstUser: mine.find((m) => m.role === "user")?.content ?? null };
    },
    async lastMessages(id, n) {
      boom("lastMessages");
      calls.lastMessages++;
      return newestFirst()
        .filter((m) => m.conversation_id === id)
        .slice(0, n)
        .map((m) => ({ role: m.role, content: m.content, created_at: m.created_at }));
    },
  };
  return { store, calls };
}

const listOf = (r: { status: number; body: unknown }) => (r.body as { conversations: ConversationSummary[] }).conversations;
const threadOf = (r: { status: number; body: unknown }) => r.body as ConversationMessages;

// Scenario A — the everyday shape.
function worldA(): { w: World; ids: Record<string, string>; long: string } {
  const w = newWorld();
  const long = `${SECRET} asked for ` + "the whole proposal redone ".repeat(12);
  const c1 = conv(w, 1, "app", 0);
  say(w, c1, "user", "  Book the\n\tdentist   for\u00a0Tuesday\u2028please  ", 1);
  say(w, c1, "eve", "Booked, King.", 2);
  const c2 = conv(w, 2, "voice", 10);
  say(w, c2, "eve", "Morning, King.", 11); // hers first — the preview must still be HIS first line
  say(w, c2, "user", `Remind me to call ${SECRET} about the contract`, 12);
  say(w, c2, "eve", "On it.", 13);
  say(w, c2, "user", "and the invoice", 50);
  const c3 = conv(w, 3, "desk", 20); // no messages at all
  const c4 = conv(w, 4, "glasses", 30);
  say(w, c4, "user", long, 31);
  const c5 = conv(w, 5, "app", 40);
  say(w, c5, "eve", "Your 07:00 brief is ready.", 41); // hers only — no user line
  say(w, null, "user", "an orphan row with no conversation", 60); // skipped, never listed
  return { w, ids: { c1, c2, c3, c4, c5 }, long };
}

// Scenario C — the phone's long thread: one conversationId kept for weeks.
function worldC(pThreadRows = 2500): { w: World; p: string; olds: string[] } {
  const w = newWorld();
  const olds = [conv(w, 101, "desk", 90), conv(w, 102, "desk", 190), conv(w, 103, "voice", 290)];
  olds.forEach((id, i) => say(w, id, "user", `older thread ${i + 1}`, 100 * (i + 1)));
  const p = conv(w, 100, "app", 999);
  say(w, p, "user", "the very first thing I asked on the phone", 1000);
  for (let i = 1; i < pThreadRows; i++) say(w, p, i % 2 ? "eve" : "user", `turn ${i}`, 1000 + i);
  return { w, p, olds };
}

// ---------------------------------------------------------------------------
// A fake Supabase client: tables are arrays, PostgREST's max-rows (1000) is
// enforced, and every operation is recorded — reads and any write.
// ---------------------------------------------------------------------------

interface FakeDb {
  client: SupabaseClient;
  ops: string[];
  writes: string[];
}

function fakeDb(w: World, opts: { failTable?: string } = {}): FakeDb {
  const MAX_ROWS = 1000;
  const tables: Record<string, Record<string, unknown>[]> = {
    conversations: w.conversations as unknown as Record<string, unknown>[],
    messages: w.messages as unknown as Record<string, unknown>[],
  };
  const ops: string[] = [];
  const writes: string[] = [];
  const cmp = (a: unknown, b: unknown) =>
    typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

  function from(table: string) {
    const st = {
      cols: "*",
      count: false,
      head: false,
      filters: [] as Array<[string, string, unknown]>,
      orders: [] as Array<[string, boolean]>,
      range: null as [number, number] | null,
      limit: null as number | null,
      single: false,
    };
    const write = (kind: string) => () => {
      writes.push(`${table}.${kind}`);
      return b;
    };
    const exec = () => {
      ops.push(
        `${table}.select(${st.cols}${st.count ? ",count=exact" : ""}${st.head ? ",head" : ""})` +
          st.filters.map(([f, k]) => `.${f}(${k})`).join("") +
          st.orders.map(([k, asc]) => `.order(${k} ${asc ? "asc" : "desc"})`).join("") +
          (st.range ? `.range(${st.range[0]},${st.range[1]})` : "") +
          (st.limit !== null ? `.limit(${st.limit})` : "") +
          (st.single ? ".maybeSingle" : ""),
      );
      if (opts.failTable === table) return { data: null, count: null, error: { message: `permission denied for table ${table}` } };
      let rows = tables[table].filter((r) =>
        st.filters.every(([f, k, v]) => (f === "eq" ? r[k] === v : f === "in" ? (v as unknown[]).includes(r[k]) : false)),
      );
      const total = rows.length;
      if (st.orders.length) {
        rows = [...rows].sort((a, b) => {
          for (const [k, asc] of st.orders) {
            const c = cmp(a[k], b[k]);
            if (c !== 0) return asc ? c : -c;
          }
          return 0;
        });
      }
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
      if (st.limit !== null) rows = rows.slice(0, st.limit);
      rows = rows.slice(0, MAX_ROWS); // PostgREST's cap: silent, no error
      const want = st.cols.split(",").map((s) => s.trim());
      const proj = rows.map((r) => Object.fromEntries(want.map((k) => [k, r[k]])));
      const data = st.head ? null : st.single ? proj[0] ?? null : proj;
      return { data, count: st.count ? total : null, error: null };
    };
    const b: Record<string, unknown> = {
      select: (c = "*", o?: { count?: string; head?: boolean }) => {
        st.cols = c;
        st.count = o?.count === "exact";
        st.head = o?.head === true;
        return b;
      },
      eq: (k: string, v: unknown) => (st.filters.push(["eq", k, v]), b),
      in: (k: string, v: unknown) => (st.filters.push(["in", k, v]), b),
      order: (k: string, o?: { ascending?: boolean }) => (st.orders.push([k, o?.ascending !== false]), b),
      range: (a: number, z: number) => ((st.range = [a, z]), b),
      limit: (n: number) => ((st.limit = n), b),
      maybeSingle: () => ((st.single = true), b),
      single: () => ((st.single = true), b),
      insert: write("insert"),
      update: write("update"),
      upsert: write("upsert"),
      delete: write("delete"),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
    };
    return b;
  }
  const rpc = (name: string) => {
    writes.push(`rpc.${name}`);
    return Promise.resolve({ data: null, error: null });
  };
  return { client: { from, rpc } as unknown as SupabaseClient, ops, writes };
}

// ---------------------------------------------------------------------------

async function main() {
  show.push("=== H1 — THE PURE PIECES ===");
  {
    ok("H1.1", clampLimit(undefined, 30, 100) === 30 && clampLimit("", 30, 100) === 30 && clampLimit("  ", 30, 100) === 30, "no limit, or a blank one → the default");
    ok("H1.2", clampLimit("0", 30, 100) === 1 && clampLimit("-5", 30, 100) === 1, "0 and negatives clamp UP to 1");
    ok("H1.3", clampLimit("1000", 30, 100) === 100 && clampLimit("100", 30, 100) === 100 && clampLimit("1e9", 200, 500) === 500, "too big clamps DOWN to the max");
    ok("H1.4", clampLimit("abc", 30, 100) === 30 && clampLimit(["5", "6"], 30, 100) === 30 && clampLimit("Infinity", 30, 100) === 30 && clampLimit({}, 200, 500) === 200, "non-numeric (text, ?limit=a&limit=b, Infinity, an object) → the default, never NaN");
    ok("H1.5", clampLimit("12", 30, 100) === 12 && clampLimit("7.6", 30, 100) === 8 && clampLimit(42, 30, 100) === 42, "a sane number is kept (rounded)");
    ok("H1.6", isUuid(uuid(7)) && isUuid(uuid(7).toUpperCase()) && ![ "abc", "", `${uuid(7)} `, `${uuid(7)}x`, "00000000-0000-4000-8000-00000000000g", "../../conversations", 42].some((x) => isUuid(x)), "isUuid: canonical 8-4-4-4-12 hex only (either case); padding, a trailing char, a g, a path, a number are not");

    ok("H1.7", previewOf("  Book the\n\tdentist   for\u00a0Tuesday\u2028please  ") === "Book the dentist for Tuesday please", "whitespace (newline, tab, runs, NBSP, U+2028) collapses to single spaces and is trimmed");
    const p100 = "x".repeat(PREVIEW_MAX);
    ok("H1.8", previewOf(p100) === p100, `exactly ${PREVIEW_MAX} chars is NOT cut`);
    const cut = previewOf("y".repeat(PREVIEW_MAX + 1));
    ok("H1.9", Array.from(cut).length === PREVIEW_MAX && cut.endsWith("…") && cut.startsWith("y".repeat(PREVIEW_MAX - 1)), `${PREVIEW_MAX + 1} chars is cut to ${PREVIEW_MAX}, the last one "…"`);
    const emo = previewOf("😀".repeat(150));
    ok("H1.10", Array.from(emo).length === PREVIEW_MAX && !/[\ud800-\udbff](?![\udc00-\udfff])/.test(emo), "the cut counts code points: 150 emoji → 99 whole emoji + …, no split surrogate");
    ok("H1.11", previewOf(null) === "" && previewOf(undefined) === "" && previewOf("   \n ") === "", "no user message (or only whitespace) → \"\"");

    const m = takeNewest(
      [
        { conversation_id: "b", created_at: at(9) },
        { conversation_id: null, created_at: at(8) },
        { conversation_id: "a", created_at: at(7) },
        { conversation_id: "b", created_at: at(6) },
        { conversation_id: "c", created_at: at(5) },
      ],
      2,
    );
    ok("H1.12", [...m.keys()].join() === "b,a" && m.get("b") === at(9), "takeNewest: first sighting in newest-first rows is the last message; a null conversation_id is skipped; no NEW id past the limit (c is not taken)");

    const shaped = shapeConversationList(
      [
        { row: { id: "z", surface: "app", started_at: at(0) }, lastMessageAt: at(5), stats: { count: 2, firstUser: "old" } },
        { row: { id: "y", surface: "app", started_at: at(1) }, lastMessageAt: null, stats: { count: 0, firstUser: null } },
        { row: { id: "x", surface: "desk", started_at: at(20) }, lastMessageAt: null, stats: { count: 1, firstUser: "no stamp" } },
        { row: { id: "w", surface: "voice", started_at: at(2) }, lastMessageAt: at(9), stats: { count: 3, firstUser: null } },
        { row: { id: "v", surface: "voice", started_at: at(3) }, lastMessageAt: at(9), stats: { count: 1, firstUser: "tie" } },
      ],
      10,
    );
    ok("H1.13", shaped.map((c) => c.id).join() === "x,v,w,z", `shapeConversationList: zero-message y is DROPPED; x (no message time) falls back to started_at; newest last_at first; a tie breaks on id (${shaped.map((c) => c.id).join()})`);
    ok("H1.14", shaped[0].last_at === at(20) && shaped[2].preview === "" && shapeConversationList([], 5).length === 0, "…x.last_at = its started_at; no user line → preview \"\"; nothing in → nothing out");

    const win = chronologicalWindow(
      [
        { role: "eve", content: "3", created_at: at(3) },
        { role: "user", content: "2", created_at: at(2) },
        { role: "eve", content: "1", created_at: at(1) },
      ],
      2,
    );
    ok("H1.15", win.map((x) => x.content).join() === "2,3", "chronologicalWindow: the newest N of newest-first rows, returned OLDEST first");
  }

  show.push("=== H2 — THE LIST (in-memory store) ===");
  {
    const { w, ids, long } = worldA();
    const { store } = memStore(w);
    const r = await conversationsRoute(undefined, store);
    const list = listOf(r);
    ok("H2.1", r.status === 200 && list.map((c) => c.id).join() === [ids.c2, ids.c5, ids.c4, ids.c1].join(), "200, sorted by LAST MESSAGE, not by start: c2 (started 10, last 50) outranks c5, c4 and c1");
    ok("H2.2", !list.some((c) => c.id === ids.c3), "c3 — a conversation with zero messages — is not listed at all");
    const c2 = list[0] ?? ({} as ConversationSummary);
    ok("H2.3", c2.count === 4 && c2.last_at === at(50) && c2.started_at === at(10) && c2.surface === "voice", `c2: count 4 (both roles), last_at = its last message, started_at and surface as stored`);
    ok("H2.4", c2.preview === `Remind me to call ${SECRET} about the contract`, "c2's preview is HIS first line, though her greeting came first");
    const c1 = list.find((c) => c.id === ids.c1);
    ok("H2.5", c1?.preview === "Book the dentist for Tuesday please" && c1.count === 2, `c1's preview is whitespace-collapsed: "${c1?.preview}"`);
    const c4 = list.find((c) => c.id === ids.c4);
    ok("H2.6", !!c4 && Array.from(c4.preview).length === PREVIEW_MAX && c4.preview.endsWith("…") && long.replace(/\s+/g, " ").startsWith(c4.preview.slice(0, -1)), `c4's ${long.length}-char first line is cut to ${PREVIEW_MAX}`);
    const c5 = list.find((c) => c.id === ids.c5);
    ok("H2.7", c5?.preview === "" && c5.count === 1, "c5 (her brief only, no line of his) → preview \"\", count 1");
    ok("H2.8", Object.keys(c2).sort().join() === "count,id,last_at,preview,started_at,surface", `each item is exactly { id, surface, started_at, last_at, preview, count }`);
    ok("H2.9", JSON.stringify(Object.keys(r.body as object)) === '["conversations"]', "the body is exactly { conversations: [...] }");
  }

  show.push("=== H3 — THE LIMIT ===");
  {
    const w = newWorld();
    for (let i = 0; i < 120; i++) say(w, conv(w, 1000 + i, "app", i * 10), "user", `ask ${i}`, i * 10 + 1);
    const newestIds = (n: number) => Array.from({ length: n }, (_, k) => uuid(1000 + 119 - k)).join();
    const get = async (lim: unknown) => listOf(await conversationsRoute(lim, memStore(w).store));
    const d = await get(undefined);
    ok("H3.1", d.length === LIST_DEFAULT && d.map((c) => c.id).join() === newestIds(LIST_DEFAULT), `no limit → the newest ${LIST_DEFAULT}, newest first`);
    ok("H3.2", (await get("0")).length === 1 && (await get("-3")).length === 1 && (await get("0"))[0].id === uuid(1119), "limit=0 / limit=-3 → 1 (the newest)");
    const big = await get("1000");
    ok("H3.3", big.length === LIST_MAX && big.map((c) => c.id).join() === newestIds(LIST_MAX), `limit=1000 → ${LIST_MAX}, and they are the newest ${LIST_MAX} of 120`);
    ok("H3.4", (await get("abc")).length === LIST_DEFAULT && (await get("12")).length === 12, `limit=abc → ${LIST_DEFAULT}; limit=12 → 12`);
    const few = await get("50");
    ok("H3.5", few.length === 50 && (await listConversations(500, memStore(w).store)).length === LIST_MAX, "listConversations clamps on its own too (500 → 100)");
  }

  show.push("=== H4 — THE PHONE'S LONG THREAD, THE SCAN, AND ITS BOUND ===");
  {
    const { w, p, olds } = worldC(2500);
    const m = memStore(w, { pageCap: SCAN_PAGE });
    const list = listOf(await conversationsRoute("30", m.store));
    ok("H4.1", list.map((c) => c.id).join() === [p, ...[...olds].reverse()].join(), "the three older threads are found PAST the long one's 2500 rows (the scan pages on)");
    const pl = list[0] ?? ({} as ConversationSummary);
    ok("H4.2", pl.count === 2500 && pl.preview === "the very first thing I asked on the phone", `the long thread's count is EXACT (${pl.count}) and its preview is its FIRST line, 2500 rows back — not read off a window`);
    ok("H4.3", m.calls.activity.map((c) => c.offset).join() === "0,1000,2000,2503" && m.calls.activity.every((c) => c.n <= SCAN_PAGE), `pages of ≤ ${SCAN_PAGE} (offsets ${m.calls.activity.map((c) => c.offset).join(", ")}); an empty page ends it`);
    ok("H4.4", m.calls.stats === 4 && m.calls.conversations === 1, "one stats read per listed conversation, one conversations read in all");

    const capped = memStore(w, { pageCap: 300 });
    const cl = listOf(await conversationsRoute("30", capped.store));
    ok("H4.5", cl.length === 4 && capped.calls.activity[1]?.offset === 300, "a store that caps a page BELOW 1000 (max-rows set lower) is not mistaken for the end: offset advances by what came back");

    const early = memStore(w, { pageCap: SCAN_PAGE });
    const two = listOf(await conversationsRoute("2", early.store));
    ok("H4.6", two.map((c) => c.id).join() === [p, olds[2]].join() && early.calls.activity.length === 3 && early.calls.stats === 2, `limit=2 stops scanning the moment 2 threads are found (${early.calls.activity.length} pages, ${early.calls.stats} stats reads)`);
    const one = memStore(w, { pageCap: SCAN_PAGE });
    await conversationsRoute("1", one.store);
    ok("H4.7", one.calls.activity.length === 1, "limit=1 reads ONE page");

    const huge = worldC(SCAN_MAX + 1000);
    const hm = memStore(huge.w, { pageCap: SCAN_PAGE });
    const hl = listOf(await conversationsRoute("30", hm.store));
    const scanned = hm.calls.activity.reduce((s, c) => s + c.got, 0);
    ok("H4.8", scanned === SCAN_MAX && hl.length === 1 && hl[0].count === SCAN_MAX + 1000, `the scan is BOUNDED: ${scanned} rows at most (SCAN_MAX); a thread older than the newest ${SCAN_MAX} rows is not listed — the stated cost of the bound`);

    const empty = memStore(newWorld());
    const er = await conversationsRoute(undefined, empty.store);
    ok("H4.9", er.status === 200 && listOf(er).length === 0 && empty.calls.stats === 0, "an empty store → 200 { conversations: [] }");
  }

  show.push("=== H5 — ONE CONVERSATION'S MESSAGES ===");
  {
    const w = newWorld();
    const m = conv(w, 500, "app", 0);
    for (let i = 0; i < 600; i++) say(w, m, i % 2 ? "eve" : "user", `msg ${i}`, i);
    const { ids, w: wa } = (() => {
      const a = worldA();
      w.conversations.push(...a.w.conversations);
      for (const x of a.w.messages) say(w, x.conversation_id, x.role, x.content, Math.round((Date.parse(x.created_at) - T0) / 60_000));
      return a;
    })();
    void wa;
    const mem = memStore(w);
    const r = await conversationMessagesRoute(m, undefined, mem.store);
    const t = threadOf(r);
    ok("H5.1", r.status === 200 && t.messages.length === MESSAGES_DEFAULT && t.messages[0].content === "msg 400" && t.messages[MESSAGES_DEFAULT - 1].content === "msg 599", `no limit → the LAST ${MESSAGES_DEFAULT} (msg 400 … msg 599), oldest first`);
    ok("H5.2", t.messages.every((x, i, a) => i === 0 || a[i - 1].created_at <= x.created_at), "chronological");
    ok("H5.3", t.id === m && t.surface === "app" && t.started_at === at(0) && Object.keys(t).sort().join() === "id,messages,started_at,surface" && Object.keys(t.messages[0]).sort().join() === "content,created_at,role", "the body is exactly { id, surface, started_at, messages: [{ role, content, created_at }] }");
    const all = threadOf(await conversationMessagesRoute(m, "9999", mem.store));
    ok("H5.4", all.messages.length === MESSAGES_MAX && all.messages[0].content === "msg 100", `limit=9999 → ${MESSAGES_MAX}, the newest ${MESSAGES_MAX} (from msg 100)`);
    const one = threadOf(await conversationMessagesRoute(m, "0", mem.store));
    ok("H5.5", one.messages.length === 1 && one.messages[0].content === "msg 599", "limit=0 → 1: the newest message");
    ok("H5.6", threadOf(await conversationMessagesRoute(m, "abc", mem.store)).messages.length === MESSAGES_DEFAULT, `limit=abc → ${MESSAGES_DEFAULT}`);
    const c2 = threadOf(await conversationMessagesRoute(ids.c2, "10", mem.store));
    ok("H5.7", c2.messages.map((x) => x.role).join() === "eve,user,eve,user" && c2.messages[1].content === `Remind me to call ${SECRET} about the contract`, "content and role come back exactly as stored");
    const c3 = await conversationMessagesRoute(ids.c3, undefined, mem.store);
    ok("H5.8", c3.status === 200 && threadOf(c3).messages.length === 0, "a conversation with no messages → 200, messages: []");
    const up = await conversationMessagesRoute(ids.c2.toUpperCase(), "10", mem.store);
    ok("H5.9", up.status === 200 && threadOf(up).id === ids.c2, "an UPPERCASE uuid finds the same conversation (Postgres reads either case)");

    const before = { ...mem.calls };
    const bad = await Promise.all(["abc", "", "../../conversations", `${ids.c2} `, "00000000-0000-4000-8000-00000000000g"].map((x) => conversationMessagesRoute(x, undefined, mem.store)));
    ok("H5.10", bad.every((x) => x.status === 400 && JSON.stringify(x.body) === '{"error":"id must be a uuid"}') && mem.calls.conversation === before.conversation && mem.calls.lastMessages === before.lastMessages, "a non-uuid id → 400 { error: \"id must be a uuid\" }, and the store is never asked");
    const nf = await conversationMessagesRoute(uuid(9999), undefined, mem.store);
    ok("H5.11", nf.status === 404 && JSON.stringify(nf.body) === '{"error":"not found"}' && mem.calls.lastMessages === before.lastMessages, "an unknown uuid → 404 { error: \"not found\" }, and no message read");
  }

  show.push("=== H6 — OFFLINE AND FAILING STORES ===");
  {
    const off = await conversationsRoute(undefined, null);
    ok("H6.1", off.status === 503 && JSON.stringify(off.body) === '{"error":"memory spine offline"}', "list with no Supabase → 503 memory spine offline");
    const offM = await conversationMessagesRoute(uuid(1), undefined, null);
    const offBad = await conversationMessagesRoute("nope", undefined, null);
    ok("H6.2", offM.status === 503 && offBad.status === 400, "messages with no Supabase → 503 (a bad id is still a 400 first)");
    const { w, ids } = worldA();
    for (const k of ["activityPage", "stats", "conversations"] as const) {
      const r = await conversationsRoute(undefined, memStore(w, { throwOn: k }).store);
      ok(`H6.3${k[0]}`, r.status === 500 && /^history read failed: /.test((r.body as { error: string }).error) && !JSON.stringify(r.body).includes(SECRET), `a store error in ${k} → 500 "history read failed: …", never a partial list, never content`);
    }
    for (const k of ["conversation", "lastMessages"] as const) {
      const r = await conversationMessagesRoute(ids.c2, undefined, memStore(w, { throwOn: k }).store);
      ok(`H6.4${k[0]}`, r.status === 500 && !JSON.stringify(r.body).includes(SECRET), `a store error in ${k} → 500`);
    }
  }

  show.push("=== H7 — THE LIVE STORE (supabaseHistoryStore) AGAINST A FAKE CLIENT ===");
  {
    // Scenario A + the long thread, in one fake database with a 1000-row cap.
    const a = worldA();
    const c = worldC(2500);
    const w = newWorld();
    w.conversations.push(...a.w.conversations, ...c.w.conversations);
    for (const x of [...a.w.messages, ...c.w.messages]) say(w, x.conversation_id, x.role, x.content, Math.round((Date.parse(x.created_at) - T0) / 60_000));
    const fk = fakeDb(w);
    _setDbForTests(fk.client);

    const live = await conversationsRoute("30");
    const mem = await conversationsRoute("30", memStore(w).store);
    ok("H7.1", live.status === 200 && JSON.stringify(live.body) === JSON.stringify(mem.body) && listOf(live).length === 8, `the live store's answer equals the in-memory store's, item for item (${listOf(live).length} conversations)`);
    const lp = listOf(live).find((x) => x.id === c.p);
    ok("H7.2", lp?.count === 2500 && lp.preview === "the very first thing I asked on the phone", "through the 1000-row cap: the long thread's count is exact (count=exact rides the header) and its preview is its first line");
    const scans = fk.ops.filter((o) => o.startsWith("messages.select(conversation_id, created_at)"));
    ok("H7.3", scans.length >= 3 && scans.every((o) => /\.order\(created_at desc\)\.order\(id desc\)\.range\(\d+,\d+\)$/.test(o)), `the scan is ${scans.length} ranged pages, newest first with id as the tie-break: ${scans[0]}`);
    ok("H7.4", fk.ops.some((o) => /^messages\.select\(role, content,count=exact\)\.eq\(conversation_id\)\.order\(created_at asc\)\.order\(id asc\)\.limit\(1\)$/.test(o)), "stats is ONE select: the first message with an exact count");
    const fallbacks = fk.ops.filter((o) => /^messages\.select\(content\)\.eq\(conversation_id\)\.eq\(role\)/.test(o)).length;
    ok("H7.5", fallbacks === 2, `…and only the 2 threads that open with HER line (c2, c5) take a second select for his first line (${fallbacks})`);
    ok("H7.6", fk.ops.filter((o) => o.startsWith("conversations.select(id, surface, started_at).in(id)")).length === 1, "the conversation rows are ONE `in` select");

    fk.ops.length = 0;
    const t = await conversationMessagesRoute(a.ids.c2, "3");
    const tm = threadOf(t);
    ok("H7.7", t.status === 200 && tm.messages.map((x) => x.content).join(" | ") === `Remind me to call ${SECRET} about the contract | On it. | and the invoice`, "messages?limit=3 → the last 3, oldest first");
    ok("H7.8", fk.ops.join(" ; ") === "conversations.select(id, surface, started_at).eq(id).maybeSingle ; messages.select(role, content, created_at).eq(conversation_id).order(created_at desc).order(id desc).limit(3)", `two selects: ${fk.ops.join(" ; ")}`);

    const tie = newWorld();
    const tc = conv(tie, 900, "app", 0);
    say(tie, tc, "user", "same second, his", 5);
    say(tie, tc, "eve", "same second, hers", 5);
    _setDbForTests(fakeDb(tie).client);
    const tt = threadOf(await conversationMessagesRoute(tc, undefined));
    const tl = listOf(await conversationsRoute(undefined))[0];
    ok("H7.9", tt.messages.map((x) => x.role).join() === "user,eve" && tl?.preview === "same second, his", "two rows with the same created_at keep insertion order (id breaks the tie) in the window and in the preview");

    _setDbForTests(fk.client);
    const nf = await conversationMessagesRoute(uuid(424242), undefined);
    ok("H7.10", nf.status === 404, "live store: an unknown uuid → 404");

    ok("H7.11", fk.writes.length === 0, `READ-ONLY, measured: across every call above the client saw ${fk.writes.length} insert/update/upsert/delete/rpc`);

    _setDbForTests(fakeDb(w, { failTable: "conversations" }).client);
    const e1 = await conversationsRoute(undefined);
    const e2 = await conversationMessagesRoute(a.ids.c1, undefined);
    ok("H7.12", e1.status === 500 && e2.status === 500 && /permission denied/.test((e1.body as { error: string }).error), `a Supabase error → 500 with its reason: "${(e1.body as { error: string }).error}"`);
    _setDbForTests(fakeDb(w, { failTable: "messages" }).client);
    ok("H7.13", (await conversationsRoute(undefined)).status === 500, "…the same when the messages table is the one failing");

    _setDbForTests(null);
    ok("H7.14", (await conversationsRoute(undefined)).status === 503 && (await conversationMessagesRoute(a.ids.c1, undefined)).status === 503, "db() offline → both routes 503 through the default store");
  }

  show.push("=== H8 — BEARER-ONLY ===");
  {
    const KEY = "harness-brain-token-not-a-real-one";
    const NOW = 1_790_000_000;
    const exp = NOW + 600;
    const nonce = "0123456789abcdef";
    const sig = createHmac("sha256", Buffer.from(KEY, "utf8")).update(`os1.${exp}.${nonce}`).digest("hex");
    const ticket = `Bearer os1.${exp}.${nonce}.${sig}`;
    ok("H8.0", authorizeBrainRequest("GET", "/state", ticket, KEY, NOW).ok === true, "control: the minted ticket IS good (it opens GET /state)");
    const paths = ["/conversations", `/conversations/${uuid(1)}/messages`];
    ok("H8.1", paths.every((p) => authorizeBrainRequest("GET", p, ticket, KEY, NOW).ok === false && !osTicketRoute("GET", p)), "a valid OS ticket on either history route is REFUSED — not on the ticket allow-list");
    ok("H8.2", paths.every((p) => { const v = authorizeBrainRequest("GET", p, `Bearer ${KEY}`, KEY, NOW); return v.ok && v.via === "bearer"; }), "the server bearer opens both");
    ok("H8.3", paths.every((p) => !authorizeBrainRequest("GET", p, undefined, KEY, NOW).ok && !authorizeBrainRequest("GET", p, "Bearer wrong", KEY, NOW).ok), "no header / a wrong bearer → refused");
    const auth = INDEX_SRC.indexOf("authorizeBrainRequest(req.method");
    const listRoute = INDEX_SRC.indexOf('app.get("/conversations",');
    const msgRoute = INDEX_SRC.indexOf('app.get("/conversations/:id/messages",');
    ok("H8.4", auth > 0 && listRoute > auth && msgRoute > auth, "SOURCE: index.ts mounts both routes AFTER the bearer middleware");
    ok("H8.5", /conversationsRoute\(req\.query\.limit\)/.test(INDEX_SRC) && /conversationMessagesRoute\(req\.params\.id, req\.query\.limit\)/.test(INDEX_SRC), "SOURCE: the routes hand their raw query/param to the functions driven above");
    const allow = TICKET_SRC.slice(TICKET_SRC.indexOf("export function osTicketRoute"), TICKET_SRC.indexOf("export function authorizeBrainRequest"));
    ok("H8.6", !/conversations/.test(allow.slice(allow.indexOf("{"))) && /History \(GET \/conversations.*bearer-only ON PURPOSE/.test(TICKET_SRC), "SOURCE: osTicketRoute's body names no history path, and its comment says history is bearer-only on purpose");
  }

  show.push("=== H9 — READ-ONLY AND SILENT, IN SOURCE ===");
  {
    ok("H9.1", !/\.(insert|update|upsert|delete|rpc)\(/.test(HISTORY_SRC), "SOURCE: history.ts calls no insert / update / upsert / delete / rpc");
    ok("H9.2", !/console\./.test(HISTORY_SRC), "SOURCE: history.ts has no console call at all");
    ok("H9.3", !logged.some((l) => l.includes(SECRET) || l.includes("first thing I asked")), `nothing any scenario ran logged a word of content (${logged.length} console lines in all)`);
  }

  console.log = realLog;
  console.warn = realWarn;
  console.error = realError;
  console.info = realInfo;
  console.log(show.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log = realLog;
  console.warn = realWarn;
  console.error = realError;
  console.info = realInfo;
  console.error(e);
  process.exit(1);
});
