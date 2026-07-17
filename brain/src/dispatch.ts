import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db } from "./db.js";
import { searchMemory } from "./memory.js";
import { isQuietHours } from "./schedule.js";
import { sendPush, getLatestToken, isPushReady } from "./push.js";

// Fleet workers run their OWN model — kept on Sonnet 5 even when the chat loop
// (EVE_MODEL) drops to Haiku for cost. The deep reasoning (research synthesis,
// JSA tribunals, adversarial teardowns) is where the horsepower earns its price;
// the frequent, cheap chat path doesn't need it. Split set by King 2026-07-17.
const MODEL = process.env.EVE_FLEET_MODEL || "claude-sonnet-5";
const here = path.dirname(fileURLToPath(import.meta.url));
const deliverablesDir = path.join(here, "..", "data", "deliverables");

// Fleet dispatch (02 §3): POST /dispatch {agent?, task, client?} → jobs row →
// an autonomous worker runs the task → deliverable lands on disk with the
// path in jobs.result_ref → approval attention item → done-ping (nudge
// channel, quiet-hours aware). Workers are 🟢 GREEN: they produce documents;
// they never send anything external (no send tools are exposed to them).
//
// Named workers carry the Churlish reasoning doctrine (fable-mind v1.0) as
// distinct lenses. Same law for all of them: numbers over adjectives, no
// fabricated proof, ship with receipts.

interface FleetPersona {
  system: string;
  maxTurns: number;
  maxBudgetUsd: number;
  minutes: number;
}

const BASE_LAW =
  "Law for every deliverable: numbers beat adjectives — a finding without a number, dollar figure, or " +
  "date is an opinion, cut it or quantify it. Never fabricate proof: no results = say so, hold labeled " +
  "space for real proof, name the fastest path to earning it. Denominators must match claims. " +
  "Convert every stated timeline into the REALIZED timeline (price in the lag). Direct, concrete — " +
  "usable Monday morning without edits.";

const PERSONAS: Record<string, FleetPersona> = {
  eve: {
    system:
      "You are a Churlish Media fleet worker producing an internal deliverable for Brandon King. " + BASE_LAW,
    maxTurns: 16,
    maxBudgetUsd: 1.5,
    minutes: 10,
  },
  research: {
    system:
      "You are Churlish Media's deep-research worker, reporting to Brandon King. Sweep the topic from " +
      "multiple angles with live web search — by entity, by market, by competitor, by time — then read the " +
      "strongest sources, not just their headlines. Every claim carries its source and date inline; label " +
      "each key finding CONFIRMED (multiple independent sources) or REPORTED (single source). Prefer primary " +
      "sources over aggregators. Where sources conflict, say so and weigh them. End with a SOURCES list. " +
      BASE_LAW,
    maxTurns: 32,
    maxBudgetUsd: 3,
    minutes: 20,
  },
  "justice-league": {
    system:
      "You are the Justice League — Churlish Media's portfolio and sequencing board, advising Brandon King. " +
      "Your job is WHAT to build or sell, in WHAT order, and what to park. Rank every option by dollars and " +
      "by capacity honesty (his real hours, not aspirational ones). The pipeline outranks the build: when a " +
      "build competes with sales conversations for hours, the conversations win. Price every new idea — " +
      "buyer + number in sixty seconds or it parks itself; parked ideas enter the calendar only by " +
      "displacing something named. Every recommendation carries a pre-committed fallback trigger: if X " +
      "hasn't happened by DATE, then Y. " + BASE_LAW,
    maxTurns: 16,
    maxBudgetUsd: 1.5,
    minutes: 10,
  },
  jsa: {
    system:
      "You are the JSA — Churlish Media's single-decision tribunal, ruling for Brandon King. Structure: " +
      "(1) THE QUESTION, stated as one decidable sentence; (2) THE CASE FOR — the strongest honest steelman, " +
      "with numbers; (3) THE CASE AGAINST — argued just as hard, not a strawman; (4) WHAT WOULD CHANGE THE " +
      "VERDICT — the facts that would flip it; (5) THE VERDICT — one call, plainly stated, with pre-committed " +
      "tripwires (if X hasn't happened by DATE, then Y). If the decision is really several decisions, split " +
      "them and rule on each. " + BASE_LAW,
    maxTurns: 16,
    maxBudgetUsd: 1.5,
    minutes: 10,
  },
  "suicide-squad": {
    system:
      "You are the Suicide Squad — Churlish Media's adversarial teardown unit, attacking Brandon King's own " +
      "plans and assets before an enemy does. Attack like a well-funded competitor: what would they clone, " +
      "undercut, or outspend? Hunt ABSENCES, not just flaws — what's missing entirely is where the money is, " +
      "especially the target's own stated rules it isn't following. Rank every finding by dollars left on " +
      "the table. Deliver the sting WITH the fix: if nothing stings, the analysis failed; if nothing's " +
      "actionable Monday morning, it also failed. " + BASE_LAW,
    maxTurns: 16,
    maxBudgetUsd: 1.5,
    minutes: 10,
  },
};

export interface DispatchResult {
  ok: boolean;
  jobId?: string;
  error?: string;
}

export async function runDispatch(task: string, agent = "eve", client?: string): Promise<DispatchResult> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline — jobs table unavailable" };
  if (!task?.trim()) return { ok: false, error: "task required" };

  const { data: job, error } = await c
    .from("jobs")
    .insert({ agent, title: task.slice(0, 140), status: "queued" })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Fire-and-forget: /dispatch returns immediately; the worker runs in the
  // background and reports through the jobs row + attention item + push.
  void runWorker(job.id, task, agent, client).catch(async (err) => {
    console.error("[dispatch] worker crashed", err);
    await c.from("jobs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", job.id);
  });

  return { ok: true, jobId: job.id };
}

async function runWorker(jobId: string, task: string, agent: string, client?: string): Promise<void> {
  const c = db();
  if (!c) return;
  await c.from("jobs").update({ status: "running" }).eq("id", jobId);

  // Ground the worker in what EVE already knows about the client/topic.
  const recall = await searchMemory(client ? `${client} ${task}` : task, 5);
  const memoryLines = recall.length
    ? "Relevant memory:\n" + recall.map((h) => `- [${h.kind}] ${h.content}`).join("\n")
    : "No stored memory on this topic — do not invent client facts; hold labeled space for anything unknown.";

  // ⚑VERIFIED 2026-07-16 (SDK 0.3.211 docs): `tools` = availability,
  // `allowedTools` = auto-approval; both are needed, plus bypassPermissions,
  // for an unattended worker. persistSession:false skips transcript retention
  // for ephemeral fleet jobs. Caps come from the persona — research runs
  // longer and spends more; everyone else holds 16 turns / $1.50 / 10 min.
  const persona = PERSONAS[agent] ?? PERSONAS.eve;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), persona.minutes * 60_000);
  let out = "";
  try {
    const q = query({
      prompt:
        `Fleet job for Churlish Media (worker: ${agent}).\n` +
        `Task: ${task}\n` +
        (client ? `Client: ${client}\n` : "") +
        `${memoryLines}\n\n` +
        "Produce the COMPLETE deliverable as clean markdown. Rules: no placeholders — if a fact is " +
        "unknown, flag it inline as [NEEDS: …]; numbers over adjectives; every recommendation carries " +
        "its evidence or assumption; end with 'The One Thing to Do First' — one sentence, one action, " +
        "one deadline. Output ONLY the deliverable document.",
      options: {
        model: MODEL,
        systemPrompt: persona.system,
        tools: ["WebSearch", "WebFetch"],
        allowedTools: ["WebSearch", "WebFetch"],
        permissionMode: "bypassPermissions",
        persistSession: false,
        maxTurns: persona.maxTurns,
        maxBudgetUsd: persona.maxBudgetUsd,
        abortController: ac,
      },
    });
    for await (const m of q) {
      if (m.type === "result") {
        if (m.subtype === "success") out = m.result;
        else {
          await c.from("jobs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", jobId);
          return;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  // Write a local copy for convenience, but the DB carries the CONTENT —
  // hosted filesystems are ephemeral, and a deliverable that evaporates on
  // redeploy is a deliverable he can't approve.
  let filePath: string | null = null;
  try {
    mkdirSync(deliverablesDir, { recursive: true });
    filePath = path.join(deliverablesDir, `${jobId}.md`);
    writeFileSync(filePath, out, "utf8");
  } catch (err) {
    console.warn("[dispatch] local deliverable write failed (DB copy still holds it):", err);
    filePath = null;
  }

  await c
    .from("jobs")
    .update({ status: "in_approvals", result_ref: filePath, finished_at: new Date().toISOString() })
    .eq("id", jobId);

  // Approval inbox item (Ops screen) carrying the deliverable itself.
  await c.from("attention_items").insert({
    kind: "approval",
    message: `Deliverable ready: ${task.slice(0, 100)}`,
    nudge_level: 1,
    ref: { job_id: jobId, agent, client: client ?? null, path: filePath, content: out },
  });

  // Done-ping — quiet hours hold it; the approval item still lands above.
  if (!isQuietHours(new Date()) && isPushReady()) {
    const token = await getLatestToken();
    if (token) {
      try {
        await sendPush(token, {
          title: "EVE · FLEET",
          body: `${agent} finished: ${task.slice(0, 60)}. In your approvals.`,
          channelId: "nudge",
          data: { kind: "approval", attention_id: jobId, deeplink: "eve://ops" },
        });
      } catch (err) {
        console.error("[dispatch] done-ping failed", err);
      }
    }
  }
}
