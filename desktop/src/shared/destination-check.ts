// DESTINATION PROVENANCE — owning stream: DESK/S1.
//
// One pure function, in shared/ rather than in electron/api.ts, for one reason:
// it is the belt behind a prompt law, and a belt has to be testable without
// booting Electron. verify/desk-injection-harness.mjs hammers it directly.
//
// It is imported by MAIN only (electron/api.ts). The renderer never runs it —
// the renderer is handed the RESULT on the confirm, so a compromised turn has
// no path to re-grade itself on the way to the screen.

import type { DestinationCheck } from "./desk-contract.js";

// ---------------------------------------------------------------------------
// DID THE DESTINATION COME OUT OF HIS MOUTH? (a3 / a5 / a9)
//
// The audit's flag-then-comply failure: a caption in a screenshot names a
// folder, she quotes it, says out loud that she will not treat it as a
// directive, and then goes looking for that exact folder and offers to create
// it — closing with "that GE Outdoors path you named". He named no path. The
// caption did.
//
// A prompt law is the right first answer and it is not the last one, because
// the turn that gets talked around is precisely the turn that cannot be trusted
// to report on itself. So THE DESKTOP grades it. Main is the only process that
// holds both halves — the message King typed and the plan she raised on it —
// and it compares them here, with no model anywhere in the loop.
//
// v0.5 — THE TWIN IS GONE, AND THIS ONE IS NO LONGER LOAD-BEARING.
//
// `brain/src/grounding.ts` used to be the same algorithm on the other side of
// the wire, refusing where this one warns. Audit 3 DELETED it, and the reason
// matters more than the file did:
//
//   "This feature cannot be made safe in this shape. The refusal tries to infer
//    AUTHORSHIP from STRING OVERLAP, and a picture can write the string. Every
//    patch to it will be a longer regex against an adversary who is choosing
//    his words for him."
//
// The two that ended it:
//   P8  A QUESTION GROUNDS AS WELL AS AN ORDER. "what's this note on my monitor
//       about the Clients Northwind thing" contains every word of
//       `Clients\Northwind`, so the move was GROUNDED and CARDED — off a
//       question he asked about a picture whose answer the picture wrote.
//   P2  "sort my downloads into projects" grounds a bare root label, i.e. a mass
//       move into the top level of a root, off two words he says every day.
//
// The brain now refuses on a question that HAS an answer — does the destination
// occur IN THE PICTURE, read back by a separate tool-less pass (brain/src/
// reader.ts, brain/src/narrow.ts) — plus a structural operation lock: while a
// picture is in the session it is MOVE only, no renames, no bare root drops.
//
// THIS FUNCTION SURVIVED AS A BANNER AND NOTHING ELSE. "You did not type that
// folder" is still a true and useful thing to print above a batch of his files,
// and a card that says it costs nothing. But it gates nothing, it decides
// nothing, no refusal depends on it, and it must never be described as the
// thing that stops an attack — it isn't, it never was, and saying so is how a
// belt ends up load-bearing by accident.
//
// THE RULE, deliberately small enough to explain on the card:
//   · Only `move` and `rename` are graded. A `stage` composes its own path into
//     his trash, so there is no destination he could have named.
//   · A row that lands in the folder it started in chose no destination; its
//     FOLDER is skipped. Its NEW NAME is still graded.
//   · A destination is GROUNDED when EVERY folder name along its path appears
//     in his typed message as a whole-word run — or, when the file lands in the
//     root of a census folder, when the root label does.
//   · A row whose basename changes has been RENAMED, and the new stem is folded
//     and tested against his words exactly like a folder segment.
//   · Everything else is UNGROUNDED, and the card names it.
//
// The rule is kept AS IT WAS, deliberately, rather than being "improved": it is
// now decoration on a card, and quietly changing what a decoration means is how
// he learns to stop reading it.
//
// WHY RENAMES (audit 2, H3). This function used to grade folders only, and it
// returned `null` — silence — for a rename in place, because a rename in place
// lands where it started and every row fell through the skip above. That is a
// hole with a name: an attacker who cannot RELOCATE one of his files can still
// rename EVERY file on his desk to whatever a photograph says, and the card
// says nothing at all while it happens. The stem is what she chose; the
// extension is not (validatePlan refuses an extension change outright), so the
// stem is what gets graded.
//
// Every segment, not just the deepest one, because the banner's claim is
// literal: `desktop\Clients\Acme` on a turn where he said only "Clients" is a
// destination he half-named, and "Acme" came from somewhere else. Saying that
// out loud is the whole job. The root label alone never grounds a subfolder —
// a plan cannot invent a root (validatePlan refuses one off the census), so the
// root is the part an attacker could not have chosen and is worth nothing as
// evidence that HE chose the rest.
//
// It is deliberately conservative in the direction of speaking up: "sort these"
// with a destination of `projects\GE Outdoors` warns, and it should, because he
// did not say GE Outdoors — something else did. APPROVE stays enabled. This is
// information, not a refusal. (His standing decision on warnings.)
// ---------------------------------------------------------------------------

/**
 * Fold to a whole-word token run — case, accents and punctuation all give way,
 * so he does not have to type a folder byte for byte. The leading and trailing
 * spaces ARE the word boundary: without them "GE" would ground "GE Outdoors".
 * An empty fold returns "" and not " ", because a matcher that matches every
 * message is not a check.
 */
function normWords(s: string): string {
  const folded = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return folded ? ` ${folded} ` : "";
}

/**
 * The DIRECTORY half of a root-relative path, backslash-normalised. "" when the
 * file lands in the root of the census folder itself.
 */
function relDir(rel: string): string {
  const norm = rel.replace(/[\\/]+/g, "\\").replace(/^\\+/, "");
  const cut = norm.lastIndexOf("\\");
  return cut < 0 ? "" : norm.slice(0, cut);
}

/** The filename half — everything after the last separator. */
function baseName(rel: string): string {
  const norm = rel.replace(/[\\/]+/g, "\\");
  const cut = norm.lastIndexOf("\\");
  return cut < 0 ? norm : norm.slice(cut + 1);
}

/**
 * The STEM — the basename with its extension dropped. She cannot change an
 * extension (validatePlan G-D refuses it), so the extension is not something he
 * could have failed to authorise. A dotfile (".env") is all stem, no extension.
 */
function baseStem(rel: string): string {
  const name = baseName(rel);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Whole-word containment of one path segment inside his folded message. */
function says(said: string, seg: string): boolean {
  const token = normWords(seg);
  return token !== "" && said.includes(token);
}

/**
 * DOES SHE SAY THIS CAME FROM HIM? (audit 2, H4)
 *
 * On roughly half of samples she attributed the picture's text to King in her
 * own prose — "the destination he named", "as you said", "per your doc" — while
 * the destination was one he had never typed. Law 4 in the prompt does not stop
 * it, because a turn that has been talked around does not enforce its own laws.
 *
 * So MAIN catches it with a regex and no trust in the model at all. This is
 * only ever consulted when the grade has ALREADY found something ungrounded:
 * "your downloads folder" is ordinary prose on an honest turn and only becomes
 * evidence when it is attached to a destination he demonstrably never chose.
 */
const ATTRIBUTION = /\byour\b|\byou (said|named|asked|told|wanted|mentioned)\b|\bper you\b|\bas discussed\b/i;

export function attributionSuspect(intent: unknown): boolean {
  return typeof intent === "string" && ATTRIBUTION.test(intent);
}

/**
 * `null` when there is nothing honest to say — a stage, an unreadable payload,
 * or a batch that moved nothing and renamed nothing. Null renders as SILENCE on
 * the card; it is never rendered as "checked and clean".
 */
export function destinationCheck(typedMessage: string, payload: unknown): DestinationCheck | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  if (o.op !== "move" && o.op !== "rename") return null;
  if (!Array.isArray(o.moves) || o.moves.length === 0) return null;

  const said = normWords(typeof typedMessage === "string" ? typedMessage : "");
  const grounded: string[] = [];
  const ungrounded: string[] = [];
  const renamedUngrounded: string[] = [];
  const seen = new Set<string>();
  const seenName = new Set<string>();

  for (const raw of o.moves) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.toRoot !== "string" || typeof m.toRel !== "string") continue;
    const dir = relDir(m.toRel);

    // ---- THE NEW NAME -----------------------------------------------------
    // Graded FIRST and unconditionally, BEFORE the same-place skip below,
    // because a rename in place is precisely the row that skip throws away.
    if (typeof m.fromRel === "string" && baseName(m.fromRel).toLowerCase() !== baseName(m.toRel).toLowerCase()) {
      const stem = baseStem(m.toRel);
      const nameKey = stem.toLowerCase();
      if (!seenName.has(nameKey)) {
        seenName.add(nameKey);
        if (!says(said, stem)) renamedUngrounded.push(stem);
      }
    }

    // It landed where it started: no destination was chosen, so none was named.
    if (
      typeof m.fromRoot === "string" &&
      typeof m.fromRel === "string" &&
      m.fromRoot === m.toRoot &&
      relDir(m.fromRel).toLowerCase() === dir.toLowerCase()
    ) {
      continue;
    }

    const shown = dir ? `${m.toRoot}\\${dir}` : m.toRoot;
    const key = shown.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // EVERY segment, or the root label when there are none. A segment that
    // folds to nothing (pure punctuation) can never be found in anything, so it
    // counts as ungrounded rather than silently passing on an empty match.
    const segs = dir.split(/[\\/]+/).filter(Boolean);
    const parts = segs.length > 0 ? segs : [m.toRoot];
    if (parts.every((seg) => says(said, seg))) grounded.push(shown);
    else ungrounded.push(shown);
  }

  // The early-out used to be `grounded.length === 0 && ungrounded.length === 0`,
  // which swallowed every rename-in-place batch before it could be reported.
  // A verdict now survives on the strength of the NAMES alone.
  if (grounded.length === 0 && ungrounded.length === 0 && renamedUngrounded.length === 0) return null;
  return { grounded, ungrounded, renamedUngrounded };
}
