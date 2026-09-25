// Brain-side proof for ONE HOUSE STEP 4c · 4.6 — THE QUIET-CLIENT PULSE READS THE OS.
// (src/pulse.ts runPulseSweep, src/os.ts osToolData.)
//
//   cd C:\dev\eve\brain && npx tsx verify/pulse-harness.ts
//
// Pure and offline. The model call is swapped for a canned line
// (_setPulseGeneratorForTests), Supabase is a small in-file fake that records
// every read and write, and the OS is a local fetch stub answering the fixed
// quiet_clients contract. Firebase is never initialised, so no push can leave.
// Both roster branches are driven: CHURLISH_OS_TOKEN unset → the brain's own
// `clients` table, exactly as before; set → the OS's quiet_clients, with the
// brain table never read.
//
// Where a check reads SOURCE TEXT rather than driving behaviour it says SOURCE.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

delete process.env.CHURLISH_OS_TOKEN;
delete process.env.EVE_PUSH_ALLOW;
process.env.EVE_TZ = "America/Chicago";

import { _setDbForTests } from "../src/db.js";
import { runPulseSweep, _setPulseGeneratorForTests, parseOsQuietClients } from "../src/pulse.js";
import { osTool, osToolData } from "../src/os.js";

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONNECTORS_SRC = readFileSync(path.join(brainDir, "src", "connectors.ts"), "utf8");

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  show.push(`  ${id.padEnd(6)} ${cond ? "PASS" : "****FAIL****"}  ${what}`);
}

// ---- a small fake Supabase: eq / is / in / contains (JSON subset), select / insert / update, limit.
type Row = Record<string, unknown>;
interface Fake {
  client: SupabaseClient;
  tables: Record<string, Row[]>;
  reads: string[];
  writes: string[];
}
function subset(have: unknown, want: unknown): boolean {
  if (want && typeof want === "object") {
    if (!have || typeof have !== "object") return false;
    return Object.entries(want as Row).every(([k, v]) => subset((have as Row)[k], v));
  }
  return have === want;
}
function fake(seed: Record<string, Row[]>): Fake {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const reads: string[] = [];
  const writes: string[] = [];
  let n = 0;
  function from(table: string) {
    tables[table] ??= [];
    const st = { op: "select" as "select" | "insert" | "update", payload: null as Row | null, filters: [] as Array<(r: Row) => boolean>, single: false, limit: Infinity };
    const api: Record<string, unknown> = {};
    const chain = () => api;
    for (const k of ["order", "not", "or", "gte", "lte", "gt", "lt", "neq", "range"]) api[k] = chain;
    api.select = () => api;
    api.insert = (p: Row) => ((st.op = "insert"), (st.payload = p), api);
    api.update = (p: Row) => ((st.op = "update"), (st.payload = p), api);
    api.eq = (k: string, v: unknown) => (st.filters.push((r) => r[k] === v), api);
    api.is = (k: string, v: unknown) => (st.filters.push((r) => (v === null ? r[k] === null || r[k] === undefined : r[k] === v)), api);
    api.in = (k: string, vs: unknown[]) => (st.filters.push((r) => vs.includes(r[k])), api);
    api.contains = (k: string, v: unknown) => (st.filters.push((r) => subset(r[k], v)), api);
    api.limit = (x: number) => ((st.limit = x), api);
    api.single = () => ((st.single = true), api);
    api.maybeSingle = api.single;
    const run = async () => {
      const rows = tables[table];
      if (st.op === "insert") {
        const row = { id: `row-${++n}`, created_at: new Date().toISOString(), ...(st.payload as Row) };
        rows.push(row);
        writes.push(`${table}.insert`);
        return { data: st.single ? row : [row], error: null };
      }
      const hit = rows.filter((r) => st.filters.every((f) => f(r))).slice(0, st.limit);
      if (st.op === "update") {
        for (const r of hit) Object.assign(r, st.payload);
        writes.push(`${table}.update`);
        return { data: hit, error: null };
      }
      reads.push(table);
      return { data: st.single ? (hit[0] ?? null) : hit, error: null };
    };
    api.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej);
    return api;
  }
  return { client: { from } as unknown as SupabaseClient, tables, reads, writes };
}

const DAY = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const prompts: string[] = [];
_setPulseGeneratorForTests(async (p) => {
  prompts.push(p);
  return p.includes("touch-base update King should send") ? "Hi — quick update on where things stand." : "Client quiet; update drafted.";
});

const osCalls: Array<{ url: string; tool: string; auth: string }> = [];
let osAnswer: { status: number; body: unknown } = { status: 200, body: {} };
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: unknown, init?: { body?: unknown; headers?: Record<string, string> }) => {
  const b = JSON.parse(String(init?.body ?? "{}")) as { tool?: string };
  osCalls.push({ url: String(input), tool: b.tool ?? "", auth: init?.headers?.authorization ?? "" });
  return new Response(JSON.stringify(osAnswer.body), { status: osAnswer.status, headers: { "content-type": "application/json" } });
}) as typeof globalThis.fetch;

// The brain's own table: one client past cadence, one fresh — and a name that
// must NEVER appear on the OS branch.
const BRAIN_CLIENTS: Row[] = [
  { id: "brain-1", name: "Stale Copy Co", cadence_days: 7, last_touch_at: iso(10 * DAY), status: "active" },
  { id: "brain-2", name: "Fresh Co", cadence_days: 7, last_touch_at: iso(2 * DAY), status: "active" },
];

async function main() {
  show.push("=== PL1 — NOT WIRED: the brain's own table, exactly as before ===");
  {
    const f = fake({ clients: BRAIN_CLIENTS, attention_items: [], touches: [], tasks: [], jobs: [], runs: [], push_tokens: [] });
    _setDbForTests(f.client);
    osCalls.length = 0;
    const r = await runPulseSweep();
    const item = f.tables.attention_items[0];
    ok("PL1.1", r.ok && r.source === "brain" && osCalls.length === 0 && f.reads.includes("clients"), `CHURLISH_OS_TOKEN unset → source=brain, the clients table is read, the OS is not called (calls=${osCalls.length})`);
    ok("PL1.2", r.quiet.length === 1 && r.quiet[0].client === "Stale Copy Co" && r.quiet[0].daysQuiet === 10, `only the client past cadence is quiet: ${JSON.stringify(r.quiet)}`);
    ok("PL1.3", f.tables.attention_items.length === 1 && (item.ref as Row).client_id === "brain-1" && (item.ref as Row).source === "brain" && item.nudge_level === 1, "ONE attention item, N1, keyed on the brain's client id, ref.source=brain");
    ok("PL1.4", (f.tables.runs[0]?.detail as Row)?.source === "brain", "the runs row records which roster it read");
  }

  show.push("=== PL2 — WIRED: the OS says who is quiet ===");
  {
    process.env.CHURLISH_OS_TOKEN = "harness-os-token";
    const f = fake({ clients: BRAIN_CLIENTS, attention_items: [], touches: [], tasks: [], jobs: [], runs: [], push_tokens: [] });
    _setDbForTests(f.client);
    osCalls.length = 0;
    prompts.length = 0;
    osAnswer = {
      status: 200,
      body: {
        ok: true,
        result: "2 clients are past their cadence.",
        data: {
          clients: [
            { id: "os-acme", name: "Acme Roofing", cadence_days: 7, days_quiet: 12.6, last_touch_at: iso(12 * DAY) },
            { id: "os-new", name: "Brand New LLC", cadence_days: 14, days_quiet: 15, last_touch_at: null },
            { id: "", name: "No Id Inc", cadence_days: 7, days_quiet: 9, last_touch_at: null },
            { id: "os-bad", name: "Bad Numbers", cadence_days: "seven", days_quiet: 9, last_touch_at: null },
          ],
        },
      },
    };
    const r = await runPulseSweep();
    ok("PL2.1", osCalls.length === 1 && osCalls[0].tool === "quiet_clients" && /\/api\/eve$/.test(osCalls[0].url) && osCalls[0].auth === "Bearer harness-os-token", `one POST /api/eve {tool:"quiet_clients"} with the OS bearer (${osCalls[0]?.url.replace(/^https:\/\/[^/]+/, "")})`);
    ok("PL2.2", r.ok && r.source === "os" && !f.reads.includes("clients"), `source=os, and the brain's clients table is NEVER read (reads: ${[...new Set(f.reads)].join(", ")})`);
    ok("PL2.3", JSON.stringify(r.quiet) === JSON.stringify([{ client: "Acme Roofing", daysQuiet: 12 }, { client: "Brand New LLC", daysQuiet: 15 }]), `the OS roster maps straight in — days_quiet → daysQuiet (floored), malformed rows dropped: ${JSON.stringify(r.quiet)}`);
    ok("PL2.4", !r.quiet.some((q) => q.client === "Stale Copy Co"), "the stale brain-table client is NOT nudged on the OS branch");
    const refs = f.tables.attention_items.map((i) => i.ref as Row);
    ok("PL2.5", refs.length === 2 && refs[0].client_id === "os-acme" && refs[0].days_quiet === 12 && refs[0].source === "os" && refs[1].client_id === "os-new", "the SAME per-client flow: one N1 attention item each, keyed on the OS client id, ref.source=os");
    const acmeDraft = prompts.find((p) => p.includes("Acme Roofing") && p.includes("touch-base update"));
    const newDraft = prompts.find((p) => p.includes("Brand New LLC") && p.includes("touch-base update"));
    ok("PL2.6", !!acmeDraft && acmeDraft.includes("12 days quiet (cadence: 7)") && !!newDraft && newDraft.includes("(cadence: 14)"), "cadence_days → cadence_days in the draft prompt: \"Acme Roofing has gone 12 days quiet (cadence: 7)\"");
    ok("PL2.7", (f.tables.runs[0]?.detail as Row)?.source === "os", "the runs row says source=os");
  }

  show.push("=== PL3 — THE CUTOVER: an item opened under the brain's id is not duplicated ===");
  {
    const f = fake({
      clients: BRAIN_CLIENTS,
      attention_items: [{ id: "att-1", kind: "silent_client", resolved_at: null, nudge_level: 1, created_at: iso(30 * 3600_000), ref: { client_id: "brain-acme", client: "Acme Roofing", days_quiet: 10, draft: "…" } }],
      touches: [], tasks: [], jobs: [], runs: [], push_tokens: [],
    });
    _setDbForTests(f.client);
    osAnswer = { status: 200, body: { ok: true, result: "1", data: { clients: [{ id: "os-acme", name: "Acme Roofing", cadence_days: 7, days_quiet: 12, last_touch_at: iso(12 * DAY) }] } } };
    const r = await runPulseSweep();
    ok("PL3.1", f.tables.attention_items.length === 1 && r.quiet.length === 0, `the open item keyed on brain-acme is found by name — no duplicate (items=${f.tables.attention_items.length})`);
    ok("PL3.2", r.escalated === 1 && f.tables.attention_items[0].nudge_level === 2, "…and it ESCALATES N1 → N2 after 24 h, as the law says, instead of starting over");
  }

  show.push("=== PL4 — WIRED BUT FAILING: say so, never fall back to the stale copy ===");
  {
    const f = fake({ clients: BRAIN_CLIENTS, attention_items: [], touches: [], tasks: [], jobs: [], runs: [], push_tokens: [] });
    _setDbForTests(f.client);
    osAnswer = { status: 500, body: { ok: false, error: "quiet_clients exploded" } };
    const r = await runPulseSweep();
    ok("PL4.1", r.ok === false && /OS quiet_clients failed: quiet_clients exploded/.test(r.reason ?? "") && r.source === "os", `an OS error FAILS the sweep with the reason: "${r.reason}"`);
    ok("PL4.2", !f.reads.includes("clients") && f.writes.length === 0, "…and reads no brain table and writes nothing — a wrong nudge is worse than none");
    osAnswer = { status: 200, body: { ok: true, result: "no data here" } };
    const r2 = await runPulseSweep();
    ok("PL4.3", r2.ok === false && /no data\.clients list/.test(r2.reason ?? ""), `an answer with no data.clients FAILS too: "${r2.reason}"`);
  }

  show.push("=== PL5 — osTool is unchanged for every existing caller ===");
  {
    osAnswer = { status: 200, body: { ok: true, result: "board text", data: { n: 1 } } };
    const s = await osTool("get_board");
    const d = await osToolData("get_board");
    ok("PL5.1", s === "board text" && d.result === "board text" && (d.data as Row).n === 1, "osTool still returns the plain string; osToolData returns { result, data } from the same call");
    osAnswer = { status: 200, body: { ok: true, result: "x", data: [1, 2] } };
    ok("PL5.2", (await osToolData("get_board")).data === null, "a non-object `data` (an array) comes back as null — the caller never gets a shape it didn't ask for");
    ok("PL5.3", parseOsQuietClients(null) === null && parseOsQuietClients({ clients: "x" }) === null && parseOsQuietClients({ clients: [] })?.length === 0, "the parser: no data / no list → null (a failure); an EMPTY list → [] (nobody is quiet, a real answer)");
    const sites = (CONNECTORS_SRC.match(/os\.osTool\(/g) ?? []).length;
    ok("PL5.4", sites >= 13 && !CONNECTORS_SRC.includes("osToolData"), `SOURCE: connectors.ts still calls os.osTool at its ${sites} sites and never osToolData — no existing caller had to change`);
  }

  delete process.env.CHURLISH_OS_TOKEN;
  globalThis.fetch = REAL_FETCH;
  _setDbForTests(null);
  _setPulseGeneratorForTests(null);
  ok("PL9", globalThis.fetch === REAL_FETCH, "the fetch stub is removed at the end of the run");

  console.log(show.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  globalThis.fetch = REAL_FETCH;
  console.error(e);
  process.exit(1);
});
