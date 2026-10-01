// Churlish OS connector — EVE's line to Rookie's tool surface and Pennyworth's
// drafting desk, via the OS's /api/eve endpoint (bearer EVE_OS_TOKEN on their
// side, CHURLISH_OS_TOKEN here; same value). One tool per request; the OS
// executes and answers in plain text. No token → degrade honestly.
//
// Tier law note: the endpoint itself refuses send_pending_email and
// draft_client_email+send_now without confirmed:true — only the RED confirm
// executor (connectors.ts) ever passes it. Defense in depth on both shores.

const OS_URL = (process.env.CHURLISH_OS_URL || "https://churlishos.app").replace(/\/+$/, "");

export function ready(): boolean {
  return !!process.env.CHURLISH_OS_TOKEN;
}

export function statusDetail(): string {
  return ready()
    ? `token set → ${OS_URL}/api/eve`
    : "needs CHURLISH_OS_TOKEN (same value as EVE_OS_TOKEN on the OS's Vercel env)";
}

export class OsNotConnectedError extends Error {
  constructor() {
    super("Churlish OS not connected");
  }
}

export function explainError(e: unknown): string {
  if (e instanceof OsNotConnectedError) {
    return "The OS line isn't wired up yet (CHURLISH_OS_TOKEN missing on the brain, or EVE_OS_TOKEN missing on the OS). Say exactly that — don't guess at board numbers or client facts.";
  }
  return `OS call failed: ${e instanceof Error ? e.message : String(e)}`;
}

// Pennyworth's proposal drafting runs a Claude call inside the OS (up to ~60s
// on Vercel) — the timeout must outlive it.
export async function osTool(
  tool: string,
  input: Record<string, unknown> = {},
  confirmed = false,
): Promise<string> {
  return (await osToolData(tool, input, confirmed)).result;
}

// One House 4c (4.6): the same call, with the OS's `data` beside the prose.
// The house tools answer `{ ok, result, data }` — `result` is the sentence she
// relays, `data` is the numbers a job computes on (quiet_clients' roster). osTool
// above is this minus `data`, so every existing caller is byte-identical. `data`
// is whatever object the OS sent, or null — the CALLER shape-checks it.
export async function osToolData(
  tool: string,
  input: Record<string, unknown> = {},
  confirmed = false,
): Promise<{ result: string; data: Record<string, unknown> | null }> {
  const token = process.env.CHURLISH_OS_TOKEN;
  if (!token) throw new OsNotConnectedError();
  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(), 75_000);
  try {
    const r = await fetch(`${OS_URL}/api/eve`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ tool, input, ...(confirmed ? { confirmed: true } : {}) }),
      signal: ac.signal,
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: string; data?: unknown; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error || `OS answered ${r.status}`);
    const data = j.data && typeof j.data === "object" && !Array.isArray(j.data) ? (j.data as Record<string, unknown>) : null;
    return { result: j.result ?? "", data };
  } finally {
    clearTimeout(deadline);
  }
}

// ---- the OS sweep, for the 07:00 brief (One House Step 4) ----
// GET /api/eve/sweep on the OS (bearer = this same token) answers
// { ok, ran_at: ISO | null, needs_you: number | null }: when the newest
// house.sweep / house.sweep_ran Ledger line was written, and how many open
// needs-you Ledger lines the OS holds. No token throws OsNotConnectedError
// like osTool; an unreachable OS throws its reason.
export interface OsSweep {
  ran_at: string | null;
  needs_you: number | null;
}

export async function osSweep(): Promise<OsSweep> {
  const token = process.env.CHURLISH_OS_TOKEN;
  if (!token) throw new OsNotConnectedError();
  const r = await fetch(`${OS_URL}/api/eve/sweep`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ran_at?: unknown; needs_you?: unknown; error?: string };
  if (!r.ok || !j.ok) throw new Error(j.error || `OS answered ${r.status}`);
  return {
    ran_at: typeof j.ran_at === "string" ? j.ran_at : null,
    needs_you: typeof j.needs_you === "number" && Number.isFinite(j.needs_you) ? j.needs_you : null,
  };
}

// ---- the OS event feed (One House Step 4c · 4.3 / 4.4) ----
// GET /api/eve/events?since=<cursor>&limit=<n> on the OS (bearer = this same
// token) answers
//   { ok: true, cursor: string, events: [{ id, at (ISO), kind, title,
//     detail: string | null, link: "/inbox" | "/ledger" | …, needs_you: boolean,
//     client_id: string | null }] }
// `since` omitted or empty → the OS answers the last 24 h. The cursor is OPAQUE:
// it is passed back verbatim and never parsed here. An event that does not match
// the shape is DROPPED (counted in `dropped`), never repaired — the cursor still
// moves past it, because the OS already has. Titles and details are third-party
// text (client names, email subjects) and are never logged by this module.
export interface OsEvent {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  link: string;
  needs_you: boolean;
  client_id: string | null;
}

export interface OsEventsPage {
  cursor: string;
  events: OsEvent[];
  dropped: number;
}

export const OS_EVENTS_MAX_LIMIT = 200;

function asOsEvent(v: unknown): OsEvent | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const str = (k: string) => typeof e[k] === "string" && (e[k] as string).length > 0;
  if (!str("id") || !str("at") || !str("kind") || typeof e.title !== "string" || !str("link")) return null;
  if (typeof e.needs_you !== "boolean") return null;
  if (e.detail !== null && e.detail !== undefined && typeof e.detail !== "string") return null;
  if (e.client_id !== null && e.client_id !== undefined && typeof e.client_id !== "string") return null;
  if (Number.isNaN(new Date(e.at as string).getTime())) return null;
  return {
    id: e.id as string,
    at: e.at as string,
    kind: e.kind as string,
    title: e.title as string,
    detail: typeof e.detail === "string" ? e.detail : null,
    link: e.link as string,
    needs_you: e.needs_you as boolean,
    client_id: typeof e.client_id === "string" ? e.client_id : null,
  };
}

export async function osEventsSince(cursor: string | null, limit = 50): Promise<OsEventsPage> {
  const token = process.env.CHURLISH_OS_TOKEN;
  if (!token) throw new OsNotConnectedError();
  const n = Math.min(OS_EVENTS_MAX_LIMIT, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 50)));
  const qs = new URLSearchParams();
  if (cursor) qs.set("since", cursor);
  qs.set("limit", String(n));
  const r = await fetch(`${OS_URL}/api/eve/events?${qs.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; cursor?: unknown; events?: unknown; error?: string };
  if (!r.ok || !j.ok) throw new Error(j.error || `OS answered ${r.status}`);
  if (typeof j.cursor !== "string") throw new Error("OS events answer carried no cursor");
  const raw = Array.isArray(j.events) ? j.events : [];
  const events = raw.map(asOsEvent).filter((e): e is OsEvent => e !== null);
  // An EMPTY cursor is the OS saying "nothing to point at yet" (no `since` and
  // a quiet 24 h, or the Ledger not applied) — not an error. The caller's own
  // cursor stands, so the pull neither moves nor primes on it.
  return { cursor: j.cursor || cursor || "", events, dropped: raw.length - events.length };
}

// ---- ambient board snapshot (the "seamless OS" path) ----
// The board question was her slowest turn: she had to emit an os_board tool
// call, wait for the Railway→Vercel→Supabase round-trip, THEN answer — two LLM
// turns and a network hop. Instead we keep a compact board line warm in the
// background and drop it straight into every context pack, so "what's the
// board" answers in ONE turn with zero round-trip. os_board stays available
// for authoritative detail/action; this is the fast ambient read.

let boardCache: { line: string; at: number; calls: number | null; week: string | null } | null = null;
let boardRefreshing = false;
const BOARD_TTL_MS = 45_000;

async function refreshBoard(): Promise<void> {
  if (boardRefreshing || !ready()) return;
  boardRefreshing = true;
  try {
    const raw = await osTool("get_board");
    const j = JSON.parse(raw) as {
      week?: string; goal?: number; collected?: number; signed_in_year?: number;
      open_pipeline?: number; open_deals?: number; clients?: number;
      coverage?: number | null; friday_five?: unknown;
    };
    const d = (n?: number) => `$${(n ?? 0).toLocaleString("en-US")}`;
    // friday_five is either the object or the literal string "not logged yet"
    // (churlish-os lib/rookie-tools.ts boardSummary). `calls` is the OS-side
    // sales-floor counter the Today tile mirrors — keep it on the warm cache so
    // the tile costs zero round-trips.
    const ffObj =
      j.friday_five && typeof j.friday_five === "object" ? (j.friday_five as { calls?: number }) : null;
    const ff = ffObj ? "logged" : "not logged yet";
    boardCache = {
      at: Date.now(),
      calls: typeof ffObj?.calls === "number" ? ffObj.calls : null,
      week: j.week ?? null,
      line:
        `OS board (live snapshot, ${j.week ?? "this week"}): ${d(j.collected)} collected of ${d(j.goal)} goal · ` +
        `${d(j.open_pipeline)} open pipeline across ${j.open_deals ?? 0} deals · ${j.clients ?? 0} clients · ` +
        `Friday Five ${ff}. (For detail or to change anything, use os_board / os_command.)`,
    };
  } catch (e) {
    console.warn("[os] board snapshot refresh failed:", e instanceof Error ? e.message : String(e));
    // leave the last good snapshot in place; never throw into the pack
  } finally {
    boardRefreshing = false;
  }
}

// Instant: returns the cached board line (may be up to ~45s stale) and kicks a
// non-blocking refresh when stale. Null until the first refresh lands — she can
// still call os_board that once. Never blocks the caller.
export function boardSnapshot(): string | null {
  if (!ready()) return null;
  if (!boardCache || Date.now() - boardCache.at > BOARD_TTL_MS) void refreshBoard();
  return boardCache?.line ?? null;
}

// Warm the snapshot at boot so the very first board question is fast too.
export async function warmBoard(): Promise<void> {
  await refreshBoard();
}

// Cheap read (no refresh trigger) — lets /health confirm the ambient build is
// live and the snapshot has landed, so latency measurements target the right
// build rather than racing a deploy.
export function boardSnapshotReady(): boolean {
  return !!boardCache;
}

// The OS-side sales-floor number (Friday Five "Calls held"), off the warm cache.
// null = OS unreachable, or the week has no Friday Five row yet. Kicks a
// background refresh when stale; never blocks.
export function boardCalls(): number | null {
  if (!ready()) return null;
  if (!boardCache || Date.now() - boardCache.at > BOARD_TTL_MS) void refreshBoard();
  return boardCache?.calls ?? null;
}

// Force the snapshot to re-read NOW. Called right after EVE writes the Friday
// Five so the Today tile reflects the new count immediately instead of showing
// a stale number for up to the 45s TTL.
export async function refreshBoardNow(): Promise<void> {
  boardCache = boardCache ? { ...boardCache, at: 0 } : null; // invalidate, then re-read
  await refreshBoard();
}

// ---- the house gate on HIS-mailbox sends (gmail_send, calendar_invite) ----
// Her gmail_send and calendar_invite leave from Brandon's own Gmail / Calendar —
// the sender must stay his mailbox, so they cannot ride the OS's send gate. They
// still answer to it: after his approve on the RED card, the executor (built
// here, wired in connectors.ts) reads house_status FIRST and
//   · sends paused        → nothing sent; the card resolves not executed
//   · OS unreachable /
//     no token / garbled  → nothing sent (fail closed)
//   · test mode on        → every recipient / attendee becomes TEST_INBOX and
//                           the subject / title reads "[TEST → orig, …] …" —
//                           the same marking as the OS's applyTestGuard
//                           (churlish-os lib/house/send-gate.ts)
// and, after a real send, writes ONE Ledger line through the OS's ledger_note
// (confirmed:true; title = recipient domain + subject, never the body). A Ledger
// failure does not undo the send: one log line, no content.

export const TEST_INBOX = "hello@churlishmedia.com";
export const PAUSED_DETAIL = "Paused in the OS — nothing sent.";
export const UNREACHABLE_DETAIL = "Couldn't reach the OS to check Pause all — nothing sent.";

export type HouseGate = { ok: true; testMode: boolean } | { ok: false; detail: string };

export async function houseGate(): Promise<HouseGate> {
  let data: Record<string, unknown> | null;
  try {
    data = (await osToolData("house_status")).data;
  } catch {
    return { ok: false, detail: UNREACHABLE_DETAIL };
  }
  // No numbers, no answer: a reply that cannot say whether sends are paused is
  // treated exactly like no reply.
  if (!data || typeof data.sends_paused !== "boolean" || typeof data.test_mode !== "boolean") {
    return { ok: false, detail: UNREACHABLE_DETAIL };
  }
  if (data.sends_paused) return { ok: false, detail: PAUSED_DETAIL };
  return { ok: true, testMode: data.test_mode };
}

/** Every recipient goes to TEST_INBOX; the subject names who it was for, as the OS does. */
export function applyTestGuard(recipients: string[], subject: string): { to: string[]; subject: string } {
  return { to: [TEST_INBOX], subject: `[TEST → ${recipients.join(", ")}] ${subject}` };
}

export function splitRecipients(to: string): string[] {
  return to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

/** The domains only — the Ledger names who it went to by domain, never an address. */
export function recipientDomains(recipients: string[]): string {
  const d = [...new Set(recipients.map((r) => {
    const at = r.lastIndexOf("@");
    return at >= 0 ? r.slice(at + 1).replace(/[>\s]+$/, "").toLowerCase() : "";
  }).filter(Boolean))];
  return d.length ? d.join(", ") : "unknown domain";
}

export type GatedKind = "gmail" | "calendar";

export interface GatedSend {
  kind: GatedKind;
  recipients: string[];
  subject: string; // the email subject, or the event title
  ref: string; // the confirm card's id — one Ledger line per card
  send: (to: string[], subject: string) => Promise<string>;
}

export async function houseGatedSend(g: GatedSend): Promise<string | { executed: false; detail: string }> {
  const gate = await houseGate();
  if (!gate.ok) return { executed: false, detail: gate.detail };
  const out = gate.testMode ? applyTestGuard(g.recipients, g.subject) : { to: g.recipients, subject: g.subject };
  const detail = await g.send(out.to, out.subject); // a throw here is a failed send — the card says so
  const gmail = g.kind === "gmail";
  const title = `${gmail ? "EVE emailed" : "EVE invited"} ${recipientDomains(g.recipients)} — ${g.subject}`.slice(0, 160);
  const note = gate.testMode
    ? `Test mode on: went to the test inbox, not the ${gmail ? "recipient" : "attendees"}.`
    : `${gmail ? "Sent from Brandon's Gmail" : "Invite sent from Brandon's Calendar"} after he approved her card.`;
  try {
    await osTool("ledger_note", { kind: gmail ? "eve.gmail_sent" : "eve.calendar_invite", title, detail: note, ref: g.ref }, true);
  } catch {
    console.warn(`[os] ledger_note failed after a ${g.kind} send — the send stands`);
  }
  return gate.testMode ? `${detail} (Test mode: went to ${TEST_INBOX}, not the ${gmail ? "recipient" : "attendees"}.)` : detail;
}

// ---- the OS client roster (/state's client tile and the brief) ----
// GET /api/eve/clients on the OS (bearer = this same token) answers
//   { ok: true, clients: [{ id, name, status, segment, cadence_days,
//     days_quiet: number | null, last_touch_at: string | null }], blind: [] }
// — every real, non-test client of the OS owner (churlish-os
// lib/eve/clients.ts). A row that does not match the shape is DROPPED, never
// repaired. No token throws OsNotConnectedError like osTool; an unreachable OS,
// a non-ok answer or a missing `clients` list throws its reason, so the caller
// can fall back to the brain's own table AND say it did. Names are third-party
// text and are never logged by this module.
export interface OsRosterClient {
  id: string;
  name: string;
  status: string;
  segment: string | null;
  cadence_days: number;
  days_quiet: number | null;
  last_touch_at: string | null;
}

export function parseOsRoster(v: unknown): OsRosterClient[] | null {
  if (!v || typeof v !== "object") return null;
  const list = (v as Record<string, unknown>).clients;
  if (!Array.isArray(list)) return null;
  const out: OsRosterClient[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || typeof r.name !== "string" || !r.name) continue;
    if (typeof r.cadence_days !== "number" || !Number.isFinite(r.cadence_days)) continue;
    if (r.days_quiet !== null && (typeof r.days_quiet !== "number" || !Number.isFinite(r.days_quiet))) continue;
    if (r.last_touch_at !== null && r.last_touch_at !== undefined && typeof r.last_touch_at !== "string") continue;
    out.push({
      id: r.id,
      name: r.name,
      status: typeof r.status === "string" ? r.status : "",
      segment: typeof r.segment === "string" && r.segment ? r.segment : null,
      cadence_days: r.cadence_days,
      days_quiet: typeof r.days_quiet === "number" ? Math.floor(r.days_quiet) : null,
      last_touch_at: typeof r.last_touch_at === "string" ? r.last_touch_at : null,
    });
  }
  return out;
}

export async function osClients(): Promise<OsRosterClient[]> {
  const token = process.env.CHURLISH_OS_TOKEN;
  if (!token) throw new OsNotConnectedError();
  const r = await fetch(`${OS_URL}/api/eve/clients`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!r.ok || !j.ok) throw new Error(j.error || `OS answered ${r.status}`);
  const list = parseOsRoster(j);
  if (!list) throw new Error("OS clients answer carried no clients list");
  return list;
}
