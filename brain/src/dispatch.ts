import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db } from "./db.js";
import { searchMemory } from "./memory.js";
import { isQuietHours } from "./schedule.js";
import { sendPush, getLatestToken, isPushReady } from "./push.js";

const MODEL = process.env.EVE_MODEL || "claude-sonnet-5";
const here = path.dirname(fileURLToPath(import.meta.url));
const deliverablesDir = path.join(here, "..", "data", "deliverables");

// Fleet dispatch (02 §3): POST /dispatch {agent?, task, client?} → jobs row →
// an autonomous worker runs the task → deliverable lands on disk with the
// path in jobs.result_ref → approval attention item → done-ping (nudge
// channel, quiet-hours aware). Workers are 🟢 GREEN: they produce documents;
// they never send anything external (no send tools are exposed to them).

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
  // for ephemeral fleet jobs. Hard caps: 16 turns, $1.50, 10 minutes.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 10 * 60_000);
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
        systemPrompt:
          "You are a Churlish Media fleet worker producing an internal deliverable for Brandon King. " +
          "Direct, concrete, numbers-first. The document must be usable Monday morning without edits.",
        tools: ["WebSearch", "WebFetch"],
        allowedTools: ["WebSearch", "WebFetch"],
        permissionMode: "bypassPermissions",
        persistSession: false,
        maxTurns: 16,
        maxBudgetUsd: 1.5,
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
