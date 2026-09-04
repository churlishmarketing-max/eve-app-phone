// HONESTY — the receipt, the licence, and the one renderer every desk refusal
// goes through. For the FILING path.
//
// PURE. No I/O, no module state, no clock, no randomness, no model call. Same
// discipline as desk.ts, image.ts and narrow.ts, and for the same reason: a
// belt that only exists as a sentence in a prompt is a belt the next turn can
// argue with.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE USED TO BE, AND WHY HALF OF IT IS GONE (audit 4, W1 + W2)
//
// It used to hold two KEYWORD DETECTORS and the two corrections they appended
// to her answer:
//
//   cardClaims()      a CLAIM word list ("queued", "approve card", "card is
//                     up", ...) that fired when zero cards were raised, and
//                     appended PHANTOM_CARD_CORRECTION.
//   diskFaultClaims() a DISK_FAULT word list ("corrupted", "malformed", ...)
//                     that fired when the desk had refused, and appended
//                     INVENTED_FAULT_CORRECTION.
//
// BOTH ARE DELETED. Not narrowed, not extended — deleted, and deliberately not
// replaced with a longer list.
//
//   W1. The claim detector was broken 11 times out of 11 by ordinary English:
//       "I've put that in front of you for approval", "It's on your desk now,
//       ready for the green light", "That batch is sitting there for you to
//       sign off", "The plan is staged for your OK". A leading modal disarmed
//       even a LISTED phrase — "You can see it's queued for your approve"
//       passed the PROMISE guard while "It's queued for your approve" was
//       caught. Policing her prose with a word list is the same losing shape
//       three image audits already condemned: a longer regex against an
//       adversary — or just a fluent writer — choosing the words.
//
//       THE REPLACEMENT IS NOT A BETTER DETECTOR. IT IS GROUND TRUTH ON THE
//       SCREEN. The desktop already knows exactly how many cards are waiting
//       (/state.pendingConfirms plus the confirm frames on the turn), so the
//       deck now prints that number beside the conversation AT ALL TIMES,
//       including when it is ZERO, and prints THIS TURN RAISED NO CARD under a
//       finished turn that emitted no confirm frame. A false claim is then
//       visibly false without anyone parsing a sentence, and he never has to
//       trust her sentence about whether a card exists.
//       See desktop/src/shared/card-truth.ts and deck/TalkColumn.tsx.
//
//   W2. The fault detector caught "corrupted" and "malformed" and missed 8 of
//       10 real paraphrases ("that file seems to be missing from the folder",
//       "I couldn't find that one on disk", "looks like the scan tool is
//       down", "the desk is offline", "that one's locked by another program").
//       Worse, the correction it appended PROMISED coverage the detector did
//       not have: it said "Nothing was found corrupted, malformed or missing"
//       while DISK_FAULT had no term for missing at all. A backstop that
//       asserts more than it checks is worse than none, so it is gone and
//       nothing asserts in its place. What remains is the thing that was
//       already doing the work: the refusal text itself. G-EXT's rewrite is
//       the model — the true reason is the easiest thing to say — and
//       NO_DIAGNOSIS below forbids the invented ones BY NAME at the only
//       moment they are tempting, which is inside the refusal she is reading.
//
// WHAT SURVIVES, and why each piece earns it:
//
//   THE RECEIPT. A card claim needs a receipt, and the only place a receipt is
//   ever minted is the tool result that actually raised the card (`cardReceipt`,
//   called by desk_file_plan in connectors.ts with the real confirm id). She
//   cannot mint one: the id is a uuid she never sees unless a card exists. This
//   is a POSITIVE licence handed out with the thing that makes it true — the
//   opposite shape to a list of forbidden words.
//
//   THE REFUSAL RENDERER. One shape for every plan refusal, carrying the rule
//   id and the quotable reason, with NO_DIAGNOSIS attached.
//
//   THE LOG LINE. chat.ts still counts cards raised and desk refusals per turn.
//   That count is now written to the log and NOWHERE ELSE — it is never
//   injected into her answer. A number in a log cannot promise more than it
//   counted.
//
// Owning stream: BRAIN/S2.
// ---------------------------------------------------------------------------

/**
 * THE RECEIPT. Minted only by the code path that actually raised a card, and
 * handed back inside that tool's result. The confirm id is a uuid: she cannot
 * guess one, and there is no other place in a turn where one appears.
 */
export function cardReceipt(confirmId: string): string {
  return `CARD RAISED — receipt ${confirmId}`;
}

/**
 * The clause that goes on EVERY card-raising tool result. It hands her the true
 * sentence and closes the only door she has ever walked through instead.
 *
 * Note the shape: this licenses words when they are TRUE. It does not try to
 * enumerate the words that would be false, because that list does not exist —
 * that is W1, and the deck's own card counter is the answer to it.
 */
export function cardLicence(confirmId: string): string {
  return (
    `${cardReceipt(confirmId)}. This receipt is the ONLY thing that lets you say the words "queued", ` +
    `"approve card", "card is up", "waiting for your approve" or anything of that shape. You have one now, ` +
    `so say it. If a turn ever ends without a receipt in front of you, THERE IS NO CARD: do not say it is ` +
    `queued, do not say it is waiting, do not say "approve and they're filed", and do not tell him to ` +
    `confirm anything, in those words or any others. Say what you actually did and what you need from him. ` +
    `His deck prints the number of cards waiting for him beside this conversation, and prints THIS TURN ` +
    `RAISED NO CARD under a finished turn that raised none — so a card you announce and did not raise is ` +
    `not a risk you are running, it is a sentence he can already see is false.`
  );
}

/**
 * THE CLAUSE ON EVERY DESK REFUSAL (audit 3, C3). The true reason is right
 * there in the refusal, so the easiest thing to say is the true thing; and the
 * sentences she reached for instead are named and forbidden by name, because
 * "be honest" did not stop them and "his disk is fine" does.
 *
 * EVERY CLAIM IN HERE IS ONE THIS BOX CAN PROVE. "Nothing here is corrupted,
 * malformed, damaged, invalid or missing" is not a promise about a check that
 * was run over his files — it is a statement about what this system's refusal
 * strings are capable of saying, and the DISK-FAULT CENSUS in
 * verify/honesty-harness.ts reads the shipped strings and proves it rather than
 * asserting it. That is the W2 rule applied to this file's own text: the claim
 * in the output is exactly the claim the code can prove.
 */
export const NO_DIAGNOSIS = (
  "NO CARD WAS RAISED and nothing is waiting for him. That reason above is the WHOLE reason — it is " +
  "quotable, say it in your own words and stop there. DO NOT INVENT A CAUSE I DID NOT GIVE YOU. In " +
  "particular: nothing here is corrupted, malformed, damaged, invalid or missing; the desk did not spot, " +
  "say, find or flag anything wrong with any of his files; there is no tool outage, no tool-layer issue " +
  "and no bug to work around; and there is nothing for him to go and look at in a folder. This was a rule " +
  "in this box refusing a plan, not his machine having a problem. Fix the plan or ask him what he meant — " +
  "never diagnose his disk."
);

/** Render a plan refusal the one way it is ever rendered. */
export function renderPlanRefusal(rule: string, reason: string): string {
  return `Refused before it reached him — ${reason} (${rule}). ${NO_DIAGNOSIS}`;
}

// ---------------------------------------------------------------------------
// THE TURN LEDGER — a log line, and nothing else
// ---------------------------------------------------------------------------

export interface TurnFacts {
  /** file_batch confirms actually emitted this turn. Counted by chat.ts. */
  cardsRaised: number;
  /** desk tool refusals this turn. Counted by connectors.ts. */
  deskRefusals: number;
}

/**
 * What this process COUNTED on this turn. Two integers it kept itself, written
 * to the log so a later question about a turn has an answer.
 *
 * It says nothing about what she SAID, because nothing here read what she said,
 * and it is never appended to her answer. That restraint is the whole of W2's
 * lesson: the claim in the output must be exactly the claim the code can prove,
 * and all this code can prove is a count.
 */
export function turnLedgerLine(conversationId: string, facts: TurnFacts): string {
  return `[turn] ${conversationId} cardsRaised=${facts.cardsRaised} deskRefusals=${facts.deskRefusals}`;
}
