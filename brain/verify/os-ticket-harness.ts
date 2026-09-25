// Brain-side proof for ONE HOUSE STEP 4c · 4.1 — THE FRONT DOOR.
//   T. the OS TICKET (src/os-ticket.ts, used by index.ts's auth middleware):
//      `Bearer os1.<exp>.<nonce>.<sig>`, HMAC-SHA256 keyed with EVE_BRAIN_TOKEN,
//      alive at most 15 minutes, accepted on four routes and nowhere else.
//   C. the CORS ALLOW-LIST (src/cors.ts, used by index.ts's CORS middleware):
//      a listed origin is echoed, anything else gets no ACAO — never `*`.
//
//   cd C:\dev\eve\brain && npx tsx verify/os-ticket-harness.ts
//
// Pure and offline. No env, no network, no DB, no server. The verifier and the
// auth decision are pure functions and the middleware in index.ts calls exactly
// the one driven here (SOURCE check at the end says so). The tickets are minted
// in THIS file with node:crypto, the way the OS mints them — not with a helper
// from the module under test, so a bug in the brain's HMAC cannot agree with
// itself.
//
// Where a check reads SOURCE TEXT rather than driving behaviour it says SOURCE.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyOsTicket, authorizeBrainRequest, osTicketRoute, OS_TICKET_MAX_TTL_SEC, OS_TICKET_SKEW_SEC } from "../src/os-ticket.js";
import { corsPolicy, corsAllows, corsBanner, noteRefusedOrigin, DEFAULT_ALLOWED_ORIGINS } from "../src/cors.js";

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_SRC = readFileSync(path.join(brainDir, "src", "index.ts"), "utf8");
const TICKET_SRC = readFileSync(path.join(brainDir, "src", "os-ticket.ts"), "utf8");

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  show.push(`  ${id.padEnd(6)} ${cond ? "PASS" : "****FAIL****"}  ${what}`);
}

const KEY = "harness-brain-token-not-a-real-one";
const NOW = 1_790_000_000; // a fixed "now" in unix seconds; nothing here reads the clock

/** Mint exactly as the OS does: sig = hex HMAC-SHA256(key utf8, `os1.${exp}.${nonce}`). */
function mint(exp: number | string, nonce = "0123456789abcdef", key = KEY): string {
  const sig = createHmac("sha256", Buffer.from(key, "utf8")).update(`os1.${exp}.${nonce}`).digest("hex");
  return `Bearer os1.${exp}.${nonce}.${sig}`;
}

show.push("=== T1 — THE VERIFIER ===");
{
  const good = verifyOsTicket(mint(NOW + 600), KEY, NOW);
  ok("T1.1", good.ok === true && good.exp === NOW + 600, "a ticket signed with the brain token, 10 minutes out, is VALID");
  const edge = verifyOsTicket(mint(NOW + OS_TICKET_MAX_TTL_SEC), KEY, NOW);
  ok("T1.2", edge.ok === true, `exactly ${OS_TICKET_MAX_TTL_SEC}s out is still valid (exp − now ≤ 900)`);
  const skewed = verifyOsTicket(mint(NOW + OS_TICKET_MAX_TTL_SEC + OS_TICKET_SKEW_SEC), KEY, NOW);
  ok("T1.2b", skewed.ok === true, `${OS_TICKET_MAX_TTL_SEC + OS_TICKET_SKEW_SEC}s out is still valid — a brain clock ${OS_TICKET_SKEW_SEC}s behind the OS's does not refuse fresh tickets`);
  const far = verifyOsTicket(mint(NOW + OS_TICKET_MAX_TTL_SEC + OS_TICKET_SKEW_SEC + 1), KEY, NOW);
  ok("T1.3", far.ok === false && far.reason === "expiry too far ahead", `${OS_TICKET_MAX_TTL_SEC + OS_TICKET_SKEW_SEC + 1}s out is REFUSED: "${far.ok ? "" : far.reason}" — no ticket outlives 15 minutes plus skew`);
  const day = verifyOsTicket(mint(NOW + 86_400), KEY, NOW);
  ok("T1.4", day.ok === false, "a day out is REFUSED — a correctly signed long-lived ticket is still not a key");
  const expired = verifyOsTicket(mint(NOW - 1), KEY, NOW);
  ok("T1.5", expired.ok === false && expired.reason === "expired", `one second past exp is REFUSED: "${expired.ok ? "" : expired.reason}"`);
  const atExp = verifyOsTicket(mint(NOW), KEY, NOW);
  ok("T1.6", atExp.ok === false && atExp.reason === "expired", "exp == now is REFUSED (valid only while now < exp)");

  const wrongKey = verifyOsTicket(mint(NOW + 600, "0123456789abcdef", "some-other-token"), KEY, NOW);
  ok("T1.7", wrongKey.ok === false && wrongKey.reason === "bad signature", "a ticket signed with ANOTHER key is REFUSED: bad signature");
  const t = mint(NOW + 600);
  const flipped = t.slice(0, -1) + (t.endsWith("0") ? "1" : "0");
  const flip = verifyOsTicket(flipped, KEY, NOW);
  ok("T1.8", flip.ok === false && flip.reason === "bad signature", "one hex digit of the sig changed is REFUSED");
  // Move exp but keep the old sig — the signature covers exp, so a ticket cannot be stretched.
  const sig = t.split(".").pop() as string;
  const stretched = verifyOsTicket(`Bearer os1.${NOW + 800}.0123456789abcdef.${sig}`, KEY, NOW);
  ok("T1.9", stretched.ok === false && stretched.reason === "bad signature", "a ticket whose exp was edited after signing is REFUSED (the sig covers exp)");
  const renonced = verifyOsTicket(`Bearer os1.${NOW + 600}.fedcba9876543210.${sig}`, KEY, NOW);
  ok("T1.10", renonced.ok === false && renonced.reason === "bad signature", "…and so is one whose nonce was swapped");

  const upper = verifyOsTicket(mint(NOW + 600).replace(/[a-f]/g, (c) => c.toUpperCase()).replace("Bearer OS1", "Bearer os1"), KEY, NOW);
  ok("T1.11", upper.ok === false && upper.reason === "not an os1 ticket", "UPPERCASE hex is REFUSED — the contract is lowercase, and the shape check is exact");
  const shortNonce = verifyOsTicket(mint(NOW + 600, "0123456789abcde"), KEY, NOW);
  ok("T1.12", shortNonce.ok === false && shortNonce.reason === "not an os1 ticket", "a 15-char nonce is REFUSED (16 lowercase hex, exactly)");
  const ms = verifyOsTicket(mint((NOW + 600) * 1000), KEY, NOW);
  ok("T1.13", ms.ok === false, "an exp in MILLISECONDS (a likely OS-side slip) is REFUSED as too far ahead, not silently accepted for 50 years");
  ok("T1.14", verifyOsTicket(undefined, KEY, NOW).ok === false && verifyOsTicket("", KEY, NOW).ok === false, "no header / empty header is REFUSED");
  ok("T1.15", verifyOsTicket(`${mint(NOW + 600)} `, KEY, NOW).ok === false && verifyOsTicket(mint(NOW + 600).replace("Bearer ", "bearer "), KEY, NOW).ok === false, "trailing space or a lowercase scheme is REFUSED — exact shape only");
  ok("T1.16", verifyOsTicket(mint(NOW + 600, "0123456789abcdef", ""), "", NOW).ok === false, "an EMPTY signing key refuses everything, even a ticket 'signed' with the empty key");
  const reasons = [far, expired, wrongKey, flip].map((v) => (v.ok ? "" : v.reason)).join("|");
  ok("T1.17", !reasons.includes("0123456789abcdef") && !reasons.includes(sig), "a refusal reason never echoes the nonce or the signature back (nothing to leak into a log)");
}

show.push("=== T2 — TWO DOORS AND NO MORE ===");
{
  const tk = mint(NOW + 600);
  const bearer = `Bearer ${KEY}`;
  const doors: Array<[string, string]> = [["POST", "/chat"], ["GET", "/state"]];
  for (const [m, p] of doors) {
    const r = authorizeBrainRequest(m, p, tk, KEY, NOW);
    ok(`T2.${m[0]}${p.length}`, r.ok === true && r.via === "os_ticket", `a good ticket OPENS ${m} ${p}`);
  }
  const good = authorizeBrainRequest("POST", "/chat", tk, KEY, NOW);
  ok("T2.1", good.ok === true, "good ticket on POST /chat passes the auth decision");
  const exp = authorizeBrainRequest("POST", "/chat", mint(NOW - 5), KEY, NOW);
  ok("T2.2", exp.ok === false, "an EXPIRED ticket on POST /chat is refused (401)");
  const future = authorizeBrainRequest("POST", "/chat", mint(NOW + 16 * 60), KEY, NOW);
  ok("T2.3", future.ok === false, "a ticket 16 minutes in the future on POST /chat is refused (401)");
  const badSig = authorizeBrainRequest("POST", "/chat", mint(NOW + 600, "0123456789abcdef", "wrong"), KEY, NOW);
  ok("T2.4", badSig.ok === false, "a wrong-signature ticket on POST /chat is refused (401)");
  ok("T2.4b", authorizeBrainRequest("POST", "/confirm", tk, KEY, NOW).ok === false && authorizeBrainRequest("GET", "/confirm/c_123", tk, KEY, NOW).ok === false, "a correct ticket on POST /confirm and GET /confirm/:id is REFUSED — a card resolves only through the OS's own server, the Inbox's one-tap door");
  const wear = authorizeBrainRequest("POST", "/wardrobe/wear", tk, KEY, NOW);
  ok("T2.5", wear.ok === false, "a CORRECT ticket on POST /wardrobe/wear (bearer-only) is refused (401)");
  for (const [m, p] of [["POST", "/dispatch"], ["POST", "/register-push"], ["POST", "/job"], ["POST", "/capture"], ["POST", "/senses/sms"], ["POST", "/attention/x/action"], ["POST", "/wardrobe/sync/manifest"], ["GET", "/vitals"]] as const) {
    ok(`T2.x${p.length}`, authorizeBrainRequest(m, p, tk, KEY, NOW).ok === false, `a correct ticket on ${m} ${p} is refused — bearer-only`);
  }
  ok("T2.6", authorizeBrainRequest("GET", "/chat", tk, KEY, NOW).ok === false && authorizeBrainRequest("POST", "/state", tk, KEY, NOW).ok === false, "the door is METHOD + path: GET /chat and POST /state are not doors");
  ok("T2.7", authorizeBrainRequest("POST", "/chat/", tk, KEY, NOW).ok === false && authorizeBrainRequest("POST", "/Chat", tk, KEY, NOW).ok === false && authorizeBrainRequest("GET", "/confirm/a/b", tk, KEY, NOW).ok === false, "path variants (trailing slash, case, extra segment) FAIL CLOSED to bearer-only");
  ok("T2.8", authorizeBrainRequest("POST", "/wardrobe/wear", bearer, KEY, NOW).ok === true && authorizeBrainRequest("POST", "/chat", bearer, KEY, NOW).ok === true, "ALLOW TWIN: the single bearer still opens every route, exactly as before");
  const b = authorizeBrainRequest("POST", "/chat", bearer, KEY, NOW);
  ok("T2.9", b.ok === true && b.via === "bearer", "…and is recognised as the bearer, not as a ticket");
  ok("T2.10", authorizeBrainRequest("POST", "/chat", "Bearer nope", KEY, NOW).ok === false && authorizeBrainRequest("POST", "/chat", undefined, KEY, NOW).ok === false, "a wrong bearer / no header is refused, as before");
  ok("T2.11", authorizeBrainRequest("POST", "/chat", `Bearer ${KEY}x`, KEY, NOW).ok === false, "a bearer with one extra character is refused (length-checked before timingSafeEqual)");
  ok("T2.12", osTicketRoute("HEAD", "/state") === false, "HEAD /state is not a ticket door (fail closed; the OS uses GET)");
}

show.push("=== T3 — THE MIDDLEWARE USES THIS, AND LOGS NOTHING ===");
{
  ok("T3.1", /authorizeBrainRequest\(req\.method, req\.path, req\.headers\.authorization, TOKEN,/.test(INDEX_SRC), "SOURCE: index.ts's auth middleware calls authorizeBrainRequest with the real method, path, header and EVE_BRAIN_TOKEN");
  ok("T3.2", !/TOKEN_BUF/.test(INDEX_SRC), "SOURCE: the old inline bearer compare is gone — one decision, not two that could drift");
  ok("T3.3", !/console\.(log|warn|error)/.test(TICKET_SRC), "SOURCE: os-ticket.ts has no console call at all — a ticket and its reason are never logged");
  const mw = INDEX_SRC.slice(INDEX_SRC.indexOf("const verdict = authorizeBrainRequest"), INDEX_SRC.indexOf("const verdict = authorizeBrainRequest") + 300);
  ok("T3.4", mw.length > 0 && !/console\./.test(mw) && /status\(401\)\.json\(\{ error: "unauthorized" \}\)/.test(mw), "SOURCE: a refusal is the same bare 401 as before, with no log line");
}

show.push("=== C — CORS: AN ALLOW-LIST, NOT A MIRROR ===");
{
  const def = corsPolicy(undefined);
  ok("C1", def.open === false && corsAllows("https://churlishos.app", def) && corsAllows("https://www.churlishos.app", def), "DEFAULT: the OS origins are allowed (https://churlishos.app, https://www.churlishos.app)");
  ok("C2", ["http://localhost", "https://localhost", "capacitor://localhost", "http://localhost:5173", "http://127.0.0.1:5173"].every((o) => corsAllows(o, def)), "DEFAULT: the repo's own clients — Capacitor WebView (http/https/capacitor://localhost) and Vite dev :5173 — are allowed");
  ok("C3", !corsAllows("https://evil.example", def), "DEFAULT: https://evil.example is REFUSED (no ACAO)");
  ok("C4", !corsAllows("https://churlishos.app.evil.example", def) && !corsAllows("https://evilchurlishos.app", def) && !corsAllows("http://churlishos.app", def), "look-alikes are REFUSED: suffix trick, prefix trick, and http:// for an https origin");
  ok("C5", !corsAllows("null", def), "Origin: null (file://, sandboxed iframe) is REFUSED");
  ok("C6", corsAllows("https://my-brain.up.railway.app", def, "my-brain.up.railway.app") && !corsAllows("https://other.up.railway.app", def, "my-brain.up.railway.app"), "SAME-ORIGIN (the brain's own /console page) is allowed by Host match; a different host is not");
  ok("C7", corsAllows("HTTPS://ChurlishOS.app/", def), "origin compare is case- and trailing-slash-insensitive");
  const env = corsPolicy(" https://a.example , https://b.example/ ");
  ok("C8", env.open === false && corsAllows("https://a.example", env) && corsAllows("https://b.example", env) && !corsAllows("https://churlishos.app", env), "EVE_ALLOWED_ORIGINS REPLACES the default list (churlishos.app is not implied once it is set)");
  const open = corsPolicy("*");
  ok("C9", open.open === true && corsAllows("https://evil.example", open), "EVE_ALLOWED_ORIGINS=* restores reflect-any, for a laptop test");
  ok("C10", corsBanner(open, true).startsWith("[cors] OPEN (*)") && corsBanner(def, false).startsWith("[cors] allow-list") && corsBanner(def, false).includes("https://churlishos.app"), `the boot line says which: "${corsBanner(def, false).slice(0, 60)}…"`);
  ok("C11", corsPolicy("https://a.example,*").open === false && !corsAllows("https://evil.example", corsPolicy("https://a.example,*")), "a `*` INSIDE a list is dropped, not honoured — only the bare value opens it");
  ok("C12", DEFAULT_ALLOWED_ORIGINS.every((o) => o !== "*"), "the default list never contains `*`");
  const lines: string[] = [];
  noteRefusedOrigin("https://evil.example", (l) => lines.push(l));
  noteRefusedOrigin("https://evil.example", (l) => lines.push(l));
  noteRefusedOrigin("https://other.example", (l) => lines.push(l));
  ok("C13", lines.length === 2 && lines[0] === "[cors] refused origin https://evil.example", `the refusal warns ONCE per origin and names only the origin: "${lines[0]}"`);
  for (let i = 0; i < 80; i++) noteRefusedOrigin(`https://scan${i}.example`, (l) => lines.push(l));
  ok("C14", lines.length === 51 && /further refusals are not logged/.test(lines[50]), `bounded: a scanner cycling 80 origins produces ${lines.length} lines, the last saying the rest are not logged`);
  const mw = INDEX_SRC.slice(INDEX_SRC.indexOf("const CORS = corsPolicy"), INDEX_SRC.indexOf("const CORS = corsPolicy") + 900);
  ok("C15", /corsAllows\(origin, CORS, req\.headers\.host\)\) res\.setHeader\("Access-Control-Allow-Origin", origin\)/.test(mw) && !/"\*"/.test(mw), "SOURCE: the middleware echoes the origin only when corsAllows says so, and never writes `*`");
  ok("C16", /if \(req\.method === "OPTIONS"\) return res\.sendStatus\(204\)/.test(mw) && INDEX_SRC.indexOf("const CORS = corsPolicy") < INDEX_SRC.indexOf("authorizeBrainRequest(req.method"), "SOURCE: OPTIONS preflight still answers 204, and the CORS middleware runs BEFORE auth");
  ok("C17", /console\.log\(corsBanner\(CORS/.test(INDEX_SRC), "SOURCE: the boot log prints the CORS line");
}

console.log(show.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
