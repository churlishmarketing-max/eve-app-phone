// Brain-side proof for ONE HOUSE STEP 4c · 4.3 / 4.4 — THE MINUTE PULL THAT PUSHES
// (src/os-events.ts runOsEventsPull, src/os.ts osEventsSince, the os_event push).
//
//   cd C:\dev\eve\brain && npx tsx verify/os-events-harness.ts
//
// Pure and offline. runOsEventsPull takes its world as PullDeps, so every
// scenario here is a stub OS, a stub cursor store, a stub clock and a counting
// push — no network, no Supabase, no FCM. The two places that touch the real
// modules (osEventsSince's shape check, sendPush's dev wall) are driven with a
// local fetch stub and with the send wall shut, and both are restored.
//
// Where a check reads SOURCE TEXT rather than driving behaviour it says SOURCE.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

delete process.env.EVE_PUSH_ALLOW;
for (const k of Object.keys(process.env)) if (k.startsWith("RAILWAY_")) delete process.env[k];
delete process.env.CHURLISH_OS_TOKEN;
process.env.EVE_TZ = "America/Chicago";

import {
  runOsEventsPull,
  startOsEventsPull,
  pushWorthy,
  batchPushBody,
  osEventLink,
  cleanTitle,
  renderOsEvents,
  _resetOsEventsForTests,
  MAX_PUSH_WORDS,
  MAX_SEND_FAILURES,
  PULL_LIMIT,
  type PullDeps,
} from "../src/os-events.js";
import { osEventsSince, type OsEvent, type OsEventsPage } from "../src/os.js";
import { sendPush, type SendPushArgs } from "../src/push.js";

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEDULE_SRC = readFileSync(path.join(brainDir, "src", "schedule.ts"), "utf8");
const EVENTS_SRC = readFileSync(path.join(brainDir, "src", "os-events.ts"), "utf8");

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  show.push(`  ${id.padEnd(6)} ${cond ? "PASS" : "****FAIL****"}  ${what}`);
}

// Every console line any scenario prints is captured, so "titles are never
// logged" is checked against what was actually written, not against intent.
const logged: string[] = [];
const realLog = console.log;
const realWarn = console.warn;
console.log = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
console.warn = (...a: unknown[]) => void logged.push(a.map(String).join(" "));

const SECRET_TITLE = "Dana Whitfield <dana@studio.example> — re: contract";
let seq = 0;
function ev(kind: string, extra: Partial<OsEvent> = {}): OsEvent {
  seq += 1;
  return { id: `e${seq}`, at: "2026-09-25T14:05:00Z", kind, title: `${SECRET_TITLE} #${seq}`, detail: "a body nobody logs", link: "/inbox", needs_you: false, client_id: null, ...extra };
}

interface World {
  deps: PullDeps;
  fetches: Array<string | null>;
  saved: string[];
  sent: SendPushArgs[];
  pages: OsEventsPage[];
  stored: { cursor: string | null };
  clock: { quiet: boolean };
  sendThrows: { on: boolean };
  fetchThrows: { on: boolean };
}

function world(opts: { stored?: string | null; pages?: OsEventsPage[]; ready?: boolean } = {}): World {
  _resetOsEventsForTests();
  const w: World = {
    fetches: [],
    saved: [],
    sent: [],
    pages: opts.pages ?? [],
    stored: { cursor: opts.stored ?? null },
    clock: { quiet: false },
    sendThrows: { on: false },
    fetchThrows: { on: false },
    deps: undefined as unknown as PullDeps,
  };
  w.deps = {
    ready: () => opts.ready ?? true,
    fetchPage: async (cursor) => {
      w.fetches.push(cursor);
      if (w.fetchThrows.on) throw new Error("OS answered 503");
      return w.pages.shift() ?? { cursor: cursor ?? "c-empty", events: [], dropped: 0 };
    },
    loadCursor: async () => w.stored.cursor,
    saveCursor: async (c) => {
      w.saved.push(c);
      w.stored.cursor = c;
    },
    quiet: () => w.clock.quiet,
    now: () => new Date("2026-09-25T15:00:00Z"),
    pushReady: () => true,
    token: async () => "fcm-token",
    send: async (_t, args) => {
      if (w.sendThrows.on) throw new Error("fcm unavailable");
      w.sent.push(args);
      return "msg-id";
    },
    osUrl: "https://churlishos.app/",
  };
  return w;
}

async function main() {
  show.push("=== P1 — WIRING: no token, no pull ===");
  {
    const w = world({ ready: false });
    const r = await runOsEventsPull({}, w.deps);
    ok("P1.1", r.outcome === "not-wired" && w.fetches.length === 0 && w.sent.length === 0, "CHURLISH_OS_TOKEN unset → a no-op: no fetch, no push, no cursor");
    logged.length = 0;
    startOsEventsPull();
    ok("P1.2", logged.length === 1 && /\[os_events\] OFF — CHURLISH_OS_TOKEN not set/.test(logged[0]), `…and arming it says so ONCE and arms nothing: "${logged[0]?.slice(0, 70)}"`);
    ok("P1.3", /startOsEventsPull\(\);/.test(SCHEDULE_SRC.slice(SCHEDULE_SRC.indexOf("export function startSchedulers"))), "SOURCE: the pull is armed inside startSchedulers(), so it lives behind schedulersGate() like every other cron");
  }

  show.push("=== P2 — FIRST RUN PRIMES; IT NEVER PUSHES YESTERDAY ===");
  {
    const w = world({ stored: null, pages: [{ cursor: "c-1", events: [ev("lead.created"), ev("invoice.paid")], dropped: 0 }] });
    const r = await runOsEventsPull({}, w.deps);
    ok("P2.1", r.outcome === "primed" && w.fetches[0] === null && w.sent.length === 0 && w.saved.join() === "c-1", `no stored cursor → one fetch with no since (the OS's last 24 h), cursor c-1 stored, ZERO pushes (outcome=${r.outcome})`);
    w.pages.push({ cursor: "c-2", events: [ev("lead.created", { link: "/ledger" })], dropped: 0 });
    const r2 = await runOsEventsPull({}, w.deps);
    ok("P2.2", r2.outcome === "pulled" && w.fetches[1] === "c-1" && w.sent.length === 1, "the next minute pulls FROM c-1 and pushes what is new");
  }

  show.push("=== P3 — ONE BATCHED PUSH PER PULL ===");
  {
    const events = [ev("email.sent"), ev("lead.created", { link: "/inbox?focus=lead" }), ev("invoice.paid", { link: "/ledger" }), ev("booking.created"), ev("proposal.viewed", { needs_you: true })];
    const w = world({ stored: "c-10", pages: [{ cursor: "c-11", events, dropped: 0 }] });
    const r = await runOsEventsPull({}, w.deps);
    const p = w.sent[0];
    ok("P3.1", w.sent.length === 1 && r.pushed === true && r.worthy === 4 && r.events === 5, `5 events, 4 push-worthy → exactly ONE push (sent=${w.sent.length}, worthy=${r.worthy})`);
    ok("P3.2", p?.data.kind === "os_event" && p.data.link === "https://churlishos.app/inbox?focus=lead", `data.kind = "os_event", data.link = CHURLISH_OS_URL + the FIRST push-worthy event's link: ${p?.data.link}`);
    const words = p?.body.split(/\s+/).length ?? 99;
    ok("P3.3", !!p && p.body.startsWith("4 things happened in the OS:") && words <= MAX_PUSH_WORDS, `body is "N things happened in the OS: …", ${words} words (≤ ${MAX_PUSH_WORDS})`);
    ok("P3.4", w.saved.join() === "c-11", "the cursor advances to the OS's c-11 after the push");
  }

  show.push("=== P4 — WHAT PUSHES, AND WHAT ONLY MOVES THE CURSOR ===");
  {
    const yes = ["lead.created", "lead.replied", "invoice.paid", "booking.created", "booking.cancelled", "hlp.guest_booked", "email.held", "email.failed", "sequence.stalled"];
    const no = ["invoice.sent", "email.sent", "proposal.drafted", "house.sweep", "starfire.generated", "leads.imported"];
    ok("P4.1", yes.every((k) => pushWorthy(ev(k))), `these kinds push: ${yes.join(", ")}`);
    ok("P4.2", no.every((k) => !pushWorthy(ev(k))), `these do not: ${no.join(", ")} (note "leads." is not "lead.")`);
    ok("P4.3", pushWorthy(ev("house.sweep", { needs_you: true })), "needs_you:true pushes whatever its kind");
    const w = world({ stored: "c-20", pages: [{ cursor: "c-21", events: [ev("email.sent"), ev("invoice.sent")], dropped: 0 }] });
    const r = await runOsEventsPull({}, w.deps);
    ok("P4.4", w.sent.length === 0 && r.pushed === false && w.saved.join() === "c-21", "a pull with nothing push-worthy sends NOTHING and still advances the cursor");
  }

  show.push("=== P5 — QUIET HOURS HOLD THE CURSOR; THE BATCH GOES OUT AFTER 06:30 ===");
  {
    const w = world({ stored: "c-30", pages: [{ cursor: "c-31", events: [ev("lead.created"), ev("email.held")], dropped: 0 }] });
    w.clock.quiet = true;
    const r = await runOsEventsPull({}, w.deps);
    ok("P5.1", r.outcome === "quiet-hours" && w.fetches.length === 0 && w.sent.length === 0 && w.saved.length === 0 && w.stored.cursor === "c-30", "inside 21:30–06:30: no fetch, no push, and the cursor is HELD at c-30");
    w.clock.quiet = false;
    const r2 = await runOsEventsPull({}, w.deps);
    ok("P5.2", r2.pushed === true && w.sent.length === 1 && w.fetches[0] === "c-30" && w.saved.join() === "c-31", "the first tick after 06:30 pulls from the HELD cursor and sends the night's batch — once");
    const w2 = world({ stored: "c-40", pages: [{ cursor: "c-41", events: [ev("lead.created")], dropped: 0 }] });
    w2.clock.quiet = true;
    const r3 = await runOsEventsPull({ force: true }, w2.deps);
    ok("P5.3", r3.pushed === true && w2.sent.length === 1, "force (POST /job os_events with force:true) skips the hold, like pulse_sweep's force");
    ok("P5.4", /quiet: \(d: Date\) => boolean/.test(EVENTS_SRC) && /quiet: isQuietHours,/.test(EVENTS_SRC), "SOURCE: the live quiet test is schedule.ts isQuietHours — the same 21:30–06:30 pulse.ts uses");
  }

  show.push("=== P6 — A BACKLOG IS PAGED INTO ONE PUSH ===");
  {
    const full = Array.from({ length: PULL_LIMIT }, (_, i) => ev(i === 7 ? "lead.created" : "email.sent"));
    const w = world({ stored: "c-50", pages: [{ cursor: "c-51", events: full, dropped: 0 }, { cursor: "c-52", events: [ev("invoice.paid")], dropped: 0 }] });
    const r = await runOsEventsPull({}, w.deps);
    ok("P6.1", w.fetches.join() === "c-50,c-51" && w.sent.length === 1 && r.worthy === 2 && w.saved.join() === "c-52", `a full page (${PULL_LIMIT}) fetches the next page in the SAME pull; ${r.events} events, 2 push-worthy, ONE push, cursor c-52`);
  }

  show.push("=== P7 — FAILURES HOLD, THEN LET GO ===");
  {
    const w = world({ stored: "c-60", pages: [] });
    w.fetchThrows.on = true;
    const r = await runOsEventsPull({}, w.deps);
    ok("P7.1", r.ok === false && r.outcome === "error" && w.saved.length === 0 && w.sent.length === 0, "an unreachable OS moves nothing — the next minute retries from the same cursor");
    const w2 = world({ stored: "c-70" });
    w2.sendThrows.on = true;
    const outcomes: string[] = [];
    for (let i = 0; i < MAX_SEND_FAILURES; i++) {
      w2.pages.push({ cursor: "c-71", events: [ev("lead.created")], dropped: 0 });
      outcomes.push((await runOsEventsPull({}, w2.deps)).outcome);
    }
    ok("P7.2", outcomes.slice(0, MAX_SEND_FAILURES - 1).every((o) => o === "held-send-failed") && w2.fetches.slice(0, MAX_SEND_FAILURES).every((c) => c === "c-70"), `a failed push HOLDS the cursor and retries the same batch (${outcomes.join(" → ")})`);
    ok("P7.3", outcomes[MAX_SEND_FAILURES - 1] === "pulled" && w2.saved.join() === "c-71", `…and after ${MAX_SEND_FAILURES} failures in a row lets the batch go, so one dead token can't stall the feed forever`);
  }

  show.push("=== P8 — THE PIECES ===");
  {
    const long = [ev("lead.created", { title: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree" }), ev("lead.created", { title: "second lead" })];
    const b = batchPushBody(long);
    ok("P8.1", b.split(/\s+/).length <= MAX_PUSH_WORDS && b.startsWith("2 things happened in the OS: one two"), `a long first title is cut to fit ${MAX_PUSH_WORDS} words: "${b.slice(0, 50)}…" (${b.split(/\s+/).length} words)`);
    ok("P8.2", batchPushBody([ev("lead.created", { title: "New lead: Acme" })]) === "1 thing happened in the OS: New lead: Acme", "one event: \"1 thing happened in the OS: New lead: Acme\"");
    const many = Array.from({ length: 12 }, (_, i) => ev("lead.created", { title: `Lead ${i + 1}` }));
    const bm = batchPushBody(many);
    ok("P8.3", bm.startsWith("12 things happened in the OS: Lead 1; Lead 2;") && bm.split(/\s+/).length <= MAX_PUSH_WORDS, `twelve events: the count is the whole batch, the titles are the first few that fit: "${bm}"`);
    ok("P8.4", osEventLink("https://churlishos.app", "/inbox") === "https://churlishos.app/inbox" && osEventLink("https://churlishos.app/", "/ledger?x=1") === "https://churlishos.app/ledger?x=1", "a path link is prefixed with CHURLISH_OS_URL");
    ok("P8.5", ["//evil.example/x", "https://evil.example", "javascript:alert(1)", "inbox", "/in box"].every((l) => osEventLink("https://churlishos.app", l) === "https://churlishos.app/ledger"), "anything but a same-site path (//host, a URL, javascript:, no leading slash, a space) falls back to /ledger — a push never opens another site");
    ok("P8.6", cleanTitle("line one\nFAKE: cursor: x\u2028more") === "line one FAKE: cursor: x more" && cleanTitle("x".repeat(300)).length === 140, "a title is flattened to one line and capped at 140 chars");
    const page: OsEventsPage = { cursor: "c-99", events: [ev("lead.created", { title: "New lead\ncursor: forged", at: "2026-09-25T13:07:00Z" }), ev("email.sent", { at: "2026-09-25T23:59:00Z" })], dropped: 1 };
    const rendered = renderOsEvents(page, null, "America/Chicago");
    const lines = rendered.split("\n");
    ok("P8.7", lines[1] === "08:07 · New lead cursor: forged (lead.created)" && lines[2].startsWith("18:59 · ") && lines[lines.length - 1] === "cursor: c-99" && lines.filter((l) => l.startsWith("cursor:")).length === 1, `the tool's lines are "HH:MM · title (kind)" in EVE_TZ, and a forged "cursor:" in a title cannot become a line of its own: ${JSON.stringify(lines[1])}`);
    ok("P8.8", /1 malformed event skipped/.test(rendered) && renderOsEvents({ cursor: "c", events: [], dropped: 0 }, "c0").startsWith("OS events since that cursor: nothing new."), "dropped events are counted aloud; an empty pull says nothing new");
  }

  show.push("=== P9 — osEventsSince HOLDS THE CONTRACT ===");
  {
    const realFetch = globalThis.fetch;
    const urls: string[] = [];
    let answer: unknown = {};
    globalThis.fetch = (async (input: unknown) => {
      urls.push(String(input));
      return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;
    process.env.CHURLISH_OS_TOKEN = "harness-token";
    answer = {
      ok: true,
      cursor: "opaque-1",
      events: [
        { id: "a", at: "2026-09-25T14:00:00Z", kind: "lead.created", title: "ok", detail: null, link: "/inbox", needs_you: false, client_id: null },
        { id: "b", at: "not a date", kind: "lead.created", title: "bad at", detail: null, link: "/inbox", needs_you: false, client_id: null },
        { id: "c", at: "2026-09-25T14:00:00Z", kind: "lead.created", title: "no needs_you", detail: null, link: "/inbox", client_id: null },
        "a string",
      ],
    };
    const p = await osEventsSince(null);
    ok("P9.1", p.cursor === "opaque-1" && p.events.length === 1 && p.dropped === 3, `a malformed event is DROPPED and counted, never repaired (kept ${p.events.length}, dropped ${p.dropped})`);
    ok("P9.2", /^https:\/\/[^/]+\/api\/eve\/events\?limit=50$/.test(urls[0]), `no cursor → since omitted: ${urls[0].replace(/^https:\/\/[^/]+/, "")}`);
    await osEventsSince("a b/c", 999);
    ok("P9.3", urls[1].endsWith("/api/eve/events?since=a+b%2Fc&limit=200"), `the cursor is passed back verbatim (form-encoded) and the limit is clamped to 200: ${urls[1].replace(/^https:\/\/[^/]+/, "")}`);
    answer = { ok: true, events: [] };
    let threw = "";
    try {
      await osEventsSince("x");
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }
    ok("P9.4", /no cursor/.test(threw), `an answer with no cursor THROWS ("${threw}") — the pull then moves nothing`);
    delete process.env.CHURLISH_OS_TOKEN;
    let nw = "";
    try {
      await osEventsSince(null);
    } catch (e) {
      nw = e instanceof Error ? e.message : String(e);
    }
    ok("P9.5", /not connected/.test(nw) && urls.length === 3, "no CHURLISH_OS_TOKEN → OsNotConnectedError before any request");
    globalThis.fetch = realFetch;
  }

  show.push("=== P10 — NOTHING ABOUT AN EVENT IS LOGGED ===");
  {
    logged.length = 0;
    const id = await sendPush("fcm-token", { title: "EVE · THE OS", body: `2 things happened in the OS: ${SECRET_TITLE}`, channelId: "nudge", data: { kind: "os_event", attention_id: "e1", deeplink: "eve://ops", link: "https://churlishos.app/inbox" } });
    ok("P10.1", id === "" && logged.length === 1 && !logged[0].includes("Dana") && /titles not logged/.test(logged[0]) && logged[0].includes("https://churlishos.app/inbox"), `the dev send wall prints the os_event push WITHOUT its body: "${logged[0]?.slice(0, 110)}"`);
    logged.length = 0;
    const w = world({ stored: "c-80", pages: [{ cursor: "c-81", events: [ev("lead.created")], dropped: 0 }] });
    w.sendThrows.on = true;
    await runOsEventsPull({}, w.deps);
    w.sendThrows.on = false;
    w.fetchThrows.on = true;
    await runOsEventsPull({}, w.deps);
    const all = logged.join("\n");
    ok("P10.2", logged.length >= 1 && !all.includes("Dana") && !all.includes("a body nobody logs") && !all.includes("c-8"), `every line the pull logged across a failed push and a failed fetch names no title, no detail and no cursor (${logged.length} lines)`);
    ok("P10.3", !/console\.(log|warn|error)\([^)]*(title|body|detail|cursor\b)/.test(EVENTS_SRC.replace(/cursor not (saved|readable)/g, "")), "SOURCE: no console call in os-events.ts interpolates a title, body, detail or cursor");
  }

  console.log = realLog;
  console.warn = realWarn;
  console.log(show.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log = realLog;
  console.warn = realWarn;
  console.error(e);
  process.exit(1);
});
