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

/**
 * CARD-1, CRITICAL. The old line was:
 *
 *   JSON.stringify(payload, Object.keys(payload).sort())
 *
 * `JSON.stringify`'s replacer ARRAY filters keys at EVERY depth, not just the
 * top one. A payload whose top-level key set does not contain `fromRel` /
 * `toRel` / `i` / `size` therefore canonicalises its `moves` array to
 * `[{},{},…]`: the hash covered the op, the intent and the count, and not one
 * single path. Two batches that move completely different files hashed
 * identically, which means the card could show one thing and the approve could
 * execute another.
 *
 * This is a recursive canonicaliser: every value at every depth is in the
 * string. It must stay byte-identical to the desktop's
 * electron/desk/index.ts canonical(), or every filing confirm fails closed.
 */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

/**
 * 128 bits, not 64 (G-C2). For the three shipped FLAT payloads
 * ({to,subject,body}, {phoneNumber,message}, {client_name}) the canonical
 * string is byte-identical to what the old line produced — only the truncation
 * widens. Clients echo back whatever hash they were handed and the store is
 * in-memory, so a deploy restart strands nothing.
 */
export function payloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonical(payload)).digest("hex").slice(0, 32);
}

export function requestConfirm(
  kind: string,
  summary: string,
  payload: Record<string, unknown>,
  execute: (() => Promise<string>) | null,
  clientAction?: ClientAction,
  // CARD-4: a filing plan rots faster than a text. Per-kind TTL, defaulted so
  // every existing caller keeps its 30 minutes exactly.
  ttlMs: number = TTL_MS,
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
    expiresAt: new Date(now + ttlMs).toISOString(),
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
    // Client-executed: approval hands the action back to the surface that can
    // actually perform it. executed:false is honest — nothing has left the
    // brain. The detail names the RIGHT surface, because "executes on the
    // phone" printed under a file batch is exactly the kind of confident wrong
    // sentence this whole machine exists to prevent.
    return {
      ok: true,
      executed: false,
      detail:
        entry.clientAction?.type === "apply_file_batch"
          ? "approved — running on your desk"
          : "approved — executes on the phone",
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

/**
 * CARD-5. `/state` returns this to EVERY surface on a 30 s poll, over whatever
 * network the phone happens to be on. The full from->to list of a file batch is
 * a map of his disk, and it does not need to be there: the only surface that
 * can execute one fetches it by id (GET /confirm/:id). The HEAD of the payload
 * stays, so the phone can still render a card and CANCEL it. (G-C11)
 */
export function listPending(): PendingConfirm[] {
  sweep();
  return [...pending.values()].map(({ execute: _e, clientAction: _c, ...rest }) => {
    if (rest.kind !== "file_batch") return rest;
    const { moves: _m, ...head } = rest.payload as Record<string, unknown>;
    return { ...rest, payload: { ...head, moves: "withheld — fetch by id at the desk" } };
  });
}

/** The full payload, by id. Read-only, authenticated, mints nothing. (§3.6) */
export function getPending(id: string): PendingConfirm | null {
  sweep();
  const entry = pending.get(id);
  if (!entry) return null;
  const { execute: _e, clientAction: _c, ...rest } = entry;
  return rest;
}
