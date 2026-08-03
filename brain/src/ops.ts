import { db } from "./db.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localDay, addLocalDays, lastNDays } from "./day.js";
import { streakFrom } from "./vitals.js";

// ---- Routines / habits — the per-day ledger is routine_days (003_body.sql) ----
//
// The streak is DERIVED from routine_days, never incremented in place. The old
// path read routines.streak and added one, which meant a missed day could only
// be discovered on the next tick, back-dating was impossible, and a double tap
// had to be caught by a read-then-branch. Now the (routine_id, on_date) primary
// key makes a tick idempotent by construction and the number is recomputed from
// history every time. routines.streak / last_done_on stay as a write-through
// cache so anything still reading those columns keeps working.

// Recompute from the ledger and refresh the cache. 400 days is well past any
// streak worth showing and keeps the read bounded.
async function recomputeStreak(c: SupabaseClient, id: string): Promise<number> {
  const since = addLocalDays(localDay(), -400);
  const { data } = await c.from("routine_days").select("on_date").eq("routine_id", id).gte("on_date", since);
  const set = new Set((data ?? []).map((r) => r.on_date as string));
  const streak = streakFrom(set, localDay());
  const last = [...set].sort().pop() ?? null;
  await c.from("routines").update({ streak, last_done_on: last }).eq("id", id);
  return streak;
}

// Back-dating is allowed, bounded to the last 7 local days, and never forward:
// "I forgot to tick Tuesday" is real, a month-old memory is a guess.
function windowError(day: string, today: string): string | null {
  if (lastNDays(7, today).includes(day)) return null;
  return `${day} is outside the editable window (last 7 days through ${today})`;
}

export async function tickRoutine(id: string, onDate?: string): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const today = localDay();
  const day = onDate ?? today;
  const bad = windowError(day, today);
  if (bad) return { ok: false, error: bad };

  const { data: r, error } = await c.from("routines").select("id, name").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "no such routine" };

  // Idempotent by the (routine_id, on_date) primary key — not by a read-branch.
  const { error: insErr, count } = await c
    .from("routine_days")
    .upsert({ routine_id: id, on_date: day }, { onConflict: "routine_id,on_date", ignoreDuplicates: true, count: "exact" });
  if (insErr) return { ok: false, error: insErr.message };

  const streak = await recomputeStreak(c, id);

  // Resolve UNCONDITIONALLY. The old early-return on "already done today" left a
  // stale routine_risk item open whenever the second tap of the day was the one
  // that followed the 20:00 job.
  await c
    .from("attention_items")
    .update({ resolved_at: new Date().toISOString() })
    .eq("kind", "routine_risk")
    .is("resolved_at", null)
    .contains("ref", { routine_id: id });

  return { ok: true, name: r.name, on_date: day, streak, alreadyDone: count === 0 };
}

// The inverse a toggle needs: delete one (routine_id, on_date) row. Same 7-day
// window, same recompute. Deleting a day is amnesty for a mis-tap, not a way to
// rewrite a month.
export async function untickRoutine(id: string, onDate?: string): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const today = localDay();
  const day = onDate ?? today;
  const bad = windowError(day, today);
  if (bad) return { ok: false, error: bad };

  const { data: r, error } = await c.from("routines").select("id, name").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "no such routine" };

  const { error: delErr, count } = await c
    .from("routine_days")
    .delete({ count: "exact" })
    .eq("routine_id", id)
    .eq("on_date", day);
  if (delErr) return { ok: false, error: delErr.message };

  const streak = await recomputeStreak(c, id);
  return { ok: true, name: r.name, on_date: day, streak, removed: (count ?? 0) > 0 };
}

export async function createRoutine(
  name: string,
  cadence = "daily",
  slot: "habit" | "checkin" = "habit",
): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "name is required" };

  const { data: top } = await c
    .from("routines")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (typeof top?.sort_order === "number" ? top.sort_order : 0) + 10;

  const { data, error } = await c
    .from("routines")
    .insert({ name: clean, cadence, slot, sort_order })
    .select("id, name, cadence, slot, sort_order")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, routine: data };
}

// active=false, NEVER a delete: routine_days cascades on delete (003_body.sql),
// so dropping the row would destroy the history the streak is derived from.
export async function archiveRoutine(id: string): Promise<Record<string, unknown>> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline" };
  const { data: r, error } = await c.from("routines").select("id, name").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!r) return { ok: false, error: "no such routine" };
  const { error: upErr } = await c.from("routines").update({ active: false }).eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, name: r.name, archived: true };
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
