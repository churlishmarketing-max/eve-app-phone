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
