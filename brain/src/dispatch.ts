import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "./db.js";
import { searchMemory } from "./memory.js";
import { withheldRecallLine } from "./durable.js";
import { isQuietHours } from "./schedule.js";
import { sendPush, getLatestToken, isPushReady } from "./push.js";
import { requestConfirm, type PendingConfirm } from "./confirm.js";
import { fleetRoster } from "./fleet.js";
import * as os from "./os.js";
import {
  capability,
  resolveUnitKey,
  refuseUnit,
  type Capability,
  type DispatchRefusal,
  type ToolRunner,
  type WorkerRunner,
  type SkillRunner,
} from "./registry.js";

// The ONLY tools a background worker (worker kind AND skill kind) ever holds.
// Read-only web. No send/post/publish/schedule/save — D-DISPATCH weakness #3:
// a bad deliverable is the worst case a worker can produce, never a bad action.
// A manifest row cannot widen this; it is code.
export const WORKER_TOOLS: readonly string[] = ["WebSearch", "WebFetch"];

/**
 * Permission mode for unattended workers. NOT "bypassPermissions": that needs
 * --dangerously-skip-permissions, which refuses to run as root — which is what
 * the Railway container is. "dontAsk" pre-approves via `allowedTools` and
 * denies everything else.
 */
export const WORKER_PERMISSION_MODE =
  (process.env.EVE_WORKER_PERMISSION_MODE as
    | "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "auto"
    | undefined) ?? "dontAsk";

// THE DISPATCHER, v0.1 (D-DISPATCH §1, §2.4, §3, §6, §8.2).
//
// One job row the brain owns. A unit resolves through the registry
// (registry.ts) or it is REFUSED out loud — the old `PERSONAS[agent] ??
// PERSONAS.eve` line, which ran a generic worker wearing any name it was
// handed, is gone. Every status transition is written to the row, emitted as
// a `job` SSE frame on the dispatching turn, and `failed` always lands an
// attention item so it reaches his inbox instead of a server log.
//
// Fleet workers run their OWN model — kept on Sonnet 5 even when the chat loop
// (EVE_MODEL) drops to Haiku for cost. Split set by King 2026-07-17.
const MODEL = process.env.EVE_FLEET_MODEL || "claude-sonnet-5";
const here = path.dirname(fileURLToPath(import.meta.url));
const deliverablesDir = path.join(here, "..", "data", "deliverables");

export type JobStatus = "queued" | "running" | "in_approvals" | "done" | "failed";

/** The SSE `job` frame. Emitted on every status transition of the dispatching turn. */
export interface JobFrame {
  id: string;
  status: JobStatus;
  unit: string;
  title: string;
  host: "brain" | "desk";
  why?: string;
  tier?: "green" | "red";
  confirmId?: string;
}
export type JobEmit = (frame: JobFrame) => void;

// ---------------------------------------------------------------------------
// PRE-MIGRATION HONESTY. sql/004_dispatch.sql is additive and may not have
// been applied. One probing select at boot decides the mode; nothing pretends.
// ---------------------------------------------------------------------------

export const DISPATCH_COLUMNS = [
  "host", "unit", "spec", "result", "awaiting", "parent_id", "step", "cost_usd",
  "desk_id", "conversation_id", "why", "tier", "confirm_id", "updated_at",
] as const;
const LEGACY_COLUMNS = ["id", "agent", "title", "status", "result_ref", "created_at", "finished_at"] as const;

export interface DispatchSchema {
  migrated: boolean; // true = 004 columns present; false = legacy jobs table, "store what fits"
  probedAt: string | null; // null = not probed yet (spine offline at boot)
  reason?: string; // why migrated is false, when it is
}
let schema: DispatchSchema = { migrated: false, probedAt: null, reason: "not probed yet" };

export async function probeDispatchSchema(c: SupabaseClient | null = db()): Promise<DispatchSchema> {
  if (!c) {
    schema = { migrated: false, probedAt: null, reason: "memory spine offline" };
    return schema;
  }
  const { error } = await c.from("jobs").select(["id", ...DISPATCH_COLUMNS].join(", ")).limit(1);
  schema = error
    ? { migrated: false, probedAt: new Date().toISOString(), reason: `probe failed: ${error.message}` }
    : { migrated: true, probedAt: new Date().toISOString() };
  console.log(`[dispatch] schema probe → ${schema.migrated ? "migrated (004 columns present)" : "PRE-MIGRATION mode: " + schema.reason}`);
  return schema;
}

export function dispatchReady(): DispatchSchema {
  return schema;
}

// In pre-migration mode the columns that don't exist live here for the life of
// the process, keyed by job id, so the SSE frame and /state can still carry
// why/tier/confirmId for jobs THIS process created. Lost on restart — by design
// and said so in /health.dispatchReady.
interface Extras {
  unit: string;
  host: "brain" | "desk";
  why?: string;
  tier?: "green" | "red";
  confirmId?: string;
  result?: Record<string, unknown>;
  spec?: Record<string, unknown>;
  conversationId?: string;
  costUsd?: number;
}
const overlay = new Map<string, Extras>();

// ---------------------------------------------------------------------------
// Job row helpers — the ONLY writers of jobs.status in this file.
// ---------------------------------------------------------------------------

interface NewJob {
  unit: string;
  title: string;
  host: "brain" | "desk";
  why?: string;
  tier?: "green" | "red";
  spec: Record<string, unknown>;
  conversationId?: string;
}

async function insertJob(c: SupabaseClient, j: NewJob): Promise<{ id: string } | { error: string }> {
  const legacy = { agent: j.unit, title: j.title.slice(0, 140), status: "queued" as const };
  const row = schema.migrated
    ? {
        ...legacy,
        host: j.host,
        unit: j.unit,
        spec: j.spec,
        why: j.why ?? null,
        tier: j.tier ?? null,
        conversation_id: j.conversationId ?? null,
        updated_at: new Date().toISOString(),
      }
    : legacy;
  const { data, error } = await c.from("jobs").insert(row).select("id").single();
  if (error || !data) return { error: error?.message ?? "insert returned no row" };
  overlay.set(data.id, {
    unit: j.unit,
    host: j.host,
    why: j.why,
    tier: j.tier,
    spec: j.spec,
    conversationId: j.conversationId,
  });
  return { id: data.id as string };
}

interface StatusPatch {
  status: JobStatus;
  confirmId?: string;
  result?: Record<string, unknown>;
  resultRef?: string | null;
  costUsd?: number;
  terminal?: boolean; // stamps finished_at
}

async function patchJob(c: SupabaseClient, jobId: string, p: StatusPatch): Promise<void> {
  const now = new Date().toISOString();
  const legacy: Record<string, unknown> = { status: p.status };
  if (p.terminal) legacy.finished_at = now;
  if (p.resultRef !== undefined) legacy.result_ref = p.resultRef;
  const row = schema.migrated
    ? {
        ...legacy,
        updated_at: now,
        ...(p.confirmId !== undefined ? { confirm_id: p.confirmId } : {}),
        ...(p.result !== undefined ? { result: p.result } : {}),
        ...(p.costUsd !== undefined ? { cost_usd: p.costUsd } : {}),
      }
    : legacy;
  const { error } = await c.from("jobs").update(row).eq("id", jobId);
  if (error) console.error(`[dispatch] job ${jobId} → ${p.status} write failed:`, error.message);
  const x = overlay.get(jobId);
  if (x) {
    if (p.confirmId !== undefined) x.confirmId = p.confirmId;
    if (p.result !== undefined) x.result = p.result;
    if (p.costUsd !== undefined) x.costUsd = p.costUsd;
  }
}

// `known` is what the caller read from the ROW (post-restart the overlay is
// empty, and a frame must never carry a placeholder unit).
function frameFor(jobId: string, status: JobStatus, title: string, x: Extras | undefined, known: Partial<Extras> = {}): JobFrame {
  const unit = x?.unit ?? known.unit;
  if (!unit) throw new Error(`[dispatch] job ${jobId}: no unit known for the frame`);
  const why = x?.why ?? known.why;
  const tier = x?.tier ?? known.tier;
  const confirmId = x?.confirmId ?? known.confirmId;
  return {
    id: jobId,
    status,
    unit,
    title,
    host: x?.host ?? known.host ?? "brain",
    ...(why ? { why } : {}),
    ...(tier ? { tier } : {}),
    ...(confirmId ? { confirmId } : {}),
  };
}

/** The row-side facts a frame needs when the overlay is empty (post-restart). */
async function knownFromRow(c: SupabaseClient, jobId: string): Promise<{ title: string; known: Partial<Extras> }> {
  const cols = schema.migrated ? "id, agent, title, unit, host, why, tier, confirm_id" : "id, agent, title";
  const { data: row } = await c.from("jobs").select(cols).eq("id", jobId).maybeSingle();
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    title: (r.title as string | undefined) ?? "",
    known: {
      unit: (r.unit as string | undefined) ?? (r.agent as string | undefined),
      host: (r.host as "brain" | "desk" | undefined),
      why: (r.why as string | undefined) ?? undefined,
      tier: (r.tier as "green" | "red" | undefined) ?? undefined,
      confirmId: (r.confirm_id as string | undefined) ?? undefined,
    },
  };
}

/**
 * `failed` is never silent (D-DISPATCH §1.2). Writes the terminal status AND
 * an attention item — kind "job_failed", message "<unit> — <title>: <reason>"
 * — so it lands in his approval inbox and the hub, exactly like a success does.
 */
export async function failJob(
  jobId: string,
  unit: string,
  title: string,
  reason: string,
  emit?: JobEmit,
  c: SupabaseClient | null = db(),
): Promise<void> {
  if (!c) return;
  const why = (reason || "no reason recorded").replace(/\s+/g, " ").trim().slice(0, 200);
  await patchJob(c, jobId, { status: "failed", terminal: true, result: { kind: "failure", reason: why, at: new Date().toISOString() } });
  const { error } = await c.from("attention_items").insert({
    kind: "job_failed",
    message: `${unit} — ${title.slice(0, 100)}: ${why}`,
    nudge_level: 1,
    ref: { jobId, job_id: jobId, unit, reason: why },
  });
  if (error) console.error(`[dispatch] job_failed attention item for ${jobId} not written:`, error.message);
  emit?.(frameFor(jobId, "failed", title, overlay.get(jobId), { unit }));
}

// ---------------------------------------------------------------------------
// dispatch_unit — the one entry point (tool, POST /dispatch, legacy alias).
// ---------------------------------------------------------------------------

export interface DispatchInput {
  unit: string; // roster key or name — resolved, never fuzzy-matched
  task: string; // his sentence, verbatim
  why: string; // her one-line routing reason
  client?: string; // required by units whose registry row declares it (pennyworth)
  conversationId?: string;
  emitJob?: JobEmit;
  emitConfirm?: (c: PendingConfirm) => void;
}

export interface DispatchAccepted {
  ok: true;
  jobId: string;
  unit: string;
  name: string;
  status: JobStatus; // where the job is when this returns
  tier?: "green" | "red";
  confirmId?: string; // set when the job's next action is a RED card (already emitted)
  say: string; // what she may truthfully tell him right now
}
export type DispatchOutcome = DispatchAccepted | DispatchRefusal;

/** Pure resolution: which registry row (if any) a unit string lands on. No side effects. */
export async function resolveDispatch(unit: string): Promise<{ key: string; cap: Capability } | DispatchRefusal> {
  const { units } = await fleetRoster();
  const key = resolveUnitKey(unit, units);
  const cap = capability(key);
  if (!cap) return refuseUnit(key, units.find((u) => u.key === key));
  return { key, cap };
}

export async function dispatchUnit(input: DispatchInput): Promise<DispatchOutcome> {
  const task = input.task?.trim();
  const resolved = await resolveDispatch(input.unit ?? "");
  if ("ok" in resolved) return resolved; // the spoken refusal — no substitution, ever
  const { key, cap } = resolved;
  if (!task) {
    return { ok: false, code: "missing_input", unit: key, name: cap.name, say: `Nothing to hand ${cap.name} — the task was empty. Nothing was started.`, runnable: [] };
  }
  const c = db();
  if (!c) {
    return {
      ok: false,
      code: "spine_offline",
      unit: key,
      name: cap.name,
      say: "I can't open a job right now — the memory spine (jobs table) is offline. Nothing was started.",
      runnable: [],
    };
  }

  // Declared inputs (registry §2.2): missing → ask, never guess.
  if (cap.runner.kind === "tool") {
    const missing = cap.runner.inputs.filter((i) => i.required && !input[i.name]?.trim());
    if (missing.length) {
      return {
        ok: false,
        code: "missing_input",
        unit: key,
        name: cap.name,
        say: `${cap.name} needs ${missing.map((m) => m.name).join(", ")} to run this — which ${missing[0].name}? Nothing was started.`,
        runnable: [],
      };
    }
  }

  const tier = cap.runner.kind === "tool" ? cap.runner.tier : "green";
  const title = task.slice(0, 140);
  const ins = await insertJob(c, {
    unit: key,
    title,
    host: cap.host,
    why: input.why?.trim() || undefined,
    tier,
    spec: {
      said: task,
      unit: key,
      routedBy: "model",
      routedWhy: input.why?.trim() || null,
      ...(input.client ? { inputs: { client: input.client } } : {}),
    },
    conversationId: input.conversationId,
  });
  if ("error" in ins) {
    return { ok: false, code: "spine_offline", unit: key, name: cap.name, say: `I couldn't open the job row: ${ins.error}. Nothing was started.`, runnable: [] };
  }
  const jobId = ins.id;
  input.emitJob?.(frameFor(jobId, "queued", title, overlay.get(jobId)));

  if (cap.runner.kind === "worker" || cap.runner.kind === "skill") {
    // Fire-and-forget: the worker reports through the row + attention item + push.
    // A "skill" row rides the SAME path with its SKILL.md as doctrine (v0.2).
    void workerRunner(c, jobId, key, cap.name, title, task, cap.runner, input.client, input.emitJob).catch(async (err) => {
      console.error("[dispatch] worker crashed", err);
      await failJob(jobId, key, title, `worker crashed: ${err instanceof Error ? err.message : String(err)}`, input.emitJob, c);
    });
    return {
      ok: true,
      jobId,
      unit: key,
      name: cap.name,
      status: "queued",
      tier,
      say:
        cap.runner.kind === "skill"
          ? `${cap.name} has it (job ${jobId.slice(0, 8)}). Drafting in the background — the deliverable lands in his ` +
            `approvals with a ping when done (minutes). It drafts, then waits for him: nothing is sent, posted, or ` +
            `published by a skill worker. Don't claim its results before it lands.`
          : `${cap.name} has it (job ${jobId.slice(0, 8)}). It's running in the background — the deliverable lands in ` +
            `his approvals with a ping when done (minutes; research can take twenty). Don't claim its results before it lands.`,
    };
  }

  // Tool-kind: runs inline in this turn so the card is up before she answers.
  return TOOL_ADAPTERS[cap.runner.adapter](c, { jobId, key, cap, title, task, client: input.client!, emit: input.emitJob, emitConfirm: input.emitConfirm });
}

/** Legacy shape (POST /dispatch, dispatch_fleet). Same path, same refusals. */
export async function runDispatch(task: string, agent: string, client?: string, why = "legacy dispatch call"): Promise<DispatchOutcome> {
  return dispatchUnit({ unit: agent, task, why, client });
}

// ---------------------------------------------------------------------------
// Tool adapters — CODE. A registry row can only pick one of these by name.
// ---------------------------------------------------------------------------

interface AdapterArgs {
  jobId: string;
  key: string;
  cap: Capability;
  title: string;
  task: string;
  client: string;
  emit?: JobEmit;
  emitConfirm?: (c: PendingConfirm) => void;
}
type Adapter = (c: SupabaseClient, a: AdapterArgs) => Promise<DispatchOutcome>;

const TOOL_ADAPTERS: Record<ToolRunner["adapter"], Adapter> = {
  // Pennyworth's email, hop by hop (D-DISPATCH §3): GREEN draft into the OS
  // comms panel → RED send card bound to this job → his approve closes it.
  os_client_email: async (c, a) => {
    await patchJob(c, a.jobId, { status: "running" });
    a.emit?.(frameFor(a.jobId, "running", a.title, overlay.get(a.jobId)));
    let draft: string;
    try {
      draft = await os.osTool("draft_client_email", { client_name: a.client, instruction: a.task });
    } catch (e) {
      const reason = os.explainError(e);
      await failJob(a.jobId, a.key, a.title, reason, a.emit, c);
      return { ok: false, code: "run_failed", unit: a.key, name: a.cap.name, say: `${a.cap.name} couldn't draft it — ${reason} The job is marked failed; nothing was sent.`, runnable: [] };
    }
    const payload = { client_name: a.client, jobId: a.jobId };
    const pending = requestConfirm(
      "os_send_email",
      `Send Pennyworth's pending draft to ${a.client} (via Churlish OS)`,
      payload,
      () => os.osTool("send_pending_email", { client_name: a.client }, true),
      undefined,
      undefined,
      a.jobId,
    );
    a.emitConfirm?.(pending);
    await patchJob(c, a.jobId, {
      status: "in_approvals",
      confirmId: pending.id,
      result: { kind: "draft", client: a.client, draft: draft.slice(0, 4000), confirmId: pending.id, at: new Date().toISOString() },
    });
    a.emit?.(frameFor(a.jobId, "in_approvals", a.title, overlay.get(a.jobId)));
    return {
      ok: true,
      jobId: a.jobId,
      unit: a.key,
      name: a.cap.name,
      status: "in_approvals",
      tier: "red",
      confirmId: pending.id,
      say:
        `Pennyworth drafted it for ${a.client} (job ${a.jobId.slice(0, 8)}) and the send card is up (confirm ${pending.id.slice(0, 8)}, ` +
        `expires ${pending.expiresAt}). NOT sent — his approve fires it through the OS. Draft as the OS returned it:\n${draft.slice(0, 1500)}`,
    };
  },
};

// ---------------------------------------------------------------------------
// Confirm ↔ job linkage (D-DISPATCH §3.1 item 4). Called by POST /confirm
// after resolveConfirm, for confirms minted with a jobId.
// ---------------------------------------------------------------------------

export async function settleJobFromConfirm(
  jobId: string,
  r: { approved: boolean; executed: boolean; detail: string; error?: string },
  emit?: JobEmit,
  c: SupabaseClient | null = db(),
): Promise<{ status: JobStatus } | null> {
  if (!c) return null;
  const x = overlay.get(jobId);
  const { title, known } = await knownFromRow(c, jobId);
  const unit = x?.unit ?? known.unit;
  if (!unit) {
    console.error(`[dispatch] confirm resolved for job ${jobId} but no such job row — nothing settled`);
    return null;
  }
  const at = new Date().toISOString();
  if (r.error) {
    // The approve happened but the send threw — a real failure, loud.
    await failJob(jobId, unit, title, `send failed after approve: ${r.error}`, emit, c);
    return { status: "failed" };
  }
  if (!r.approved) {
    // His own cancel. Terminal, recorded as the result — no attention item,
    // because nagging him about a thing he just did is noise, not honesty.
    await patchJob(c, jobId, { status: "failed", terminal: true, result: { kind: "confirm", approved: false, executed: false, detail: r.detail, at } });
    emit?.(frameFor(jobId, "failed", title, x, known));
    return { status: "failed" };
  }
  await patchJob(c, jobId, { status: "done", terminal: true, result: { kind: "confirm", approved: true, executed: r.executed, detail: r.detail, at } });
  emit?.(frameFor(jobId, "done", title, x, known));
  return { status: "done" };
}

// ---------------------------------------------------------------------------
// /state.jobs — every job created in the last 24 h, any status, newest first.
// ---------------------------------------------------------------------------

export const JOBS_WINDOW_MS = 24 * 3600_000;
export const JOBS_LIMIT = 50;

export function recentJobsQuery(c: SupabaseClient, now: number = Date.now()) {
  const cols = schema.migrated ? [...LEGACY_COLUMNS, ...DISPATCH_COLUMNS] : [...LEGACY_COLUMNS];
  return c
    .from("jobs")
    .select(cols.join(", "))
    .gte("created_at", new Date(now - JOBS_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(JOBS_LIMIT);
}

/** The /state.jobs[] row shape. Legacy `agent` kept beside `unit` for the phone. */
export interface JobView {
  id: string;
  unit: string | null;
  agent: string | null;
  title: string;
  status: JobStatus;
  host: "brain" | "desk";
  why: string | null;
  tier: "green" | "red" | null;
  confirm_id: string | null;
  result: Record<string, unknown> | null;
  result_ref: string | null;
  cost_usd: number | null;
  conversation_id: string | null;
  spec: Record<string, unknown> | null;
  created_at: string;
  finished_at: string | null;
  updated_at: string | null;
}

export function shapeJob(row: Record<string, unknown>): JobView {
  const id = String(row.id);
  const x = overlay.get(id);
  const pick = <T,>(col: string, fallback: T | undefined): T | null =>
    (row[col] as T | null | undefined) ?? fallback ?? null;
  return {
    id,
    unit: pick<string>("unit", x?.unit ?? (row.agent as string | undefined)),
    agent: (row.agent as string | null | undefined) ?? null,
    title: String(row.title ?? ""),
    status: row.status as JobStatus,
    host: pick<"brain" | "desk">("host", x?.host) ?? "brain",
    why: pick<string>("why", x?.why),
    tier: pick<"green" | "red">("tier", x?.tier),
    confirm_id: pick<string>("confirm_id", x?.confirmId),
    result: pick<Record<string, unknown>>("result", x?.result),
    result_ref: (row.result_ref as string | null | undefined) ?? null,
    cost_usd: pick<number>("cost_usd", x?.costUsd),
    conversation_id: pick<string>("conversation_id", x?.conversationId),
    spec: pick<Record<string, unknown>>("spec", x?.spec),
    created_at: String(row.created_at),
    finished_at: (row.finished_at as string | null | undefined) ?? null,
    updated_at: (row.updated_at as string | null | undefined) ?? null,
  };
}

// ---------------------------------------------------------------------------
// The SDK worker — unchanged in what it runs (WebSearch/WebFetch only, capped),
// changed in what it reports: cost_usd from the SDK result, failed → loud.
// ---------------------------------------------------------------------------

type WorkerFn = (
  c: SupabaseClient,
  jobId: string,
  unit: string,
  name: string,
  title: string,
  task: string,
  runner: WorkerRunner | SkillRunner,
  client: string | undefined,
  emit?: JobEmit,
) => Promise<void>;

const runWorker: WorkerFn = async (c, jobId, unit, name, title, task, runner, client, emit) => {
  await patchJob(c, jobId, { status: "running" });
  emit?.(frameFor(jobId, "running", title, overlay.get(jobId)));

  // STEP 6 OF THE D6-10 CHAIN (audit 6, X2), AND THE WORST STEP OF IT: this
  // brief goes to an UNATTENDED worker, running with pre-approved tools, outside
  // any conversation, with no confirm card anywhere in the loop. Whatever
  // searchMemory returns here is read by a model nobody is watching.
  //
  // searchMemory now withholds every row it cannot prove came out of a clean
  // conversation. The withheld count is stated in the brief for the same reason
  // it is stated in her briefing: a worker told "no stored memory on this topic"
  // will confidently proceed, while a worker told the recall was TRIMMED will
  // hold labelled space, which is what the next line already asks of it.
  const { hits: recall, withheld } = await searchMemory(client ? `${client} ${task}` : task, 5);
  const held = withheldRecallLine(withheld);
  const memoryLines =
    (recall.length
      ? "Relevant memory:\n" + recall.map((h) => `- [${h.kind}] ${h.content}`).join("\n")
      : "No stored memory on this topic — do not invent client facts; hold labeled space for anything unknown.") +
    (held ? `\n${held}` : "");

  // VERIFIED 2026-07-16 (SDK 0.3.211 docs): `tools` = availability,
  // `allowedTools` = auto-approval; both are needed for an unattended worker.
  // persistSession:false skips transcript retention.
  //
  // FIXED 2026-09-02 — and this is why every worker had ALWAYS failed in
  // production while passing locally. permissionMode was "bypassPermissions",
  // which the SDK implements with --dangerously-skip-permissions, and that flag
  // REFUSES to run as root. Railway's NIXPACKS container IS root, so the Claude
  // Code process exited 1 every time ("worker crashed"), while the identical
  // code on a Windows dev box worked. Not one deliverable in the jobs table had
  // ever been produced by the deployed brain.
  // "dontAsk" is correct here and strictly SAFER: never prompt, DENY anything
  // not pre-approved. Our two tools are pre-approved via `allowedTools`, so
  // nothing legitimate is lost and an unexpected tool is refused rather than
  // waved through. Overridable with EVE_WORKER_PERMISSION_MODE.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), runner.cost.minutes * 60_000);
  let out = "";
  let costUsd: number | undefined;
  try {
    const q = query({
      prompt:
        `Fleet job for Churlish Media (worker: ${name}).\n` +
        `Task: ${task}\n` +
        (client ? `Client: ${client}\n` : "") +
        `${memoryLines}\n\n` +
        "Produce the COMPLETE deliverable as clean markdown. Rules: no placeholders — if a fact is " +
        "unknown, flag it inline as [NEEDS: …]; numbers over adjectives; every recommendation carries " +
        "its evidence or assumption; end with 'The One Thing to Do First' — one sentence, one action, " +
        "one deadline. Output ONLY the deliverable document.",
      options: {
        model: MODEL,
        systemPrompt: runner.doctrine,
        tools: [...WORKER_TOOLS],
        allowedTools: [...WORKER_TOOLS],
        permissionMode: WORKER_PERMISSION_MODE,
        persistSession: false,
        maxTurns: runner.cost.maxTurns,
        maxBudgetUsd: runner.cost.maxBudgetUsd,
        abortController: ac,
      },
    });
    for await (const m of q) {
      if (m.type === "result") {
        const spent = (m as { total_cost_usd?: unknown }).total_cost_usd;
        if (typeof spent === "number") costUsd = spent;
        if (m.subtype === "success") out = m.result;
        else {
          await failJob(jobId, unit, title, `worker ended: ${m.subtype}${ac.signal.aborted ? ` (hit the ${runner.cost.minutes}-minute cap)` : ""}`, emit, c);
          if (costUsd !== undefined) await patchJob(c, jobId, { status: "failed", costUsd });
          return;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  if (!out.trim()) {
    await failJob(jobId, unit, title, "worker returned an empty deliverable", emit, c);
    return;
  }

  // Local copy for convenience; the DB (attention item) carries the CONTENT —
  // hosted filesystems are ephemeral.
  let filePath: string | null = null;
  try {
    mkdirSync(deliverablesDir, { recursive: true });
    filePath = path.join(deliverablesDir, `${jobId}.md`);
    writeFileSync(filePath, out, "utf8");
  } catch (err) {
    console.warn("[dispatch] local deliverable write failed (DB copy still holds it):", err);
    filePath = null;
  }

  await patchJob(c, jobId, {
    status: "in_approvals",
    terminal: true,
    resultRef: filePath,
    result: { kind: "deliverable", chars: out.length, path: filePath, at: new Date().toISOString() },
    ...(costUsd !== undefined ? { costUsd } : {}),
  });
  emit?.(frameFor(jobId, "in_approvals", title, overlay.get(jobId)));

  // Approval inbox item carrying the deliverable itself (ops.ts approve → done).
  await c.from("attention_items").insert({
    kind: "approval",
    message: `Deliverable ready: ${task.slice(0, 100)}`,
    nudge_level: 1,
    ref: { job_id: jobId, jobId, agent: unit, unit, client: client ?? null, path: filePath, content: out },
  });

  // Done-ping — quiet hours hold it; the approval item still lands above.
  if (!isQuietHours(new Date()) && isPushReady()) {
    const token = await getLatestToken();
    if (token) {
      try {
        await sendPush(token, {
          title: "EVE · FLEET",
          body: `${name} finished: ${task.slice(0, 60)}. In your approvals.`,
          channelId: "nudge",
          data: { kind: "approval", attention_id: jobId, deeplink: "eve://ops" },
        });
      } catch (err) {
        console.error("[dispatch] done-ping failed", err);
      }
    }
  }
};

// Swappable so the harness can prove the worker path without an SDK call.
let workerRunner: WorkerFn = runWorker;

// Test seams (verify/dispatch-harness.ts). Not used by the server.
export const _test = {
  setSchema(s: DispatchSchema) {
    schema = s;
  },
  setWorker(fn: WorkerFn | null) {
    workerRunner = fn ?? runWorker;
  },
  overlay,
};
