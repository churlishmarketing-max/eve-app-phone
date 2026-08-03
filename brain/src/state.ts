import { db, isDbReady } from "./db.js";
import { floorView } from "./floor.js";
import { listPending } from "./confirm.js";
import { getConnectorStatus } from "./connectors.js";
import { getLatestBrief } from "./brief.js";
import { streakFrom } from "./vitals.js";
import { localDay, addLocalDays } from "./day.js";

// GET /state — the Today/Ops screens read live data THROUGH the brain
// (05 §4: the app never holds a Supabase key).

export async function buildState(): Promise<Record<string, unknown>> {
  const c = db();
  // Pending RED confirms + connector tiles work even with the spine offline.
  if (!c) return { online: false, pendingConfirms: listPending(), connectors: getConnectorStatus() };

  const [three, floor, attention, clients, jobs, routines, routineDays] = await Promise.all([
    c.from("tasks").select("id, title, detail, priority, due_at").not("priority", "is", null).is("done_at", null).order("priority"),
    // The floor now comes from floor.ts — same number as the OS board and her
    // context pack, on the same week window. (Was: a rolling-7-day touches
    // count that could never match the OS's calendar week.)
    floorView(),
    c.from("attention_items").select("id, kind, message, nudge_level, ref, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(20),
    c.from("clients").select("id, name, cadence_days, last_touch_at, status").eq("status", "active"),
    c.from("jobs").select("id, agent, title, status, created_at").in("status", ["queued", "running", "in_approvals"]).order("created_at", { ascending: false }).limit(10),
    c.from("routines").select("id, name, streak, last_done_on, slot, active").eq("active", true),
    c.from("routine_days").select("routine_id, on_date").gte("on_date", addLocalDays(localDay(), -400)),
  ]);

  // A Supabase outage must not render as a confident all-clear (review C19).
  if (three.error || attention.error || clients.error) {
    return { online: false, pendingConfirms: listPending(), connectors: getConnectorStatus() };
  }

  // The routines the app renders carry the COMPUTED streak, not the stored int.
  // routines.streak is a write-through cache that nothing decays, so a habit
  // last ticked in June still reported its old number. Overwrite the field in
  // place rather than adding a parallel one — EveApp.tsx reads r.streak
  // directly, so a new field would ship inert.
  // routine_days / routines errors stay OUT of the outage gate below: a missing
  // BODY migration must not black out Today, Ops and Wire. If the per-day
  // ledger is unreadable we fall back to the cached int rather than showing a
  // confident 0 for every habit.
  const today = localDay();
  const tickDays = new Map<string, Set<string>>();
  for (const r of routineDays.data ?? []) {
    const id = r.routine_id as string;
    if (!tickDays.has(id)) tickDays.set(id, new Set<string>());
    tickDays.get(id)!.add(r.on_date as string);
  }
  const routineList = (routines.data ?? []).map((r) => ({
    ...r,
    streak: routineDays.error ? r.streak : streakFrom(tickDays.get(r.id as string) ?? new Set<string>(), today),
  }));

  const clientPulse = (clients.data ?? []).map((cl) => ({
    ...cl,
    days_quiet: cl.last_touch_at
      ? Math.floor((Date.now() - new Date(cl.last_touch_at).getTime()) / 86400_000)
      : null,
  }));

  return {
    online: true,
    latestBrief: getLatestBrief(),
    todaysThree: three.data ?? [],
    floor,
    attentionItems: attention.data ?? [],
    clients: clientPulse,
    jobs: jobs.data ?? [],
    routines: routineList,
    pendingConfirms: listPending(),
    connectors: getConnectorStatus(),
  };
}

export { isDbReady };
