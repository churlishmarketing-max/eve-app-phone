// THE HANDOFF — how a picture turn stays useful after `desk_file_plan` refuses.
//
// PURE. No I/O, no module state, no clock, no randomness, no model call. Same
// discipline as desk.ts, image.ts, picture.ts and honesty.ts.
//
// ---------------------------------------------------------------------------
// THE PROBLEM THIS SOLVES
//
// picture.ts refuses every plan while a picture is in the conversation. That is
// correct and it is also, on its own, the feature switched off: he screenshots a
// Premiere timeline, she reads twelve clip names off it, and then the only thing
// she can say is "I can't". He is left retyping twelve filenames by hand — which
// is exactly the work he sent the picture to avoid.
//
// So the refusal hands off instead. She reads the names, puts each one through
// `desk_scan`, and calls `desk_handoff` with the INDEX IDS that came back. His
// deck raises a button: START A NEW THREAD WITH THESE NAMES. It opens a FRESH
// conversation — new conversation id, new ledger row, new SDK session, no
// picture anywhere in it — with those filenames as CHIPS BESIDE AN EMPTY
// COMPOSER, visible and individually deletable. The box itself holds only what
// he types. He types where they go, in his own words, and presses send. That
// turn files normally and raises a normal card.
//
// (The composer used to be seeded with the names as prose. Audit 5 / B2 killed
// that: the composer is `message`, and `message` is the one region of a turn
// defined as his own keystrokes. The names ride as a structured field now and
// are re-enveloped at the brain door — carried.ts. Four strings in this build
// still described the old shape and are corrected; see X5.)
//
// ---------------------------------------------------------------------------
// WHAT MAY TRAVEL, AND WHY THE ANSWER IS "INTEGERS"
//
// The seeded text must contain FILENAMES AND NOTHING ELSE — never a folder,
// never a rename, never an operation, never a sentence, never one word of prose
// out of the picture. The obvious implementation is to let her hand over a list
// of strings and then strip the ones that look wrong. That is a filter against
// an adversary choosing the input, which is the losing shape this whole program
// keeps rediscovering.
//
// SO NO STRING CROSSES THE WIRE. `desk_handoff` takes `i` — the index ids from
// `desk_scan`, integers and nothing else — exactly like `desk_file_plan` takes
// its sources, and for exactly the same reason (G-P1: a source path is
// unrepresentable). This module turns those integers into names by looking them
// up in THIS TURN'S PACK, which the DESKTOP minted off its own index. A name she
// never saw in a scan has no id; an id that is not in the index resolves to
// nothing and is dropped, counted, and reported.
//
// And the frame that goes to his machine carries the IDS, not the names. His
// desktop resolves them a second time against its own live index and composes
// the composer text from ITS OWN strings. The names in this file's output exist
// for one purpose — telling HER what she just listed, so she can say it out loud
// — and they never become the text he sends.
//
// A caption cannot write an integer that means a folder.
//
// Owning stream: BRAIN/S2.
// ---------------------------------------------------------------------------

// The ONE import this pure module has, and it reads a frozen module-load
// constant rather than doing anything: the sentence handed to the model at the
// bottom of this file used to explain the handoff by naming a picture, and with
// intake off there is no picture in any conversation to name. Nothing else here
// consults the switch — resolving ids to names is the same work in both states.
import { pic } from "./intake.js";

/**
 * The ceiling on one handoff. The same number as MAX_BATCH, because the list he
 * is being handed is a list he has to be able to read in a composer box before
 * he presses send — the identical constraint the card is under.
 */
export const MAX_HANDOFF = 50;

/** What goes on the wire, and it is integers. */
export interface HandoffFrame {
  /** The index revision those ids belong to. His desktop re-checks it. */
  rev: string;
  /** Index ids, deduplicated, in the order she gave them, capped. */
  ids: number[];
}

export interface HandoffResolution {
  /** The frame to emit. Null when nothing survived — there is no empty button. */
  frame: HandoffFrame | null;
  /** Names for HER reply only. These never become the text he sends. */
  names: string[];
  /** Ids she named that are not in the index. Reported, never silently eaten. */
  missing: number[];
  /** Ids past MAX_HANDOFF. Reported too — a truncated list must say so. */
  overflow: number;
}

/**
 * IDS -> WHAT HIS DESK ACTUALLY HOLDS.
 *
 * Order is HERS: the order she listed them is the order he reads them in, and
 * re-sorting a list he is about to check by eye helps nobody. Duplicates
 * collapse to their first appearance.
 *
 * An id that is not in this pack's index is NOT an error and NOT a guess — it
 * is dropped and returned in `missing`, so the tool's reply can tell her to say
 * which names she could not find. That sentence is the honest one and it is the
 * one audit after audit found her skipping.
 */
export function resolveHandoff(
  index: { rev: string; entries: readonly { i: number; n: string }[] },
  ids: readonly unknown[],
): HandoffResolution {
  const byId = new Map<number, string>();
  for (const e of index.entries) byId.set(e.i, e.n);

  const seen = new Set<number>();
  const kept: number[] = [];
  const names: string[] = [];
  const missing: number[] = [];
  let overflow = 0;

  for (const raw of Array.isArray(ids) ? ids : []) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const i = Math.floor(raw);
    if (i < 0 || seen.has(i)) continue;
    seen.add(i);
    const name = byId.get(i);
    if (name === undefined) {
      missing.push(i);
      continue;
    }
    if (kept.length >= MAX_HANDOFF) {
      overflow += 1;
      continue;
    }
    kept.push(i);
    names.push(name);
  }

  return {
    frame: kept.length > 0 ? { rev: index.rev, ids: kept } : null,
    names,
    missing,
    overflow,
  };
}

/**
 * WHAT SHE IS TOLD after a handoff. It licenses one sentence and forbids the
 * one she would otherwise reach for.
 *
 * Note what is NOT licensed: anything that sounds like the files are on their
 * way. A handoff moves nothing, plans nothing, and raises no card — it puts the
 * names on his deck as chips beside an empty composer. Saying otherwise would be
 * the same fabricated completed-action the card receipt exists to stop, one step
 * to the left.
 *
 * ---------------------------------------------------------------------------
 * IT EMITS COUNTS. IT DOES NOT EMIT NAMES (audit 6, G1 / X4).
 *
 * This function used to interpolate `r.names.slice(0, 8).join(", ")` into a
 * sentence that connectors.ts returned through `text()`, which wraps nothing.
 * carried.ts's header states the discipline the whole feature rests on — EVERY
 * filename that reaches this model reaches it inside `<untrusted_filenames>` —
 * and this was attacker-chosen strings arriving as unenveloped prose, on the
 * ORDINARY EXIT PATH, at the exact moment she is being told to talk about them.
 *
 * She loses nothing. The ids came out of a `desk_scan` in THIS turn, and that
 * result is enveloped and still in her context: she can name them from there.
 * What she cannot do any more is read them out of a sentence this file wrote
 * for her, which is the only place they were not labelled as third-party text.
 *
 * THE COUNT ARITHMETIC IS UNCHANGED AND DELIBERATELY SO. The judge downgraded
 * the "count lies" sub-claim: `names.length` counts exactly the ids that
 * resolved, `missing` and `overflow` are disjoint from it, and the envelope lens
 * misread that as an inconsistency. Do not "fix" it.
 */
export function renderHandoff(r: HandoffResolution): string {
  if (!r.frame) {
    return (
      `NOTHING TO HAND OVER — none of those index ids are in his desk index this turn, so there is no ` +
      `button and nothing is on his screen. Do not tell him to look for one. Say which names you could not ` +
      `find on his desk and ask him about those.`
    );
  }
  const n = r.names.length;
  return (
    `HANDED OVER — ${n} filename${n === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} now on a button on his ` +
    `deck. I am not repeating them back to you here: the names are in the desk_scan result you got the ids ` +
    `from, inside its untrusted-filenames envelope, and that is the only place on this system a filename is ` +
    `allowed to reach you. Name them to him from there if he needs to hear them. ` +
    `NOTHING HAS BEEN PLANNED, NOTHING IS QUEUED, NO CARD EXISTS and nothing is waiting for his approve — ` +
    `do not say any of those words. The button opens a NEW conversation with those names as chips beside an ` +
    `EMPTY message box; he types where they go in his own words and sends it, and I file from that. ` +
    // S3 — THE REASON, NOT THE INSTRUCTION, IS WHAT WAS UNREACHABLE. "the
    // folder has to come from him" is true in both states and stays; "because a
    // picture does not get to choose one" describes a picture that cannot be in
    // any conversation while the door is shut, and a model told why a thing
    // that cannot happen is forbidden starts looking for it.
    `Tell him it is there, in one line, and tell him the folder has to come from him` +
    pic(` because a picture does not get to choose one.`, `.`) +
    (r.missing.length > 0
      ? ` ${r.missing.length} of the ids you gave me ${r.missing.length === 1 ? "is" : "are"} not in his ` +
        `index and did not travel — say which names you could not find.`
      : "") +
    (r.overflow > 0
      ? ` ${r.overflow} more were past the ${MAX_HANDOFF}-name ceiling and were left off — say so.`
      : "")
  );
}
