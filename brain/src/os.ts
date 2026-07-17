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
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: string; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error || `OS answered ${r.status}`);
    return j.result ?? "";
  } finally {
    clearTimeout(deadline);
  }
}

// ---- ambient board snapshot (the "seamless OS" path) ----
// The board question was her slowest turn: she had to emit an os_board tool
// call, wait for the Railway→Vercel→Supabase round-trip, THEN answer — two LLM
// turns and a network hop. Instead we keep a compact board line warm in the
// background and drop it straight into every context pack, so "what's the
// board" answers in ONE turn with zero round-trip. os_board stays available
// for authoritative detail/action; this is the fast ambient read.

let boardCache: { line: string; at: number } | null = null;
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
    const ff = j.friday_five && typeof j.friday_five === "object" ? "logged" : "not logged yet";
    boardCache = {
      at: Date.now(),
      line:
        `OS board (live snapshot, ${j.week ?? "this week"}): ${d(j.collected)} collected of ${d(j.goal)} goal · ` +
        `${d(j.open_pipeline)} open pipeline across ${j.open_deals ?? 0} deals · ${j.clients ?? 0} clients · ` +
        `Friday Five ${ff}. (For detail or to change anything, use os_board / os_command.)`,
    };
  } catch {
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
