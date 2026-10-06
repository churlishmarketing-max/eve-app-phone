// THE OS WRITE CARD — os_command's writes, os_create_invoice and
// os_move_client_stage, drawn instead of refused in a thread that has read
// someone else's words.
//
// WHY THIS EXISTS (2026-10-06). In the OS web chat Brandon said "set the
// sell-by date to Dec 1" and got the conversation lock: "the OS won't let that
// thread change your sprint… open a fresh thread." The same dead end the
// dispatch pair had until f4851f0. These three tools are now
// `card-when-tainted` (authority.ts): a CLEAN turn of a CLEAN conversation
// still calls the OS directly, exactly as before; a TAINTED turn or a
// LOCKED/unreadable conversation draws ONE card through this file and calls
// nothing. This is the W4 ruling applied — untrusted text may cause a card to be
// DRAWN, never RUN.
//
// WHAT THE CARD CARRIES. The payload IS the instruction:
//   · `action`      — one line in his words ("Change your sprint")
//   · `subcommand`  — os_command only: the Rookie tool by name
//   · one field per argument, labelled for a human and formatted ("sell-by
//     date" → "2026-12-01 (Tuesday, December 1, 2026)", money as dollars)
//   · `os_tool` + `os_input` — the EXACT call his approve makes, captured here,
//     deep-copied, never re-derived. The executor reads ONLY these two, out of
//     the same object the hash covers, so the card cannot show one thing and
//     run another.
// The phone renders any kind generically (every payload key, uppercased, with
// its value in full); the OS Inbox shows the summary, so the summary carries
// the same fields in one line.
//
// CHECKS THAT CAN FAIL WITHOUT HIM RUN FIRST, so he is never handed a card
// whose approve could only fail or silently do nothing: the OS line must be
// connected, the subcommand must have a card shape here, every argument must be
// one the OS reads (an unknown key is dropped by the OS without a word), every
// required argument must be present, and every date must be a real
// YYYY-MM-DD — rookie-tools.ts IGNORES an unparseable date and answers
// "Nothing to change", which is how "Dec 1" turns into a card that does
// nothing. What cannot be checked without calling the OS (does that client
// name match one client?) is left to the OS at approve time, and a "No client
// matching" / "Ambiguous" answer comes back on the card as NOT changed.
//
// THE SAME OS CALL THE TOOL MAKES TODAY: os.osTool(tool, input), no
// `confirmed` flag. The tap adds the signature; it does not widen the call.

import { requestConfirm, type PendingConfirm } from "./confirm.js";
import * as os from "./os.js";

export type OsCardKind = "os_command" | "os_create_invoice" | "os_move_client_stage";

/** A checked, captured OS write — what his card shows and exactly what his approve sends. */
export interface OsCall {
  kind: OsCardKind;
  /** The OS tool name on the wire (POST /api/eve {tool}). */
  tool: string;
  /** The exact input object on the wire, deep-copied at draw time. */
  input: Record<string, unknown>;
  /** One line in his words: "Change your sprint". */
  action: string;
  /** Finishes "I can't … on my own here". */
  cannot: string;
  /** Human-readable label → value, in the order he reads them. */
  fields: Array<[string, string]>;
  /** os_command only: the subcommand name, shown on the card. */
  subcommand?: string;
}

export type OsCheck = { ok: true; call: OsCall } | { ok: false; say: string };

const NO_CARD = "No card was drawn and nothing in your OS changed.";

// ---------------------------------------------------------------------------
// VALUE CHECKS — shape only. Nothing here reads what a string SAYS.
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day in YYYY-MM-DD, or null. "2026-02-30" is not one. */
export function isoDay(v: unknown): string | null {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return v;
}

function showDay(v: string): string {
  const [y, m, d] = v.split("-").map(Number);
  const long = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${v} (${long})`;
}

/** A finite number, or a string that is plainly one. The OS does Number(x). */
function numberOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return null;
}

function dollars(n: number): string {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}$${s}`;
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

// ---------------------------------------------------------------------------
// os_command — ONE SHAPE PER WRITE SUBCOMMAND, mirroring the OS's own reader
// (churlish-os lib/rookie-tools.ts runTool). A write subcommand with no shape
// here draws NO card and says so: fail-closed, the way OS_WRITE_TOOLS is.
// ---------------------------------------------------------------------------

type Kind =
  | { t: "text"; max?: number; allowEmpty?: boolean }
  | { t: "money" }
  | { t: "number" }
  | { t: "date" }
  | { t: "bool" }
  | { t: "oneOf"; of: readonly string[] };

interface Field {
  key: string;
  label: string;
  kind: Kind;
  required?: boolean;
}

interface Shape {
  action: string;
  cannot: string;
  fields: Field[];
  /** At least one field must be present (the "only provided fields change" tools). */
  needOne?: boolean;
  /** Extra rules the field list cannot state. Returns the refusal, or null. */
  extra?: (input: Record<string, unknown>) => string | null;
  /** Lines appended after the fields (e.g. a computed total). */
  tail?: (input: Record<string, unknown>) => Array<[string, string]>;
}

/** The OS's pipeline stages for deals (rookie-tools.ts STAGES). An unknown one is written verbatim by update_deal_stage. */
export const DEAL_STAGES = ["Lead", "Diagnostic Sent", "Diagnostic Done", "Proposal", "Signed", "Collected", "Lost"] as const;
const CLIENT_STATUS = ["Lead", "Active", "Past"] as const;
const EXPENSE_CATEGORY = ["Software", "Ads", "Contractors", "Gear", "Fees", "Other"] as const;
const WORK_TYPE = ["video", "ad", "doc", "web", "social", "strategy", "other"] as const;
const GOAL_TYPE = ["business", "life"] as const;
const TRIGGERS = ["new_lead", "booking", "stage_enter", "days_in_stage"] as const;

const text = (max?: number): Kind => ({ t: "text", ...(max ? { max } : {}) });

export const OS_COMMAND_SHAPES: Record<string, Shape> = {
  add_deal: {
    action: "Add a deal to your pipeline",
    cannot: "add a deal to your pipeline",
    fields: [
      { key: "name", label: "deal", kind: text(), required: true },
      { key: "value", label: "value", kind: { t: "money" }, required: true },
      { key: "offer", label: "offer", kind: text() },
      { key: "stage", label: "stage", kind: { t: "oneOf", of: DEAL_STAGES } },
    ],
  },
  update_deal_stage: {
    action: "Move a deal to a new stage",
    cannot: "move a deal in your pipeline",
    fields: [
      { key: "name", label: "deal (matched by name)", kind: text(), required: true },
      { key: "stage", label: "new stage", kind: { t: "oneOf", of: DEAL_STAGES }, required: true },
    ],
  },
  add_client: {
    action: "Add a client to your roster",
    cannot: "add a client to your roster",
    fields: [
      { key: "name", label: "client", kind: text(), required: true },
      { key: "contact", label: "contact", kind: text() },
      { key: "email", label: "email", kind: text() },
      { key: "phone", label: "phone", kind: text() },
      { key: "industry", label: "industry", kind: text() },
      { key: "status", label: "status", kind: { t: "oneOf", of: CLIENT_STATUS } },
    ],
  },
  update_client: {
    action: "Update a client's record",
    cannot: "change a client's record",
    fields: [
      { key: "client_name", label: "client (matched by name)", kind: text(), required: true },
      { key: "name", label: "new name", kind: text() },
      { key: "contact", label: "contact", kind: text() },
      { key: "email", label: "email", kind: text() },
      { key: "phone", label: "phone", kind: text() },
      { key: "industry", label: "industry", kind: text() },
      { key: "status", label: "status", kind: { t: "oneOf", of: CLIENT_STATUS } },
      { key: "notes_append", label: "add to notes", kind: text() },
    ],
    extra: (i) =>
      ["name", "contact", "email", "phone", "industry", "status", "notes_append"].some((k) => i[k] !== undefined)
        ? null
        : "update_client needs at least one field to change besides client_name (name, contact, email, phone, industry, status, notes_append).",
  },
  add_expense: {
    action: "Log an expense",
    cannot: "log an expense",
    fields: [
      { key: "vendor", label: "vendor", kind: text(), required: true },
      { key: "amount", label: "amount", kind: { t: "money" }, required: true },
      { key: "category", label: "category", kind: { t: "oneOf", of: EXPENSE_CATEGORY } },
      { key: "recurring", label: "recurring monthly", kind: { t: "bool" } },
      { key: "date", label: "date", kind: { t: "date" } },
    ],
  },
  add_expenses_bulk: {
    action: "Log several expenses at once",
    cannot: "log expenses",
    fields: [],
    extra: (i) => {
      const items = i.items;
      if (!Array.isArray(items) || items.length === 0) return "add_expenses_bulk needs `items`: a non-empty list of {vendor, amount, category?, recurring?, date?}.";
      for (const [n, raw] of items.entries()) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return `Expense ${n + 1} isn't an object.`;
        const it = raw as Record<string, unknown>;
        const bad = Object.keys(it).filter((k) => !["vendor", "amount", "category", "recurring", "date"].includes(k));
        if (bad.length) return `Expense ${n + 1} has field(s) the OS does not read: ${bad.join(", ")}.`;
        if (!nonEmpty(it.vendor)) return `Expense ${n + 1} has no vendor — the OS would skip it without saying.`;
        if (numberOf(it.amount) === null) return `Expense ${n + 1} has no amount in dollars — the OS would skip it without saying.`;
        if (it.category !== undefined && !EXPENSE_CATEGORY.includes(it.category as never)) return `Expense ${n + 1}'s category must be one of ${EXPENSE_CATEGORY.join(", ")}.`;
        if (it.recurring !== undefined && typeof it.recurring !== "boolean") return `Expense ${n + 1}'s recurring must be true or false.`;
        if (it.date !== undefined && !isoDay(it.date)) return `Expense ${n + 1}'s date must be a real day written YYYY-MM-DD (the OS would quietly use today instead).`;
      }
      return null;
    },
    tail: (i) => {
      const items = i.items as Array<Record<string, unknown>>;
      const total = items.reduce((s, it) => s + (numberOf(it.amount) ?? 0), 0);
      return [
        ...items.map((it, n): [string, string] => [
          `expense ${n + 1}`,
          `${String(it.vendor)} — ${dollars(numberOf(it.amount) ?? 0)}${it.category ? ` (${String(it.category)})` : ""}` +
            `${it.recurring === true ? ", recurring monthly" : ""}${typeof it.date === "string" ? `, on ${it.date}` : ", dated today"}`,
        ]),
        ["total", dollars(total)],
      ];
    },
  },
  log_friday_five: {
    action: "Log this week's Friday Five",
    cannot: "log your Friday Five",
    needOne: true,
    fields: [
      { key: "calls", label: "calls", kind: { t: "number" } },
      { key: "offers_out", label: "offers out", kind: { t: "number" } },
      { key: "signed", label: "signed", kind: { t: "money" } },
      { key: "collected", label: "collected", kind: { t: "money" } },
      { key: "founder_free_pct", label: "founder-free %", kind: { t: "number" } },
    ],
  },
  set_sprint: {
    action: "Change your sprint on the war board",
    cannot: "change your sprint",
    needOne: true,
    fields: [
      { key: "target", label: "collected target", kind: { t: "money" } },
      { key: "sellby_date", label: "sell-by date", kind: { t: "date" } },
      { key: "deadline_date", label: "deadline", kind: { t: "date" } },
      { key: "one_thing_title", label: "the one thing", kind: text(140) },
      { key: "one_thing_body", label: "the one thing — supporting line", kind: { t: "text", max: 400, allowEmpty: true } },
    ],
  },
  add_goal: {
    action: "Add a goal to Founder OS",
    cannot: "add a goal",
    fields: [
      { key: "text", label: "goal", kind: text(), required: true },
      { key: "type", label: "type", kind: { t: "oneOf", of: GOAL_TYPE } },
      { key: "target", label: "target", kind: { t: "number" } },
    ],
  },
  complete_goal: {
    action: "Mark a goal done",
    cannot: "mark a goal done",
    fields: [{ key: "text", label: "goal (matched by text)", kind: text(), required: true }],
  },
  set_strategy: {
    action: "Replace your Working Strategy",
    cannot: "replace your Working Strategy",
    fields: [{ key: "text", label: "new Working Strategy (replaces the old one whole)", kind: text(), required: true }],
  },
  set_kpi: {
    action: "Set a KPI's value for this period",
    cannot: "set a KPI",
    fields: [
      { key: "name", label: "KPI (matched by name)", kind: text(), required: true },
      { key: "value", label: "value", kind: { t: "number" }, required: true },
    ],
  },
  add_work_item: {
    action: "Add a work item to a client's board",
    cannot: "add a work item to a client's board",
    fields: [
      { key: "client_name", label: "client (matched by name)", kind: text(), required: true },
      { key: "title", label: "work item", kind: text(), required: true },
      { key: "type", label: "type", kind: { t: "oneOf", of: WORK_TYPE } },
    ],
  },
  add_log: {
    action: "Write a line to the sys.log",
    cannot: "write to your sys.log",
    fields: [{ key: "message", label: "line", kind: text(), required: true }],
  },
  propose_automation: {
    action: "Propose an automation rule (created OFF — you switch it on in the Mail Room)",
    cannot: "propose an automation",
    fields: [
      { key: "name", label: "rule name", kind: text(), required: true },
      { key: "trigger", label: "trigger", kind: { t: "oneOf", of: TRIGGERS }, required: true },
      { key: "stage_name", label: "stage", kind: text() },
      { key: "days", label: "days in stage", kind: { t: "number" } },
      { key: "task", label: "brief Pennyworth writes from", kind: text(), required: true },
    ],
    extra: (i) => {
      if ((i.trigger === "stage_enter" || i.trigger === "days_in_stage") && !nonEmpty(i.stage_name)) {
        return `A ${String(i.trigger)} rule needs stage_name — the stage it watches.`;
      }
      if (i.trigger === "days_in_stage" && !((numberOf(i.days) ?? 0) >= 1)) return "A days_in_stage rule needs days of 1 or more.";
      return null;
    },
  },
};

/** One field's value, checked and shown — or the refusal. */
function checkField(f: Field, v: unknown, where: string): { ok: true; show: string } | { ok: false; say: string } {
  const k = f.kind;
  switch (k.t) {
    case "text": {
      if (typeof v !== "string" || (!k.allowEmpty && !v.trim())) return { ok: false, say: `${where}: \`${f.key}\` must be non-empty text.` };
      if (k.max && v.length > k.max) {
        return { ok: false, say: `${where}: \`${f.key}\` is ${v.length} characters and the OS keeps only ${k.max} — shorten it so the card shows what lands.` };
      }
      return { ok: true, show: v.length ? v : "(cleared — empty)" };
    }
    case "money": {
      const n = numberOf(v);
      if (n === null) return { ok: false, say: `${where}: \`${f.key}\` must be a number of DOLLARS (got ${JSON.stringify(v)}).` };
      return { ok: true, show: dollars(n) };
    }
    case "number": {
      const n = numberOf(v);
      if (n === null) return { ok: false, say: `${where}: \`${f.key}\` must be a number (got ${JSON.stringify(v)}).` };
      return { ok: true, show: String(n) };
    }
    case "date": {
      const d = isoDay(v);
      if (!d) {
        return {
          ok: false,
          say: `${where}: \`${f.key}\` must be a real day written YYYY-MM-DD (got ${JSON.stringify(v)}) — the OS ignores any other ` +
            `form without saying so. Work out the year from today's date and call it again, e.g. 2026-12-01.`,
        };
      }
      return { ok: true, show: showDay(d) };
    }
    case "bool":
      if (typeof v !== "boolean") return { ok: false, say: `${where}: \`${f.key}\` must be true or false.` };
      return { ok: true, show: v ? "yes" : "no" };
    case "oneOf":
      if (typeof v !== "string" || !k.of.includes(v)) {
        return { ok: false, say: `${where}: \`${f.key}\` must be one of ${k.of.join(", ")} (got ${JSON.stringify(v)}) — the OS would not use it as given.` };
      }
      return { ok: true, show: v };
  }
}

/** A deep copy that is exactly what goes on the wire (JSON drops `undefined`, as the request body would). */
function wire<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? {})) as T;
}

/** os_command {tool, input} → the card's call, or the reason there is no card. Pure. */
export function checkOsCommand(subcommand: string, rawInput: Record<string, unknown> | undefined): OsCheck {
  const shape = OS_COMMAND_SHAPES[subcommand];
  if (!shape) {
    return { ok: false, say: `I have no card shape for os_command "${subcommand}", so I can't put it in front of you to sign. ${NO_CARD}` };
  }
  const input = wire(rawInput ?? {}) as Record<string, unknown>;
  const where = `os_command ${subcommand}`;
  const known = new Set([...shape.fields.map((f) => f.key), ...(subcommand === "add_expenses_bulk" ? ["items"] : [])]);
  const unknown = Object.keys(input).filter((k) => !known.has(k));
  if (unknown.length) {
    return {
      ok: false,
      say: `${where} doesn't read ${unknown.map((k) => `\`${k}\``).join(", ")} — the OS would drop ${unknown.length === 1 ? "it" : "them"} without a word. ` +
        `Its fields are: ${[...known].join(", ")}. ${NO_CARD}`,
    };
  }
  const fields: Array<[string, string]> = [];
  for (const f of shape.fields) {
    const v = input[f.key];
    if (v === undefined || v === null) {
      if (f.required) return { ok: false, say: `${where} needs \`${f.key}\`. ${NO_CARD}` };
      continue;
    }
    const c = checkField(f, v, where);
    if (!c.ok) return { ok: false, say: `${c.say} ${NO_CARD}` };
    fields.push([f.label, c.show]);
  }
  if (shape.needOne && fields.length === 0) {
    return { ok: false, say: `${where} changes only the fields it is given, and it was given none (${shape.fields.map((f) => f.key).join(", ")}). ${NO_CARD}` };
  }
  const extra = shape.extra?.(input);
  if (extra) return { ok: false, say: `${extra} ${NO_CARD}` };
  if (shape.tail) fields.push(...shape.tail(input));
  return {
    ok: true,
    call: { kind: "os_command", tool: subcommand, input, action: shape.action, cannot: shape.cannot, fields, subcommand },
  };
}

// ---------------------------------------------------------------------------
// os_create_invoice — a DRAFT invoice, but a money instrument with his name on
// it. Line items shown one per field, with the total the OS will compute.
// ---------------------------------------------------------------------------

export interface InvoiceArgs {
  client_name: string;
  title?: string;
  items: Array<{ desc: string; qty?: number; unit: number }>;
  due_date?: string;
  notes?: string;
}

export function checkOsInvoice(a: InvoiceArgs): OsCheck {
  const where = "os_create_invoice";
  if (!nonEmpty(a.client_name)) return { ok: false, say: `${where} needs the client's name. ${NO_CARD}` };
  if (a.title !== undefined && a.title.length > 200) return { ok: false, say: `${where}: the title is ${a.title.length} characters and the OS keeps 200 — shorten it. ${NO_CARD}` };
  if (a.due_date !== undefined && !isoDay(a.due_date)) {
    return { ok: false, say: `${where}: due_date must be a real day written YYYY-MM-DD (got ${JSON.stringify(a.due_date)}) — the OS drops any other form without saying. ${NO_CARD}` };
  }
  if (!a.items?.length) return { ok: false, say: `${where} needs at least one line item. ${NO_CARD}` };
  const fields: Array<[string, string]> = [["client (matched by name)", a.client_name]];
  if (a.title) fields.push(["title", a.title]);
  let total = 0;
  for (const [n, it] of a.items.entries()) {
    if (!nonEmpty(it.desc)) return { ok: false, say: `${where}: line ${n + 1} has no description — the OS would drop it without saying. ${NO_CARD}` };
    if (!Number.isFinite(it.unit)) return { ok: false, say: `${where}: line ${n + 1}'s unit price must be a number of dollars. ${NO_CARD}` };
    if (it.qty !== undefined && !(Number.isFinite(it.qty) && it.qty > 0)) {
      return { ok: false, say: `${where}: line ${n + 1}'s qty must be more than 0 (the OS would quietly make it 1). ${NO_CARD}` };
    }
    const qty = it.qty ?? 1;
    total += qty * it.unit;
    fields.push([`line ${n + 1}`, `${it.desc} — ${qty} × ${dollars(it.unit)} = ${dollars(qty * it.unit)}`]);
  }
  fields.push(["total", dollars(Math.round(total * 100) / 100)]);
  if (a.due_date) fields.push(["due", showDay(a.due_date)]);
  if (a.notes) fields.push(["notes", a.notes]);
  fields.push(["lands as", "a DRAFT in the cockpit's Invoices panel — nothing is emailed until you send it there"]);
  return {
    ok: true,
    call: {
      kind: "os_create_invoice",
      tool: "create_invoice",
      // Byte-for-byte the object the direct path sends today.
      input: wire({ client_name: a.client_name, title: a.title, items: a.items, due_date: a.due_date, notes: a.notes }) as Record<string, unknown>,
      action: `Draft an invoice for ${a.client_name}`,
      cannot: "raise an invoice in your name",
      fields,
    },
  };
}

// ---------------------------------------------------------------------------
// os_move_client_stage — moves his pipeline and fires the stage-enter drafts.
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StageArgs {
  client_name?: string;
  client_id?: string;
  stage: string;
}

export function checkOsStage(a: StageArgs): OsCheck {
  const where = "os_move_client_stage";
  if (!nonEmpty(a.client_name) && !nonEmpty(a.client_id)) return { ok: false, say: `${where} needs client_name or client_id. ${NO_CARD}` };
  if (a.client_id !== undefined && !UUID.test(a.client_id)) return { ok: false, say: `${where}: client_id must be the client's uuid (the OS refuses anything else). ${NO_CARD}` };
  if (!nonEmpty(a.stage)) return { ok: false, say: `${where} needs the stage's name. ${NO_CARD}` };
  const who = a.client_id ? `${a.client_name ? `${a.client_name}, ` : ""}id ${a.client_id}` : (a.client_name as string);
  return {
    ok: true,
    call: {
      kind: "os_move_client_stage",
      tool: "client_move_stage",
      input: wire({ client_name: a.client_name, client_id: a.client_id, stage: a.stage }) as Record<string, unknown>,
      action: `Move ${who} to ${a.stage}`,
      cannot: "move a client's stage",
      fields: [
        [a.client_id ? "client" : "client (matched by name)", who],
        ["new stage", a.stage],
        ["then", "the stage's automations DRAFT their emails for your approval — nothing is sent"],
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// DRAWING THE CARD, AND WHAT HIS APPROVE DOES
// ---------------------------------------------------------------------------

/**
 * The OS's own "nothing happened" answers (rookie-tools.ts runTool returns them
 * as plain text with ok:true). On his card they read as NOT changed, never as
 * done. These are the OS's protocol strings, not third-party text.
 */
const OS_DID_NOTHING = /^(ERROR:|No (client|deal|KPI|open goal) matching|Ambiguous —|Nothing to change|No items provided|Unknown tool)/;

export function osAnswerChangedNothing(answer: string): boolean {
  return OS_DID_NOTHING.test(answer.trim());
}

/** The payload his screen prints field by field and the hash covers. */
export function osCardPayload(call: OsCall): Record<string, unknown> {
  const p: Record<string, unknown> = { action: call.action };
  if (call.subcommand) p.subcommand = call.subcommand;
  for (const [label, value] of call.fields) p[label] = value;
  // THE CALL ITSELF, last. The executor reads only these two keys.
  p.os_tool = call.tool;
  p.os_input = call.input;
  return p;
}

export function osCardSummary(call: OsCall): string {
  const line = call.fields.map(([k, v]) => `${k}: ${v.replace(/\s+/g, " ")}`).join(" · ");
  const s = `${call.action}${call.subcommand ? ` (OS ${call.subcommand})` : " (via Churlish OS)"} — ${line}`;
  return s.length > 1500 ? `${s.slice(0, 1499)}…` : s;
}

/**
 * ONE card. Runs nothing: no OS call is made until his approve, and that call
 * is `os.osTool(payload.os_tool, payload.os_input)` read back out of the hashed
 * payload — the same call the tool makes in a clean turn. confirm.ts deletes
 * the card on its first resolve, so a second approve finds nothing.
 */
export function requestOsCard(call: OsCall): PendingConfirm {
  const payload = osCardPayload(call);
  return requestConfirm(call.kind, osCardSummary(call), payload, async () => {
    const answer = await os.osTool(payload.os_tool as string, payload.os_input as Record<string, unknown>);
    if (osAnswerChangedNothing(answer)) return { executed: false, detail: `Nothing changed — the OS answered: ${answer}` };
    return answer;
  });
}
