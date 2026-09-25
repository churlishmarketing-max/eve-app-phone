// EVE's ALERTS MIRROR — King's private Discord #eve-alerts channel (server:
// Backpack), reached through its own incoming WEBHOOK, beside the notebook
// (#eve-notes, notes.ts). Brandon, 2026-09-25: "she can send me information and
// notes either via notification like she does currently AND OR save that
// information / send it via Discord."
//
// So: every push that clears the send wall (push.ts sendPush) is ALSO posted
// here as ONE message — title, body, and the OS link as the last line — when
// its kind is switched on. The phone is the tap; the channel is the record he
// can scroll back through on any device. Notes stay notes (notes.ts, her
// save_note tool); this file never writes to #eve-notes and notes.ts never
// writes here.
//
// THE CONTRACT
//   DISCORD_ALERTS_WEBHOOK_URL  unset → every call is a no-op, no fetch.
//   DISCORD_ALERT_KINDS         unset → DEFAULT_ALERT_KINDS below.
//                               "*"   → every push kind.
//                               "none" or "" (with the URL set) → nothing.
//                               "a,b" → exactly those push kinds.
//   Rate: at most one message per kind per RATE_WINDOW_MS, except brief and
//   closeout (once a day each by construction, and never worth dropping).
//
// NEVER BLOCKS, NEVER THROWS. sendPush does not await the mirror; the post has
// a 10-second deadline; any failure is ONE log line naming the kind and an
// HTTP status or "timeout"/"network error" — never the body, the title, the
// link or the webhook URL (a webhook URL IS the credential: anyone holding it
// can post to the channel).
//
// QUIET HOURS follow the push. Every caller of sendPush holds its own push
// through 21:30–06:30 (brief, closeout, tripwire, pulse, routines, the OS
// pull's held cursor), and the mirror only ever fires from inside sendPush —
// so a push held overnight is mirrored in the morning, when it goes.

const LIMIT = 2000; // Discord's hard per-message character cap — exceeding it 400s
export const BODY_MAX = 1900;
const TITLE_MAX = 200;
const LINK_MAX = 300;
export const RATE_WINDOW_MS = 60_000;
export const TIMEOUT_MS = 10_000;
export const DEFAULT_ALERT_KINDS: readonly string[] = [
  "brief",
  "closeout",
  "tripwire",
  "silent_client",
  "approval",
  "routine_risk",
  "os_event",
];
/** Kinds the per-kind rate guard never holds back. */
const UNLIMITED: ReadonlySet<string> = new Set(["brief", "closeout"]);

function webhook(): string | undefined {
  return process.env.DISCORD_ALERTS_WEBHOOK_URL || undefined;
}

export interface AlertKinds {
  all: boolean;
  kinds: ReadonlySet<string>;
}

/** DISCORD_ALERT_KINDS → which push kinds mirror. Unset = the default list. */
export function parseAlertKinds(raw: string | undefined): AlertKinds {
  if (raw === undefined) return { all: false, kinds: new Set(DEFAULT_ALERT_KINDS) };
  const items = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (items.includes("*")) return { all: true, kinds: new Set() };
  if (!items.length || (items.length === 1 && items[0] === "none")) return { all: false, kinds: new Set() };
  return { all: false, kinds: new Set(items.filter((k) => k !== "none")) };
}

function alertKinds(): AlertKinds {
  return parseAlertKinds(process.env.DISCORD_ALERT_KINDS);
}

export function alertKindEnabled(kind: string): boolean {
  const k = alertKinds();
  return k.all || k.kinds.has(kind.toLowerCase());
}

function kindsLabel(k: AlertKinds): string {
  if (k.all) return "*";
  return k.kinds.size ? [...k.kinds].join(",") : "none";
}

export function discordAlertsReady(): boolean {
  return !!webhook();
}

export function discordAlertsStatusDetail(): string {
  return discordAlertsReady()
    ? `webhook set → Discord #eve-alerts (kinds: ${kindsLabel(alertKinds())})`
    : "needs DISCORD_ALERTS_WEBHOOK_URL (Discord → #eve-alerts → Integrations → Webhooks)";
}

/** The one boot line for both Discord channels. States only — never a URL. */
export function discordBanner(notesOn: boolean): string {
  const alerts = discordAlertsReady() ? `on (kinds: ${kindsLabel(alertKinds())})` : "off";
  return `[discord] notes: ${notesOn ? "on" : "off"} · alerts: ${alerts}`;
}

function oneLine(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
}

function cap(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * The OS page a mirrored alert links to. An absolute http(s) URL is kept; a
 * same-site path is put under CHURLISH_OS_URL; anything else is omitted.
 */
export function mirrorLink(link: string | null | undefined): string | null {
  const l = (link ?? "").trim();
  if (!l || /\s/.test(l)) return null;
  if (/^https?:\/\/[^/\s]+/i.test(l)) return l.length <= LINK_MAX ? l : null;
  if (/^\/(?!\/)/.test(l)) {
    const base = (process.env.CHURLISH_OS_URL || "https://churlishos.app").replace(/\/+$/, "");
    const abs = `${base}${l}`;
    return abs.length <= LINK_MAX ? abs : null;
  }
  return null;
}

/**
 * ONE message: "**title**", the body (≤ BODY_MAX, and less if the title and
 * link need the room), then the link as its own last line. Always ≤ 2000
 * characters; anything cut ends in "…".
 */
export function formatAlert(title: string, body: string, link?: string | null): string {
  const head = `**${cap(oneLine(title) || "EVE", TITLE_MAX)}**`;
  const tail = link ? `\n${link}` : "";
  const room = LIMIT - head.length - 1 - tail.length;
  const text = cap(body.trim(), Math.min(BODY_MAX, room));
  const msg = `${head}${text ? `\n${text}` : ""}${tail}`;
  return msg.length <= LIMIT ? msg : cap(msg, LIMIT);
}

// Per-kind last-post times, in process memory (the same shape as the other
// in-memory guards in this brain: a restart forgets, which only ever allows).
const lastPost = new Map<string, number>();
const inFlight = new Set<Promise<MirrorResult>>();

/** Harness seams. Never called by the server. */
export function _resetDiscordForTests(): void {
  lastPost.clear();
}
export async function _drainDiscordForTests(): Promise<void> {
  while (inFlight.size) await Promise.all([...inFlight]);
}

export interface MirrorResult {
  /** "off" | "kind-off" | "rate-limited" | "sent" | "failed" */
  outcome: string;
  status?: number;
}

async function post(url: string, kind: string, content: string): Promise<MirrorResult> {
  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // allowed_mentions: none — a client name or email subject in a body must
      // never be able to ping @everyone in his server.
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: ac.signal,
    });
    if (!r.ok) {
      console.warn(`[discord] alert not mirrored (kind=${kind}): HTTP ${r.status}`);
      return { outcome: "failed", status: r.status };
    }
    return { outcome: "sent", status: r.status };
  } catch (e) {
    const why = ac.signal.aborted || (e as { name?: string })?.name === "AbortError" ? "timeout" : "network error";
    console.warn(`[discord] alert not mirrored (kind=${kind}): ${why}`);
    return { outcome: "failed", status: 0 };
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * Mirror one alert to #eve-alerts. Returns a promise that NEVER rejects; the
 * live caller (sendPush) does not await it. The checks (URL, kind, rate) run
 * synchronously, so the rate stamp is taken before any await and two pushes of
 * one kind in the same tick cannot both slip through.
 */
export function mirrorToDiscord(kind: string, title: string, body: string, link?: string | null): Promise<MirrorResult> {
  try {
    const url = webhook();
    if (!url) return Promise.resolve({ outcome: "off" });
    if (!alertKindEnabled(kind)) return Promise.resolve({ outcome: "kind-off" });
    const now = Date.now();
    if (!UNLIMITED.has(kind)) {
      const last = lastPost.get(kind);
      if (last !== undefined && now - last < RATE_WINDOW_MS) {
        console.log(`[discord] alert held by the ${RATE_WINDOW_MS / 1000}s guard (kind=${kind})`);
        return Promise.resolve({ outcome: "rate-limited" });
      }
    }
    lastPost.set(kind, now);
    const p = post(url, kind, formatAlert(title, body, mirrorLink(link))).catch((): MirrorResult => ({ outcome: "failed" }));
    inFlight.add(p);
    void p.finally(() => inFlight.delete(p));
    return p;
  } catch {
    console.warn(`[discord] alert not mirrored (kind=${kind}): internal error`);
    return Promise.resolve({ outcome: "failed" });
  }
}
