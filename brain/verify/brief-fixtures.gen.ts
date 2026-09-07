// Generates desktop/src/shared/fixtures-brief.ts from the SHIPPED brain.
//
//   cd C:\dev\eve-cos\brain && npx tsx verify/brief-fixtures.gen.ts
//
// WHY THIS EXISTS. The BRIEF pane is photographed for review, and a pane shot
// against hand-written fixtures proves only that the designer can type. Every
// object in fixtures-brief.ts is the verbatim JSON output of buildBriefDeck()
// on the inputs below, so the PNGs are of what the brain actually emits. If
// briefing.ts changes what a row says, re-run this and the receipts move with
// it.
//
// The instant is PINNED to 2026-09-04T12:00:00Z = 07:00 America/Chicago, his
// wake hour and the hour the 07:00 cron runs, so the overnight window in the
// shot reads "9:00 PM → 7:00 AM" every time.

process.env.EVE_TZ = "America/Chicago";

import { writeFileSync } from "node:fs";
import type { RawMessage, RawEvent } from "../src/google.js";

const { buildBriefDeck } = await import("../src/briefing.js");
type BriefInput = import("../src/briefing.js").BriefInput;
const { buildDigest, buildShape } = await import("../src/mail.js");

const NOW = new Date("2026-09-04T12:00:00Z");
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const msg = (p: Partial<RawMessage>): RawMessage => ({
  id: "i",
  from: "S <s@example.com>",
  subject: "",
  date: "Fri, 04 Sep 2026 06:00:00 -0500",
  snippet: "",
  ...p,
});
const ev = (p: Partial<RawEvent>): RawEvent => ({
  id: "e",
  summary: "",
  location: "",
  description: "",
  start: "",
  end: "",
  allDay: false,
  attendees: [],
  ...p,
});

const base: BriefInput = {
  now: NOW,
  online: true,
  confirms: [],
  attention: [],
  tasks: [],
  jobs: [],
  runs: [],
  clients: [],
  promises: [],
  mail: null,
  shape: null,
  floor: null,
  blind: [],
};

// A FULL MORNING. One of each thing the four sections can hold.
const full = buildBriefDeck({
  ...base,
  confirms: [{ id: "cf-1", kind: "send_email", summary: "Send Zach the renewal update", createdAt: hoursAgo(1) }],
  attention: [
    { id: "at-draft", kind: "silent_client", message: "Rustic Lumber has gone quiet — reply drafted", nudge_level: 2, ref: { draft: "Hi Zach —" }, created_at: hoursAgo(5) },
  ],
  tasks: [
    { id: "tk-late", title: "Invoice follow-up — Creative Impact", priority: 1, due_at: hoursAgo(20) },
    { id: "tk-today", title: "Ship the VSL cut", priority: 2, due_at: new Date(NOW.getTime() + 6 * 3_600_000).toISOString() },
  ],
  jobs: [
    { id: "jb-held", unit: "starfire", title: "Weekly content pass", status: "in_approvals", created_at: hoursAgo(6), finished_at: hoursAgo(5) },
    { id: "jb-done", unit: "raven", title: "Inbox triage", status: "done", created_at: hoursAgo(4), finished_at: hoursAgo(4) },
    { id: "jb-failed", unit: "cyborg", title: "Ledger reconcile", status: "failed", created_at: hoursAgo(7), finished_at: hoursAgo(7) },
  ],
  runs: [
    { id: 91, job: "pulse_sweep", ok: true, at: hoursAgo(2) },
    { id: 92, job: "unit_clock", ok: false, at: hoursAgo(8) },
  ],
  clients: [{ id: "cl-1", name: "Rustic Lumber", cadence_days: 7, days_quiet: 19 }],
  promises: [{ content: "Send Emmanuel the funnel numbers", created_at: daysAgo(6) }],
  mail: buildDigest(
    [
      msg({ id: "m1", from: "Zach <zach@rusticlumber.com>", subject: "Renewal — can you confirm by Friday?", snippet: "We're blocked on your sign-off. Can you confirm the renewal terms by Friday?" }),
      msg({ id: "m2", from: "Newsletter <news@example.org>", subject: "Weekly roundup", snippet: "Here is what happened this week." }),
    ],
    NOW,
  ).digest,
  shape: buildShape(
    [
      ev({ id: "e1", summary: "RLS renewal call", start: "2026-09-04T15:00:00Z", end: "2026-09-04T16:00:00Z", attendees: ["a@x.com", "b@y.com"] }),
      ev({ id: "e2", summary: "VSL review — Churlish", start: "2026-09-04T21:00:00Z", end: "2026-09-04T22:00:00Z", attendees: [] }),
    ],
    NOW,
  ),
  floor: { count: 2, goal: 3 },
});

// THE COMMON ONE. Everything answered, nothing to report.
const empty = buildBriefDeck({ ...base });

// EMPTY BUT BLIND — the same zero rows, and NOT an all-clear.
const blind = buildBriefDeck({
  ...base,
  blind: [
    { section: "needs_you", say: "Gmail is not connected. She has NOT seen his inbox — no mail is reported below." },
    { section: "shape", say: "Google Calendar is not connected. She has NOT seen his day — no events are reported below." },
  ],
});

const lit = (o: unknown) => JSON.stringify(o, null, 2).split("\n").join("\n  ");

const out = `// EVE_MOCK / shot fixtures for THE BRIEF pane. Owning stream: THE BRIEF (C).
//
// NOT HAND-WRITTEN, AND NOT EDITABLE BY HAND. Every object below is the
// verbatim JSON output of the shipped brain — brain/src/briefing.ts's
// buildBriefDeck() — captured by brain/verify/brief-fixtures.gen.ts from the
// fixture inputs recorded in that file, at 2026-09-04T12:00:00Z (07:00
// America/Chicago, his wake hour). The pane is therefore photographed against
// what the brain actually emits rather than against an idea of it.
//
// To change a string here, change briefing.ts and re-run the generator.
//
// Three states, because all three are real and he will see all three:
//   mockBrief()      — a full morning: a RED card, held work, a failed job, a
//                      quiet client, a stale promise, mail with a real ask.
//   mockBriefEmpty() — THE COMMON ONE. Nothing needs him, nothing slipped, a
//                      clear calendar, a quiet night. allClear: true.
//   mockBriefBlind() — the same zero rows, but two sources could not be read.
//                      This is NOT an all-clear and must never render as one.

import type { BriefDeck } from "./contract.js";

export function mockBrief(): BriefDeck {
  return ${lit(full)};
}

export function mockBriefEmpty(): BriefDeck {
  return ${lit(empty)};
}

export function mockBriefBlind(): BriefDeck {
  return ${lit(blind)};
}
`;

const target = new URL("../../desktop/src/shared/fixtures-brief.ts", import.meta.url);
writeFileSync(target, out);
console.log(`wrote ${target.pathname}`);
console.log(`  full : ${full.sections.reduce((n, s) => n + s.items.length, 0)} rows, untrusted ${full.untrustedCount}, allClear ${full.allClear}`);
console.log(`  empty: 0 rows, allClear ${empty.allClear}`);
console.log(`  blind: 0 rows, allClear ${blind.allClear}, blind lines ${blind.sections.reduce((n, s) => n + s.blind.length, 0)}`);
