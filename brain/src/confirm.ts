import { createHash, randomUUID } from "node:crypto";

// RED-tier enforcement (02 §6): tools that send anything external NEVER
// execute directly. They register a pending confirm here; the app renders a
// confirm card; only POST /confirm with the matching payload hash executes.
// There is deliberately NO flag that disables this.
//
// In-memory by design: a brain restart clears pending sends, and nothing
// external can fire without a fresh, explicit approval round-trip.

export interface PendingConfirm {
  id: string;
  kind: string; // e.g. "send_email" | "send_sms" | "send_slack"
  summary: string; // one human line: what will be sent, to whom
  payload: Record<string, unknown>; // the EXACT payload that will be sent
  hash: string; // sha256 of canonical payload — approval must echo it
  createdAt: string;
  expiresAt: string;
}

// Some sends execute on the PHONE, not the brain (SMS leaves from King's SIM,
// 02 §6 / 05 §7). Those confirms carry a clientAction instead of an execute:
// approval hands the action back to the app, which fires it natively.
export interface ClientAction {
  type: string; // e.g. "send_sms"
  payload: Record<string, unknown>;
}

interface StoredConfirm extends PendingConfirm {
  execute: (() => Promise<string>) | null; // runs the real send on approval; null → the app executes
  clientAction?: ClientAction;
}

const TTL_MS = 30 * 60_000; // 30 min — stale sends must be re-requested
const pending = new Map<string, StoredConfirm>();

function sweep(): void {
  const now = Date.now();
  for (const [id, c] of pending) {
    if (Date.parse(c.expiresAt) < now) pending.delete(id);
  }
}

export function payloadHash(payload: Record<string, unknown>): string {
  // Canonical: stable key order so the same payload always hashes the same.
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function requestConfirm(
  kind: string,
  summary: string,
  payload: Record<string, unknown>,
  execute: (() => Promise<string>) | null,
  clientAction?: ClientAction,
): PendingConfirm {
  sweep();
  const id = randomUUID();
  const now = Date.now();
  const entry: StoredConfirm = {
    id,
    kind,
    summary,
    payload,
    hash: payloadHash(payload),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
    execute,
    ...(clientAction ? { clientAction } : {}),
  };
  pending.set(id, entry);
  const { execute: _e, clientAction: _c, ...publicEntry } = entry;
  return publicEntry;
}

export type ConfirmResult =
  | { ok: true; executed: boolean; detail: string; clientAction?: ClientAction }
  | { ok: false; error: string };

export async function resolveConfirm(
  id: string,
  hash: string,
  approve: boolean,
): Promise<ConfirmResult> {
  sweep();
  const entry = pending.get(id);
  if (!entry) return { ok: false, error: "no such pending confirm (expired or already resolved)" };
  if (entry.hash !== hash) {
    // Wrong hash = the app is approving a different payload than what would
    // send. Refuse and keep the entry so the app can re-fetch and retry.
    return { ok: false, error: "payload hash mismatch — refresh and re-approve" };
  }
  pending.delete(id); // single-use either way
  if (!approve) return { ok: true, executed: false, detail: "cancelled" };
  if (!entry.execute) {
    // Client-executed send: approval hands the action to the app; the PHONE
    // fires it. executed:false is honest — nothing has left the brain.
    return {
      ok: true,
      executed: false,
      detail: "approved — executes on the phone",
      ...(entry.clientAction ? { clientAction: entry.clientAction } : {}),
    };
  }
  try {
    const detail = await entry.execute();
    return { ok: true, executed: true, detail };
  } catch (err) {
    return { ok: false, error: `send failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function listPending(): PendingConfirm[] {
  sweep();
  return [...pending.values()].map(({ execute: _e, clientAction: _c, ...rest }) => rest);
}
