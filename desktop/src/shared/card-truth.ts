// CARD TRUTH — the two sentences the app prints ABOUT cards, and the exact
// claim each one is allowed to make. Owning stream: DESK/S1.
//
// Pure strings in, pure strings out. No DOM, no React, no Electron, nothing
// async. It lives in shared/ rather than inside the renderer for the same
// reason destination-check.ts does: these sentences are load-bearing, and a
// load-bearing sentence has to be provable without booting a window.
// verify/desk-injection-harness.mjs drives both halves directly.
//
// ---------------------------------------------------------------------------
// HALF ONE — HOW MANY CARDS ARE WAITING (audit 4, W1)
//
// The brain used to police her PROSE for card claims: a keyword list
// ("queued", "approve card", "waiting for your approve"...) that fired when
// zero cards had been raised and appended a correction to her answer. The
// audit broke it 11 times out of 11 with ordinary paraphrase — "I've put that
// in front of you for approval", "It's on your desk now, ready for the green
// light", "That batch is sitting there for you to sign off", "The plan is
// staged for your OK" — and showed that a leading modal disarmed even a listed
// phrase: "You can see it's queued for your approve" walked straight past it
// while "It's queued for your approve" was caught.
//
// That shape cannot be won. It is the same shape three image audits already
// condemned: a longer regex against whoever is choosing the words.
//
// SO THE ANSWER IS NOT A BETTER DETECTOR. IT IS GROUND TRUTH ON THE SCREEN.
// The desktop already knows exactly how many cards are waiting — the union of
// /state.pendingConfirms and the confirm frames that arrived on this turn,
// minus the ones he has resolved. That number is printed beside the
// conversation AT ALL TIMES, INCLUDING WHEN IT IS ZERO, and a finished turn
// that raised none says so under itself. He never has to trust a sentence
// about whether a card exists, because the truth is on screen next to it — and
// no sentence anyone can write changes the count.
//
// WHY ZERO HAS TO PRINT. A counter that hides at zero is a counter that says
// nothing on exactly the turn the lie is told. "0 CARDS WAITING FOR YOU" beside
// "approve and they're filed" is the whole fix; a blank space beside it is not.
//
// ---------------------------------------------------------------------------
// HALF TWO — WHAT A BIN DESTINATION IS FOR (audit 4, D1)
//
// The file-batch card printed a constant law line: "NOTHING IS DELETED.
// NOTHING IS OVERWRITTEN." Both halves are literally true of a MOVE, including
// a move whose destination is his Recycle Bin, his Trash folder, or a folder he
// calls `_deleted`. The card then read as safer than the operation was: what it
// actually described was a batch of files being put somewhere whose entire
// purpose is that emptying it destroys them.
//
// A true sentence that leaves out the consequence is the shape this whole
// program keeps finding — the stage card had exactly the same bug and was
// fixed the same way, by putting the reassurance and the consequence on one
// line. So a bin-bound batch drops the "NOTHING IS DELETED" half (it is the
// half that misleads) and says what the destination is for instead.
//
// THE LIMIT, STATED. This reads FOLDER NAMES. It cannot know that a folder
// called `Archive` is where he throws things away, and it will call a build
// output folder named `bin` a bin. Both directions are survivable because this
// changes COPY and nothing else: no refusal depends on it, APPROVE stays
// enabled either way, and every from->to row is on the card regardless. It is
// not, and must never become, a security check.
// ---------------------------------------------------------------------------

/**
 * "0 CONFIRM CARDS WAITING FOR YOU" / "1 CONFIRM CARD WAITING FOR YOU" / "N
 * CONFIRM CARDS WAITING FOR YOU". The persistent counter beside the
 * conversation.
 *
 * IT SAYS "CONFIRM CARD", NOT "CARD", and the extra word is load-bearing: the
 * data column on the same screen carries an APPROVAL INBOX of attention items,
 * which is a different queue that is not counted here. A counter that exists to
 * end an ambiguity must not open a smaller one.
 *
 * `n` is an array length at both call sites (App.tsx's confirm union), so it is
 * always a finite non-negative integer; anything else is a programming error
 * and floors to 0 rather than printing a number nobody can read.
 */
export function waitingCardsLine(n: number): string {
  const k = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (k === 0) return "0 CONFIRM CARDS WAITING FOR YOU";
  return k === 1 ? "1 CONFIRM CARD WAITING FOR YOU" : `${k} CONFIRM CARDS WAITING FOR YOU`;
}

/**
 * What one FINISHED turn raised. Printed under the turn's own bubble, so a
 * claim and its contradiction are one line apart.
 *
 * Only ever called for a turn the reducer has marked done: a turn still
 * streaming, or one that died mid-stream, prints NOTHING here, because "no card
 * yet" and "no card" are different sentences and only one of them is knowable.
 */
export function turnCardLine(n: number): string {
  const k = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (k === 0) return "THIS TURN RAISED NO CONFIRM CARD";
  return k === 1 ? "THIS TURN RAISED 1 CONFIRM CARD" : `THIS TURN RAISED ${k} CONFIRM CARDS`;
}

/**
 * Folder names that mean "things in here are waiting to be destroyed".
 *
 * Whole SEGMENTS only, folded to letters and digits, so `Clients\Trashwood` and
 * `Bingo` are not bins and `Recycle Bin`, `$RECYCLE.BIN`, `.Trash-1000` and
 * `_deleted` are. The list is deliberately short and literal: this is copy, not
 * a classifier, and a long list of guesses would make the sentence mean less
 * every time it fired.
 */
const BIN_SEGMENTS = new Set([
  "bin",
  "recyclebin",
  "recycle",
  "recycler",
  "recycled",
  "trash",
  "trashes",
  "trashcan",
  "wastebasket",
  "wastebin",
  "rubbish",
  "rubbishbin",
  "deleted",
  "deleteditems",
  "todelete",
  "fordeletion",
  "junk",
]);

/**
 * Fold one path segment to bare letters and digits: case, spaces, dots,
 * hyphens, underscores and the `$` on `$Recycle.Bin` all give way, and the
 * trailing SID on a Linux `.Trash-1000` is dropped so the name still reads.
 */
function foldSegment(seg: string): string {
  return seg
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
}

/**
 * WHICH OF THESE DESTINATIONS IS A BIN. Input is the card's own derived
 * destination list (root-qualified display paths); output is the subset whose
 * path contains a bin segment, in input order, deduplicated by display string.
 *
 * Deriving it from the DESTINATIONS the renderer computed off `moves` — never
 * from a payload field — is deliberate: a plan that described itself as
 * innocent would otherwise print its own alibi. (INJ-4)
 */
export function binBoundDestinations(destinations: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of destinations) {
    if (typeof d !== "string" || !d) continue;
    const hit = d
      .split(/[\\/]+/)
      .filter(Boolean)
      .some((seg) => BIN_SEGMENTS.has(foldSegment(seg)));
    if (!hit) continue;
    const key = d.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** True when ANY row of this batch is bound for a bin. */
export function isBinBound(destinations: readonly string[]): boolean {
  return binBoundDestinations(destinations).length > 0;
}
