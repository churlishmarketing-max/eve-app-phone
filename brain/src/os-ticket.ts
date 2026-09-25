import { createHmac, timingSafeEqual } from "node:crypto";

// ONE HOUSE STEP 4c · 4.1 — THE OS TICKET. The brain accepts an OS credential.
//
// The Churlish OS (churlishos.app) talks to her from a signed-in operator's
// browser, and that browser must never hold EVE_BRAIN_TOKEN — it is the one key
// to every route on this brain. So the OS mints a SHORT-LIVED TICKET on its own
// server, signed with that key, and hands the browser only the ticket:
//
//   Authorization: Bearer os1.<exp>.<nonce>.<sig>
//
//     exp   unix SECONDS, digits only — when the ticket stops working
//     nonce 16 lowercase hex chars, chosen by the OS per ticket
//     sig   lowercase hex HMAC-SHA256 over the exact string `os1.<exp>.<nonce>`
//           (the exp and nonce exactly as they appear in the header), keyed
//           with EVE_BRAIN_TOKEN as utf8
//
// NO NEW SECRET. The key is the bearer both sides already hold; nothing new is
// set on Railway or Vercel for this.
//
// WHAT A TICKET IS WORTH, and no more: index.ts accepts one on exactly two
// routes — POST /chat and GET /state — the two the OS's /eve page uses. NOT
// /confirm: a card is resolved only through the OS's own server (the Inbox's
// one-tap door, which records it), never straight from a browser holding a
// ticket — the judge's call, so the prime law has one door. Every other route
// stays bearer-only, so a leaked ticket cannot register a push token, move her
// wardrobe, dispatch a unit or approve anything, and it dies inside fifteen
// minutes on its own.
//
// NOT A ONE-TIME TOKEN. The nonce is not remembered: a ticket is good for any
// number of calls to those two routes until `exp`. That is deliberate — one
// chat turn is a /chat plus a /state poll — and the 15-minute
// ceiling is what bounds a replay. Stated here, not hidden.
//
// CLOCK SKEW. The OS mints exp = now + 900 on Vercel's clock; if Railway's clock
// runs a few seconds behind, a fresh ticket would read as "too far ahead" and
// every turn would silently fall back to the slow path. So the ceiling allows
// OS_TICKET_SKEW_SEC on top. Expiry itself is still judged on this clock.
//
// PURE: no clock read, no env read, no logging. The caller passes the secret and
// `now`, which is what lets verify/os-ticket-harness.ts drive every edge without
// waiting fifteen minutes. And it NEVER echoes the header back in a reason —
// the reasons are fixed strings, so a rejected ticket cannot leak into a log.

/** A ticket may not live longer than this. Measured from `now`, not from minting. */
export const OS_TICKET_MAX_TTL_SEC = 900;
/** Seconds of clock difference between the OS and this brain that a ticket tolerates. */
export const OS_TICKET_SKEW_SEC = 30;

const TICKET_SHAPE = /^Bearer os1\.(\d{1,12})\.([0-9a-f]{16})\.([0-9a-f]{64})$/;

export type OsTicketVerdict = { ok: true; exp: number } | { ok: false; reason: string };

/** True when the header is shaped like a ticket at all — lets the auth door route it without verifying. */
export function looksLikeOsTicket(header: string | undefined): boolean {
  return typeof header === "string" && header.startsWith("Bearer os1.");
}

export function verifyOsTicket(header: string | undefined, secret: string, nowSec: number): OsTicketVerdict {
  if (!secret) return { ok: false, reason: "no signing key on this brain" };
  if (typeof header !== "string") return { ok: false, reason: "no ticket" };
  const m = TICKET_SHAPE.exec(header);
  if (!m) return { ok: false, reason: "not an os1 ticket" };
  const [, expStr, nonce, sig] = m;
  const exp = Number(expStr);
  if (!Number.isSafeInteger(exp)) return { ok: false, reason: "bad expiry" };
  if (!(nowSec < exp)) return { ok: false, reason: "expired" };
  if (exp - nowSec > OS_TICKET_MAX_TTL_SEC + OS_TICKET_SKEW_SEC) return { ok: false, reason: "expiry too far ahead" };
  const want = createHmac("sha256", Buffer.from(secret, "utf8")).update(`os1.${expStr}.${nonce}`).digest();
  const got = Buffer.from(sig, "hex");
  // Both are 32 bytes by construction (the shape pins 64 hex chars), and the
  // length check stays anyway: timingSafeEqual throws on a mismatch.
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "bad signature" };
  return { ok: true, exp };
}

/**
 * The two doors a ticket opens. Method + exact path; anything else (including /confirm) is bearer-only.
 * History (GET /conversations, GET /conversations/:id/messages) is bearer-only ON PURPOSE: the OS proxies it with its server bearer.
 */
export function osTicketRoute(method: string, pathName: string): boolean {
  if (method === "POST" && pathName === "/chat") return true;
  if (method === "GET" && pathName === "/state") return true;
  return false;
}

/**
 * THE WHOLE AUTH DECISION for a non-open route, as one pure function so the
 * harness drives the same code the middleware runs. The single bearer works
 * everywhere it always did (timing-safe, review C32). A ticket works ONLY where
 * osTicketRoute says so; on any other route it is simply not the bearer, and is
 * refused like any other wrong header.
 */
export function authorizeBrainRequest(
  method: string,
  pathName: string,
  header: string | undefined,
  token: string,
  nowSec: number,
): { ok: true; via: "bearer" | "os_ticket" } | { ok: false } {
  const auth = Buffer.from(header || "");
  const want = Buffer.from(`Bearer ${token}`);
  if (token && auth.length === want.length && timingSafeEqual(auth, want)) return { ok: true, via: "bearer" };
  if (looksLikeOsTicket(header) && osTicketRoute(method, pathName)) {
    const v = verifyOsTicket(header, token, nowSec);
    if (v.ok) return { ok: true, via: "os_ticket" };
  }
  return { ok: false };
}
