// THE BRIEF — state → view. Owning stream: THE BRIEF (C).
//
// counters.ts's job, for this pane: the ONE place that turns /state into
// something the screen asserts, and therefore the only place that can lie.
// Its law is inherited verbatim — "offline is a DASH, never a zero. A zero is a
// measurement. A dash is the truth when nothing was measured."
//
// THREE ABSENCES, DISTINGUISHED, because they are three different sentences and
// collapsing them is exactly how a pane starts lying:
//
//   state.brief === undefined   the brain served no `brief` key at all — an
//                               older brain, or api.ts's bare {online:false}
//                               network failure.        → "no-key"
//   state.brief === null        the brain answered and has NO BRIEF YET: the
//                               07:00 run has not happened since the last
//                               restart.                → "not-yet"
//   state.brief is a deck       she filed one.          → "none" (no absence)
//
// A fourth state sits on top of those: the deck is present but `state.online`
// is false. brain/src/state.ts serves `brief` on BOTH degraded returns on
// purpose, so what he sees then is a REAL brief that is no longer being
// refreshed. That is `stale` — not an error, and not current either.
//
// THE COLOUR LAW OUTRANKS THE BRAIN'S TONE. briefing.ts tones a tripwire "red"
// because it is the loudest thing in its section. On this screen red is
// RESERVED: "#C41E3A = RED confirm tier or live mic ONLY". So a brain tone of
// "red" is honoured as red ONLY when the row is genuinely a pending RED confirm
// card — which the row's own `source` proves — and is otherwise demoted to gold.
// This is the same ruling counters.ts already made for FAILED jobs: "D-DISPATCH
// §7.2 wrote 'FAILED n (red)'; the colour law outranks it."

import type { BriefDeck, BriefItem, BriefSection, EveState } from "@shared/contract";

export const DASH = "—";

/** The pane's tones. Same four names counters.ts uses. */
export type BriefPaneTone = "acc" | "hot" | "red" | "off";

export type BriefAbsence = "none" | "no-key" | "not-yet";

export interface BriefView {
  deck: BriefDeck | null;
  absence: BriefAbsence;
  /** A real deck, but the brain is not answering now, so it is not being refreshed. */
  stale: boolean;
  /** The sentence the pane shows INSTEAD of a brief. Empty when there is a deck. */
  absenceSay: string;
  /** Every section that could not read at least one of its sources. */
  blindSections: number;
  /** True only when the brain itself claimed an all-clear AND we are not stale. */
  allClear: boolean;
}

/**
 * The ONLY route from EveState to this pane. Never invents a deck, and never
 * turns "she has not run yet" into "nothing needs you".
 */
export function briefView(state: EveState): BriefView {
  const raw = state.brief;

  if (raw === undefined) {
    return {
      deck: null,
      absence: "no-key",
      stale: false,
      absenceSay:
        "Her brain served no brief. That is not an empty brief — it is no answer at all: either she is unreachable, or this brain is older than the brief.",
      blindSections: 0,
      allClear: false,
    };
  }

  if (raw === null) {
    return {
      deck: null,
      absence: "not-yet",
      stale: false,
      absenceSay:
        "No brief has been built yet today. The 07:00 run has not happened since her last restart. Nothing below is missing — there is simply nothing to show.",
      blindSections: 0,
      allClear: false,
    };
  }

  const blindSections = raw.sections.filter((s) => s.blind.length > 0).length;
  return {
    deck: raw,
    absence: "none",
    stale: !state.online,
    absenceSay: "",
    blindSections,
    // allClear is the brain's claim, and it already requires that every source
    // answered. We only ever narrow it: a stale deck is not a current all-clear.
    allClear: raw.allClear && state.online,
  };
}

/**
 * The brain's tone, filtered through the desktop's colour law.
 * `red` survives ONLY for a pending RED confirm card. Everything the brain
 * shouted at becomes gold, which is what gold is for.
 */
export function paneTone(item: BriefItem): BriefPaneTone {
  if (item.tone === "red") return item.source.startsWith("pendingConfirms.") ? "red" : "hot";
  if (item.tone === "hot") return "hot";
  if (item.tone === "dim") return "off";
  return "acc";
}

/** tone → class. Same shape as CorePane's toneClass: "acc" is the default, unclassed. */
export function toneClass(t: BriefPaneTone): string {
  return t === "acc" ? "" : t;
}

// ---------------------------------------------------------------------------
// WHAT A SECTION KNOWS — ONE DECISION, TWO RENDERERS.
//
// THE MIRROR OF brain/src/briefing.ts's sectionKnowledge() / BLIND_NOT_CLEAR,
// byte for byte. A deck is rendered twice — by this pane, and by the push
// writer that feeds the 07:00 notification — and the push reaches his phone
// BEFORE he opens the app, so the two must answer "may this section say it is
// clear?" identically or the first surface he sees contradicts the second.
//
//   "listed"  there are rows. Show them. (Blind lines still show ALONGSIDE.)
//   "blind"   no rows AND a source did not answer. NOT a measured zero, so the
//             section's `empty` sentence is FORBIDDEN — she did not look.
//   "empty"   no rows and every source answered. A measured zero; it may say so.
//
// It is a copy because the brain and the desktop are separate npm packages and
// briefing.ts imports db/mail/day code a renderer can never load — the same
// reason contract.ts hand-mirrors briefing.ts's types. The copy is proved by
// EXECUTION, not inspection: brain/verify/brief-harness.ts C7 imports THIS file
// and fails the moment the two implementations disagree on any section shape.
// Nothing else in this file may be imported by that harness, which is why this
// module's only import is a type-only one.
// ---------------------------------------------------------------------------
export type SectionKnowledge = "listed" | "blind" | "empty";

/** What a rowless-but-blind section says INSTEAD of its empty sentence. */
export const BLIND_NOT_CLEAR = "Nothing else was readable here, so this section is not an all-clear.";

export function sectionKnowledge(s: { items: unknown[]; blind: unknown[] }): SectionKnowledge {
  if (s.items.length > 0) return "listed";
  if (s.blind.length > 0) return "blind";
  return "empty";
}

/**
 * The count in a section's right-hand meta.
 *
 * A section with no rows is NOT automatically a zero. If it could not read one
 * of its sources, the number of things in it is genuinely unknown, and the
 * honest mark for an unknown is a dash. Only a section that read everything and
 * found nothing has actually measured a zero — and it says so in words anyway,
 * so the dash costs him nothing and the lie would cost him a lot.
 *
 * "Did she measure this?" is the SAME question sectionKnowledge answers, so it
 * is asked there rather than re-derived here.
 */
export function sectionCount(s: BriefSection): string {
  if (sectionKnowledge(s) === "blind") return DASH;
  return String(s.items.length);
}

/** How many rows in the whole deck came out of third-party text. */
export function untrustedNote(deck: BriefDeck): string | null {
  if (deck.untrustedCount === 0) return null;
  return deck.untrustedCount === 1
    ? "1 line below was read out of his mail or calendar. It is quoted, not acted on."
    : `${deck.untrustedCount} lines below were read out of his mail or calendar. They are quoted, not acted on.`;
}
