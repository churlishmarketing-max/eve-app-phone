// THE /state POLL — main process, one loop, one cache.
//
// 30s interval (handoff §7.1: "Poll 30s"; the phone uses 60s). Also fires
// immediately on deck focus and on an explicit eve:state:refresh from the
// renderer, so the screen King just looked at is never stale.
//
// Guarantees:
//   - never overlaps: an in-flight guard drops a tick rather than stacking
//     requests on a slow brain;
//   - never throws: api.getState() already returns {online:false} on failure,
//     and that degraded state is cached like any other;
//   - always pushes: every completed tick broadcasts eve:state:update to all
//     windows, online or not, so the title-bar dot can flip LINK -> DOWN.
//
// Diffing feeds the toast engine: a pendingConfirm id not seen before is a
// red_confirm toast; an attentionItem with kind==="tripwire" that is new is a
// tripwire toast. toasts.ts applies the focus/quiet/dedupe policy on top.
//
// Owning stream: S1.

import { getState } from "./api.js";
import { isQuietHours } from "./quiet.js";
import { notify } from "./toasts.js";
import { setTrayState, trayState } from "./tray.js";
import { broadcast } from "./windows.js";
import { IPC, type EveState, type StateUpdate } from "../src/shared/contract.js";

const INTERVAL_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;
let cached: StateUpdate = { state: { online: false }, fetchedAt: new Date(0).toISOString() };

// Ids we have already diffed. Separate from the toast dedupe set: this one
// answers "is this new to the poll", that one answers "did we already ping".
const seenConfirms = new Set<string>();
const seenTripwires = new Set<string>();

function diff(state: EveState): void {
  for (const c of state.pendingConfirms ?? []) {
    if (!c.id || seenConfirms.has(c.id)) continue;
    seenConfirms.add(c.id);
    notify("red_confirm", {
      id: c.id,
      title: "EVE — waiting on your thumb",
      body: c.summary || `${c.kind} needs your approve.`,
    });
  }
  for (const a of state.attentionItems ?? []) {
    if (a.kind !== "tripwire") continue;
    if (!a.id || seenTripwires.has(a.id)) continue;
    seenTripwires.add(a.id);
    notify("tripwire", { id: a.id, title: "EVE — tripwire", body: a.message });
  }
}

// --- tray drive (S4) --------------------------------------------------------
//
// The icon's RESTING state is a function of the state we just pushed: things
// waiting on his thumb outrank quiet hours, quiet hours outrank idle. "thinking"
// is not a resting state — main.ts sets it from the /chat `state` frames and
// clears it on done/error, so a tick that lands mid-turn must not stomp it.
//
// Alert counts pendingConfirms plus NEW-style tripwires (attentionItems whose
// kind is "tripwire"); those are exactly the two things §7.3 lets toast.

function attentionCount(state: EveState): number {
  const confirms = (state.pendingConfirms ?? []).length;
  const tripwires = (state.attentionItems ?? []).filter((a) => a.kind === "tripwire").length;
  return confirms + tripwires;
}

function driveTray(state: EveState): void {
  if (trayState() === "thinking") return; // a live turn owns the icon
  if (!state.online) {
    // A brain we cannot reach is not a quiet brain and not an empty queue.
    setTrayState(isQuietHours() ? "quiet" : "idle");
    return;
  }
  const n = attentionCount(state);
  if (n > 0) setTrayState("alert", { count: n });
  else if (isQuietHours()) setTrayState("quiet");
  else setTrayState("idle");
}

/**
 * One tick. Safe to call from anywhere; overlapping calls return the current
 * cache rather than firing a second request.
 */
export async function pollOnce(): Promise<StateUpdate> {
  if (inFlight) return cached;
  inFlight = true;
  try {
    const state = await getState();
    cached = { state, fetchedAt: new Date().toISOString() };
    // Only diff a state that actually came back. A degraded {online:false}
    // carries no confirms, and treating "we could not reach her" as "the queue
    // emptied" would silently lose a red card.
    if (state.online) diff(state);
    broadcast(IPC.stateUpdate, cached);
    driveTray(state);
    return cached;
  } finally {
    inFlight = false;
  }
}

export function startPoll(): void {
  if (timer) return;
  void pollOnce();
  timer = setInterval(() => void pollOnce(), INTERVAL_MS);
  // Do not hold the event loop open on quit.
  timer.unref?.();
}

export function stopPoll(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** The last state we actually got, plus when. Never null, never throws. */
export function lastState(): StateUpdate {
  return cached;
}

/** Test seam only. */
export function resetPoll(): void {
  seenConfirms.clear();
  seenTripwires.clear();
  cached = { state: { online: false }, fetchedAt: new Date(0).toISOString() };
}
