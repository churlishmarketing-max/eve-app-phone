import cron from "node-cron";
import { db } from "./db.js";
import * as os from "./os.js";
import type { OsEvent, OsEventsPage } from "./os.js";
import { isQuietHours } from "./schedule.js";
import { sendPush, getLatestToken, isPushReady, type SendPushArgs } from "./push.js";
import { stamp } from "./health.js";

// ONE HOUSE STEP 4c · 4.3 / 4.4 — THE MINUTE PULL THAT PUSHES.
//
// The OS writes one Ledger-shaped line per thing that happened in the house (a
// lead landed, an invoice was paid, a booking came in, an email was held at the
// send gate …). Once a minute, on the hosted brain only, this pulls whatever is
// new since the last cursor (os.osEventsSince) and — when any of it is the kind
// of thing he wants on his phone — sends ONE batched push for the whole pull.
// Never one push per event.
//
// WHAT PUSHES: an event with needs_you:true, or whose kind starts with one of
// PUSH_KIND_PREFIXES. Everything else only advances the cursor. The body is
// built here, word-counted, with no model call: "N things happened in the OS:
// <first titles>", at most 25 words. The tap opens the FIRST pushing event's
// page on the OS (data.link = CHURLISH_OS_URL + its link); data.kind is
// "os_event".
//
// QUIET HOURS (21:30–06:30, the same isQuietHours pulse.ts uses) — THE CURSOR IS
// HELD. Inside the window the pull does not run at all: no fetch, no push, no
// cursor move. The first tick after 06:30 drains the night (paging up to
// MAX_PAGES) and sends the ONE batch then. The other choice — advance the
// cursor at night and drop the push — would lose "a lead came in at 23:10"
// entirely; the brief does not carry OS events, so nothing else would tell him.
//
// FIRST RUN — PRIME, DON'T PUSH. With no stored cursor the OS answers the last
// 24 hours. Those are history, not news, and the 07:00 brief covers them; the
// first pull stores the cursor and pushes nothing. The same holds when the
// cursor store is unreachable after a restart — a missing cursor fails QUIET,
// never as a replay of yesterday on his lock screen.
//
// THE CURSOR lives in app_state (sql/002 — the brain's existing durable
// key/value, the same place the wardrobe and the BODY ladder keep theirs) under
// OS_EVENTS_CURSOR_KEY, and in memory for the life of the process so a failed
// write never re-pushes a batch. No migration.
//
// NEVER LOGGED: an event's title or detail, the push body, the cursor's value.
// The log says counts and kinds of outcome, nothing else.

export const OS_EVENTS_CURSOR_KEY = "os.events_cursor";
export const PULL_LIMIT = 50;
export const MAX_PAGES = 10;
export const MAX_PUSH_WORDS = 25;
/** After this many consecutive failed sends the batch is let go, so one bad token can't hold the feed forever. */
export const MAX_SEND_FAILURES = 3;

export const PUSH_KIND_PREFIXES: readonly string[] = [
  "lead.",
  "invoice.paid",
  "booking.",
  "hlp.",
  "email.held",
  "email.failed",
  "sequence.stalled",
];

export function pushWorthy(e: OsEvent): boolean {
  return e.needs_you === true || PUSH_KIND_PREFIXES.some((p) => e.kind.startsWith(p));
}

/** One line, bounded — a title is third-party text and must not be able to forge a second line anywhere it lands. */
export function cleanTitle(t: string, max = 140): string {
  const one = t.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one || "(untitled)";
}

/** "N things happened in the OS: a; b; c" — at most MAX_PUSH_WORDS words, first titles first. */
export function batchPushBody(events: OsEvent[]): string {
  const n = events.length;
  const head = `${n} ${n === 1 ? "thing" : "things"} happened in the OS:`;
  const words = head.split(" ");
  const titles: string[] = [];
  for (const e of events) {
    const tw = cleanTitle(e.title).split(" ");
    const sep = titles.length ? 1 : 0;
    if (words.length + titles.join(" ").split(" ").filter(Boolean).length + tw.length + sep > MAX_PUSH_WORDS) {
      // The title does not fit whole. If nothing is listed yet, fit what we can.
      if (!titles.length) titles.push(tw.slice(0, MAX_PUSH_WORDS - words.length).join(" ") + "…");
      break;
    }
    titles.push(tw.join(" "));
  }
  const body = `${head} ${titles.join("; ")}`;
  const all = body.split(/\s+/);
  return all.length <= MAX_PUSH_WORDS ? body : all.slice(0, MAX_PUSH_WORDS).join(" ");
}

/** The OS page a tap opens. Only a same-site PATH is honoured; anything else falls back to the Ledger. */
export function osEventLink(osUrl: string, link: string): string {
  const base = osUrl.replace(/\/+$/, "");
  const safe = /^\/(?!\/)[A-Za-z0-9/_\-?=&.%#]*$/.test(link) ? link : "/ledger";
  return `${base}${safe}`;
}

/** Everything the pull touches, injectable so verify/os-events-harness.ts drives it with no network, no DB, no FCM. */
export interface PullDeps {
  ready: () => boolean;
  fetchPage: (cursor: string | null, limit: number) => Promise<OsEventsPage>;
  loadCursor: () => Promise<string | null>;
  saveCursor: (cursor: string) => Promise<void>;
  quiet: (d: Date) => boolean;
  now: () => Date;
  pushReady: () => boolean;
  token: () => Promise<string | null>;
  send: (token: string, args: SendPushArgs) => Promise<string>;
  osUrl: string;
}

export interface PullResult {
  ok: boolean;
  /** "not-wired" | "quiet-hours" | "primed" | "pulled" | "held-send-failed" | "error" */
  outcome: string;
  events: number;
  worthy: number;
  pushed: boolean;
  dropped: number;
  error?: string;
}

async function loadCursorFromDb(): Promise<string | null> {
  const c = db();
  if (!c) return null;
  const { data, error } = await c.from("app_state").select("value").eq("key", OS_EVENTS_CURSOR_KEY).maybeSingle();
  if (error) throw new Error(`cursor read failed: ${error.message}`);
  const v = (data?.value ?? null) as { cursor?: unknown } | null;
  return v && typeof v.cursor === "string" && v.cursor ? v.cursor : null;
}

async function saveCursorToDb(cursor: string): Promise<void> {
  const c = db();
  if (!c) return;
  const { error } = await c
    .from("app_state")
    .upsert({ key: OS_EVENTS_CURSOR_KEY, value: { cursor }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`cursor write failed: ${error.message}`);
}

export function liveDeps(): PullDeps {
  return {
    ready: os.ready,
    fetchPage: (cursor, limit) => os.osEventsSince(cursor, limit),
    loadCursor: loadCursorFromDb,
    saveCursor: saveCursorToDb,
    quiet: isQuietHours,
    now: () => new Date(),
    pushReady: isPushReady,
    token: getLatestToken,
    send: sendPush,
    osUrl: process.env.CHURLISH_OS_URL || "https://churlishos.app",
  };
}

// Process memory: the cursor as last advanced here (null = not yet loaded), and
// the run of failed sends on the batch currently held.
const mem: { cursor: string | null; loaded: boolean; sendFailures: number } = { cursor: null, loaded: false, sendFailures: 0 };

/** Harness seam: forget the in-process cursor. Never called by the server. */
export function _resetOsEventsForTests(): void {
  mem.cursor = null;
  mem.loaded = false;
  mem.sendFailures = 0;
}

async function remember(deps: PullDeps, cursor: string): Promise<void> {
  mem.cursor = cursor;
  try {
    await deps.saveCursor(cursor);
  } catch (e) {
    // The in-memory cursor still moved, so this process never re-pushes the batch.
    console.warn("[os_events] cursor not saved (kept in memory):", e instanceof Error ? e.message : String(e));
  }
}

export async function runOsEventsPull(opts: { force?: boolean } = {}, deps: PullDeps = liveDeps()): Promise<PullResult> {
  const base = { events: 0, worthy: 0, pushed: false, dropped: 0 };
  if (!deps.ready()) return { ok: true, outcome: "not-wired", ...base };
  if (!opts.force && deps.quiet(deps.now())) return { ok: true, outcome: "quiet-hours", ...base };

  try {
    if (!mem.loaded) {
      mem.cursor = await deps.loadCursor().catch((e: unknown) => {
        console.warn("[os_events] cursor not readable, priming:", e instanceof Error ? e.message : String(e));
        return null;
      });
      mem.loaded = true;
    }
    const start = mem.cursor;

    // Drain in pages so a night's backlog is ONE batch, not one push per page.
    let cursor = start;
    const seen: OsEvent[] = [];
    let dropped = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const p = await deps.fetchPage(cursor, PULL_LIMIT);
      seen.push(...p.events);
      dropped += p.dropped;
      const moved = p.cursor !== cursor;
      cursor = p.cursor;
      if (p.events.length + p.dropped < PULL_LIMIT || !moved) break;
    }

    if (start === null) {
      // FIRST RUN (or an unreadable store): prime, never push the last 24 h.
      if (cursor !== null) await remember(deps, cursor);
      return { ok: true, outcome: "primed", ...base, events: seen.length, dropped };
    }

    const worthy = seen.filter(pushWorthy);
    let pushed = false;
    if (worthy.length && deps.pushReady()) {
      const token = await deps.token();
      if (token) {
        const first = worthy[0];
        try {
          const id = await deps.send(token, {
            title: "EVE · THE OS",
            body: batchPushBody(worthy),
            channelId: "nudge",
            data: { kind: "os_event", attention_id: first.id, deeplink: "eve://ops", link: osEventLink(deps.osUrl, first.link) },
          });
          pushed = !!id;
          mem.sendFailures = 0;
        } catch (e) {
          mem.sendFailures += 1;
          console.warn(`[os_events] push failed (${mem.sendFailures}/${MAX_SEND_FAILURES}):`, e instanceof Error ? e.message : String(e));
          if (mem.sendFailures < MAX_SEND_FAILURES) {
            // HOLD the cursor: the same batch is retried next minute.
            return { ok: false, outcome: "held-send-failed", ...base, events: seen.length, worthy: worthy.length, dropped, error: "push failed" };
          }
          mem.sendFailures = 0; // let this batch go rather than hold the feed forever
        }
      }
    }
    if (cursor !== null && cursor !== start) await remember(deps, cursor);
    return { ok: true, outcome: "pulled", events: seen.length, worthy: worthy.length, pushed, dropped };
  } catch (e) {
    // An unreachable OS moves nothing; the next minute tries again from the same cursor.
    return { ok: false, outcome: "error", ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Arm the minute pull. Called from startSchedulers(), so it only ever runs where
 * schedulersGate() says ON. With no CHURLISH_OS_TOKEN it arms nothing and says
 * so once.
 */
export function startOsEventsPull(): void {
  if (!os.ready()) {
    console.log("[os_events] OFF — CHURLISH_OS_TOKEN not set; the minute OS pull is a no-op on this brain.");
    return;
  }
  let running = false;
  cron.schedule("* * * * *", () => {
    if (running) return; // a slow OS never stacks two pulls
    running = true;
    runOsEventsPull()
      .then((r) => {
        stamp("os_events", { ok: r.ok, outcome: r.outcome, events: r.events, worthy: r.worthy, pushed: r.pushed });
        if (r.outcome === "error") console.warn("[os_events] pull failed:", r.error);
        else if (r.events || r.pushed) console.log(`[os_events] ${r.outcome}: ${r.events} events, ${r.worthy} push-worthy, pushed=${r.pushed}`);
      })
      .catch((e) => console.error("[os_events] error", e instanceof Error ? e.message : String(e)))
      .finally(() => {
        running = false;
      });
  });
  console.log("[os_events] armed: every minute, one batched push per pull; held through quiet hours 21:30–06:30");
}

/**
 * What the os_events_since tool hands her: one short line per event,
 * "HH:MM · title (kind)" in EVE_TZ, oldest first as the OS sent them, then the
 * cursor to pass back as `since` next time. Titles go through cleanTitle, so
 * no title can forge a second line or pose as the cursor.
 */
export function renderOsEvents(page: OsEventsPage, since: string | null, tz = process.env.EVE_TZ || "America/Chicago"): string {
  const hhmm = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const head = since ? "OS events since that cursor" : "OS events, last 24 hours";
  const lines = page.events.map((e) => `${hhmm(e.at)} · ${cleanTitle(e.title)} (${cleanTitle(e.kind, 60)})${e.needs_you ? " · needs you" : ""}`);
  const body = lines.length ? `${head} (${lines.length}):\n${lines.join("\n")}` : `${head}: nothing new.`;
  const dropped = page.dropped ? `\n(${page.dropped} malformed event${page.dropped === 1 ? "" : "s"} skipped.)` : "";
  return `${body}${dropped}\ncursor: ${page.cursor}`;
}
