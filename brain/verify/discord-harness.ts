// Brain-side proof for THE DISCORD ALERTS MIRROR (src/discord.ts, and its one
// call site inside src/push.ts sendPush).
//
//   cd C:\dev\eve\brain && npx tsx verify/discord-harness.ts
//
// Pure and offline. Discord is a stub globalThis.fetch that records every call;
// FCM is a stub transport (push.ts _setPushTransportForTests); the send wall is
// opened deliberately with EVE_PUSH_ALLOW=1 where a scenario needs it and shut
// again. Every console line is captured, so "no body and no webhook URL is ever
// logged" is checked against what was actually written.
//
// House rule: every deny has an ALLOW TWIN — a mirror that never posts would
// pass every "did not post" check on its own.
//
// Where a check reads SOURCE TEXT rather than driving behaviour it says SOURCE.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Env first, THEN the modules (dynamic imports in main): push.ts reads
// CHURLISH_OS_URL at load.
delete process.env.EVE_PUSH_ALLOW;
for (const k of Object.keys(process.env)) if (k.startsWith("RAILWAY_")) delete process.env[k];
delete process.env.DISCORD_ALERTS_WEBHOOK_URL;
delete process.env.DISCORD_ALERT_KINDS;
delete process.env.DISCORD_NOTES_WEBHOOK_URL;
delete process.env.CHURLISH_OS_TOKEN;
process.env.CHURLISH_OS_URL = "https://churlishos.app";
process.env.EVE_TZ = "America/Chicago";

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUSH_SRC = readFileSync(path.join(brainDir, "src", "push.ts"), "utf8");
const DISCORD_SRC = readFileSync(path.join(brainDir, "src", "discord.ts"), "utf8");
const INDEX_SRC = readFileSync(path.join(brainDir, "src", "index.ts"), "utf8");

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  show.push(`  ${id.padEnd(6)} ${cond ? "PASS" : "****FAIL****"}  ${what}`);
}

const logged: string[] = [];
const realLog = console.log;
const realWarn = console.warn;
const realError = console.error;
console.log = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
console.warn = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "));

const HOOK = "https://discord.example/api/webhooks/1234/SECRET-HOOK-TOKEN";
const SECRET_BODY = "Dana Whitfield <dana@studio.example> signed the contract";

// ---- the Discord stub ----
interface Call {
  url: string;
  content: string;
  payload: Record<string, unknown>;
}
const calls: Call[] = [];
type Mode = "ok" | "500" | "throw" | "hang";
let mode: Mode = "ok";
let releaseHang: (() => void) | null = null;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: unknown, init?: { body?: unknown; signal?: AbortSignal }) => {
  const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  calls.push({ url: String(input), content: String(payload.content ?? ""), payload });
  if (mode === "throw") throw new TypeError(`fetch failed for ${String(input)}`);
  if (mode === "500") return new Response(`{"message":"echo: ${SECRET_BODY}"}`, { status: 500 });
  if (mode === "hang") {
    await new Promise<void>((res) => {
      releaseHang = res;
      init?.signal?.addEventListener("abort", () => res());
    });
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 204 });
}) as typeof fetch;

// ---- the FCM stub ----
const fcm: Array<{ token?: string; data?: Record<string, string>; notification?: { title?: string; body?: string } }> = [];
let fcmThrows = false;

async function main() {
  const d = await import("../src/discord.js");
  const push = await import("../src/push.js");
  const ev = await import("../src/os-events.js");
  push._setPushTransportForTests(async (m) => {
    fcm.push(m as unknown as (typeof fcm)[number]);
    if (fcmThrows) throw Object.assign(new Error("fcm down"), { code: "messaging/internal-error" });
    return "projects/x/messages/1";
  });

  const reset = () => {
    calls.length = 0;
    fcm.length = 0;
    logged.length = 0;
    mode = "ok";
    fcmThrows = false;
    d._resetDiscordForTests();
  };

  // ------------------------------------------------------------------
  show.push("=== D1 — URL UNSET IS A NO-OP ===");
  {
    reset();
    const r = await d.mirrorToDiscord("tripwire", "EVE · TRIPWIRE", SECRET_BODY, "https://churlishos.app/inbox");
    ok("D1.1", r.outcome === "off" && calls.length === 0, `mirrorToDiscord with no DISCORD_ALERTS_WEBHOOK_URL → "${r.outcome}", ${calls.length} fetches`);
    ok("D1.2", !d.discordAlertsReady() && /needs DISCORD_ALERTS_WEBHOOK_URL/.test(d.discordAlertsStatusDetail()), "discordAlertsReady() is false and the status names the variable to set");
    process.env.EVE_PUSH_ALLOW = "1";
    const id = await push.sendPush("fcm-token", { title: "EVE · TRIPWIRE", body: SECRET_BODY, channelId: "tripwire", data: { kind: "tripwire", attention_id: "a1", deeplink: "eve://ops" } });
    await d._drainDiscordForTests();
    ok("D1.3", id !== "" && fcm.length === 1 && calls.length === 0, `a real (stub-FCM) push with the URL unset still goes to the phone and posts nothing (fcm=${fcm.length}, fetches=${calls.length})`);
    delete process.env.EVE_PUSH_ALLOW;
    ok("D1.4", logged.every((l) => !l.startsWith("[discord]")), "and says nothing about Discord in the log");
  }

  process.env.DISCORD_ALERTS_WEBHOOK_URL = HOOK;

  // ------------------------------------------------------------------
  show.push("=== D2 — DISCORD_ALERT_KINDS ===");
  {
    const def = d.parseAlertKinds(undefined);
    ok("D2.1", !def.all && [...def.kinds].join(",") === "brief,closeout,tripwire,silent_client,approval,routine_risk,os_event", `unset → the default seven: ${[...def.kinds].join(",")}`);
    const star = d.parseAlertKinds("*");
    ok("D2.2", star.all, `"*" → every kind`);
    ok("D2.3", d.parseAlertKinds("none").kinds.size === 0 && !d.parseAlertKinds("none").all, `"none" → nothing`);
    ok("D2.4", d.parseAlertKinds("").kinds.size === 0 && !d.parseAlertKinds("").all && d.parseAlertKinds(" , ").kinds.size === 0, `"" (and " , ") → nothing`);
    const list = d.parseAlertKinds(" tripwire, OS_EVENT ,, floor_check");
    ok("D2.5", !list.all && [...list.kinds].sort().join(",") === "floor_check,os_event,tripwire", `a list is trimmed, lower-cased, blanks dropped: ${[...list.kinds].sort().join(",")}`);

    reset();
    process.env.DISCORD_ALERT_KINDS = "";
    const r1 = await d.mirrorToDiscord("brief", "EVE", "morning", null);
    process.env.DISCORD_ALERT_KINDS = "none";
    const r2 = await d.mirrorToDiscord("tripwire", "EVE · TRIPWIRE", "x", null);
    ok("D2.6", r1.outcome === "kind-off" && r2.outcome === "kind-off" && calls.length === 0, `URL set + DISCORD_ALERT_KINDS="" or "none" → nothing posts (${r1.outcome}/${r2.outcome}, ${calls.length} fetches)`);
    process.env.DISCORD_ALERT_KINDS = "floor_check";
    const r3 = await d.mirrorToDiscord("tripwire", "EVE · TRIPWIRE", "x", null);
    const r4 = await d.mirrorToDiscord("floor_check", "EVE · FLOOR", "x", null);
    ok("D2.7", r3.outcome === "kind-off" && r4.outcome === "sent" && calls.length === 1, `a list mirrors exactly its kinds: tripwire ${r3.outcome}, floor_check ${r4.outcome} (ALLOW twin)`);
    process.env.DISCORD_ALERT_KINDS = "*";
    const r5 = await d.mirrorToDiscord("week_preview", "EVE · WEEK AHEAD", "x", null);
    ok("D2.8", r5.outcome === "sent", `"*" mirrors a kind outside the default list (week_preview → ${r5.outcome})`);
    delete process.env.DISCORD_ALERT_KINDS;
    const r6 = await d.mirrorToDiscord("week_preview", "EVE · WEEK AHEAD", "x", null);
    ok("D2.9", r6.outcome === "kind-off", `unset again → week_preview is off by default (${r6.outcome})`);
  }

  // ------------------------------------------------------------------
  show.push("=== D3 — ONE MESSAGE, UNDER THE CAP ===");
  {
    const link = "https://churlishos.app/inbox";
    const short = d.formatAlert("EVE · TRIPWIRE", "Stripe webhook is failing.", link);
    ok("D3.1", short === `**EVE · TRIPWIRE**\nStripe webhook is failing.\n${link}`, `a short alert is title / body / link, one line each: ${JSON.stringify(short)}`);
    const long = d.formatAlert("EVE · THE OS", "w".repeat(5000), link);
    const bodyPart = long.split("\n")[1];
    ok("D3.2", long.length <= 2000 && bodyPart.length <= d.BODY_MAX && bodyPart.endsWith("…") && long.endsWith(`\n${link}`), `a 5000-char body → ${long.length} chars total, body ${bodyPart.length} ≤ ${d.BODY_MAX} ending "…", link still the last line`);
    const exact = d.formatAlert("EVE", "b".repeat(d.BODY_MAX), null);
    ok("D3.3", !exact.includes("…") && exact.length === "**EVE**\n".length + d.BODY_MAX, `a body of exactly ${d.BODY_MAX} is not cut (ALLOW twin)`);
    const huge = d.formatAlert("T".repeat(900), "b".repeat(1900), `https://churlishos.app/${"p".repeat(250)}`);
    ok("D3.4", huge.length <= 2000 && huge.includes("…"), `a 900-char title + 1900-char body + long link still fits: ${huge.length} ≤ 2000`);
    const oneline = d.formatAlert("EVE\n@everyone forged line", "b", null);
    ok("D3.5", oneline.split("\n")[0] === "**EVE @everyone forged line**", "a title can't forge a second line");
    ok("D3.6", d.mirrorLink("https://churlishos.app/ledger") === "https://churlishos.app/ledger" && d.mirrorLink("/today") === "https://churlishos.app/today", "an absolute link is kept; a same-site path goes under CHURLISH_OS_URL");
    ok("D3.7", d.mirrorLink("//evil.example/x") === null && d.mirrorLink("eve://ops") === null && d.mirrorLink(null) === null && d.mirrorLink("https://a.b/c d") === null && d.mirrorLink(`https://a.b/${"x".repeat(400)}`) === null, "anything else (//host, eve://, null, whitespace, overlong) is omitted");

    reset();
    const r = await d.mirrorToDiscord("os_event", "EVE · THE OS", "x".repeat(3000), link);
    ok("D3.8", r.outcome === "sent" && calls.length === 1 && calls[0].content.length <= 2000 && calls[0].url === HOOK, `the posted content is ${calls[0]?.content.length} chars, ONE message to the alerts webhook`);
    ok("D3.9", JSON.stringify(calls[0]?.payload.allowed_mentions) === '{"parse":[]}', "the post disables every mention (no @everyone from a body)");
  }

  // ------------------------------------------------------------------
  show.push("=== D4 — A FAILING WEBHOOK NEVER THROWS AND LOGS NO BODY ===");
  {
    reset();
    mode = "500";
    let threw = false;
    let r1: { outcome: string } = { outcome: "?" };
    try {
      r1 = await d.mirrorToDiscord("tripwire", "EVE · TRIPWIRE", SECRET_BODY, "https://churlishos.app/inbox");
    } catch {
      threw = true;
    }
    ok("D4.1", !threw && r1.outcome === "failed", `HTTP 500 → no throw, outcome "${r1.outcome}"`);
    const l1 = logged.filter((l) => l.startsWith("[discord]"));
    ok("D4.2", l1.length === 1 && /kind=tripwire/.test(l1[0]) && /HTTP 500/.test(l1[0]), `one log line, kind + status: "${l1[0]}"`);
    d._resetDiscordForTests();
    logged.length = 0;
    mode = "throw";
    let r2: { outcome: string } = { outcome: "?" };
    try {
      r2 = await d.mirrorToDiscord("tripwire", "EVE · TRIPWIRE", SECRET_BODY, null);
    } catch {
      threw = true;
    }
    const l2 = logged.filter((l) => l.startsWith("[discord]"));
    ok("D4.3", !threw && r2.outcome === "failed" && l2.length === 1 && /network error/.test(l2[0]), `a network throw (whose message holds the URL) → no throw, one line: "${l2[0]}"`);

    // Through sendPush: a failing webhook must not fail or delay the push.
    d._resetDiscordForTests();
    logged.length = 0;
    mode = "500";
    process.env.EVE_PUSH_ALLOW = "1";
    let pushThrew = false;
    let id = "";
    try {
      id = await push.sendPush("fcm-token", { title: "EVE · TRIPWIRE", body: SECRET_BODY, channelId: "tripwire", data: { kind: "tripwire", attention_id: "a2", deeplink: "eve://ops" } });
    } catch {
      pushThrew = true;
    }
    await d._drainDiscordForTests();
    ok("D4.4", !pushThrew && id !== "", "sendPush still resolves with the FCM id when the webhook 500s");

    // Never blocks: a webhook that hangs does not hold sendPush.
    d._resetDiscordForTests();
    mode = "hang";
    const t0 = Date.now();
    const id2 = await push.sendPush("fcm-token", { title: "EVE · TRIPWIRE", body: "hang", channelId: "tripwire", data: { kind: "tripwire", attention_id: "a3", deeplink: "eve://ops" } });
    const took = Date.now() - t0;
    const stillPending = calls.length > 0 && releaseHang !== null;
    ok("D4.5", id2 !== "" && took < 1000 && stillPending, `with the webhook hanging, sendPush returned in ${took} ms (the post is still open: fire-and-forget)`);
    (releaseHang as (() => void) | null)?.();
    await d._drainDiscordForTests();
    delete process.env.EVE_PUSH_ALLOW;
    ok("D4.6", /TIMEOUT_MS = 10_000/.test(DISCORD_SRC) && /setTimeout\(\(\) => ac\.abort\(\), TIMEOUT_MS\)/.test(DISCORD_SRC), "SOURCE: every post is aborted after 10 s");

    const all = logged.join("\n");
    ok("D4.7", !all.includes("Dana") && !all.includes("SECRET-HOOK-TOKEN") && !all.includes("discord.example") && !all.includes("signed the contract"), `across every failure above, no log line holds the body, the echoed error or the webhook URL (${logged.length} lines)`);
    ok("D4.8", !/console\.(log|warn|error)\([^)]*\$\{(title|body|content|url|link|e\b|e\.message)/.test(DISCORD_SRC), "SOURCE: no console call in discord.ts interpolates a title, body, content, URL, link or error message");
  }

  // ------------------------------------------------------------------
  show.push("=== D5 — THE PER-KIND RATE GUARD ===");
  {
    reset();
    const realNow = Date.now;
    let fake = 1_800_000_000_000;
    Date.now = () => fake;
    try {
      const a = await d.mirrorToDiscord("os_event", "EVE · THE OS", "one", null);
      fake += 30_000;
      const b = await d.mirrorToDiscord("os_event", "EVE · THE OS", "two", null);
      ok("D5.1", a.outcome === "sent" && b.outcome === "rate-limited" && calls.length === 1, `os_event twice in 30 s → ${a.outcome}, ${b.outcome} (${calls.length} post)`);
      const c = await d.mirrorToDiscord("tripwire", "EVE · TRIPWIRE", "three", null);
      ok("D5.2", c.outcome === "sent" && calls.length === 2, "another kind in the same window still posts — the guard is per kind");
      fake += 30_000;
      const e = await d.mirrorToDiscord("os_event", "EVE · THE OS", "four", null);
      ok("D5.3", e.outcome === "sent" && calls.length === 3, `60 s after the first, os_event posts again (${e.outcome})`);
      const f1 = await d.mirrorToDiscord("brief", "EVE", "b1", null);
      const f2 = await d.mirrorToDiscord("brief", "EVE", "b2", null);
      const g1 = await d.mirrorToDiscord("closeout", "EVE · CLOSE-OUT", "c1", null);
      const g2 = await d.mirrorToDiscord("closeout", "EVE · CLOSE-OUT", "c2", null);
      ok("D5.4", [f1, f2, g1, g2].every((r) => r.outcome === "sent") && calls.length === 7, "brief and closeout are never held by the guard");
      // Two in the same tick: the stamp is taken before any await.
      fake += 120_000;
      const [h1, h2] = await Promise.all([d.mirrorToDiscord("approval", "EVE", "x", null), d.mirrorToDiscord("approval", "EVE", "y", null)]);
      ok("D5.5", [h1.outcome, h2.outcome].sort().join(",") === "rate-limited,sent", `two approvals in one tick → one post (${h1.outcome}, ${h2.outcome})`);
      const held = logged.filter((l) => /held by the 60s guard/.test(l));
      ok("D5.6", held.length === 2 && held.every((l) => !/two|"x"|"y"/.test(l)), `each hold is one log line with the kind only: "${held[0]}"`);
    } finally {
      Date.now = realNow;
    }
  }

  // ------------------------------------------------------------------
  show.push("=== D6 — sendPush MIRRORS EXACTLY ONCE ===");
  {
    reset();
    process.env.EVE_PUSH_ALLOW = "1";
    const id = await push.sendPush("fcm-token", { title: "EVE · TRIPWIRE", body: "Stripe webhook is failing — check the OS.", channelId: "tripwire", data: { kind: "tripwire", attention_id: "t1", deeplink: "eve://ops" } });
    await d._drainDiscordForTests();
    ok("D6.1", id !== "" && fcm.length === 1 && calls.length === 1, `one tripwire push → one FCM send and ONE Discord post (fcm=${fcm.length}, posts=${calls.length})`);
    ok("D6.2", calls[0]?.content === "**EVE · TRIPWIRE**\nStripe webhook is failing — check the OS.\nhttps://churlishos.app/inbox", `with the push's title, body and its OS link (from the kind table): ${JSON.stringify(calls[0]?.content)}`);

    reset();
    const osLink = "https://churlishos.app/ledger?e=42";
    await push.sendPush("fcm-token", { title: "EVE · THE OS", body: "2 things happened in the OS: a; b", channelId: "nudge", data: { kind: "os_event", attention_id: "e1", deeplink: "eve://ops", link: osLink } });
    await d._drainDiscordForTests();
    ok("D6.3", calls.length === 1 && calls[0].content.endsWith(`\n${osLink}`) && calls[0].content.startsWith("**EVE · THE OS**\n2 things happened"), "an os_event mirrors with its own absolute data.link as the last line");

    reset();
    await push.sendPush("fcm-token", { title: "EVE", body: "odd", channelId: "nudge", data: { kind: "approval", attention_id: "j1", deeplink: "eve://ops", link: "/ledger" } });
    await d._drainDiscordForTests();
    ok("D6.4", calls.length === 1 && calls[0].content.endsWith("\nhttps://churlishos.app/ledger"), "a same-site path in data.link is mirrored under CHURLISH_OS_URL");

    reset();
    await push.sendPush("fcm-token", { title: "EVE · FLOOR", body: "Behind pace.", channelId: "nudge", data: { kind: "floor_check", attention_id: "floor_check", deeplink: "eve://today" } });
    await d._drainDiscordForTests();
    ok("D6.5", fcm.length === 1 && calls.length === 0, "floor_check is not in the default kinds → the push goes, nothing is mirrored");
    process.env.DISCORD_ALERT_KINDS = "*";
    d._resetDiscordForTests();
    await push.sendPush("fcm-token", { title: "EVE · FLOOR", body: "Behind pace.", channelId: "nudge", data: { kind: "floor_check", attention_id: "floor_check", deeplink: "eve://today" } });
    await d._drainDiscordForTests();
    ok("D6.6", calls.length === 1 && calls[0].content === "**EVE · FLOOR**\nBehind pace.", `with "*" it mirrors, and a kind with no OS page carries no link line: ${JSON.stringify(calls[0]?.content)}`);

    reset();
    process.env.DISCORD_ALERT_KINDS = "brief";
    await push.sendPush("fcm-token", { title: "EVE · TRIPWIRE", body: "x", channelId: "tripwire", data: { kind: "tripwire", attention_id: "t2", deeplink: "eve://ops" } });
    await d._drainDiscordForTests();
    ok("D6.7", fcm.length === 1 && calls.length === 0, "tripwire switched off (DISCORD_ALERT_KINDS=brief) → pushed, not mirrored");
    await push.sendPush("fcm-token", { title: "EVE", body: "Morning.", channelId: "brief", data: { kind: "brief", attention_id: "b1", deeplink: "eve://today" } });
    await d._drainDiscordForTests();
    ok("D6.8", calls.length === 1 && calls[0].content === "**EVE**\nMorning.\nhttps://churlishos.app/today", "…and the brief, which is on, is (ALLOW twin)");
    delete process.env.DISCORD_ALERT_KINDS;

    // The same gate decision, delivered or not.
    reset();
    fcmThrows = true;
    let threw = false;
    try {
      await push.sendPush("fcm-token", { title: "EVE · TRIPWIRE", body: "fcm fails", channelId: "tripwire", data: { kind: "tripwire", attention_id: "t3", deeplink: "eve://ops" } });
    } catch {
      threw = true;
    }
    await d._drainDiscordForTests();
    ok("D6.9", threw && fcm.length === 1 && calls.length === 1, "an FCM failure still throws to the caller as before, and the push that passed the gate IS mirrored once");
    fcmThrows = false;

    // The wall shut: never mirrored.
    reset();
    delete process.env.EVE_PUSH_ALLOW;
    const blocked = await push.sendPush("fcm-token", { title: "EVE · TRIPWIRE", body: SECRET_BODY, channelId: "tripwire", data: { kind: "tripwire", attention_id: "t4", deeplink: "eve://ops" } });
    await d._drainDiscordForTests();
    ok("D6.10", blocked === "" && fcm.length === 0 && calls.length === 0, "a push the dev send wall blocks is neither sent nor mirrored");
    const mirrorCalls = readdirSync(path.join(brainDir, "src")).filter((f) => f.endsWith(".ts") && f !== "discord.ts" && /mirrorToDiscord\(/.test(readFileSync(path.join(brainDir, "src", f), "utf8")));
    ok("D6.11", mirrorCalls.join(",") === "push.ts" && (PUSH_SRC.match(/mirrorToDiscord\(/g) ?? []).length === 1 && PUSH_SRC.indexOf("void mirrorToDiscord(") > PUSH_SRC.indexOf("if (!gate.allowed)"), "SOURCE: the mirror has ONE call site, inside sendPush, after the wall, not awaited");
  }

  // ------------------------------------------------------------------
  show.push("=== D7 — QUIET HOURS: THE MIRROR FOLLOWS THE PUSH ===");
  {
    reset();
    process.env.EVE_PUSH_ALLOW = "1";
    ev._resetOsEventsForTests();
    const clock = { quiet: true };
    const deps = {
      ready: () => true,
      fetchPage: async () => ({ cursor: "c-2", events: [{ id: "e9", at: "2026-09-25T04:10:00Z", kind: "lead.created", title: "Lead at 23:10", detail: "", link: "/inbox", needs_you: true, client_id: null }], dropped: 0 }),
      loadCursor: async () => "c-1",
      saveCursor: async () => {},
      quiet: () => clock.quiet,
      now: () => new Date(),
      pushReady: () => true,
      token: async () => "fcm-token",
      send: push.sendPush,
      osUrl: "https://churlishos.app",
    };
    const night = await ev.runOsEventsPull({}, deps);
    await d._drainDiscordForTests();
    ok("D7.1", night.outcome === "quiet-hours" && fcm.length === 0 && calls.length === 0, `inside quiet hours the OS pull holds — no push, no mirror (${night.outcome})`);
    clock.quiet = false;
    const morning = await ev.runOsEventsPull({}, deps);
    await d._drainDiscordForTests();
    ok("D7.2", morning.pushed && fcm.length === 1 && calls.length === 1 && calls[0].content.includes("Lead at 23:10") && calls[0].content.endsWith("\nhttps://churlishos.app/inbox"), "the first pull after 06:30 pushes the night AND mirrors it, once");
    delete process.env.EVE_PUSH_ALLOW;
  }

  // ------------------------------------------------------------------
  show.push("=== D8 — THE BOOT LINE ===");
  {
    delete process.env.DISCORD_ALERTS_WEBHOOK_URL;
    const off = d.discordBanner(false);
    ok("D8.1", off === "[discord] notes: off · alerts: off", `both unset: "${off}"`);
    process.env.DISCORD_ALERTS_WEBHOOK_URL = HOOK;
    const on = d.discordBanner(true);
    ok("D8.2", on === "[discord] notes: on · alerts: on (kinds: brief,closeout,tripwire,silent_client,approval,routine_risk,os_event)", `both set: "${on}"`);
    process.env.DISCORD_ALERT_KINDS = "*";
    const star = d.discordBanner(true);
    process.env.DISCORD_ALERT_KINDS = "none";
    const none = d.discordBanner(false);
    delete process.env.DISCORD_ALERT_KINDS;
    ok("D8.3", star.endsWith("alerts: on (kinds: *)") && none === "[discord] notes: off · alerts: on (kinds: none)", `"*" and "none" read as themselves: "${star}" / "${none}"`);
    ok("D8.4", ![off, on, star, none, d.discordAlertsStatusDetail()].some((s) => s.includes("discord.example") || s.includes("SECRET")), "no banner or status ever prints the webhook URL");
    ok("D8.5", /console\.log\(discordBanner\(notesReady\(\)\)\)/.test(INDEX_SRC), "SOURCE: index.ts prints the one Discord line at boot");
  }

  console.log = realLog;
  console.warn = realWarn;
  console.error = realError;
  globalThis.fetch = realFetch;
  push._setPushTransportForTests(null);
  console.log(show.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log = realLog;
  console.warn = realWarn;
  console.error = realError;
  console.error(e);
  process.exit(1);
});
