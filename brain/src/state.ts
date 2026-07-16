import { db, isDbReady } from "./db.js";
import { listPending } from "./confirm.js";
import { getConnectorStatus } from "./connectors.js";
import { getLatestBrief } from "./brief.js";

// GET /state — the Today/Ops screens read live data THROUGH the brain
// (05 §4: the app never holds a Supabase key).

export async function buildState(): Promise<Record<string, unknown>> {
  const c = db();
  // Pending RED confirms + connector tiles work even with the spine offline.
  if (!c) return { online: false, pendingConfirms: listPending(), connectors: getConnectorStatus() };

  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [three, floor, attention, clients, jobs, routines] = await Promise.all([
    c.from("tasks").select("id, title, detail, priority, due_at").not("priority", "is", null).is("done_at", null).order("priority"),
    c.from("touches").select("id", { count: "exact", head: true }).in("channel", ["call", "meeting"]).gte("at", weekAgo),
    c.from("attention_items").select("id, kind, message, nudge_level, ref, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(20),
    c.from("clients").select("id, name, cadence_days, last_touch_at, status").eq("status", "active"),
    c.from("jobs").select("id, agent, title, status, created_at").in("status", ["queued", "running", "in_approvals"]).order("created_at", { ascending: false }).limit(10),
    c.from("routines").select("id, name, streak, last_done_on"),
  ]);

  // A Supabase outage must not render as a confident all-clear (review C19).
  if (three.error || attention.error || clients.error) {
    return { online: false, pendingConfirms: listPending(), connectors: getConnectorStatus() };
  }

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
    floor: { count: floor.count ?? 0, goal: 3 },
    attentionItems: attention.data ?? [],
    clients: clientPulse,
    jobs: jobs.data ?? [],
    routines: routines.data ?? [],
    pendingConfirms: listPending(),
    connectors: getConnectorStatus(),
  };
}

export { isDbReady };
