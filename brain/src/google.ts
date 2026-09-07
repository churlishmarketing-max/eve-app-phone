import { google as g } from "googleapis";

// firebase-admin pins a different google-auth-library major than the copy
// nested in googleapis-common, so naming OAuth2Client from either package
// mismatches the other. Derive the type from googleapis' own re-export —
// always the copy its APIs accept.
type GAuth = InstanceType<typeof g.auth.OAuth2>;

// Gmail + Calendar for a single user (Brandon's own account) via an OAuth2
// refresh token. Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN (minted once via scripts/google-auth.mjs).
// Absent env → tools degrade honestly; nothing crashes.

export class NotConnectedError extends Error {
  constructor(public service: string, public hint: string) {
    super(`${service} not connected`);
  }
}

const TZ = process.env.EVE_TZ || "America/Chicago";

let cachedAuth: GAuth | null = null;

function envReady(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

export const gmailReady = envReady;
export const calendarReady = envReady;

export function statusDetail(_key: "gmail" | "gcal"): string {
  return envReady() ? "OAuth refresh token set" : "needs GOOGLE_CLIENT_ID / _SECRET / _REFRESH_TOKEN (run scripts/google-auth.mjs)";
}

function auth(): GAuth {
  if (!envReady()) {
    throw new NotConnectedError("Google", "Gmail/Calendar need the one-time OAuth consent — see RUNBOOK_phase3.md");
  }
  if (!cachedAuth) {
    const client = new g.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    cachedAuth = client;
  }
  return cachedAuth;
}

export function explainError(e: unknown): string {
  if (e instanceof NotConnectedError) {
    return `${e.service} isn't wired up yet (${e.hint}). Say exactly that — don't guess at mail or calendar content.`;
  }
  return `Google call failed: ${e instanceof Error ? e.message : String(e)}`;
}

// ---- Gmail ----

function header(headers: { name?: string | null; value?: string | null }[] | undefined, name: string): string {
  return headers?.find((h) => (h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
}

async function listMessages(q: string, max: number): Promise<string> {
  const gmail = g.gmail({ version: "v1", auth: auth() });
  const list = await gmail.users.messages.list({ userId: "me", q, maxResults: max });
  const ids = list.data.messages ?? [];
  if (ids.length === 0) return `No messages match (${q}).`;
  const rows = await Promise.all(
    ids.map(async ({ id }) => {
      const m = await gmail.users.messages.get({
        userId: "me",
        id: id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const h = m.data.payload?.headers ?? undefined;
      return `- ${header(h, "From")} · "${header(h, "Subject")}" · ${header(h, "Date")}\n  ${m.data.snippet ?? ""}`;
    }),
  );
  return rows.join("\n");
}

export function listUnread(max: number): Promise<string> {
  return listMessages("is:unread in:inbox", max);
}

export function searchMail(q: string, max: number): Promise<string> {
  return listMessages(q, max);
}

function rfc822(to: string, subject: string, body: string): string {
  const raw = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', "", body].join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

export async function createDraft(to: string, subject: string, body: string): Promise<string> {
  const gmail = g.gmail({ version: "v1", auth: auth() });
  const d = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw: rfc822(to, subject, body) } },
  });
  return `Draft created in Gmail (id ${d.data.id}) — to ${to}, "${subject}". It will NOT send itself.`;
}

export async function sendMail(to: string, subject: string, body: string): Promise<string> {
  // Reached ONLY through confirm.ts resolution (RED tier, 02 §6).
  const gmail = g.gmail({ version: "v1", auth: auth() });
  const r = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: rfc822(to, subject, body) },
  });
  return `Sent (message id ${r.data.id}).`;
}

// ---- Calendar ----

export async function listEvents(days: number): Promise<string> {
  const cal = g.calendar({ version: "v3", auth: auth() });
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 3600_000);
  const r = await cal.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 25,
  });
  const items = r.data.items ?? [];
  if (items.length === 0) return `Calendar is clear for the next ${days === 1 ? "day" : days + " days"}.`;

  // Collapse exact duplicates (same title, same start). Real calendars
  // accumulate them from bad syncs — King's had the same 3:30 meeting eight
  // times over. Distinct event ids, so Google won't dedupe for us. Nobody
  // needs to read a meeting eight times, and it poisons her context window.
  const seen = new Map<string, number>();
  const unique: typeof items = [];
  for (const e of items) {
    const key = `${e.summary ?? ""}|${e.start?.dateTime || e.start?.date || ""}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 1) unique.push(e);
  }

  return unique
    .map((e) => {
      const start = e.start?.dateTime || e.start?.date || "?";
      const when = e.start?.dateTime
        ? new Date(start).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" })
        : `${start} (all day)`;
      const key = `${e.summary ?? ""}|${start}`;
      const dupes = seen.get(key) ?? 1;
      // Surface the duplication rather than hiding it — it's a real problem
      // with his calendar data, and silently swallowing it would be dishonest.
      const dupNote = dupes > 1 ? ` [⚠ ${dupes} duplicate copies of this event exist on the calendar]` : "";
      return `- ${when} · ${e.summary ?? "(untitled)"}${e.location ? " @ " + e.location : ""}${dupNote}`;
    })
    .join("\n");
}

export async function createEvent(
  title: string,
  startIso: string,
  endIso: string,
  description?: string,
  attendees?: string[],
): Promise<string> {
  for (const [label, v] of [["start", startIso], ["end", endIso]] as const) {
    if (isNaN(new Date(v).getTime())) throw new Error(`invalid ${label} datetime: ${v}`);
  }
  const cal = g.calendar({ version: "v3", auth: auth() });
  const r = await cal.events.insert({
    calendarId: "primary",
    sendUpdates: attendees?.length ? "all" : "none",
    requestBody: {
      summary: title,
      description,
      start: { dateTime: startIso, timeZone: TZ },
      end: { dateTime: endIso, timeZone: TZ },
      ...(attendees?.length ? { attendees: attendees.map((email) => ({ email })) } : {}),
    },
  });
  return `Event created: "${title}" — ${r.data.htmlLink ?? r.data.id}`;
}

// ---------------------------------------------------------------------------
// STRUCTURED READS — the seam the reader (mail.ts) is built on.
//
// Everything above returns a PRE-FORMATTED STRING with the formatting baked in,
// which is useless to a triage pass: it cannot rank what it cannot address as
// fields. These return DATA instead, and they are deliberately the only new
// Google surface — `MailSource` is an interface so verify/reader-harness.ts can
// drive the shipped rendering and triage code with a fake client and never
// touch King's real mailbox. There is no module-level state here and no way to
// swap the real source globally; a caller passes the source it wants.
// ---------------------------------------------------------------------------

/** One message, as the provider hands it over. EVERY string field here is attacker-controlled. */
export interface RawMessage {
  id: string;
  /** Raw `From` header — a display name the SENDER chose, plus their address. Untrusted. */
  from: string;
  subject: string;
  /** RFC date header as sent. Untrusted and frequently a lie; parse defensively. */
  date: string;
  /** Gmail's preview of the BODY. This is the most dangerous field on the object. */
  snippet: string;
}

/** One event. `summary`, `location`, `description` and attendee names are written by whoever sent the invite. */
export interface RawEvent {
  id: string;
  summary: string;
  location: string;
  description: string;
  /** ISO datetime, or a bare YYYY-MM-DD for an all-day event. */
  start: string;
  end: string;
  allDay: boolean;
  attendees: string[];
}

/**
 * The read surface the reader depends on. The real implementation is
 * `googleSource()`; the harness supplies a fake with the same shape.
 */
export interface MailSource {
  unread(max: number): Promise<RawMessage[]>;
  events(days: number): Promise<RawEvent[]>;
}

// Test seam (verify/clock-harness.ts): swap in a fake read surface so the
// CONTEXT PACK's untrusted half can be proven end-to-end without a network and
// without ever touching King's real mailbox. Never called by the server.
let sourceForTests: MailSource | null = null;
export function _setGoogleSourceForTests(s: MailSource | null): void {
  sourceForTests = s;
}

export function googleSource(): MailSource {
  if (sourceForTests) return sourceForTests;
  return {
    async unread(max: number): Promise<RawMessage[]> {
      const gmail = g.gmail({ version: "v1", auth: auth() });
      const list = await gmail.users.messages.list({ userId: "me", q: "is:unread in:inbox", maxResults: max });
      const ids = list.data.messages ?? [];
      return Promise.all(
        ids.map(async ({ id }) => {
          const m = await gmail.users.messages.get({
            userId: "me",
            id: id!,
            format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"],
          });
          const h = m.data.payload?.headers ?? undefined;
          return {
            id: id ?? "",
            from: header(h, "From"),
            subject: header(h, "Subject"),
            date: header(h, "Date"),
            snippet: m.data.snippet ?? "",
          };
        }),
      );
    },
    async events(days: number): Promise<RawEvent[]> {
      const cal = g.calendar({ version: "v3", auth: auth() });
      const now = new Date();
      const end = new Date(now.getTime() + days * 24 * 3600_000);
      const r = await cal.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 25,
      });
      return (r.data.items ?? []).map((e) => ({
        id: e.id ?? "",
        summary: e.summary ?? "",
        location: e.location ?? "",
        description: e.description ?? "",
        start: e.start?.dateTime || e.start?.date || "",
        end: e.end?.dateTime || e.end?.date || "",
        allDay: !e.start?.dateTime,
        attendees: (e.attendees ?? []).map((a) => a.displayName || a.email || "").filter(Boolean),
      }));
    },
  };
}
