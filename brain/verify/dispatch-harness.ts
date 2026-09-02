// Brain-side proof for THE DISPATCHER v0.1 (P0 truth pass + P1) and v0.2
// (skills as units: skills/MANIFEST.json → "skill" rows on the worker path). Pure,
// offline, no env, no network, no real DB — a fake Supabase client that
// behaves like Postgres on the one thing that matters here: an unknown column
// is an error, so "store what fits" is proven, not assumed.
//
//   cd C:\dev\eve\brain && npx tsx verify/dispatch-harness.ts
//
// Every deny has an allow twin: a dispatcher that refuses everything also passes.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

// No live roster read, no OS line: the bundled roster and an unwired OS are the
// conditions under test. (fleet.ts / os.ts read these at call time.)
delete process.env.CHURLISH_OS_FLEET_SECRET;
delete process.env.FLEET_INGEST_SECRET;
delete process.env.CHURLISH_OS_TOKEN;

import { _setDbForTests } from "../src/db.js";
import {
  dispatchUnit,
  resolveDispatch,
  failJob,
  probeDispatchSchema,
  dispatchReady,
  recentJobsQuery,
  shapeJob,
  settleJobFromConfirm,
  DISPATCH_COLUMNS,
  WORKER_TOOLS,
  _test,
  type JobFrame,
} from "../src/dispatch.js";
import { requestConfirm, resolveConfirm, listPending } from "../src/confirm.js";
import {
  buildFleetBlock,
  fleetLine,
  REGISTRY,
  badgeFor,
  resolveUnitKey,
  manifestState,
  alternativesFor,
  dispatchUnitDescription,
  registryCounts,
  capability,
  MAX_ALTERNATIVES,
} from "../src/registry.js";
import { connectorToolNames } from "../src/connectors.js";
import { fleetRoster } from "../src/fleet.js";

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, detail: string) {
  if (cond) {
    pass += 1;
    show.push(`  ${id.padEnd(10)} PASS  ${detail}`);
  } else {
    fail += 1;
    show.push(`  ${id.padEnd(10)} ****FAIL****  ${detail}`);
  }
}
function loud(id: string, detail: string) {
  show.push(`  ${id.padEnd(10)}       ${detail}`);
}

// ---------------------------------------------------------------------------
// A fake Supabase client. Tables are arrays; column sets are enforced like
// Postgres would; the query-builder chain records every op it saw.
// ---------------------------------------------------------------------------

const LEGACY_JOBS = ["id", "agent", "title", "status", "result_ref", "created_at", "finished_at"];
const ATTN = ["id", "kind", "ref", "message", "nudge_level", "due_at", "resolved_at", "created_at"];

interface Fake {
  client: SupabaseClient;
  tables: Record<string, Record<string, unknown>[]>;
  ops: string[];
}

function fakeDb(migrated: boolean): Fake {
  const columns: Record<string, string[]> = {
    jobs: migrated ? [...LEGACY_JOBS, ...DISPATCH_COLUMNS] : LEGACY_JOBS,
    attention_items: ATTN,
  };
  const tables: Record<string, Record<string, unknown>[]> = { jobs: [], attention_items: [] };
  const ops: string[] = [];

  function from(table: string) {
    const st = {
      op: "select" as "select" | "insert" | "update",
      cols: "*",
      payload: null as Record<string, unknown> | null,
      filters: [] as Array<[string, string, unknown]>,
      order: null as [string, boolean] | null,
      limit: null as number | null,
      single: false,
    };
    const unknownCols = (keys: string[]) => keys.filter((k) => k !== "*" && !columns[table].includes(k));
    const exec = () => {
      ops.push(`${table}.${st.op}(${st.op === "select" ? st.cols : Object.keys(st.payload ?? {}).join(",")})` +
        st.filters.map(([f, k, v]) => `.${f}(${k}=${typeof v === "string" ? v.slice(0, 24) : JSON.stringify(v)})`).join("") +
        (st.order ? `.order(${st.order[0]} ${st.order[1] ? "asc" : "desc"})` : "") +
        (st.limit !== null ? `.limit(${st.limit})` : ""));
      const rows = tables[table];
      if (st.op === "insert") {
        const bad = unknownCols(Object.keys(st.payload!));
        if (bad.length) return { data: null, error: { message: `column "${bad[0]}" of relation "${table}" does not exist` } };
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...st.payload! };
        rows.push(row);
        return { data: st.single ? row : [row], error: null };
      }
      const match = (r: Record<string, unknown>) =>
        st.filters.every(([f, k, v]) =>
          f === "eq" ? r[k] === v : f === "gte" ? String(r[k]) >= String(v) : f === "in" ? (v as unknown[]).includes(r[k]) : true,
        );
      if (st.op === "update") {
        const bad = unknownCols(Object.keys(st.payload!));
        if (bad.length) return { data: null, error: { message: `column "${bad[0]}" of relation "${table}" does not exist` } };
        for (const r of rows) if (match(r)) Object.assign(r, st.payload);
        return { data: null, error: null };
      }
      const want = st.cols.split(",").map((s) => s.trim()).filter(Boolean);
      const bad = unknownCols(want);
      if (bad.length) return { data: null, error: { message: `column ${table}.${bad[0]} does not exist` } };
      let out = rows.filter(match);
      if (st.order) {
        const [k, asc] = st.order;
        out = [...out].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (asc ? 1 : -1));
      }
      if (st.limit !== null) out = out.slice(0, st.limit);
      const proj = out.map((r) => (want.includes("*") ? r : Object.fromEntries(want.map((k) => [k, r[k]]))));
      return { data: st.single ? proj[0] ?? null : proj, error: null };
    };
    const b: Record<string, unknown> = {
      insert: (p: Record<string, unknown>) => ((st.op = "insert"), (st.payload = p), b),
      update: (p: Record<string, unknown>) => ((st.op = "update"), (st.payload = p), b),
      select: (c = "*") => ((st.op === "insert" ? null : (st.op = "select")), (st.cols = c), b),
      eq: (k: string, v: unknown) => (st.filters.push(["eq", k, v]), b),
      gte: (k: string, v: unknown) => (st.filters.push(["gte", k, v]), b),
      in: (k: string, v: unknown) => (st.filters.push(["in", k, v]), b),
      is: (k: string, v: unknown) => (st.filters.push(["is", k, v]), b),
      not: (k: string, _o: string, v: unknown) => (st.filters.push(["not", k, v]), b),
      order: (k: string, o?: { ascending?: boolean }) => ((st.order = [k, o?.ascending !== false]), b),
      limit: (n: number) => ((st.limit = n), b),
      single: () => ((st.single = true), b),
      maybeSingle: () => ((st.single = true), b),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
    };
    return b;
  }
  return { client: { from } as unknown as SupabaseClient, tables, ops };
}

const frames: JobFrame[] = [];
const emit = (f: JobFrame) => frames.push(f);

async function main() {
  // =========================================================================
  console.log("\n=== P0.1 — NO SILENT SUBSTITUTION: an unknown unit is a spoken error ===");
  {
    // cyborg: on the roster (fleet, CC) AND classified WORKSPACE_ONLY by the
    // skill sync (Meta Ads MCP) — the v0.2 stand-in for perry-white, who runs now.
    const r = await resolveDispatch("cyborg");
    ok("U1", "ok" in r && r.ok === false && r.code === "unit_not_runnable", `cyborg → ${"ok" in r ? r.code : "RESOLVED (wrong)"}`);
    if ("ok" in r) {
      ok("U1a", /I don't have a runner for Cyborg/.test(r.say) && /Meta Ads MCP/.test(r.say), "the sentence names him, says there is no runner, and says WHY (the sync's reason)");
      ok("U1b", r.runnable.length > 0 && r.runnable.length <= MAX_ALTERNATIVES && r.runnable.every((x) => r.say.includes(x.key)), `…and names ${r.runnable.length} alternatives (≤ ${MAX_ALTERNATIVES}, not all ${REGISTRY.length}): ${r.runnable.map((x) => x.key).join(", ")}`);
      ok("U1b2", r.runnable.some((x) => /^ad-/.test(x.key)), "alternatives are chosen by ROLE relevance (an ads unit for the ads unit), not list order");
      ok("U1c", r.badge === "WORKSPACE_ONLY" && /WORKSPACE_ONLY/.test(r.say), `badge ${r.badge} spoken`);
      ok("U1d", /tell him which unit ran it and why/.test(r.say), "the refusal carries the re-route honesty clause");
      loud("U1x", `=> ${r.say}`);
    }
    const byName = await resolveDispatch("Cyborg");
    ok("U2", "ok" in byName && byName.code === "unit_not_runnable" && byName.unit === "cyborg", `"Cyborg" resolves to the key, then refuses (no fuzzy guess)`);
    const ghost = await resolveDispatch("nobody-here");
    ok("U3", "ok" in ghost && ghost.code === "unit_unknown" && /no unit by that name/.test(ghost.say) && ghost.runnable.length <= MAX_ALTERNATIVES, `an unknown key is unit_unknown: "${"ok" in ghost ? ghost.say.slice(0, 70) : ""}…"`);
    const eve = await resolveDispatch("eve");
    ok("U4", "ok" in eve && eve.code === "unit_not_runnable", `"eve" — the OLD default fallback persona — is still refused (${"ok" in eve ? eve.code : "ran"})`);
    ok("U5", resolveUnitKey("  PERRY_WHITE ", []) === "perry-white" && resolveUnitKey("The Flash", []) === "flash" || resolveUnitKey("The Flash", [{ key: "the-flash", name: "The Flash" } as never]) === "the-flash", "key normalisation: case, spaces, underscores");

    const fk = fakeDb(false);
    _setDbForTests(fk.client);
    _test.setSchema({ migrated: false, probedAt: "t", reason: "test" });
    const d = await dispatchUnit({ unit: "cyborg", task: "build the GE Outdoors campaign", why: "test", emitJob: emit });
    ok("U6", !d.ok && fk.tables.jobs.length === 0 && frames.length === 0, `dispatch_unit(cyborg) inserts NO job row and emits NO frame (rows=${fk.tables.jobs.length})`);
  }

  console.log("\n=== ALLOW TWINS — the five code units resolve, and so do bundled skills ===");
  {
    for (const key of ["research", "jsa", "justice-league", "suicide-squad", "pennyworth"]) {
      const r = await resolveDispatch(key);
      ok(`A-${key.slice(0, 4)}`, !("ok" in r) && r.key === key && r.cap.host === "brain" && r.cap.origin === "code", `${key} → registry row (${!("ok" in r) ? r.cap.runner.kind : "refused"}, code)`);
    }
    const byName = await resolveDispatch("Pennyworth");
    ok("A-name", !("ok" in byName) && byName.key === "pennyworth", `"Pennyworth" (name) → pennyworth`);
    const ms = manifestState();
    ok("A-cnt", REGISTRY.length === 5 + ms.units && REGISTRY.filter((c) => c.runner.kind === "worker").length === 4 && REGISTRY.filter((c) => c.runner.kind === "skill").length === ms.units, `registry = 4 workers + 1 tool + ${ms.units} skills = ${REGISTRY.length}`);
    ok("A-tool", connectorToolNames.includes("mcp__eve_hands__dispatch_unit"), "dispatch_unit is in connectorToolNames (or the model could never see it)");
  }

  // =========================================================================
  console.log("\n=== v0.2 — SKILLS ARE UNITS: MANIFEST.json → skill rows on the worker path ===");
  {
    const ms = manifestState();
    ok("K1", ms.loaded && ms.units >= 30 && ms.generatedAt !== null && !ms.error, `manifest loaded: ${ms.units} skill units, ${ms.excluded} excluded, generated ${ms.generatedAt}${ms.error ? " ERROR " + ms.error : ""}`);
    const manifest = JSON.parse(readFileSync(path.join(brainDir, "skills", "MANIFEST.json"), "utf8")) as { units: Array<{ key: string; pinned: boolean; files: string[] }>; excluded: Array<{ key: string }> };
    ok("K1b", manifest.units.length === ms.units && manifest.units.every((u) => !!capability(u.key)), `every manifest unit is a registry row (${manifest.units.length})`);
    ok("K1c", ["jsa", "justice-league", "suicide-squad"].every((k) => manifest.excluded.some((x) => x.key === k) && capability(k)?.origin === "code"), "jsa / justice-league / suicide-squad are NOT double-registered — code rows only");

    const sf = await resolveDispatch("starfire");
    ok("K2", !("ok" in sf) && sf.cap.runner.kind === "skill" && sf.cap.origin === "manifest" && sf.cap.pinned && sf.cap.tier === "yellow", `starfire → skill row (pinned=${!("ok" in sf) && sf.cap.pinned}, tier=${!("ok" in sf) && sf.cap.tier})`);
    if (!("ok" in sf) && sf.cap.runner.kind === "skill") {
      const skillMd = readFileSync(path.join(brainDir, "skills", "starfire", "SKILL.md"), "utf8");
      ok("K2a", sf.cap.runner.doctrine.includes(skillMd), `the doctrine text CONTAINS the bundled SKILL.md verbatim (${skillMd.length} chars inside ${sf.cap.runner.doctrine.length})`);
      const refs = sf.cap.runner.files.filter((f) => f !== "SKILL.md");
      ok("K2b", refs.every((f) => sf.cap.runner.doctrine.includes(`bundled reference: ${f}`) && sf.cap.runner.doctrine.includes(readFileSync(path.join(brainDir, "skills", "starfire", f), "utf8"))), `…and every bundled reference inline (${refs.join(", ") || "none"})`);
      ok("K2c", /NO send, post, publish, schedule, or save tools/.test(sf.cap.runner.doctrine) && /waits for his approval/.test(sf.cap.runner.doctrine), "the preamble tells the skill it has no send tools and that drafts wait for him");
      ok("K2d", sf.cap.runner.cost.maxTurns <= 32 && sf.cap.runner.cost.maxBudgetUsd <= 3 && sf.cap.runner.cost.minutes <= 20, `caps bounded by code: ${JSON.stringify(sf.cap.runner.cost)}`);
    }
    for (const key of ["perry-white", "kid-flash", "red-robin", "blue-beetle", "jimmy-olsen", "watchtower"]) {
      const r = await resolveDispatch(key);
      ok(`K3-${key.slice(0, 5)}`, !("ok" in r) && r.cap.runner.kind === "skill" && r.cap.pinned, `${key} → skill row, pinned`);
    }
    const jo = await resolveDispatch("Jimmy Olsen");
    ok("K3-name", !("ok" in jo) && jo.key === "jimmy-olsen", `"Jimmy Olsen" (a brain-only skill NOT on the roster) resolves by registry name`);
    const un = await resolveDispatch("youtube-metadata");
    ok("K3-unpin", !("ok" in un) && un.cap.runner.kind === "skill" && !un.cap.pinned, "youtube-metadata → skill row, NOT pinned");

    // dispatch_unit("starfire") is ACCEPTED and rides the worker path with the skill's doctrine.
    const fk = fakeDb(true);
    _setDbForTests(fk.client);
    _test.setSchema({ migrated: true, probedAt: "t" });
    frames.length = 0;
    const seen: Array<{ unit: string; kind: string; doctrineHead: string; maxTurns: number }> = [];
    _test.setWorker(async (_c, jobId, unit, _name, _t, _task, runner) => {
      seen.push({ unit, kind: runner.kind, doctrineHead: runner.doctrine.slice(0, 40), maxTurns: runner.cost.maxTurns });
      await failJob(jobId, unit, "GE post", "stubbed worker", emit, fk.client);
    });
    const acc = await dispatchUnit({ unit: "Starfire", task: "we need a social media post for GE Outdoors", why: "social post → Starfire owns organic social", emitJob: emit, conversationId: "conv-3" });
    await new Promise((res) => setTimeout(res, 10));
    _test.setWorker(null);
    const row = fk.tables.jobs[0];
    ok("K4", acc.ok && acc.status === "queued" && acc.unit === "starfire" && acc.name === "Starfire" && /drafts, then waits/.test(acc.say), `dispatch_unit("Starfire") ACCEPTED: ${acc.ok ? acc.say.slice(0, 90) : acc.say}…`);
    ok("K4a", seen.length === 1 && seen[0].unit === "starfire" && seen[0].kind === "skill" && /^You are Starfire, running as a Churlish/.test(seen[0].doctrineHead), `the skill doctrine reached the worker path: ${JSON.stringify(seen[0])}`);
    ok("K4b", !!row && row.unit === "starfire" && row.host === "brain" && row.tier === "green" && row.why === "social post → Starfire owns organic social", `job row: unit=${row?.unit} host=${row?.host} tier=${row?.tier} (job.tier stays the v0.1 green|red wire; the unit's default tier is on /state.fleet)`);
    ok("K4c", frames.map((f) => f.status).join(">") === "queued>failed", `frames ${frames.map((f) => f.status).join(">")} (stub fails immediately)`);

    // dispatch_unit("docx") is refused as WORKSPACE_ONLY — with the sync's reason.
    const fk2 = fakeDb(false);
    _setDbForTests(fk2.client);
    _test.setSchema({ migrated: false, probedAt: "t", reason: "test" });
    frames.length = 0;
    const dx = await dispatchUnit({ unit: "docx", task: "make the proposal a Word doc", why: "test", emitJob: emit });
    ok("K5", !dx.ok && dx.code === "unit_not_runnable" && dx.badge === "WORKSPACE_ONLY" && /python scripts/.test(dx.say) && fk2.tables.jobs.length === 0 && frames.length === 0, `dispatch_unit("docx") → ${!dx.ok ? dx.code + " / " + dx.badge : "RAN (wrong)"}; no row, no frame`);
    ok("K5a", !dx.ok && dx.runnable.length <= MAX_ALTERNATIVES && dx.runnable.some((x) => /proposal|invoice|strategy|master-plan/.test(x.key)), `…alternatives by relevance: ${!dx.ok ? dx.runnable.map((x) => x.key).join(", ") : ""}`);
    for (const key of ["pptx", "xlsx", "pdf", "reel-vision", "big-barda", "eve-super-brain"]) {
      const r = await resolveDispatch(key);
      ok(`K5-${key.slice(0, 5)}`, "ok" in r && r.code === "unit_not_runnable" && r.badge === "WORKSPACE_ONLY", `${key} → ${"ok" in r ? r.code : "RAN (wrong)"}`);
    }

    // A skill worker holds NO send tools — the tool list is code, and it is read-only web.
    const sendish = /send|mail|slack|sms|post|publish|schedule|write|edit|bash|mcp__|os_/i;
    ok("K6", WORKER_TOOLS.length === 2 && WORKER_TOOLS.every((t) => ["WebSearch", "WebFetch"].includes(t)) && WORKER_TOOLS.every((t) => !sendish.test(t)), `worker/skill tool list = [${WORKER_TOOLS.join(", ")}] — no send tools`);
    ok("K6a", REGISTRY.filter((c) => c.runner.kind === "skill").every((c) => !("tools" in c.runner) && !("adapter" in c.runner)), "no skill row carries a tool grant or an adapter (the manifest cannot widen the worker)");

    // The alternatives helper never returns more than 8, and prefers relevance.
    const alts = alternativesFor("perry-white-x", { key: "x", name: "Email Desk", job: "writes client emails", triggers: "email", division: "fleet" } as never);
    ok("K7", alts.length <= MAX_ALTERNATIVES && alts.some((c) => /email|perry|pennyworth/.test(c.key)), `alternatives for an email-shaped unit: ${alts.map((c) => c.key).join(", ")}`);

    // The dispatch_unit description carries the re-route sentence and no 40-name list.
    const desc = dispatchUnitDescription();
    ok("K8", /RE-ROUTE HONESTY/.test(desc) && /which unit you used instead and why/.test(desc) && /If the unit he named IS runnable, run THAT unit/.test(desc), "dispatch_unit description: re-route honesty sentence present");
    ok("K8a", desc.length < 2200 && !/youtube-metadata/.test(desc) && /Pinned: [^.]*starfire/.test(desc) && new RegExp(`${REGISTRY.length} units are RUNNABLE`).test(desc), `description is counts + pinned, not the whole list (${desc.length} chars)`);
    const rc = registryCounts();
    ok("K9", rc.dispatchable === REGISTRY.length && rc.kinds.skill === ms.units && rc.kinds.worker === 4 && rc.kinds.tool === 1 && rc.pinned === 9 && rc.manifest.loaded, `/health.fleet counts: ${JSON.stringify({ dispatchable: rc.dispatchable, kinds: rc.kinds, pinned: rc.pinned })}`);
  }

  // =========================================================================
  console.log("\n=== P0.2 — FAILED IS LOUD: a failed job inserts a job_failed attention item ===");
  {
    const fk = fakeDb(false);
    _setDbForTests(fk.client);
    _test.setSchema({ migrated: false, probedAt: "t", reason: "test" });
    fk.tables.jobs.push({ id: "job-f1", agent: "research", title: "Sweep the market", status: "running", created_at: new Date().toISOString() });
    frames.length = 0;
    await failJob("job-f1", "research", "Sweep the market", "worker ended: error_max_turns " + "x".repeat(300), emit);
    const item = fk.tables.attention_items[0];
    ok("F1", fk.tables.jobs[0].status === "failed" && !!fk.tables.jobs[0].finished_at, "job row → failed with finished_at");
    ok("F2", !!item && item.kind === "job_failed", `attention item kind = ${item?.kind}`);
    ok("F3", typeof item?.message === "string" && /^research — Sweep the market: worker ended/.test(item.message as string), `message "<unit> — <title>: <reason>": "${String(item?.message).slice(0, 60)}…"`);
    const reason = (item?.ref as { reason: string }).reason;
    ok("F4", reason.length === 200 && (item?.ref as { jobId: string }).jobId === "job-f1", `reason clipped to ${reason.length} chars; ref.jobId carried`);
    ok("F5", frames.length === 1 && frames[0].status === "failed" && frames[0].unit === "research", `SSE job frame emitted: ${JSON.stringify(frames[0])}`);
  }

  // =========================================================================
  console.log("\n=== P1.6 — dispatch_unit accepts pennyworth (and refuses perry-white, above) ===");
  {
    const fk = fakeDb(false);
    _setDbForTests(fk.client);
    _test.setSchema({ migrated: false, probedAt: "t", reason: "test" });
    frames.length = 0;
    const noClient = await dispatchUnit({ unit: "pennyworth", task: "email Acacia about moving the shoot to the 12th", why: "client email desk" });
    ok("P1", !noClient.ok && noClient.code === "missing_input" && fk.tables.jobs.length === 0, `pennyworth without client → ${!noClient.ok ? noClient.code : "ran"}; no row, no guess`);
    // With a client but the OS line unwired: the job opens, the draft step
    // fails honestly, and the failure is LOUD. This is the whole pennyworth
    // path minus the network — accepted, row, frames, attention item.
    const confirms: unknown[] = [];
    const r = await dispatchUnit({ unit: "pennyworth", task: "email Acacia about moving the shoot to the 12th", why: "client email desk", client: "Acacia Wellness", emitJob: emit, emitConfirm: (c) => confirms.push(c), conversationId: "conv-1" });
    const row = fk.tables.jobs[0];
    ok("P2", !!row && row.agent === "pennyworth" && row.status === "failed", `pennyworth ACCEPTED: row agent=${row?.agent} status=${row?.status} (OS unwired → honest failure)`);
    ok("P3", !r.ok && r.code === "run_failed" && /OS line isn't wired/.test(r.say), `returns run_failed with the real cause: "${!r.ok ? r.say.slice(0, 80) : ""}…"`);
    ok("P4", frames.map((f) => f.status).join(">") === "queued>running>failed", `frames: ${frames.map((f) => f.status).join(" > ")}`);
    ok("P5", frames[0].why === "client email desk" && frames[0].tier === "red" && frames[0].host === "brain", `frame carries why/tier/host: ${JSON.stringify(frames[0])}`);
    ok("P6", fk.tables.attention_items.some((a) => a.kind === "job_failed" && /^pennyworth — email Acacia/.test(String(a.message))), "job_failed attention item landed");
    ok("P7", confirms.length === 0 && listPending().length === 0, "NO confirm card was raised (draft never landed) — nothing pretends a send is pending");
    ok("P8", Object.keys(row!).every((k) => LEGACY_JOBS.includes(k)), `pre-migration: the row used ONLY legacy columns (${Object.keys(row!).join(",")})`);
    const view = shapeJob(row!);
    ok("P9", view.unit === "pennyworth" && view.why === "client email desk" && view.tier === "red" && view.spec?.said === "email Acacia about moving the shoot to the 12th" && view.conversation_id === "conv-1", "shapeJob overlays why/tier/spec/conversation from memory in pre-migration mode");
  }

  console.log("\n=== P1.6 — a worker unit opens a queued row and hands off (SDK call stubbed) ===");
  {
    const fk = fakeDb(true);
    _setDbForTests(fk.client);
    _test.setSchema({ migrated: true, probedAt: "t" });
    frames.length = 0;
    const seen: string[] = [];
    _test.setWorker(async (_c, jobId, unit, name, _t, _task, runner) => {
      seen.push(`${unit}:${name}:${runner.cost.maxTurns}:${runner.doctrine.slice(0, 20)}`);
      await failJob(jobId, unit, "Sweep", "stubbed worker", emit, fk.client);
    });
    const r = await dispatchUnit({ unit: "research", task: "Sweep the Omaha lumber market", why: "needs live web", emitJob: emit, conversationId: "conv-2" });
    await new Promise((res) => setTimeout(res, 10));
    _test.setWorker(null);
    const row = fk.tables.jobs[0];
    ok("W1", r.ok && r.status === "queued" && r.unit === "research" && /has it/.test(r.say), `accepted: ${r.ok ? r.say.slice(0, 60) : r.say}…`);
    ok("W2", seen.length === 1 && seen[0].startsWith("research:Research:32:You are Churlish"), `the registry row's doctrine + cost reached the worker (${seen[0]})`);
    ok("W3", !!row && row.unit === "research" && row.host === "brain" && row.why === "needs live web" && row.conversation_id === "conv-2" && (row.spec as { said: string }).said === "Sweep the Omaha lumber market", "migrated: unit/host/why/spec/conversation_id written to the row");
    ok("W4", frames.map((f) => f.status).join(">") === "queued>failed", `frames ${frames.map((f) => f.status).join(">")} (stub fails immediately)`);
  }

  // =========================================================================
  console.log("\n=== P0.3 — /state.jobs: 24 h window, any status, newest first, limit 50 ===");
  {
    const fk = fakeDb(false);
    _setDbForTests(fk.client);
    _test.setSchema({ migrated: false, probedAt: "t", reason: "test" });
    const now = Date.parse("2026-09-01T12:00:00Z");
    const at = (h: number) => new Date(now - h * 3600_000).toISOString();
    fk.tables.jobs.push(
      { id: "j-done-1h", agent: "jsa", title: "a", status: "done", created_at: at(1), finished_at: at(0.5), result_ref: null },
      { id: "j-fail-2h", agent: "research", title: "b", status: "failed", created_at: at(2), finished_at: at(1.9), result_ref: null },
      { id: "j-run-23h", agent: "pennyworth", title: "c", status: "running", created_at: at(23), finished_at: null, result_ref: null },
      { id: "j-done-25h", agent: "jsa", title: "old", status: "done", created_at: at(25), finished_at: at(24), result_ref: null },
    );
    const { data, error } = await recentJobsQuery(fk.client, now);
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    ok("J1", !error && ids.join(",") === "j-done-1h,j-fail-2h,j-run-23h", `returns done + failed + running inside 24 h, newest first: ${ids.join(", ")}`);
    ok("J2", !ids.includes("j-done-25h"), "…and excludes the 25 h-old row");
    const op = fk.ops.at(-1) ?? "";
    ok("J3", /gte\(created_at=2026-08-31T12:00:00/.test(op) && /limit\(50\)/.test(op) && /order\(created_at desc\)/.test(op) && !/\.in\(status/.test(op), `query: ${op}`);
    ok("J4", !/unit|why|confirm_id/.test(op.split(")")[0]), "pre-migration: the select names only legacy columns");
    const v = shapeJob(data![0] as Record<string, unknown>);
    ok("J5", v.unit === "jsa" && v.agent === "jsa" && v.host === "brain" && v.why === null && v.confirm_id === null && v.result === null && v.cost_usd === null, `legacy row shapes with explicit nulls (no invented values): ${JSON.stringify(v).slice(0, 120)}…`);
    _test.setSchema({ migrated: true, probedAt: "t" });
    const mk = fakeDb(true);
    await recentJobsQuery(mk.client, now);
    ok("J6", /unit, spec, result.*confirm_id, updated_at/.test(mk.ops.at(-1) ?? ""), `migrated: the select names the 004 columns`);
  }

  // =========================================================================
  console.log("\n=== P1.8 — CONFIRM ↔ JOB: resolving the card closes the linked job ===");
  {
    const fk = fakeDb(true);
    _setDbForTests(fk.client);
    _test.setSchema({ migrated: true, probedAt: "t" });
    // Seeded rows, NOT in the overlay: this is the post-restart case — the
    // brain redeployed between the card going up and his approve.
    fk.tables.jobs.push({ id: "job-c1", agent: "pennyworth", unit: "pennyworth", title: "email Acacia", status: "in_approvals", created_at: new Date().toISOString(), why: "client email desk", tier: "red", confirm_id: "c-old" });
    let fired = 0;
    const p = requestConfirm("os_send_email", "Send to Acacia", { client_name: "Acacia", jobId: "job-c1" }, async () => (fired += 1, "OS: sent"), undefined, undefined, "job-c1");
    ok("C1", p.jobId === "job-c1" && listPending().some((x) => x.id === p.id && x.jobId === "job-c1"), "the pending card carries jobId (card ↔ row can find each other)");
    frames.length = 0;
    const r = await resolveConfirm(p.id, p.hash, true);
    ok("C2", r.ok && r.executed && r.jobId === "job-c1" && fired === 1, `approve → executed, jobId rides back (${JSON.stringify(r)})`);
    const s = await settleJobFromConfirm("job-c1", { approved: true, executed: true, detail: "OS: sent" }, emit);
    const row = fk.tables.jobs[0];
    ok("C3", s?.status === "done" && row.status === "done" && (row.result as { kind: string; detail: string }).kind === "confirm" && (row.result as { detail: string }).detail === "OS: sent" && !!row.finished_at, `job → done, result = the resolution: ${JSON.stringify(row.result)}`);
    ok("C4", frames.length === 1 && frames[0].status === "done" && frames[0].unit === "pennyworth" && frames[0].why === "client email desk" && frames[0].tier === "red", `frame from ROW facts (overlay empty = post-restart): ${JSON.stringify(frames[0])}`);
    const ghost = await settleJobFromConfirm("job-none", { approved: true, executed: true, detail: "x" });
    ok("C4b", ghost === null && fk.tables.jobs.every((j) => j.id !== "job-none"), "a confirm for a job row that does not exist settles nothing (no invented row)");

    // Cancel twin: his own cancel closes the job failed, with NO nag item.
    fk.tables.jobs.push({ id: "job-c2", agent: "pennyworth", unit: "pennyworth", title: "email Zach", status: "in_approvals", created_at: new Date().toISOString() });
    const p2 = requestConfirm("os_send_email", "Send to Zach", { client_name: "Zach", jobId: "job-c2" }, async () => "never", undefined, undefined, "job-c2");
    const r2 = await resolveConfirm(p2.id, p2.hash, false);
    ok("C5", r2.ok && !r2.executed && r2.jobId === "job-c2", "cancel → not executed, jobId still rides back");
    await settleJobFromConfirm("job-c2", { approved: false, executed: false, detail: "cancelled" });
    ok("C6", fk.tables.jobs[1].status === "failed" && (fk.tables.jobs[1].result as { approved: boolean }).approved === false && fk.tables.attention_items.length === 0, "cancel → failed with the resolution as result, and no attention item (his own act is not a nag)");

    // Send-threw twin: approved but the OS refused → failed AND loud.
    fk.tables.jobs.push({ id: "job-c3", agent: "pennyworth", unit: "pennyworth", title: "email Lois", status: "in_approvals", created_at: new Date().toISOString() });
    const p3 = requestConfirm("os_send_email", "Send to Lois", { client_name: "Lois", jobId: "job-c3" }, async () => { throw new Error("OS answered 502"); }, undefined, undefined, "job-c3");
    const r3 = await resolveConfirm(p3.id, p3.hash, true);
    ok("C7", !r3.ok && r3.jobId === "job-c3" && /502/.test(r3.error), `a send that threw carries jobId on the error arm: ${JSON.stringify(r3)}`);
    await settleJobFromConfirm("job-c3", { approved: true, executed: false, detail: r3.ok ? "" : r3.error, error: r3.ok ? undefined : r3.error });
    ok("C8", fk.tables.jobs[2].status === "failed" && fk.tables.attention_items.some((a) => a.kind === "job_failed" && /502/.test(String(a.message))), "…→ job failed + job_failed attention item naming the 502");
    // Mismatch twin: a wrong hash resolves nothing and links nothing.
    const p4 = requestConfirm("os_send_email", "x", { client_name: "x", jobId: "job-c4" }, async () => "no", undefined, undefined, "job-c4");
    const r4 = await resolveConfirm(p4.id, "0000", true);
    ok("C9", !r4.ok && r4.jobId === undefined && listPending().some((x) => x.id === p4.id), "hash mismatch → no jobId, entry kept (nothing settles on a refused approve)");
  }

  // =========================================================================
  console.log("\n=== P0.4 — /state.fleet: dispatchable = 5 code rows + bundled skills, against the bundled roster ===");
  {
    const jobs = [{ unit: "jsa", created_at: "2026-09-01T10:00:00Z" }, { unit: "jsa", created_at: "2026-09-01T11:00:00Z" }, { unit: "pennyworth", created_at: "2026-09-01T09:00:00Z" }];
    const f = await buildFleetBlock(jobs);
    const ms = manifestState();
    const rosterKeys = new Set((await fleetRoster()).units.map((u) => u.key));
    const offRoster = REGISTRY.filter((c) => !rosterKeys.has(c.key));
    ok("S1", f.dispatchable === 5 + ms.units && f.dispatchable === REGISTRY.length, `dispatchable = ${f.dispatchable} (5 code + ${ms.units} skills)`);
    ok("S2", rosterKeys.size === 51 && f.registered === 51 + offRoster.length && f.units.length === f.registered && f.units.filter((u) => u.roster).length === 51, `registered = ${f.registered} (51 roster + ${offRoster.length} brain-only: ${offRoster.map((c) => c.key).join(", ")}); source=${f.source}`);
    const badges = Object.fromEntries(f.units.map((u) => [u.key, u.badge]));
    ok("S3", badges.pennyworth === "RUNNABLE" && badges.jsa === "RUNNABLE" && badges.research === "RUNNABLE" && badges["perry-white"] === "RUNNABLE" && badges.starfire === "RUNNABLE" && badges.eve === "WORKSPACE_ONLY" && badges.cyborg === "WORKSPACE_ONLY", `badges: pennyworth=${badges.pennyworth} jsa=${badges.jsa} perry-white=${badges["perry-white"]} starfire=${badges.starfire} eve=${badges.eve} cyborg=${badges.cyborg}`);
    const ws = f.units.filter((u) => u.badge === "WORKSPACE_ONLY").length;
    ok("S4", ws === f.registered - f.dispatchable && f.units.every((u) => u.badge !== "DESK"), `${ws} WORKSPACE_ONLY, 0 DESK (nothing desk-wired) — computed, not literal`);
    const pw = f.units.find((u) => u.key === "pennyworth")!;
    const jsa = f.units.find((u) => u.key === "jsa")!;
    ok("S5", pw.live === false && jsa.live === true && f.units.find((u) => u.key === "perry-white")!.live === true && f.units.find((u) => u.key === "cyborg")!.live === false, `live: pennyworth=${pw.live} (OS unwired) jsa=${jsa.live} perry-white=true cyborg=false`);
    ok("S6", jsa.lastRunAt === "2026-09-01T11:00:00Z" && pw.lastRunAt === "2026-09-01T09:00:00Z" && !("lastRunAt" in f.units.find((u) => u.key === "research")!), "lastRunAt = newest job in the window per unit; ABSENT when none (never a guess)");
    ok("S7", f.units.every((u) => typeof u.name === "string" && typeof u.role === "string" && typeof u.key === "string"), "every unit carries key/name/role");
    ok("S8", badgeFor("katana") === "WORKSPACE_ONLY", "an unregistered key badges WORKSPACE_ONLY, never RUNNABLE");
    // v0.2 per-unit fields
    const sf = f.units.find((u) => u.key === "starfire")!;
    const cy = f.units.find((u) => u.key === "cyborg")!;
    const jo = f.units.find((u) => u.key === "jimmy-olsen")!;
    ok("S9", sf.kind === "skill" && sf.pinned === true && sf.tier === "yellow" && sf.division === "fleet" && sf.triggers.length > 0 && sf.triggers.length <= 80, `starfire: kind=${sf.kind} pinned=${sf.pinned} tier=${sf.tier} division=${sf.division} triggers="${sf.triggers}"`);
    ok("S10", cy.kind === null && cy.pinned === false && !("tier" in cy) && cy.triggers.length > 0, `cyborg (WORKSPACE_ONLY): kind=null pinned=false no tier, triggers="${cy.triggers}"`);
    ok("S11", jo.kind === "skill" && jo.roster === false && jo.division === "brain-skills" && jo.loc === "BRAIN" && jo.pinned, `jimmy-olsen (not a roster row): roster=false division=${jo.division} loc=${jo.loc} pinned=${jo.pinned}`);
    ok("S12", f.pinned === 9 && f.units.filter((u) => u.pinned).map((u) => u.key).sort().join(",") === "blue-beetle,jimmy-olsen,kid-flash,pennyworth,perry-white,red-robin,research,starfire,watchtower", `pinned = ${f.pinned}: ${f.units.filter((u) => u.pinned).map((u) => u.key).sort().join(", ")}`);
    ok("S13", f.kinds.worker === 4 && f.kinds.tool === 1 && f.kinds.skill === ms.units && f.units.every((u) => typeof u.triggers === "string" && u.triggers.length <= 80), `kinds = ${JSON.stringify(f.kinds)}; every triggers ≤ 80 chars`);
  }

  // =========================================================================
  console.log("\n=== P1.7 — the ambient fleet line: under ~90 tokens, counts + pinned names only ===");
  {
    const line = await fleetLine();
    const words = line.split(/\s+/).length;
    const tokens = Math.ceil(line.length / 4);
    // chars/4 under-counts here (hyphenated keys, WORKSPACE_ONLY): the real
    // tokenizer read 118 for the 340-char v0.2 draft. Budget by chars: ≤ 300.
    ok("L1", line.length <= 300 && words <= 60, `≈${tokens} tokens by chars/4 (${line.length} chars, ${words} words) — real count in CONTRACT §v0.2`);
    ok("L2", /RUNNABLE/.test(line) && /WORKSPACE_ONLY/.test(line) && (/DESK/.test(line) || (await buildFleetBlock([])).units.every((u) => u.badge !== "DESK")), "names the badges in play (DESK only when something is desk-wired)");
    ok("L3", ["starfire", "kid-flash", "red-robin", "blue-beetle", "perry-white", "jimmy-olsen", "watchtower", "pennyworth", "research"].every((k) => line.includes(k)) && !/youtube-metadata|aqualad/.test(line), "names the pinned units and NOT the rest");
    const m = line.match(/Fleet: (\d+) units — (\d+) RUNNABLE, (?:(\d+) DESK, )?(\d+) WORKSPACE_ONLY/);
    const f = await buildFleetBlock([]);
    ok("L4", !!m && Number(m[1]) === f.registered && Number(m[2]) === f.dispatchable && Number(m[3] ?? 0) === 0 && Number(m[1]) === Number(m[2]) + Number(m[3] ?? 0) + Number(m[4]), `counts match /state.fleet (${m?.slice(1).join("/")}) and sum`);
    ok("L5", !/trigger:|·/.test(line) && !/Daily money brief/.test(line), "no job descriptions or triggers (that is fleet_roster's job)");
    ok("L6", /fleet_roster lists them/.test(line) && /others can't run here/.test(line) && /Re-routing\? say which unit and why/.test(line), "points at fleet_roster for the list, says the rest can't run, and carries the re-route clause");
    loud("L7", `=> ${line}`);
  }

  // =========================================================================
  console.log("\n=== P1.11 — PRE-MIGRATION MODE engages when the probe fails ===");
  {
    const legacy = fakeDb(false);
    const s1 = await probeDispatchSchema(legacy.client);
    ok("M1", s1.migrated === false && /probe failed: column jobs\.host does not exist/.test(s1.reason ?? "") && dispatchReady().migrated === false, `legacy table → ${JSON.stringify(s1)}`);
    const migrated = fakeDb(true);
    const s2 = await probeDispatchSchema(migrated.client);
    ok("M2", s2.migrated === true && s2.probedAt !== null && dispatchReady().migrated === true, `004 applied → ${JSON.stringify(s2)}`);
    const off = await probeDispatchSchema(null);
    ok("M3", off.migrated === false && off.probedAt === null && off.reason === "memory spine offline", `spine offline → ${JSON.stringify(off)}`);
    ok("M4", /host, unit, spec, result, awaiting, parent_id, step, cost_usd, desk_id, conversation_id, why, tier, confirm_id, updated_at/.test(legacy.ops[0]), `the probe is ONE select naming every 004 column: ${legacy.ops[0]}`);
  }

  // The frame shape is exactly the contract's.
  {
    const allowed = new Set(["id", "status", "unit", "title", "host", "why", "tier", "confirmId"]);
    ok("SSE", frames.length > 0 && frames.every((f) => Object.keys(f).every((k) => allowed.has(k))), `every emitted job frame ⊆ {${[...allowed].join(",")}}`);
  }

  _setDbForTests(null);
  console.log(show.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
