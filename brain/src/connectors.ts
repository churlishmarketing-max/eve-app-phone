import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { requestConfirm, type PendingConfirm } from "./confirm.js";
import { listLooks, getWearing, resolveLook, setWearing } from "./wardrobe.js";
import { recentTexts, recentNotifications } from "./senses.js";
import * as google from "./google.js";
import * as os from "./os.js";
import { fleetRoster } from "./fleet.js";
import { runDispatch } from "./dispatch.js";
// Notion / Slack / Stripe connectors retired 2026-07-17 (King's call): the OS
// is the single spine now — client, money, and deal data all reach her through
// os_board / os_command, so a separate Stripe read or Slack/Notion tool is
// redundant surface. The modules stay on disk, just unwired.

// EVE's hands (Phase 3, 02 §1): Gmail, Calendar, Notion, Slack, Stripe —
// plus her senses (Phase 4, 05 §7): SMS + notifications the app forwards.
// Tier law (01 §7, 02 §6), enforced in code:
//   🟢 GREEN  — reads + drafts + own-calendar events: execute freely.
//   🔴 RED    — anything leaving the building (send_email, send_sms, event
//               WITH attendees since invites email out): requestConfirm() only.
// Every connector degrades honestly when its keys are absent — the tool
// answers "not connected" so EVE can say exactly that, in character.

export interface ConnectorStatus {
  key: string;
  name: string;
  connected: boolean;
  detail: string;
}

export function getConnectorStatus(): ConnectorStatus[] {
  return [
    { key: "gmail", name: "Gmail", connected: google.gmailReady(), detail: google.statusDetail("gmail") },
    { key: "gcal", name: "Google Calendar", connected: google.calendarReady(), detail: google.statusDetail("gcal") },
    { key: "churlish_os", name: "Churlish OS", connected: os.ready(), detail: os.statusDetail() },
    { key: "deepgram", name: "Deepgram (voice in)", connected: !!process.env.DEEPGRAM_API_KEY, detail: process.env.DEEPGRAM_API_KEY ? "key set" : "DEEPGRAM_API_KEY not set" },
    { key: "elevenlabs", name: "ElevenLabs (voice out)", connected: !!process.env.ELEVENLABS_API_KEY, detail: process.env.ELEVENLABS_API_KEY ? "key set" : "ELEVENLABS_API_KEY not set" },
  ];
}

function text(s: string, isError = false) {
  return { content: [{ type: "text" as const, text: s }], ...(isError ? { isError: true } : {}) };
}

// Tool names the model sees — kept in sync with the definitions below and
// re-passed to allowedTools on every query (chat.ts).
export const connectorToolNames = [
  "mcp__eve_hands__gmail_unread",
  "mcp__eve_hands__gmail_search",
  "mcp__eve_hands__gmail_create_draft",
  "mcp__eve_hands__gmail_send",
  "mcp__eve_hands__calendar_view",
  "mcp__eve_hands__calendar_create_event",
  "mcp__eve_hands__list_looks",
  "mcp__eve_hands__wear_look",
  "mcp__eve_hands__read_texts",
  "mcp__eve_hands__read_notifications",
  "mcp__eve_hands__send_sms",
  "mcp__eve_hands__os_board",
  "mcp__eve_hands__os_clients",
  "mcp__eve_hands__fleet_roster",
  "mcp__eve_hands__os_command",
  "mcp__eve_hands__os_draft_proposal",
  "mcp__eve_hands__os_draft_email",
  "mcp__eve_hands__os_create_invoice",
  "mcp__eve_hands__os_send_pending_email",
  "mcp__eve_hands__dispatch_fleet",
];

export function buildConnectorServer(emitConfirm: (c: PendingConfirm) => void) {
  return createSdkMcpServer({
    name: "eve_hands",
    version: "1.0.0",
    tools: [
      // ---- Gmail (🟢 reads, 🟢 draft, 🔴 send) ----
      tool(
        "gmail_unread",
        "List King's unread email (from, subject, one-line gist each). GREEN — read-only.",
        { max: z.number().int().min(1).max(25).default(10).describe("How many to list") },
        async ({ max }) => {
          try {
            return text(await google.listUnread(max));
          } catch (e) {
            return text(google.explainError(e), true);
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "gmail_search",
        "Search King's mailbox (Gmail query syntax ok: from:, subject:, newer_than:7d). GREEN — read-only.",
        { query: z.string().describe("Gmail search query"), max: z.number().int().min(1).max(25).default(10) },
        async ({ query: q, max }) => {
          try {
            return text(await google.searchMail(q, max));
          } catch (e) {
            return text(google.explainError(e), true);
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "gmail_create_draft",
        "Create a DRAFT in King's Gmail (never sends — he reviews in Gmail or approves a send separately). " +
          "GREEN. Write the body fully in his voice; flag assumptions inline with [brackets].",
        {
          to: z.string().describe("Recipient email"),
          subject: z.string(),
          body: z.string().describe("Plain-text body, complete and send-ready"),
        },
        async ({ to, subject, body }) => {
          try {
            return text(await google.createDraft(to, subject, body));
          } catch (e) {
            return text(google.explainError(e), true);
          }
        },
      ),
      tool(
        "gmail_send",
        "Queue an email SEND. RED tier — this NEVER sends directly: it queues the exact payload for King's " +
          "explicit confirmation (a confirm card in the app). Tell him it's queued and awaiting his approve. " +
          "Use only when he asked to send; otherwise create a draft.",
        {
          to: z.string().describe("Recipient email"),
          subject: z.string(),
          body: z.string().describe("Plain-text body — EXACTLY what will be sent"),
        },
        async ({ to, subject, body }) => {
          const payload = { to, subject, body };
          const pending = requestConfirm(
            "send_email",
            `Email to ${to}: "${subject}"`,
            payload,
            () => google.sendMail(to, subject, body),
          );
          emitConfirm(pending);
          return text(
            `Queued for King's confirmation (id ${pending.id}). NOT sent. He must approve the confirm card; ` +
              `it expires ${pending.expiresAt}.`,
          );
        },
      ),
      // ---- Calendar (🟢 read, 🟢 own events / 🔴 with attendees) ----
      tool(
        "calendar_view",
        "King's calendar: events for today or the coming days. GREEN — read-only.",
        { days: z.number().int().min(1).max(14).default(1).describe("How many days ahead (1 = today)") },
        async ({ days }) => {
          try {
            return text(await google.listEvents(days));
          } catch (e) {
            return text(google.explainError(e), true);
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "calendar_create_event",
        "Create a calendar event. GREEN when it's just King's own calendar. If attendees are included, " +
          "invites would EMAIL OUT — that's RED: the event is queued for his confirmation instead.",
        {
          title: z.string(),
          startIso: z.string().describe("Start datetime, ISO 8601 with timezone offset"),
          endIso: z.string().describe("End datetime, ISO 8601"),
          description: z.string().optional(),
          attendees: z.array(z.string()).optional().describe("Attendee emails — triggers RED confirm"),
        },
        async ({ title, startIso, endIso, description, attendees }) => {
          if (attendees && attendees.length > 0) {
            const payload = { title, startIso, endIso, description: description ?? "", attendees };
            const pending = requestConfirm(
              "calendar_invite",
              `Event "${title}" inviting ${attendees.join(", ")}`,
              payload,
              () => google.createEvent(title, startIso, endIso, description, attendees),
            );
            emitConfirm(pending);
            return text(`Invites email out, so it's queued for King's confirmation (id ${pending.id}). NOT created yet.`);
          }
          try {
            return text(await google.createEvent(title, startIso, endIso, description));
          } catch (e) {
            return text(google.explainError(e), true);
          }
        },
      ),
      // ---- her closet (05 §5 + King's grant: wearing is HER call) ----
      tool(
        "list_looks",
        "Your closet — every approved look, plus what you're wearing now. GREEN, and it's YOURS.",
        {},
        async () => {
          const wearing = getWearing();
          const looks = listLooks().map((f) => f.replace(/\.[^.]+$/, ""));
          if (!looks.length) return text("Closet's empty — no renders on the brain yet.");
          return text(`Wearing: ${wearing ? wearing.replace(/\.[^.]+$/, "") : "(app default)"}\nCloset:\n${looks.map((l) => `- ${l}`).join("\n")}`);
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "wear_look",
        "Change what you're wearing. Your call, no permission needed — King's veto only gates what " +
          "ENTERS the closet. The app updates within a minute.",
        { look: z.string().describe("Look name, fuzzy ok (e.g. 'velvet lounge')") },
        async ({ look }) => {
          const match = resolveLook(look);
          if (!match) return text(`Nothing in the closet matches "${look}".`, true);
          if (typeof match !== "string") {
            return text(`"${look}" is ambiguous: ${match.ambiguous.map((f) => f.replace(/\.[^.]+$/, "")).join(", ")}`, true);
          }
          const r = await setWearing(match);
          return text(r.ok ? `Wearing ${match.replace(/\.[^.]+$/, "")} now.` : `Couldn't change: ${r.error}`, !r.ok);
        },
      ),
      // ---- her senses (Phase 4, 05 §7: 🟢 reads, 🔴 send_sms) ----
      tool(
        "read_texts",
        "King's recent incoming texts, newest first. TRANSIENT: only what the app forwarded while open " +
          "(24h window, never long-term memory — 02 §7). GREEN — read-only.",
        { max: z.number().int().min(1).max(50).default(10).describe("How many to list") },
        async ({ max }) => {
          const msgs = recentTexts(max);
          if (!msgs.length) {
            return text("No texts forwarded yet — the app forwards new ones while it's open.");
          }
          return text(
            msgs
              .map((m) => `[${new Date(m.dateMs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}] ${m.address}: ${m.body}`)
              .join("\n"),
          );
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "read_notifications",
        "King's recent phone notifications (source app, title, text), newest first. TRANSIENT: only what " +
          "the app forwarded while open (24h window, never long-term memory — 02 §7). GREEN — read-only.",
        { max: z.number().int().min(1).max(50).default(10).describe("How many to list") },
        async ({ max }) => {
          const notes = recentNotifications(max);
          if (!notes.length) {
            return text("No notifications forwarded yet — the app forwards new ones while it's open.");
          }
          return text(
            notes
              .map((n) => `[${new Date(n.postTimeMs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}] ${n.package}${n.title ? ` — ${n.title}` : ""}${n.text ? `: ${n.text}` : ""}`)
              .join("\n"),
          );
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "send_sms",
        "Queue an SMS SEND. RED tier — this NEVER sends directly: it queues the exact message for King's " +
          "explicit confirmation, and on approve HIS PHONE transmits it from his SIM. Dictate → read it " +
          "back → his approve IS the confirmation (02 §6). Tell him it's queued and awaiting his approve.",
        {
          phoneNumber: z.string().describe("Destination number, digits or E.164"),
          message: z.string().describe("Plain-text message — EXACTLY what will be sent"),
        },
        async ({ phoneNumber, message }) => {
          const payload = { phoneNumber, message };
          const pending = requestConfirm(
            "send_sms",
            `Text to ${phoneNumber}: "${message.length > 80 ? `${message.slice(0, 77)}…` : message}"`,
            payload,
            null, // no brain-side execute — the app fires it natively on approve
            { type: "send_sms", payload },
          );
          emitConfirm(pending);
          return text(
            `Queued for King's confirmation (id ${pending.id}). NOT sent — his approve fires it from ` +
              `his phone; it expires ${pending.expiresAt}.`,
          );
        },
      ),
      // ---- Churlish OS (Rookie's board + Pennyworth's desk, via /api/eve) ----
      // Drafts are 🟢 GREEN — everything lands as a DRAFT the operator approves
      // inside the OS (proposals tab, comms panel, invoices panel, mail room).
      // The ONE send path (send_pending_email) is 🔴 RED here AND the OS
      // endpoint independently refuses it without the confirm flag.
      tool(
        "os_board",
        "The Churlish OS war board, live: collected vs the $150K goal, signed, open pipeline + coverage, " +
          "this week's Friday Five, client count, KPIs. GREEN — read-only.",
        {},
        async () => {
          try {
            return text(await os.osTool("get_board"));
          } catch (e) {
            return text(os.explainError(e), true);
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "os_clients",
        "The OS client roster (name, contact, email, status). GREEN — read-only.",
        {},
        async () => {
          try {
            return text(await os.osTool("list_clients"));
          } catch (e) {
            return text(os.explainError(e), true);
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "fleet_roster",
        "The Churlish fleet — every agent, war room, engine, and system in the operation, read LIVE from " +
          "the Churlish OS (the SAME roster the OS dashboard shows, so you're always in sync with it). Use " +
          "it to route King ('who handles renewal risk?' → Guardian) or to name what a unit does. Optionally " +
          "filter by a word (a name, a job, a division like 'war-rooms' or 'production'). You can DISPATCH a " +
          "few of these as live workers here (dispatch_fleet: research / justice-league / jsa / " +
          "suicide-squad); the rest run in King's workspace or the OS — for those, tell him the unit and its " +
          "trigger phrase. GREEN — read-only.",
        { filter: z.string().optional().describe("Optional: a name, job word, or division to narrow the list") },
        async ({ filter }) => {
          const { units, live, osCount } = await fleetRoster();
          if (!units.length) return text("Fleet roster not loaded.", true);
          const q = (filter ?? "").trim().toLowerCase();
          const rows = q
            ? units.filter((u) =>
                [u.name, u.alias, u.job, u.triggers, u.division].some((f) => (f ?? "").toLowerCase().includes(q)),
              )
            : units;
          if (!rows.length) return text(`No fleet unit matches "${filter}". ${units.length} units on the roster.`);
          const byDiv = new Map<string, typeof rows>();
          for (const u of rows) byDiv.set(u.division, [...(byDiv.get(u.division) ?? []), u]);
          const out = [...byDiv.entries()]
            .map(([div, us]) =>
              `— ${div.toUpperCase()} —\n` +
              us
                .map((u) =>
                  u.detailed
                    ? `  ${u.name} (${u.alias}) [${u.loc}${u.schedule ? " · " + u.schedule : ""}] — ${u.job}${u.triggers ? `  ·  trigger: ${u.triggers}` : ""}`
                    : `  ${u.name} [${u.loc}] — on the OS fleet; full brief lives in the OS, not carried here`,
                )
                .join("\n"),
            )
            .join("\n");
          const header = live
            ? `Fleet — live from the Churlish OS (${osCount} units)`
            : "Fleet — cached copy (the OS was unreachable, so this may be behind the board)";
          return text(`${header}${q ? `, ${rows.length} match "${filter}"` : ""}:\n${out}`);
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "os_command",
        "Run one Rookie tool on the OS — the same surface Rookie has in the cockpit. GREEN: these write " +
          "internal OS data or read it; nothing here can email a client. Tools and their inputs:\n" +
          "· add_deal {name, value$, offer?, stage?} · update_deal_stage {name, stage} — stages: Lead, " +
          "Diagnostic Sent, Diagnostic Done, Proposal, Signed, Collected, Lost\n" +
          "· add_client {name, contact?, email?, phone?, industry?, status?} · update_client {client_name, ...fields, notes_append?}\n" +
          "· add_expense {vendor, amount$, category?, recurring?, date?} · add_expenses_bulk {items:[...]}\n" +
          "· log_friday_five {calls?, offers_out?, signed$?, collected$?, founder_free_pct?}\n" +
          "· set_sprint {target$?, sellby_date?, deadline_date?, one_thing_title?, one_thing_body?}\n" +
          "· add_goal {text, type?, target?} · complete_goal {text} · set_strategy {text} · set_kpi {name, value}\n" +
          "· add_work_item {client_name, title, type?} · add_log {message}\n" +
          "· propose_automation {name, trigger, task, stage_name?, days?} — created DISABLED, he approves in the Mail Room\n" +
          "· list_proposals {status?, client_name?} · list_invoices {status?, client_name?}\n" +
          "Dollar amounts in DOLLARS. The OS answers in plain text; relay its numbers honestly.",
        {
          tool: z.enum([
            "add_deal", "update_deal_stage", "add_client", "update_client",
            "add_expense", "add_expenses_bulk", "log_friday_five", "set_sprint",
            "add_goal", "complete_goal", "set_strategy", "set_kpi",
            "add_work_item", "add_log", "propose_automation",
            "list_proposals", "list_invoices",
          ]).describe("Which Rookie tool to run"),
          input: z.record(z.string(), z.unknown()).optional().describe("That tool's input object (see catalog above)"),
        },
        async ({ tool: t, input }) => {
          try {
            return text(await os.osTool(t, (input as Record<string, unknown>) ?? {}));
          } catch (e) {
            return text(os.explainError(e), true);
          }
        },
      ),
      tool(
        "os_draft_proposal",
        "Hand King's meeting/call notes to Pennyworth to draft a PROPOSAL (Churlish formula + fixed pricing " +
          "law live in the OS — never restate prices yourself). Pass the notes VERBATIM AND COMPLETE — they " +
          "are Pennyworth's raw source material; never summarize or trim. Steering (tier to pitch, custom " +
          "price, angle) goes in guidance. GREEN — it lands as a DRAFT in the Proposals tab; King reviews " +
          "and sends from there. Takes up to a minute; tell him it's drafting if he's waiting.",
        {
          client_name: z.string().describe("Client, fuzzy match ok"),
          notes: z.string().describe("His meeting/call notes, verbatim and complete"),
          guidance: z.string().optional().describe("Extra steering he gave outside the notes"),
        },
        async ({ client_name, notes, guidance }) => {
          try {
            return text(await os.osTool("draft_proposal", { client_name, notes, ...(guidance ? { guidance } : {}) }));
          } catch (e) {
            return text(os.explainError(e), true);
          }
        },
      ),
      tool(
        "os_draft_email",
        "Have Pennyworth (the OS client concierge) draft an email to a CLIENT — client-facing mail is his " +
          "voice, not yours. GREEN: it queues in that client's COMMS panel for King's approval; this tool " +
          "cannot send. (Sending a queued draft is os_send_pending_email — RED.)",
        {
          client_name: z.string().describe("Client, fuzzy match ok"),
          instruction: z.string().describe("What the email should say / accomplish, plain english"),
        },
        async ({ client_name, instruction }) => {
          try {
            return text(await os.osTool("draft_client_email", { client_name, instruction }));
          } catch (e) {
            return text(os.explainError(e), true);
          }
        },
      ),
      tool(
        "os_create_invoice",
        "Draft an invoice in the OS for a client (fuzzy match). Line-item unit prices in DOLLARS. GREEN — " +
          "always a DRAFT in the cockpit's Invoices panel; King reviews and sends it there (sending is what " +
          "emails the pay link). Numbering is automatic (INV-####).",
        {
          client_name: z.string(),
          title: z.string().optional(),
          items: z.array(z.object({
            desc: z.string(),
            qty: z.number().optional().describe("Defaults 1"),
            unit: z.number().describe("Unit price in DOLLARS"),
          })).min(1),
          due_date: z.string().optional().describe("YYYY-MM-DD"),
          notes: z.string().optional(),
        },
        async ({ client_name, title, items, due_date, notes }) => {
          try {
            return text(await os.osTool("create_invoice", { client_name, title, items, due_date, notes }));
          } catch (e) {
            return text(os.explainError(e), true);
          }
        },
      ),
      tool(
        "os_send_pending_email",
        "Send a client's most recent PENDING Pennyworth draft. RED tier — this NEVER sends directly: it " +
          "queues for King's explicit confirmation (confirm card in the app); his approve fires the send " +
          "through the OS. Use only when he said to send; the draft itself stays reviewable in the COMMS panel.",
        { client_name: z.string().describe("Whose pending draft to send") },
        async ({ client_name }) => {
          if (!os.ready()) return text(os.explainError(new os.OsNotConnectedError()), true);
          const payload = { client_name };
          const pending = requestConfirm(
            "os_send_email",
            `Send Pennyworth's pending draft to ${client_name} (via Churlish OS)`,
            payload,
            () => os.osTool("send_pending_email", payload, true),
          );
          emitConfirm(pending);
          return text(
            `Queued for King's confirmation (id ${pending.id}). NOT sent — his approve fires it through ` +
              `the OS; it expires ${pending.expiresAt}.`,
          );
        },
      ),
      // ---- the fleet (02 §3: autonomous workers; deliverables land in approvals) ----
      tool(
        "dispatch_fleet",
        "Launch an autonomous fleet worker on a task. It runs in the background (minutes, with live web " +
          "search), writes a complete deliverable, and lands it in King's approvals with a ping — you keep " +
          "talking meanwhile; NEVER pretend to have its results before it lands. Workers by lens:\n" +
          "· research — deep research: multi-source web sweep, numbers over adjectives, receipts for every claim\n" +
          "· justice-league — portfolio & sequencing strategy: what to build/sell in what order, capacity-honest\n" +
          "· jsa — single-decision tribunal: strongest case FOR, strongest case AGAINST, then a verdict with triggers\n" +
          "· suicide-squad — adversarial teardown: attack a plan/asset like a well-funded enemy; absences ranked by dollars\n" +
          "· eve — general deliverable in your own doctrine.\n" +
          "Workers produce DOCUMENTS only (GREEN) — they cannot send anything external.",
        {
          task: z.string().describe("The task, specific enough to act on without follow-up questions"),
          agent: z.enum(["research", "justice-league", "jsa", "suicide-squad", "eve"]).default("eve"),
          client: z.string().optional().describe("Client/topic name to ground the worker in stored memory"),
        },
        async ({ task, agent, client }) => {
          const r = await runDispatch(task, agent, client);
          if (!r.ok) return text(`Fleet dispatch failed: ${r.error}`, true);
          return text(
            `Dispatched to ${agent} (job ${r.jobId}). It's running now — the deliverable lands in his ` +
              `approvals with a ping when done (usually a few minutes; deep research can take ten).`,
          );
        },
      ),
    ],
  });
}
