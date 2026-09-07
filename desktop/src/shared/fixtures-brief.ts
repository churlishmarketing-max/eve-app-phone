// EVE_MOCK / shot fixtures for THE BRIEF pane. Owning stream: THE BRIEF (C).
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
  return {
    "at": "2026-09-04T12:00:00.000Z",
    "day": "2026-09-04",
    "window": "9:00 PM → 7:00 AM",
    "state": "ok",
    "sections": [
      {
        "key": "needs_you",
        "title": "WHAT NEEDS YOU TODAY",
        "items": [
          {
            "id": "cf-cf-1",
            "text": "RED — Send Zach the renewal update",
            "recommend": "Read the card and sign it or kill it. Nothing leaves until you do.",
            "source": "pendingConfirms.id=cf-1",
            "origin": "ledger",
            "tone": "red",
            "rank": 0
          },
          {
            "id": "jb-jb-held",
            "text": "STARFIRE finished: Weekly content pass — held for you",
            "recommend": "Open it on THE CORE — the deliverable is done and waiting on your thumb.",
            "source": "jobs.id=jb-held",
            "origin": "ledger",
            "tone": "hot",
            "rank": 1
          },
          {
            "id": "at-at-draft",
            "text": "Rustic Lumber has gone quiet — reply drafted",
            "recommend": "The reply is drafted and on your desk. Read it, then send it yourself.",
            "source": "attention_items.id=at-draft",
            "origin": "ledger",
            "tone": "hot",
            "rank": 2
          },
          {
            "id": "tk-tk-late",
            "text": "OVERDUE — Invoice follow-up — Creative Impact",
            "recommend": "It is past its own due time. Move it or do it — do not let it sit a second day.",
            "source": "tasks.id=tk-late",
            "origin": "ledger",
            "tone": "hot",
            "rank": 3
          },
          {
            "id": "ml-m1",
            "text": "Zach: Renewal — can you confirm by Friday?",
            "recommend": "Someone is stopped until you move. Unblock them first.",
            "source": "mail.ref=m1 (asks-a-question, carries-a-date, blocks-someone)",
            "origin": "untrusted",
            "tone": "acc",
            "rank": 4
          }
        ],
        "empty": "Nothing is waiting on you. No cards, no held work, no overdue promises, no mail with an ask in it.",
        "blind": []
      },
      {
        "key": "overnight",
        "title": "WHAT SHE DID OVERNIGHT",
        "items": [
          {
            "id": "ov-j-jb-held",
            "text": "STARFIRE finished and held: Weekly content pass",
            "recommend": "Nothing needed. This is the receipt.",
            "source": "jobs.id=jb-held status=in_approvals",
            "origin": "ledger",
            "tone": "dim",
            "rank": 0
          },
          {
            "id": "ov-j-jb-done",
            "text": "RAVEN finished: Inbox triage",
            "recommend": "Nothing needed. This is the receipt.",
            "source": "jobs.id=jb-done status=done",
            "origin": "ledger",
            "tone": "dim",
            "rank": 1
          },
          {
            "id": "ov-j-jb-failed",
            "text": "CYBORG failed: Ledger reconcile",
            "recommend": "Nothing needed. This is the receipt.",
            "source": "jobs.id=jb-failed status=failed",
            "origin": "ledger",
            "tone": "hot",
            "rank": 2
          },
          {
            "id": "ov-r-91",
            "text": "pulse sweep ran — clean",
            "recommend": "Nothing needed. This is the receipt.",
            "source": "runs.id=91",
            "origin": "ledger",
            "tone": "dim",
            "rank": 3
          },
          {
            "id": "ov-r-92",
            "text": "unit clock ran — it did not finish clean",
            "recommend": "Nothing needed. This is the receipt.",
            "source": "runs.id=92",
            "origin": "ledger",
            "tone": "hot",
            "rank": 4
          },
          {
            "id": "ov-a-at-draft",
            "text": "Drafted and left on your desk: Rustic Lumber has gone quiet — reply drafted",
            "recommend": "Nothing needed. This is the receipt.",
            "source": "attention_items.id=at-draft",
            "origin": "ledger",
            "tone": "dim",
            "rank": 5
          }
        ],
        "empty": "Nothing ran. Her log is empty for the window, which is what an ordinary night looks like.",
        "blind": []
      },
      {
        "key": "slipping",
        "title": "WHAT IS SLIPPING",
        "items": [
          {
            "id": "sl-c-cl-1",
            "text": "Rustic Lumber — 19 days quiet against a 7-day cadence",
            "recommend": "Past their own cadence. Send a line today, or change the cadence to the truth.",
            "source": "clients.id=cl-1",
            "origin": "ledger",
            "tone": "hot",
            "rank": 0
          },
          {
            "id": "sl-j-jb-failed",
            "text": "CYBORG failed: Ledger reconcile",
            "recommend": "It ended without a deliverable. Re-run it or drop it — do not leave it half-done.",
            "source": "jobs.id=jb-failed",
            "origin": "ledger",
            "tone": "hot",
            "rank": 1
          },
          {
            "id": "sl-p-1788004800000",
            "text": "6 days open: Send Emmanuel the funnel numbers",
            "recommend": "You said you would. It is still open.",
            "source": "memory_entries.kind=promise created_at=2026-08-29",
            "origin": "ledger",
            "tone": "acc",
            "rank": 2
          }
        ],
        "empty": "Nothing is slipping. Every client is inside its own cadence and no promise has gone stale.",
        "blind": []
      },
      {
        "key": "shape",
        "title": "TODAY'S SHAPE",
        "items": [
          {
            "id": "sh-e-e1",
            "text": "10:00 AM–11:00 AM — RLS renewal call (2 on it)",
            "recommend": "On the calendar. Nothing to decide.",
            "source": "calendar.ref=e1",
            "origin": "untrusted",
            "tone": "dim",
            "rank": 0
          },
          {
            "id": "sh-e-e2",
            "text": "4:00 PM–5:00 PM — VSL review — Churlish",
            "recommend": "On the calendar. Nothing to decide.",
            "source": "calendar.ref=e2",
            "origin": "untrusted",
            "tone": "dim",
            "rank": 1
          },
          {
            "id": "sh-g-2026-09-04T13:00:00.000Z",
            "text": "FREE — 8:00 AM–10:00 AM (2h)",
            "recommend": "A real hole in the day. Put the hardest thing here.",
            "source": "calendar.gap minutes=120",
            "origin": "ledger",
            "tone": "acc",
            "rank": 2
          },
          {
            "id": "sh-g-2026-09-04T16:00:00.000Z",
            "text": "FREE — 11:00 AM–4:00 PM (5h)",
            "recommend": "A real hole in the day. Put the hardest thing here.",
            "source": "calendar.gap minutes=300",
            "origin": "ledger",
            "tone": "acc",
            "rank": 3
          },
          {
            "id": "sh-g-2026-09-04T22:00:00.000Z",
            "text": "FREE — 5:00 PM–6:00 PM (1h)",
            "recommend": "A real hole in the day. Put the hardest thing here.",
            "source": "calendar.gap minutes=60",
            "origin": "ledger",
            "tone": "acc",
            "rank": 4
          },
          {
            "id": "sh-t-tk-today",
            "text": "DUE TODAY — Ship the VSL cut",
            "recommend": "This is one of the three. It goes before anything that arrives today.",
            "source": "tasks.id=tk-today",
            "origin": "ledger",
            "tone": "acc",
            "rank": 5
          },
          {
            "id": "sh-floor",
            "text": "Sales floor 2 of 3 this week",
            "recommend": "The week's floor. Real conversations, not drafts.",
            "source": "floor.count",
            "origin": "ledger",
            "tone": "acc",
            "rank": 6
          }
        ],
        "empty": "The day is open. Nothing on the calendar, nothing due — the hours are yours to spend.",
        "blind": []
      }
    ],
    "allClear": false,
    "coverage": [
      "Gmail and Google Calendar only. Texts, Instagram/Facebook DMs and Discord are NOT connected and are NOT read.",
      "Renewals and content gaps are only counted when an attention item already exists for them — there is no renewals table and no content ledger on the wire.",
      "Overnight is read from jobs, runs and attention items only. Work that leaves no row is not claimed."
    ],
    "untrustedCount": 3
  };
}

export function mockBriefEmpty(): BriefDeck {
  return {
    "at": "2026-09-04T12:00:00.000Z",
    "day": "2026-09-04",
    "window": "9:00 PM → 7:00 AM",
    "state": "ok",
    "sections": [
      {
        "key": "needs_you",
        "title": "WHAT NEEDS YOU TODAY",
        "items": [],
        "empty": "Nothing is waiting on you. No cards, no held work, no overdue promises, no mail with an ask in it.",
        "blind": []
      },
      {
        "key": "overnight",
        "title": "WHAT SHE DID OVERNIGHT",
        "items": [],
        "empty": "Nothing ran. Her log is empty for the window, which is what an ordinary night looks like.",
        "blind": []
      },
      {
        "key": "slipping",
        "title": "WHAT IS SLIPPING",
        "items": [],
        "empty": "Nothing is slipping. Every client is inside its own cadence and no promise has gone stale.",
        "blind": []
      },
      {
        "key": "shape",
        "title": "TODAY'S SHAPE",
        "items": [],
        "empty": "The day is open. Nothing on the calendar, nothing due — the hours are yours to spend.",
        "blind": []
      }
    ],
    "allClear": true,
    "coverage": [
      "Gmail and Google Calendar only. Texts, Instagram/Facebook DMs and Discord are NOT connected and are NOT read.",
      "Renewals and content gaps are only counted when an attention item already exists for them — there is no renewals table and no content ledger on the wire.",
      "Overnight is read from jobs, runs and attention items only. Work that leaves no row is not claimed."
    ],
    "untrustedCount": 0
  };
}

export function mockBriefBlind(): BriefDeck {
  return {
    "at": "2026-09-04T12:00:00.000Z",
    "day": "2026-09-04",
    "window": "9:00 PM → 7:00 AM",
    "state": "ok",
    "sections": [
      {
        "key": "needs_you",
        "title": "WHAT NEEDS YOU TODAY",
        "items": [],
        "empty": "Nothing is waiting on you. No cards, no held work, no overdue promises, no mail with an ask in it.",
        "blind": [
          "Gmail is not connected. She has NOT seen his inbox — no mail is reported below."
        ]
      },
      {
        "key": "overnight",
        "title": "WHAT SHE DID OVERNIGHT",
        "items": [],
        "empty": "Nothing ran. Her log is empty for the window, which is what an ordinary night looks like.",
        "blind": []
      },
      {
        "key": "slipping",
        "title": "WHAT IS SLIPPING",
        "items": [],
        "empty": "Nothing is slipping. Every client is inside its own cadence and no promise has gone stale.",
        "blind": []
      },
      {
        "key": "shape",
        "title": "TODAY'S SHAPE",
        "items": [],
        "empty": "The day is open. Nothing on the calendar, nothing due — the hours are yours to spend.",
        "blind": [
          "Google Calendar is not connected. She has NOT seen his day — no events are reported below."
        ]
      }
    ],
    "allClear": false,
    "coverage": [
      "Gmail and Google Calendar only. Texts, Instagram/Facebook DMs and Discord are NOT connected and are NOT read.",
      "Renewals and content gaps are only counted when an attention item already exists for them — there is no renewals table and no content ledger on the wire.",
      "Overnight is read from jobs, runs and attention items only. Work that leaves no row is not claimed."
    ],
    "untrustedCount": 0
  };
}
