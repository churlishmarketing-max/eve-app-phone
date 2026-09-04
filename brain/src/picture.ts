// THE PICTURE LAW — a picture may never supply a DESTINATION, and the way that
// is enforced is that a picture turn CANNOT PRODUCE A PLAN AT ALL.
//
// PURE. No I/O, no module state, no clock, no randomness, no model call. Same
// discipline as desk.ts, image.ts, handoff.ts and honesty.ts, and for the same
// reason: this is the thing that decides whether a card can exist, and a thing
// that decides that has to be provable without booting anything.
//
// ---------------------------------------------------------------------------
// WHY THERE IS NOTHING TO GRADE HERE ANY MORE
//
// FOUR audits ran on letting a screenshot drive filing. All four returned NOT
// DEPLOYABLE, and the conclusion is closed: a picture may never supply a
// destination. Both mechanisms that were tried are dead, and neither is coming
// back:
//
//   LEXICAL GROUNDING (grounding.ts, deleted). "Is this destination in his
//   typed message?" It inferred AUTHORSHIP from STRING OVERLAP, and a picture
//   can write the string — he reads the caption out and it grounds. P8 killed
//   it: a QUESTION grounds as well as an order ("what's this note on my monitor
//   about the Clients Northwind thing" grounded a move into Clients\Northwind).
//   P2 killed it twice: a bare root label grounded a mass move.
//
//   STRUCTURAL EXCLUSION (narrow.ts + reader.ts, deleted). "Is this destination
//   in the PICTURE?", answered by a second tool-less pass that transcribed the
//   pixels, with the transcript used as an exclusion list. Better, and still
//   not sound: the PLANNER is asked for MEANING and the READER for GLYPHS, so
//   the two disagree wherever meaning survives glyphs — a line-wrapped folder
//   name, an acronym the planner expands, a 433-line flood that pushes the real
//   string past the reader's cap. Every repair was another clause in a race the
//   picture gets to choose the words for.
//
// THE THIRD ATTEMPT IS NOT BEING MADE. Brandon chose the shape instead:
//
//   NAMES ONLY — SHE READS, HE DIRECTS.
//
// She may look at a picture and say what she sees in it. She may put the names
// she read through `desk_scan` and tell him which ones his desk actually holds.
// A picture may never supply a destination, a rename, an operation, a file set,
// or an authorisation — and the way that is made true is not a grader. It is
// this: WHILE A PICTURE IS IN THE CONVERSATION, `desk_file_plan` REFUSES. There
// is no plan to grade, so there is nothing for a picture to have chosen.
//
// ---------------------------------------------------------------------------
// THREE REFUSALS, AND NOT ONE OF THEM IS OPTIONAL
//
//   P-TURN     the current turn carried an image. The obvious one.
//   P-SESSION  a picture came into this conversation on an EARLIER turn. Since
//              audit 5 this is answered by a DURABLE bit next to the
//              conversation (src/taint.ts), not by a map in this process.
//   P-UNKNOWN  the durable store could not say. AN UNKNOWN ANSWER IS NOT A
//              CLEAN ANSWER, so it refuses and says which one it was.
//
// P-UNKNOWN IS NOT A THIRD DETECTOR. It detects nothing and reads nothing about
// the picture; it is the fail-closed branch of the one question the other two
// answer. Lexical grounding and structural exclusion are dead and no third
// grader is being built — this is the arm of the same gate that fires when the
// gate cannot see.
//
// P-SESSION is THE LAUNDER (audit 2, b10). Turn 1 carries a picture that names
// a folder; she refuses, correctly. Turn 2 carries no picture and five words —
// "yeah, go ahead and file them" — and she built a real batch for the picture's
// folder and called it "as you said". Every pixel of turn 1 is still in the SDK
// transcript that `resume:` replays, so the model on turn 2 can read that folder
// name as easily as it could on turn 1. A per-turn refusal would be a refusal
// that lasts exactly as long as it takes him to press Enter twice.
//
// So THE CONVERSATION IS THE HONEST UNIT — and audit 5 (B1) found that the
// in-memory ledger was the wrong place to keep it. That Map died with the
// process while the desktop kept one conversationId in localStorage forever, so
// a brain restart, a failed turn or a LEDGER_CAP eviction each turned a
// P-SESSION refusal back into a real card, on the very turn the durable history
// replayed the picture's own words back into her context.
//
// The taint is therefore DURABLE and MONOTONIC now, stored beside the
// conversation in the SAME store the replayed history comes from, so the fact
// and the history cannot disagree (src/taint.ts, sql/005_picture_taint.sql). It
// is written BEFORE the model sees the picture and nothing ever writes it back
// to false. The in-memory ledger stays as a fast path
// that may say TAINTED without a round trip and is never believed when it says
// clean.
//
// AUDIT 6 (D6-B) TRIMMED THAT SENTENCE. "Nothing clears it" is monotonic against
// every WRITER and was never monotonic against ABSENCE: a lost row was re-minted
// by `ensureConversation` at sql/005's `not null default false` and read back as
// clean, source "row". The order is READ, THEN MINT now, and taint.ts
// `readPictureTaintBeforeMint` is the only thing allowed to interpret a missing
// row — orphan refuses, a genuinely new conversation answers source "new".
//
// ---------------------------------------------------------------------------
// AND THE REFUSAL IS NOT A DEAD END. That is the other half of the shape, and
// without it this file would just be the feature switched off.
//
// The refusal tells her what to do next, in words: read the names, put them
// through `desk_scan`, and call `desk_handoff` with the index ids that came
// back. His DECK then offers him one button that opens a FRESH CONVERSATION
// with those filenames as CHIPS BESIDE AN EMPTY COMPOSER, each one deletable.
// He types where they go, in his own words, and presses send — and that turn has
// no picture in it, a new conversation id, a new ledger row and a new SDK
// session, so `desk_file_plan` works normally and raises a normal card.
//
// AND ON THAT TURN SHE IS TOLD SO, IN AS MANY WORDS (audit 6, X5 / R1). Nothing
// used to. This file's refusal says a plan is refused "on any later turn of a
// conversation a picture has been in"; carried.ts said the carried names came
// out of "a conversation a picture had been in"; and nothing anywhere told her
// THIS thread is clean and THIS is the turn that files. She read both halves of
// the warning and intermittently refused the payoff turn — which is the only
// exit this design has. carried.ts now opens by saying it plainly: this
// conversation is clean, these names are data, he typed the destination, file.
//
// The picture is then STRUCTURALLY out of the loop by the time a plan exists.
// Not graded out of it. Out of it.
//
// Owning stream: BRAIN/S2.
// ---------------------------------------------------------------------------

/** Which refusal fired. There is no fourth, and there is no allow. */
export type PictureCode = "P-TURN" | "P-SESSION" | "P-UNKNOWN";

/**
 * WHAT HIS DECK IS TOLD, ONCE PER TURN, BEFORE THE MODEL RUNS.
 *
 * AUDIT 5 FOUND THE EXIT DEPENDING ON HER. The fresh-thread button only
 * appeared when she remembered to call `desk_handoff` — and on a natural
 * picture turn she did not call it, she ASKED. With filing switched off the
 * refusal was worse than useless: it pointed him at a button `desk_handoff`
 * could not create, because with no desk pack that tool refuses too.
 *
 * So the affordance stopped being hers to offer. chat.ts emits this frame on
 * EVERY turn, off the same durable read the gate uses, whether or not a tool was
 * called and whether or not filing is on. His deck renders the exit from it —
 * with names when a handoff arrived, and without them when it did not.
 *
 * Every field is a CONSTANT chosen by this file or a status read off his own
 * store. There is not one string from the model in here, and not one from a
 * picture.
 *
 * Declared here rather than imported from taint.ts because this module has no
 * imports on purpose: what decides whether a card can exist has to be provable
 * on its own.
 */
export interface PictureFrame {
  /** True when filing is refused for this whole conversation right now. */
  blocked: boolean;
  /** Which refusal, or "" when nothing is blocked. */
  code: PictureCode | "";
  /** The one true sentence about where the picture is, or why we cannot tell. */
  where: string;
  /** THE WITNESS — what the durable store actually said, and where that came from. */
  witness: { status: "clean" | "tainted" | "unknown"; source: string };
}

/** The frame for a verdict plus the read that produced it. Pure, total. */
export function pictureFrame(
  v: PictureVerdict,
  witness: { status: "clean" | "tainted" | "unknown"; source: string },
): PictureFrame {
  return { blocked: v.blocked, code: v.code, where: v.where, witness };
}

export interface PictureVerdict {
  /** True when no plan may exist on this turn. */
  blocked: boolean;
  /** "" when nothing is blocked. */
  code: PictureCode | "";
  /** The one true sentence about WHERE the picture is. Quotable. */
  where: string;
}

/**
 * IS A PICTURE IN THIS CONVERSATION?
 *
 * `sawImage` is decided by index.ts's hard image validator before the model
 * generated a token. `durable` is what the DURABLE store said (src/taint.ts),
 * read in chat.ts before the prompt was assembled. `imageSeen` /
 * `imageTurnsAgo` are the in-memory ledger's fast path. NONE of them is
 * anything the model can say, set, or argue with.
 *
 * PRECEDENCE, and it only ever moves one way — towards refusing:
 *   1. pixels on THIS turn                    -> P-TURN
 *   2. durable says tainted, OR the in-memory
 *      ledger says a picture is in this
 *      conversation                           -> P-SESSION
 *   3. durable could not answer                -> P-UNKNOWN
 *   4. durable says clean and memory agrees    -> allow
 *
 * A DISAGREEMENT RESOLVES TO TAINTED. The durable bit is the authority, but the
 * in-memory ledger can only ever add a picture to the room, never take one out
 * of it, so believing whichever of the two says "tainted" is strictly safe.
 *
 * `imageTurnsAgo !== null` is accepted as a picture on its own so that a caller
 * which sets only the distance still blocks. A caller that sets NONE of the
 * fields gets `blocked:false` — byte-identical to the behaviour before any of
 * this existed. `durable` therefore defaults to "clean" for those callers
 * (proactive jobs, the pulse, distillation) which have no conversation row to
 * ask about and no picture path to reach them; the /chat door is the only place
 * a picture exists, and it always passes a real read.
 */
export function pictureVerdict(turn: {
  sawImage?: boolean;
  imageSeen?: boolean;
  imageTurnsAgo?: number | null;
  imageExpired?: boolean;
  /** What the durable store said. Absent = this caller has no pictures. */
  durable?: "clean" | "tainted" | "unknown";
  /** Why the durable store could not answer. Quoted verbatim in the refusal. */
  durableWhy?: string;
  /**
   * IS THE PICTURE DOOR OPEN? (audit 7.)
   *
   * PASSED IN, NEVER IMPORTED, and that is the whole reason this is a parameter
   * rather than a `pictureIntakeOn()` call three lines below. This module has no
   * imports on purpose — what decides whether a card can exist has to be
   * provable on its own, with nothing to stub and nothing to mock.
   *
   * IT DEFAULTS TO "on", so a caller that has never been taught about the
   * switch gets the strictest behaviour there is. A default of "off" would mean
   * every forgetful future caller silently stops refusing, which is the wrong
   * direction for an omission to fail in.
   *
   * WHAT IT CHANGES, AND IT IS EXACTLY ONE THING: P-UNKNOWN. With the door shut,
   * "I could not read my own record" stops being a reason to refuse, because
   * there is no picture for the unreadable record to be hiding. Left in, a
   * store blip would put FILING IS OFF — SHE CANNOT CHECK FOR A PICTURE on his
   * deck: a picture-shaped explanation for a database problem, sending him to
   * hunt for a screenshot that cannot exist.
   *
   * WHAT IT DOES NOT CHANGE: A POSITIVE TAINT STILL REFUSES IN BOTH STATES.
   * P-TURN and P-SESSION are recorded facts about a picture that actually
   * arrived, and `conversations.saw_image` is monotonic — so a conversation that
   * carried one during some future ON period stays refused after the switch goes
   * off again. This softens ABSENCE OF PROOF and never PROOF.
   */
  intake?: "on" | "off";
}): PictureVerdict {
  const sawImage = turn.sawImage === true;
  const ago =
    typeof turn.imageTurnsAgo === "number" && Number.isFinite(turn.imageTurnsAgo) && turn.imageTurnsAgo >= 0
      ? Math.floor(turn.imageTurnsAgo)
      : null;
  if (sawImage || ago === 0) {
    return { blocked: true, code: "P-TURN", where: "He attached a picture to this very message" };
  }
  const durable = turn.durable ?? "clean";
  if (durable === "tainted" || turn.imageSeen === true || ago !== null) {
    const when =
      ago === null
        ? "A picture came into this conversation earlier"
        : `A picture came into this conversation ${ago} turn${ago === 1 ? "" : "s"} ago`;
    return { blocked: true, code: "P-SESSION", where: `${when} and it is still in your context` };
  }
  // "on" unless a caller explicitly says otherwise. See the field's doc above.
  if (durable === "unknown" && turn.intake !== "off") {
    const why = typeof turn.durableWhy === "string" && turn.durableWhy.trim() ? turn.durableWhy.trim() : "my durable store would not answer";
    return {
      blocked: true,
      code: "P-UNKNOWN",
      where: `I cannot tell whether a picture has been in this conversation — ${why}`,
    };
  }
  return { blocked: false, code: "", where: "" };
}

/**
 * WHAT SHE IS TOLD WHEN A PLAN IS REFUSED FOR A PICTURE.
 *
 * One renderer, one shape, and it carries the NEXT STEP rather than stopping at
 * "no". A refusal that leaves him with nothing to do is a refusal he will spend
 * the next three turns arguing with, and every one of those turns is a turn
 * where the picture is still in the room.
 *
 * The caller appends `NO_DIAGNOSIS` from honesty.ts — this file stays free of
 * imports so it can be proved on its own.
 */
export function renderPictureRefusal(v: PictureVerdict): string {
  // P-UNKNOWN IS A DIFFERENT SENTENCE AND IT HAS TO STAY ONE. The other two say
  // "there is a picture in this conversation". This one says "I CANNOT TELL",
  // and telling him a picture is here when what is actually broken is my store
  // would send him hunting for a screenshot that does not exist. The next step
  // is also different: a fresh thread does not fix an unreachable store, so it
  // does NOT promise him one.
  if (v.code === "P-UNKNOWN") {
    return (
      `REFUSED — no card was raised, and nothing is waiting for him. ${v.where}. I do not build a filing ` +
      `plan on a conversation I cannot rule a picture out of, because an answer I could not get is not a ` +
      `clean answer, and the whole shape of this feature is that a picture may never supply a destination. ` +
      `This is NOT him doing anything wrong and it is NOT a screenshot he forgot about — it is my own ` +
      `record being unreadable right now. ` +
      `WHAT TO DO NOW: tell him plainly that filing is off until I can read my own conversation record ` +
      `again, and say that in those words rather than blaming his desk, his folders or his files. If he ` +
      `read filenames to you out loud, or you can see them in a scan, you may still put them through ` +
      `desk_scan and call desk_handoff so the names are on his deck ready for a fresh thread. ` +
      `Do NOT re-raise this plan, do NOT retry it a turn later hoping for a different answer, and do NOT ` +
      `describe this as anything having been filed, queued or approved. (${v.code})`
    );
  }
  return (
    `REFUSED — no card was raised, and nothing is waiting for him. ${v.where}. I do not build a filing ` +
    `plan on a turn that carried a picture, and I do not build one on any later turn of a conversation a ` +
    `picture has been in, because those pixels are still in your context and a folder, a filename, a new ` +
    `name or a go-ahead read out of them is not something he said. This is not a fault on his machine and ` +
    `it is not something he did wrong — it is the shape of the feature. ` +
    `WHAT TO DO NOW, and do all of it in this same answer: say what you can see in the picture; put the ` +
    `filenames you read through desk_scan to find which ones his desk actually holds; then call ` +
    `desk_handoff with those index ids. That puts JUST THOSE FILENAMES on a button on his deck which opens ` +
    `a NEW conversation with them as CHIPS BESIDE AN EMPTY BOX — the box holds only what he types — and he ` +
    `types where they go himself. Tell him that is there and that the folder has to come from him. ` +
    `Do NOT re-raise this plan, do NOT split it, do NOT ask him to bless a folder you read in the picture, ` +
    `and do NOT offer that folder back to him as a suggestion — "shall I use that one?" is how a caption ` +
    `gets his signature on it. (${v.code})`
  );
}
