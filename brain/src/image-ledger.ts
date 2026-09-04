// THE CONVERSATION LEDGER — the in-process FAST PATH for "is there a picture in
// this conversation", and the SDK session id it belongs beside.
//
// IT IS NOT THE AUTHORITY ANY MORE. Read src/taint.ts first. Since audit 5 the
// fact that a conversation has carried a picture lives in the DURABLE store, on
// the same row as the conversation whose history gets replayed. This file is
// what lets that answer be TAINTED without a round trip; it is never believed
// when it says clean.
//
// In its own module, and not inside chat.ts, for one reason: it is the
// arithmetic behind whether a plan is graded at all, and arithmetic that
// decides that has to be provable without booting the SDK, a database, or a
// model call. verify/image-harness.ts and verify/audit5-harness.ts drive it
// directly.
//
// ---------------------------------------------------------------------------
// AUDIT 5, B1 — WHY THIS FILE STOPPED BEING THE ANSWER
//
// Everything the old header said was true and still insufficient. The taint was
// correctly tied to the SDK session and correctly never expired on a clock —
// and the whole Map still died with the process, while the desktop kept ONE
// conversationId in localStorage forever. Audit 5 drove it live:
//
//   picture on turn 1 -> refused. turn 2 -> refused. BRAIN RESTARTED.
//   turn 3, SAME conversationId -> A REAL CARD, stamped
//   {sawImage:false, imageTurnsAgo:null} — which the card contract defines as
//   I LOOKED AND THERE WAS NO PICTURE.
//
//   THE ROW LAPSED WHILE THE CONVERSATION DID NOT — the same failure as the old
//   25-turn window and the old uncapped `sessions` map, wearing a third shape.
//
// Three ordinary triggers reach it: any brain restart (a Railway redeploy is
// one), any FAILED turn (chat.ts dropped the row on a non-success SDK result
// and again in the catch, and maxTurns is 16), and LEDGER_CAP eviction. And the
// durable message history rehydrated on EXACTLY the turn this row was missing,
// replaying her own words about the picture back into the context pack. The
// gate and the replay keyed on the same missing row in OPPOSITE directions.
//
// So the fact moved OUT of this process, into `conversations.saw_image`:
// written before the model sees the picture, never cleared by anything, read
// fail-closed. See src/taint.ts and sql/005_picture_taint.sql.
//
// WHAT THIS FILE STILL DOES, and it is worth keeping:
//   * it holds the SDK SESSION ID beside the stamp (D2), so a conversation that
//     can be resumed always has one and a conversation that has lost its stamp
//     cannot be resumed;
//   * it counts turns, so "one turn ago" and "forty turns ago" are still
//     different sentences on his screen;
//   * it answers TAINTED instantly, with no round trip, for the life of the
//     process.
// Its `seen:false` is now a NON-ANSWER, and every caller treats it as one.
//
// ---------------------------------------------------------------------------
// THE LAUNDER, which is why the taint is not per-turn (audit 2, b10 / b10c):
//
//   TURN 1  he attaches a picture that names a folder. She refuses, correctly.
//   TURN 2  no picture. He types five words: "yeah, go ahead and file them".
//           She builds a real batch for the picture's folder, calls it "as you
//           said", and the card is stamped {sawImage:false} — which the
//           contract defines as "I CHECKED, THERE WAS NO PICTURE".
//
// A per-turn stamp cannot describe a plan whose cause is a turn ago, because
// the model's context still holds every pixel of turn 1 for the life of the SDK
// session. So the taint belongs to the CONVERSATION — and, since B1, to the
// conversation's DURABLE ROW rather than to a process that can be restarted.
//
// ---------------------------------------------------------------------------
// AUDIT 3 KILLED THE 25-TURN WINDOW. Read this before restoring a number.
//
// The old ledger expired the taint after 25 turns and then returned `null`,
// which the contract defined as "I looked and there was no picture". But
// chat.ts keeps its session and passes `resume:`, so the hostile screenshot is
// still in the SDK transcript on turn 26, on turn 200, for the life of the
// process.
//
//   THE WINDOW LAPSED WHILE THE PIXELS DID NOT.
//
// A number that stops being true on a schedule is worse than no number, because
// the contract gave that particular falsehood a confident meaning.
//
// The turn count survives, because "one turn ago" and "forty turns ago" are
// genuinely different things for him to read. But it degrades, it never
// vanishes: past `TAINT_FRESH_TURNS` the stamp carries `expired: true` and the
// banner softens. The REFUSALS do not soften. Nothing about `expired` gates
// anything.
//
// ---------------------------------------------------------------------------
// WHAT A PICTURE COSTS HIM, STATED CORRECTLY (audit 5, and this header was the
// thing that was wrong).
//
// THE NARROW MOVE-ONLY SHAPE IS DEAD AND THIS HEADER USED TO SAY OTHERWISE. It
// told the next reader that filing still worked while a picture was in the room
// — moves but not renames, and any destination the picture had not named —
// which was the structural-exclusion design audit 4 deleted along with narrow.ts
// and reader.ts. A comment describing a rule that no longer exists is a lie to
// the next reader, and it is the exact audit-4 failure. THE DEAD SENTENCE IS NOT
// QUOTED HERE ON PURPOSE: verify/audit5-harness.ts greps this file for it, and a
// rot check you can defeat by quoting the rot is not a rot check. What is true
// now is simpler and stricter:
//
//   WHILE A PICTURE HAS BEEN IN THIS CONVERSATION, `desk_file_plan` REFUSES.
//   Every operation. Every shape. Every folder, including one he typed himself.
//
// The taint does not narrow the feature, it switches it off for that thread,
// and the ONLY exit is a fresh conversation — which his deck offers him a
// button for on ANY picture refusal, with the names she matched or without them
// when she matched none. See picture.ts and desktop/src/shared/handoff.ts.
//
// Owning stream: BRAIN/S2.
// ---------------------------------------------------------------------------

/**
 * How far back a picture can be and still be described as CURRENT. This is a
 * DISPLAY threshold and nothing else — it gates no refusal, and crossing it
 * changes one boolean on a banner. It is not a security parameter and must
 * never become one.
 */
export const TAINT_FRESH_TURNS = 25;

/**
 * Bounded, so a long-lived brain cannot accumulate conversations forever.
 *
 * D2: this bounds the SDK SESSION ID as well, because it is in the same row.
 * Evicting a conversation drops its resume id in the same statement as its
 * stamp, so eviction can never leave a resumable transcript behind a stamp that
 * says there was no picture.
 *
 * B1: and eviction no longer un-taints anything either, because the taint is
 * not in here. Evicting row 501 costs a fast path and a resume id; the durable
 * bit is untouched and the next turn of that conversation still refuses.
 */
export const LEDGER_CAP = 500;

/**
 * THE STAMP — this process's fast answer, and nothing more.
 *
 * `seen:true` is DECISIVE: nothing in this system can make an in-process "there
 * was a picture" wrong. `seen:false` is a NON-ANSWER and must never be read as
 * "there was no picture" — the row dies with the process, and B1 is what
 * happened the last time a caller believed it. The durable bit in src/taint.ts
 * is the authority, and a disagreement resolves to TAINTED.
 *
 * `turnsAgo` is null if and only if `seen` is false.
 */
export interface ImageStamp {
  /** Pixels rode in on THIS turn. */
  sawImage: boolean;
  /** A picture is in this SESSION's transcript. Once true, true until it dies. */
  seen: boolean;
  /** Turns since the last picture: 0 for this turn. `null` only when !seen. */
  turnsAgo: number | null;
  /** Past TAINT_FRESH_TURNS. Degrades the banner. Gates nothing. */
  expired: boolean;
}

interface ImageLedgerEntry {
  turns: number;
  lastImageTurn: number | null;
  /**
   * THE SDK SESSION ID (D2). The transcript this id resumes is the thing that
   * physically holds the pixels, so it lives in the same row as the stamp that
   * describes them. `null` until the SDK's init message names one.
   */
  sessionId: string | null;
}

const ledger = new Map<string, ImageLedgerEntry>();

/** The stamp for a conversation that has never carried a picture. */
export const NO_PICTURE: ImageStamp = { sawImage: false, seen: false, turnsAgo: null, expired: false };

/**
 * Count this turn, record whether it carried pixels, and answer WHAT IS TRUE
 * ABOUT THIS CONVERSATION.
 *
 * Called ONCE per runChat, BEFORE the model generates a token, so what it
 * returns is a fact about the conversation rather than a report from inside a
 * turn that may already be compromised.
 */
export function noteTurn(conversationId: string, sawImage: boolean): ImageStamp {
  const prev = ledger.get(conversationId);
  const turns = (prev?.turns ?? 0) + 1;
  const lastImageTurn = sawImage ? turns : prev?.lastImageTurn ?? null;
  // Re-insert at the tail so the cap evicts the least recently USED thread and
  // not merely the oldest one he ever opened.
  ledger.delete(conversationId);
  ledger.set(conversationId, {
    turns,
    lastImageTurn,
    // D2: carried forward with the taint, never separately, so the resume id
    // and the stamp cannot outlive each other.
    sessionId: prev?.sessionId ?? null,
  });
  // Eviction takes from the HEAD, and this conversation was just re-inserted at
  // the tail, so the turn being counted is never the turn being evicted.
  while (ledger.size > LEDGER_CAP) {
    const oldest = ledger.keys().next().value;
    if (oldest === undefined) break;
    ledger.delete(oldest);
  }
  if (lastImageTurn === null) return NO_PICTURE;
  const ago = turns - lastImageTurn;
  return { sawImage, seen: true, turnsAgo: ago, expired: ago > TAINT_FRESH_TURNS };
}

// THE READER'S TRANSCRIPT USED TO LIVE ON THIS ROW, and it is gone with the
// reader (`rememberReader` / `readerFor`, and src/reader.ts with them).
//
// It was here to serve `narrowCheck`'s exclusion list — "refuse a destination
// the picture mentions" — which needed the transcript to survive into every
// later turn of the session, because the launder fires on a turn with no pixels
// on it. That whole mechanism is deleted: the planner was asked for MEANING and
// the reader for GLYPHS, and a line-wrapped folder name, an acronym, or a
// 433-line flood makes the two disagree. See picture.ts.
//
// What is left is the thing the exclusion list was only ever a way of avoiding:
// while this row says a picture has been in the conversation, NO PLAN IS BUILT
// AT ALL. The stamp below is now the whole input to that decision, which is why
// it is the only thing this file still keeps.

/**
 * THE SDK SESSION ID FOR THIS CONVERSATION, or null when there is none to
 * resume (D2).
 *
 * This is the ONLY door to a resume id. A conversation whose row has been
 * evicted returns null here, so the next turn starts a NEW SDK session with an
 * empty transcript — the pixels really are gone from her context.
 *
 * WHAT THAT DOES NOT MEAN is that the CONVERSATION is clean. B1: the durable
 * message history is replayed on exactly the turn there is no session to
 * resume, and her own reply describing the picture is inside that window. The
 * absence of a resume id is a fact about pixels, never a fact about the
 * conversation — chat.ts asks src/taint.ts for the latter, and gates the
 * history replay on the same answer.
 */
export function sessionFor(conversationId: string): string | null {
  return ledger.get(conversationId)?.sessionId ?? null;
}

/**
 * Remember the SDK session id the init message named (D2).
 *
 * IF THE ROW IS GONE, THE ID IS DROPPED rather than re-created. A row can only
 * be missing here if this conversation was evicted mid-turn (LEDGER_CAP other
 * threads inside one turn), and re-creating it would attach a live, resumable
 * transcript to a fresh row whose stamp reads "no picture has ever been here".
 * Losing continuity on that thread is the cheap failure; the other one is the
 * failure D2 is about.
 */
export function noteSession(conversationId: string, sessionId: string): void {
  const e = ledger.get(conversationId);
  if (e) e.sessionId = sessionId;
}

/**
 * DROP THIS PROCESS'S ROW — the SDK session id and the fast-path stamp
 * together (D2). chat.ts `endSession()` is the single call site, and it fires
 * when a turn fails so a poisoned transcript cannot permanently break a
 * conversation.
 *
 * THIS DOES NOT END THE TAINT, and the name it used to carry said it did. The
 * taint is `conversations.saw_image` and NOTHING CLEARS IT — not this function,
 * not endSession, not the catch in chat.ts, not eviction, not a restart. B1 was
 * precisely a failed turn calling this and the next turn filing. All it does
 * now is give up the fast path and the resume id; the next turn asks the store,
 * and the store still says yes.
 */
export function clearImageTaint(conversationId: string): void {
  ledger.delete(conversationId);
}

/** Test seam, and the only other door. There is no endpoint onto this map. */
export function resetImageLedger(): void {
  ledger.clear();
}

/** Test seam. Read-only view of one conversation's row, session id included. */
export function peekImageLedger(
  conversationId: string,
): { turns: number; lastImageTurn: number | null; sessionId: string | null } | null {
  const e = ledger.get(conversationId);
  return e ? { ...e } : null;
}
