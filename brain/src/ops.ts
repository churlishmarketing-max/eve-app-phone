import { db } from "./db.js";

const TZ = process.env.EVE_TZ || "America/Chicago";

function todayInTz(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function yesterdayInTz(): string {
  return new Date(Date.now() - 86400_000).toLocaleDateString("en-CA", { timeZone: TZ });
}

// ---- Routines (Phase 4 slice, 00 DoD: streak increments ONLY same-day) ----

export async function tickRoutine(id: string): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const { data: r, error } = await c.from("routines").select("id, name, streak, last_done_on").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "no such routine" };

  const today = todayInTz();
  if (r.last_done_on === today) {
    return { ok: true, name: r.name, streak: r.streak, alreadyDone: true };
  }
  // No back-dating, by design: a tick always lands on TODAY. Streak continues
  // only if yesterday was done; otherwise it restarts at 1.
  const streak = r.last_done_on === yesterdayInTz() ? r.streak + 1 : 1;
  const { error: upErr } = await c.from("routines").update({ streak, last_done_on: today }).eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };

  // Ticking resolves today's routine_risk item, if any.
  await c
    .from("attention_items")
    .update({ resolved_at: new Date().toISOString() })
    .eq("kind", "routine_risk")
    .is("resolved_at", null)
    .contains("ref", { routine_id: id });

  return { ok: true, name: r.name, streak, alreadyDone: false };
}

// ---- Attention actions (05 §4): approve / hold / dismiss through the brain ----

export type AttentionAction = "approve" | "hold" | "dismiss";

export async function actOnAttention(id: string, action: AttentionAction): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const { data: item, error } = await c
    .from("attention_items")
    .select("id, kind, message, ref, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!item) return { ok: false, error: "no such attention item" };
  if (item.resolved_at) return { ok: false, error: "already resolved" };

  const now = new Date().toISOString();
  const ref = (item.ref ?? {}) as Record<string, unknown>;

  if (action === "dismiss") {
    await c.from("attention_items").update({ resolved_at: now, ref: { ...ref, outcome: "dismissed" } }).eq("id", id);
    return { ok: true, outcome: "dismissed" };
  }

  if (action === "hold") {
    // Snooze 24h: due_at marks when it may resurface; nudge level unchanged
    // (holding is a decision, not a slip — no escalation for it).
    const until = new Date(Date.now() + 24 * 3600_000).toISOString();
    await c.from("attention_items").update({ due_at: until, ref: { ...ref, outcome: "held", held_at: now } }).eq("id", id);
    return { ok: true, outcome: "held", until };
  }

  // approve
  await c.from("attention_items").update({ resolved_at: now, ref: { ...ref, outcome: "approved" } }).eq("id", id);

  // A silent_client approval turns the drafted update into a Today task so
  // the send actually happens (sending stays RED — via Gmail confirm once
  // connected, or King sends it himself from the draft).
  if (item.kind === "silent_client" && typeof ref.draft === "string" && ref.draft) {
    await c.from("tasks").insert({
      title: `Send ${ref.client ?? "client"} the touch-base update`,
      detail: ref.draft,
      client_id: (ref.client_id as string) ?? null,
    });
    return { ok: true, outcome: "approved", taskCreated: true };
  }
  // A fleet-job approval marks the job done.
  if (item.kind === "approval" && ref.job_id) {
    await c.from("jobs").update({ status: "done" }).eq("id", ref.job_id);
    return { ok: true, outcome: "approved", jobDone: true };
  }
  return { ok: true, outcome: "approved" };
}
