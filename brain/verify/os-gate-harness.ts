// Brain-side proof for the OS GATE on HIS-mailbox sends.
//   gmail_send and calendar_invite leave from Brandon's own Gmail / Calendar
//   (connectors.ts → os.ts houseGatedSend), after his approve on the RED card
//   (confirm.ts). Before sending, the executor reads the OS's house_status;
//   paused or unreachable → nothing sent; test mode → recipients rewritten to
//   hello@churlishmedia.com with "[TEST → …]"; after a real send → ONE
//   ledger_note through POST /api/eve with confirmed:true.
//
//   cd C:\dev\eve\brain && npx tsx verify/os-gate-harness.ts
//
// Offline: global fetch is replaced by a fake OS, and the Google send is a
// spy passed in exactly where connectors.ts passes google.sendMail /
// google.createEvent. Where a check reads SOURCE TEXT it says SOURCE.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { requestConfirm, resolveConfirm, type ConfirmResult } from "../src/confirm.js";
import * as os from "../src/os.js";

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONNECTORS_SRC = readFileSync(path.join(brainDir, "src", "connectors.ts"), "utf8");

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  show.push(`  ${id.padEnd(6)} ${cond ? "PASS" : "****FAIL****"}  ${what}`);
}

// ---- the fake OS -----------------------------------------------------------------
type OsCall = { tool: string; input: Record<string, unknown>; confirmed: boolean; auth: string };
type Status = { sends_paused?: unknown; test_mode?: unknown } | "offline" | "500" | "nodata";
let status: Status = { sends_paused: false, test_mode: false };
let ledgerAnswer: "ok" | "502" | "offline" = "ok";
let osCalls: OsCall[] = [];

const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as { tool: string; input: Record<string, unknown>; confirmed?: boolean };
  const auth = String((init?.headers as Record<string, string> | undefined)?.authorization ?? "");
  osCalls.push({ tool: body.tool, input: body.input, confirmed: body.confirmed === true, auth });
  if (body.tool === "house_status") {
    if (status === "offline") throw new TypeError("fetch failed");
    if (status === "500") return json({ ok: false, error: "boom" }, 500);
    if (status === "nodata") return json({ ok: true, result: "Sends on" });
    return json({ ok: true, result: "…", data: { daily_cap: 25, ...status } });
  }
  if (body.tool === "ledger_note") {
    if (ledgerAnswer === "offline") throw new TypeError("fetch failed");
    if (ledgerAnswer === "502") return json({ ok: false, error: "Couldn't write the Ledger line" }, 502);
    return json({ ok: true, result: "Ledger line written.", data: { id: "l1", created: true } });
  }
  return json({ ok: false, error: "unknown" }, 400);
}) as typeof fetch;

const warns: string[] = [];
console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(" ")); };

process.env.CHURLISH_OS_TOKEN = "harness-os-token";

// ---- the card, built the way connectors.ts builds it -----------------------------
type Sent = { to: string[]; subject: string };
let sent: Sent[] = [];
let sendThrows = false;

const BODY = "Hi Dana — the secret body text that must never reach the Ledger.";

async function gmailCard(to: string, subject: string): Promise<{ r: ConfirmResult; id: string }> {
  const pending = requestConfirm("send_email", `Email to ${to}: "${subject}"`, { to, subject, body: BODY }, () =>
    os.houseGatedSend({
      kind: "gmail",
      recipients: os.splitRecipients(to),
      subject,
      ref: pending.id,
      send: async (rcpt, subj) => {
        if (sendThrows) throw new Error("gmail 500");
        sent.push({ to: rcpt, subject: subj });
        return "Sent (message id m1).";
      },
    }),
  );
  return { r: await resolveConfirm(pending.id, pending.hash, true), id: pending.id };
}

async function calendarCard(title: string, attendees: string[]): Promise<{ r: ConfirmResult; id: string }> {
  const pending = requestConfirm("calendar_invite", `Event "${title}"`, { title, attendees }, () =>
    os.houseGatedSend({
      kind: "calendar",
      recipients: attendees,
      subject: title,
      ref: pending.id,
      send: async (rcpt, subj) => {
        sent.push({ to: rcpt, subject: subj });
        return `Event created: "${subj}"`;
      },
    }),
  );
  return { r: await resolveConfirm(pending.id, pending.hash, true), id: pending.id };
}

function reset(s: Status, l: typeof ledgerAnswer = "ok") {
  status = s;
  ledgerAnswer = l;
  osCalls = [];
  sent = [];
  warns.length = 0;
  sendThrows = false;
}
const ledgerCalls = () => osCalls.filter((c) => c.tool === "ledger_note");
const notExecuted = (r: ConfirmResult, detail: string) => r.ok === true && r.executed === false && r.detail === detail;

show.push("=== P — PAUSE ALL HOLDS HIS SENDS ===");
{
  reset({ sends_paused: true, test_mode: false });
  const { r } = await gmailCard("dana@acme.example", "Kickoff");
  ok("P1", notExecuted(r, "Paused in the OS — nothing sent."), `gmail_send approved while paused → not executed, "${r.ok ? r.detail : r.error}"`);
  ok("P2", sent.length === 0, "nothing reached Gmail");
  ok("P3", ledgerCalls().length === 0, "no Ledger line for a send that didn't happen");
  ok("P4", osCalls.length === 1 && osCalls[0].tool === "house_status" && osCalls[0].auth === "Bearer harness-os-token", "one house_status read, with the bearer");
  reset({ sends_paused: true, test_mode: true });
  const c = await calendarCard("Strategy call", ["dana@acme.example"]);
  ok("P5", notExecuted(c.r, "Paused in the OS — nothing sent.") && sent.length === 0, "calendar_invite approved while paused → not executed, no invite");
}

show.push("=== U — THE OS UNREACHABLE: FAIL CLOSED ===");
{
  const U = "Couldn't reach the OS to check Pause all — nothing sent.";
  reset("offline");
  const a = await gmailCard("dana@acme.example", "Kickoff");
  ok("U1", notExecuted(a.r, U) && sent.length === 0, "network failure → not executed, nothing sent");
  reset("500");
  const b = await gmailCard("dana@acme.example", "Kickoff");
  ok("U2", notExecuted(b.r, U) && sent.length === 0, "the OS answering 500 → not executed, nothing sent");
  reset("nodata");
  const c = await gmailCard("dana@acme.example", "Kickoff");
  ok("U3", notExecuted(c.r, U) && sent.length === 0, "an answer with no sends_paused flag → not executed (no answer is not a yes)");
  reset({ sends_paused: "false", test_mode: false });
  const d = await calendarCard("Strategy call", ["dana@acme.example"]);
  ok("U4", notExecuted(d.r, U) && sent.length === 0, "a non-boolean sends_paused → not executed, no invite");
  reset({ sends_paused: false, test_mode: false });
  delete process.env.CHURLISH_OS_TOKEN;
  const e = await gmailCard("dana@acme.example", "Kickoff");
  process.env.CHURLISH_OS_TOKEN = "harness-os-token";
  ok("U5", notExecuted(e.r, U) && sent.length === 0 && osCalls.length === 0, "no OS token on the brain → not executed, nothing sent");
}

show.push("=== T — TEST MODE REWRITES EVERY RECIPIENT ===");
{
  reset({ sends_paused: false, test_mode: true });
  const { r, id } = await gmailCard("dana@acme.example, ops@beta.example", "Kickoff");
  ok("T1", r.ok === true && r.executed === true, "test mode still sends (to the test inbox)");
  ok("T2", sent.length === 1 && sent[0].to.length === 1 && sent[0].to[0] === "hello@churlishmedia.com", `to: ${JSON.stringify(sent[0]?.to)}`);
  ok("T3", sent[0]?.subject === "[TEST → dana@acme.example, ops@beta.example] Kickoff", `subject: "${sent[0]?.subject}" — the OS's "[TEST → orig] " marking`);
  ok("T4", r.ok === true && /Test mode/.test(r.detail) && /hello@churlishmedia\.com/.test(r.detail), "the card says it went to the test inbox");
  ok("T5", ledgerCalls().length === 1 && ledgerCalls()[0].input.ref === id, "one Ledger line, for this card");
  reset({ sends_paused: false, test_mode: true });
  const c = await calendarCard("Strategy call", ["dana@acme.example", "sam@gamma.example"]);
  ok("T6", c.r.ok === true && c.r.executed === true && sent[0]?.to.join() === "hello@churlishmedia.com", "calendar: every attendee becomes hello@churlishmedia.com");
  ok("T7", sent[0]?.subject === "[TEST → dana@acme.example, sam@gamma.example] Strategy call", `title: "${sent[0]?.subject}"`);
}

show.push("=== S — A NORMAL SEND, AND ITS ONE LEDGER LINE ===");
{
  reset({ sends_paused: false, test_mode: false });
  const { r, id } = await gmailCard("Dana@Acme.example", "Kickoff on Monday");
  ok("S1", r.ok === true && r.executed === true && r.detail === "Sent (message id m1).", `executed, detail "${r.ok ? r.detail : r.error}"`);
  ok("S2", sent.length === 1 && sent[0].to[0] === "Dana@Acme.example" && sent[0].subject === "Kickoff on Monday", "sent to the real recipient, subject untouched");
  const L = ledgerCalls();
  ok("S3", L.length === 1, `exactly ONE ledger_note call (got ${L.length})`);
  const n = L[0];
  ok("S4", n?.confirmed === true && n.auth === "Bearer harness-os-token", "ledger_note carries confirmed:true and the bearer");
  ok("S5", n?.input.kind === "eve.gmail_sent" && n.input.ref === id, "kind eve.gmail_sent, ref = the card id");
  ok("S6", n?.input.title === "EVE emailed acme.example — Kickoff on Monday", `title "${String(n?.input.title)}" — domain + subject`);
  const flat = JSON.stringify(n?.input ?? {});
  ok("S7", !flat.includes("secret body") && !flat.includes("@"), "no body and no address anywhere in the Ledger call");
  ok("S8", Object.keys(n?.input ?? {}).sort().join() === "detail,kind,ref,title", "only kind/title/detail/ref — the OS's strict schema");
  reset({ sends_paused: false, test_mode: false });
  const c = await calendarCard("Strategy call", ["dana@acme.example"]);
  const cl = ledgerCalls();
  ok("S9", c.r.ok && c.r.executed && sent[0]?.to[0] === "dana@acme.example" && cl.length === 1 && cl[0].input.kind === "eve.calendar_invite"
    && cl[0].input.title === "EVE invited acme.example — Strategy call" && cl[0].input.ref === c.id, "calendar: invite sent, one eve.calendar_invite line");
  reset({ sends_paused: false, test_mode: false });
  sendThrows = true;
  const f = await gmailCard("dana@acme.example", "Kickoff");
  ok("S10", f.r.ok === false && /send failed/.test(f.r.error) && ledgerCalls().length === 0, "Gmail throws → the card says failed, and no Ledger line");
}

show.push("=== L — A LEDGER FAILURE DOES NOT UNDO THE SEND ===");
{
  for (const mode of ["502", "offline"] as const) {
    reset({ sends_paused: false, test_mode: false }, mode);
    const { r } = await gmailCard("dana@acme.example", "Kickoff");
    ok(`L${mode === "502" ? 1 : 2}`, r.ok === true && r.executed === true && sent.length === 1 && ledgerCalls().length === 1,
      `ledger_note ${mode} → still executed:true, sent once, one attempt`);
    ok(`L${mode === "502" ? 3 : 4}`, warns.length === 1 && !/acme|Kickoff|Dana|body|@/i.test(warns[0]), `one log line, no content: "${warns[0]}"`);
  }
}

show.push("=== W — WIRED IN connectors.ts (SOURCE) ===");
{
  ok("W1", (CONNECTORS_SRC.match(/os\.houseGatedSend\(/g) ?? []).length === 2, "SOURCE: houseGatedSend wraps exactly two executors");
  ok("W2", /kind: "gmail"[\s\S]{0,200}google\.sendMail\(/.test(CONNECTORS_SRC) && (CONNECTORS_SRC.match(/google\.sendMail\(/g) ?? []).length === 1,
    "SOURCE: google.sendMail is called once, inside the gmail gate");
  ok("W3", /kind: "calendar"[\s\S]{0,250}google\.createEvent\(subj, startIso, endIso, description, rcpt\)/.test(CONNECTORS_SRC),
    "SOURCE: the attendee createEvent runs inside the calendar gate, with the guarded title and attendees");
  ok("W4", !/ledger_note/.test(CONNECTORS_SRC), "SOURCE: ledger_note is not a tool she can call — only the executor writes it");
}

console.log(show.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
