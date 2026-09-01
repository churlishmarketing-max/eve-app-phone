// THE TOAST POLICY ENGINE.
//
// Handoff §7.3, verbatim: "Windows toasts fire ONLY for new RED confirms and
// tripwires, only when unfocused, deduped by item id, suppressed entirely in
// quiet hours."
//
// So notify() fires only when ALL FOUR hold:
//   (a) kind is "red_confirm" or "tripwire"
//   (b) the deck window is not focused
//   (c) it is not quiet hours (21:30-06:30 America/Chicago)
//   (d) this item id has not been notified before (Set dedupe, process-lifetime)
//
// Anything else queues into the deck's OPS pane and waits. The desktop never
// out-pings the brain.
//
// Owning stream: S1.

import { Notification } from "electron";
import { windowsHidden } from "./config.js";
import { isQuietHours } from "./quiet.js";
import { deckFocused, focusDeck } from "./windows.js";

/** Decisions are logged, never the payload body — a toast can carry client copy. */
function log(kind: ToastKind, item: ToastItem, outcome: string): void {
  console.log(`[toast] ${kind} ${item.id} -> ${outcome}`);
}

export type ToastKind = "red_confirm" | "tripwire" | "other";

export interface ToastItem {
  id: string;
  title?: string;
  body?: string;
}

const TOASTABLE = new Set<ToastKind>(["red_confirm", "tripwire"]);

// Dedupe by item id for the life of the process. A confirm that King already
// saw a toast for must not re-toast on every 30s poll.
const notified = new Set<string>();

export interface ToastDecision {
  fired: boolean;
  /** Why it did not fire — for the smoke log and for S4's debugging. */
  reason?: "kind" | "focused" | "quiet" | "duplicate" | "unsupported" | "headless";
}

export function notify(kind: ToastKind, item: ToastItem, at: Date = new Date()): ToastDecision {
  if (!TOASTABLE.has(kind)) return { fired: false, reason: "kind" };
  // Test runs must not ping King. The mock state ships a pendingConfirm, so
  // without this guard every `npm run smoke` / `npm run shots` would pop a real
  // Windows notification on his desktop — the same intrusion the hidden-window
  // rule exists to prevent. NOT one of the four policy gates; a harness gate.
  if (windowsHidden()) {
    log(kind, item, "headless");
    return { fired: false, reason: "headless" };
  }
  if (deckFocused()) return { fired: false, reason: "focused" };
  if (isQuietHours(at)) return { fired: false, reason: "quiet" };
  if (notified.has(item.id)) return { fired: false, reason: "duplicate" };

  // Mark BEFORE the try: a notification the OS refused still must not retry on
  // every poll tick.
  notified.add(item.id);

  if (!Notification.isSupported()) return { fired: false, reason: "unsupported" };

  const n = new Notification({
    title: item.title ?? (kind === "red_confirm" ? "EVE — waiting on your thumb" : "EVE — tripwire"),
    body: item.body ?? "",
    silent: false,
  });
  // Click focuses the deck on the item (handoff §7.3: "toast clicks focus the
  // deck on the item"). Pane-focus routing is S2/S3's; the focus is ours.
  n.on("click", () => focusDeck());
  n.show();
  log(kind, item, "fired");
  return { fired: true };
}

/** True if this id has already been toasted. Used by poll.ts diffing. */
export function alreadyNotified(id: string): boolean {
  return notified.has(id);
}

/** Test seam only. */
export function resetNotified(): void {
  notified.clear();
}

// ---------------------------------------------------------------------------
// POLICY PROBE (S4) — `EVE_TOAST_PROBE=1` prints the kind gate's decisions and
// exits nothing. Env-gated and inert otherwise, same shape as the harness
// blocks in main.ts.
//
// Why it exists: S4's spec asks for proof that the engine treats TRIPWIRES the
// same as RED CONFIRMS. Run it with EVE_SMOKE=1 so windowsHidden() is true —
// then a decision of "headless" means the item PASSED the kind gate (kind is
// checked first, at line 49) and a decision of "kind" means it was refused.
// The focus / quiet / dedupe gates cannot be exercised this way, because
// getting past "headless" means popping a real Windows notification on King's
// desktop, which is the exact intrusion the hidden-window rule forbids.
// ---------------------------------------------------------------------------

if (process.env.EVE_TOAST_PROBE === "1") {
  const cases: ToastKind[] = ["red_confirm", "tripwire", "other"];
  for (const kind of cases) {
    const d = notify(kind, { id: `probe-${kind}`, title: "probe", body: "probe" });
    const passed = d.reason !== "kind";
    console.log(
      `TOASTPROBE: ${kind} -> fired=${d.fired} reason=${d.reason ?? "-"} passedKindGate=${passed}`,
    );
  }
  console.log(`TOASTPROBE: windowsHidden=${windowsHidden()} quiet=${isQuietHours()}`);
}
