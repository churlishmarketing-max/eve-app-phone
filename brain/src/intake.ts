// PICTURE INTAKE — THE SWITCH. One file, one constant, one line to flip.
//
// ===========================================================================
// WHAT IS OFF, WHY, AND WHAT THE AUDIT FOUND
// ===========================================================================
//
// OFF: EVE does not accept pictures. On any surface — his desk, the phone, the
// glasses, a curl at the raw HTTP door — an image on a /chat body is refused at
// the validator and never reaches the model, the ledger, the taint column or
// the store.
//
// WHY: seven security audits ran on letting her read a screenshot. AUDIT 7
// RETURNED **NOT DEPLOYABLE** and recommended shipping with picture intake
// DISABLED. Brandon chose that branch in advance. This is not a narrowing, a
// gate, a heuristic, or a detector that decides which pictures are safe — every
// one of those was tried and every one of them lost. It is the feature switched
// OFF at the door.
//
// The two mechanisms that died before it are documented in src/picture.ts: the
// typed-message grounding test (a picture can write the words he is about to
// say, and a QUESTION grounds as well as an order) and the reader/exclusion
// list (the planner is asked for MEANING and the reader for GLYPHS, so a
// wrapped name or an expanded acronym splits them). There is no third attempt
// hiding in here.
//
// ONE CORRECTION TO AUDIT 7, ON THE RECORD, BECAUSE IT CHANGES WHAT SHIPS.
// Audit 7 wrote that "his current localStorage thread already has screenshots
// described in its transcript" and told him to press fresh thread. THAT IS
// FALSE, and it is checkable rather than arguable:
//
//   * `git grep` at 4cf6a1c for imageFromBody / untrusted_image / image-ledger
//     / ImageRefusal across brain/src returns NOTHING. The entire picture
//     feature is uncommitted. The DEPLOYED brain has no image path at all.
//   * The live store agrees: with sql/005 applied, `conversations` where
//     `saw_image = true` is ZERO ROWS — none of them, whatever the total is
//     today. (A fixed count here would start lying the next time he talks to
//     her; `npx tsx verify/recall-measure.ts` prints the live pair.)
//
// So no picture has ever reached this brain, and every row already in
// memory_entries, messages, touches and daily_checkins is picture-free BY
// CONSTRUCTION — not by policy and not by assumption. That fact is what makes
// the inert quarantine in src/durable.ts correct rather than convenient. Read
// the block there before changing either.
//
// ===========================================================================
// TURNING IT BACK ON
// ===========================================================================
//
// One line here, or `EVE_PICTURE_INTAKE=on` in the environment. Then:
//
//   1. `npx tsx verify/intake-harness.ts` — it runs BOTH states and asserts the
//      full-strength guard is back, so "does the guard still work" is one
//      command rather than an archaeology exercise.
//   2. APPLY brain/sql/006_durable_origin.sql FIRST. With intake on, a durable
//      row must be able to say where it came from, and until that column exists
//      recall withholds everything (fail-closed, by design, audit 6 X2).
//      /health.durableOriginReady is the dashboard for it.
//
// Nothing is deleted. picture.ts, taint.ts, durable.ts, carried.ts, handoff.ts,
// image.ts, image-ledger.ts and the desk chips/exit all stay in the tree, whole,
// behind this constant. They are good work and they are needed the day this
// reopens.
//
// Owning stream: BRAIN/S2.

export type IntakeState = "on" | "off";

/**
 * THE SWITCH. Flip this to "on" to re-enable picture intake.
 *
 * DEFAULT OFF — audit 7, NOT DEPLOYABLE.
 */
const DEFAULT_PICTURE_INTAKE: IntakeState = "off";

/**
 * The environment may override it (Railway, a harness, a local probe) so that
 * turning it on for one run does not need a rebuild. Only the exact string
 * "on" turns it on: a typo, an empty value, "true", "1" or "yes" all leave it
 * OFF, because a switch that guards a NOT DEPLOYABLE feature must not be
 * flippable by accident.
 */
function resolve(): IntakeState {
  const raw = process.env.EVE_PICTURE_INTAKE;
  if (typeof raw === "string" && raw.trim().toLowerCase() === "on") return "on";
  if (typeof raw === "string" && raw.trim().toLowerCase() === "off") return "off";
  return DEFAULT_PICTURE_INTAKE;
}

/**
 * Read ONCE at module load, not per call.
 *
 * Deliberate: a request must not be able to change its own intake state
 * mid-flight, and two reads inside one turn must not be able to disagree — a
 * door that is open for the validator and shut for the store is worse than
 * either. `_setIntakeForTests` is the single seam, and it is only used by the
 * harness.
 */
let state: IntakeState = resolve();

/** "on" | "off". Reported verbatim on /health. */
export function pictureIntake(): IntakeState {
  return state;
}

/** THE ONE PREDICATE. Everything downstream asks this and nothing else. */
export function pictureIntakeOn(): boolean {
  return state === "on";
}

/** Convenience for logs and /health text. Frozen at module load like `state`. */
export const PICTURE_INTAKE: IntakeState = state;

/**
 * Test seam. `verify/intake-harness.ts` runs the whole suite in BOTH states so
 * the re-enable path is proven rather than promised. The server never calls it.
 */
export function _setIntakeForTests(s: IntakeState): void {
  state = s;
}

/**
 * WHAT SHE SAYS WHEN A PICTURE ARRIVES AND SHE IS NOT LOOKING AT IT.
 *
 * A CONSTANT, chosen here, in her own register. It is not built from the body,
 * the filename, the mime or anything in the picture, for the same reason
 * IMAGE_ENVELOPE_NOTE is a constant: nothing an attacker draws into a
 * screenshot may influence the sentence about screenshots.
 *
 * IT SAYS THREE THINGS ON PURPOSE, and each one is a failure mode this
 * refusal would otherwise have:
 *
 *   1. SHE NOTICED. "There is a picture on this message" — she is not
 *      pretending it did not arrive, and she is not answering his words as if
 *      he sent them alone. A screenshot that vanishes silently is a screenshot
 *      he will believe she read.
 *   2. SHE IS NOT BROKEN. Not a size problem, not a format problem, not an
 *      outage, not something to retry, not something wrong on his machine.
 *      Every one of those sends him to go and check something that is fine.
 *   3. WHAT TO DO INSTEAD. A refusal with no next step is a refusal he spends
 *      three turns arguing with. Type the names, or say what is in it.
 */
export const INTAKE_OFF_WHY =
  "There's a picture on this message and I'm not opening it. Looking at pictures is switched off in me " +
  "right now — that's a decision that was made about me, not a fault: nothing is wrong with the file, " +
  "nothing is wrong with your machine, it isn't too big or the wrong kind, and trying again won't change " +
  "it. I can't tell you one thing about what's in it, so I won't guess. Type me the names or tell me what " +
  "it says and I'll work from that.";

/**
 * THE SAME FACT, ADDRESSED TO THE MODEL RATHER THAN TO HIM.
 *
 * Rendered into the turn by `renderImageRefusal` in src/image.ts, under its own
 * `<picture_intake_off>` tag rather than the generic `<image_not_attached>`
 * wrapper, so she cannot answer as though nothing was attached AND cannot
 * conclude a smaller or differently-encoded picture would have worked. It is a
 * line from EVE's own code, and it is marked as such where she reads it.
 */
export const INTAKE_OFF_MODEL_NOTE =
  "PICTURE INTAKE IS OFF. He attached a picture to this message and it was refused at the door, in code, " +
  "before you existed this turn. You have not seen it, no part of it is in your context, and there is no " +
  "later turn on which it arrives. Do not describe it, do not guess at it, do not offer to look at it, and " +
  "do not say you will look when he re-sends — a re-send is refused the same way. Tell him plainly, in " +
  "your own words, that pictures are switched off in you right now, that this is not a fault and not " +
  "something wrong on his machine, and ask him to type the names or say what is in it. Then answer the " +
  "words he actually typed.";

/**
 * PICK THE TEXT THAT IS TRUE RIGHT NOW.
 *
 * Used wherever a doctrine line or a tool description promised picture
 * behaviour. `off` defaults to "" — DROPPING the paragraph, which is the right
 * answer most of the time: a rule about what happens on "a conversation a
 * picture has been in" is not a rule at all when no conversation can have one,
 * and leaving it in teaches her a whole workflow that cannot occur.
 *
 * S3's rule, stated once: ANYTHING THAT CANNOT HAPPEN MUST NOT BE DESCRIBED AS
 * IF IT CAN. Every call to this function is a place that used to break it.
 */
export function pic(on: string, off = ""): string {
  return pictureIntakeOn() ? on : off;
}

/**
 * WHAT A TOOL SAYS INSTEAD, where the tool used to promise a picture workflow.
 *
 * ONLY THE DESK TOOLS WHOSE DESCRIPTION TAUGHT THE PICTURE DANCE GET THIS —
 * desk_scan, desk_where and desk_handoff. Everywhere else the honest
 * replacement is silence: she does not need to be told that a thing which
 * cannot happen does not happen. These get a sentence because without one she
 * would go on offering the read-the-screenshot / hand-off-the-names dance,
 * which is the exact workflow that is now unreachable.
 *
 * (It said "the two desk tools" when one site used it. Grep for the constant
 * rather than trusting a number in a sentence — that is the whole lesson of
 * the count sweep.)
 */
export const PICTURES_OFF_TOOL_NOTE =
  "PICTURES ARE SWITCHED OFF IN YOU. He cannot send you one: an image on any message is refused at the door, " +
  "in code, before you exist for that turn, on every surface he has. So there is no turn that carried a " +
  "picture, no conversation with one in it, and no screenshot for you to read names off. Never offer to look " +
  "at one, never ask him to send one, and never describe this tool as behaving differently when a picture is " +
  "involved. If he attaches one anyway, the turn tells you so and you say plainly that you are not looking — " +
  "you do not guess at what was in it.";

/**
 * ONE LINE FOR THE BOOT LOG, so the state of this switch is visible from
 * outside the container without reading the source.
 */
export function intakeBanner(): string {
  return state === "on"
    ? "[intake] PICTURE INTAKE IS ON — pictures reach the model. sql/006_durable_origin.sql MUST be applied (audit 6, X2)."
    : "[intake] picture intake is OFF (audit 7, NOT DEPLOYABLE) — images are refused at the door on every surface. See src/intake.ts.";
}
