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
