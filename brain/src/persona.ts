import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pictureIntakeOn } from "./intake.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const promptsDir = path.join(here, "..", "prompts");

// Layer 1: Character Bible verbatim. Layer 2: doctrine digest. Layer 2b: the
// operating picture. All static — loaded once so the prompt prefix stays
// byte-identical across requests (prompt-cache friendly).
const characterBible = readFileSync(
  path.join(promptsDir, "character-bible.md"),
  "utf8",
);
const doctrineDigest = readFileSync(
  path.join(promptsDir, "doctrine-digest.md"),
  "utf8",
);

// ---------------------------------------------------------------------------
// LAYER 2b — THE OPERATING PICTURE. BUSINESS FACT, NOT DOCTRINE.
//
// Sept 21, 2026: Churlish moved its front door to High Level Pros and the
// councils ruled a staged cutover. Nothing in the two layers above knew it —
// grep them for "High Level Pros", "Guest Authority" or "Kelly" and every one
// returned nothing — so asked what the offer ladder is she answered from a June
// picture, and the name closest to hand was Authority Lite, which is RETIRED and
// must never be quoted.
//
// WHY A THIRD FILE AND NOT MORE DIGEST. The digest governs JUDGMENT — how she
// decides, what she escalates, what she refuses. This is a different kind of
// sentence: the price of the Diagnostic, the name of the person Crucible work
// goes to, the fact that an offer is retired. Facts go stale on their own
// schedule and get replaced wholesale; doctrine is amended line by line after an
// audit. Mixing them means every business change edits the file the audits live
// in. The file states its own precedence at the top: the digest still owns HOW
// she decides, this owns WHAT is the case.
//
// WHY THE SYSTEM PROMPT AND NOT THE CONTEXT PACK. The pack (context.ts) rides in
// the USER turn on purpose, so the cached prefix survives — anything put there is
// paid in full on every single turn. The pack is also where every line needs a
// PACK_SOURCES verdict about whose words it carries, and these are King's own
// standing facts: not volatile, not third-party. A static layer is paid once per
// cache write and read cheap after. The pack is for what changed since the last
// turn, and none of this changed.
//
// WHAT IS DELIBERATELY NOT IN IT: the dated action list and the milestone table.
// A prompt carrying a stale date quotes last Friday's deadline with total
// confidence a week later. Those live in the tracker; the file says so, and says
// she does not have them.
// ---------------------------------------------------------------------------
const operatingPicture = readFileSync(
  path.join(promptsDir, "operating-picture.md"),
  "utf8",
);

// ---------------------------------------------------------------------------
// S3 — THE PICTURE SECTION IS SWAPPED, NOT DELETED (audit 7).
//
// 120 lines of doctrine-digest.md teach her the picture workflow: read the
// screenshot, put the names through desk_scan, hand them to desk_handoff, tell
// him about the button on his deck, never let the picture pick the folder.
// Every sentence of it is good work, and with intake off every sentence of it
// is ALSO a promise she cannot keep — she would offer him a button that no
// longer appears and ask him for a screenshot he cannot send.
//
// WHY A SWAP AND NOT A DELETE. That section is the record of four NOT
// DEPLOYABLE audits and two dead mechanisms. Deleting it would lose the record
// and leave the next person to rediscover for themselves why a grounding test
// does not work. It stays in the file, between markers, and comes back whole
// the instant the switch flips.
//
// WHY NOT SIMPLY DROP IT AND SAY NOTHING. Because silence is not honest either.
// He will still attach a picture — he does not know it is off — and with no
// doctrine at all she answers his words as though nothing came with them.
// doctrine-picture-off.md is the shorter TRUE version: what happens, and what
// to say when it does.
//
// The markers are HTML comments, so the file still reads as ordinary Markdown
// with the section in place. The swap is exact-string and THROWS if a marker is
// missing, rather than falling back to the full text: shipping the wrong half
// of this doctrine silently is precisely the failure it exists to prevent.
// ---------------------------------------------------------------------------
const OPEN = "<!-- PICTURE-SECTION -->";
const CLOSE = "<!-- /PICTURE-SECTION -->";

export function withPictureDoctrine(digest: string): string {
  const a = digest.indexOf(OPEN);
  const b = digest.indexOf(CLOSE);
  if (a === -1 || b === -1 || b < a) {
    throw new Error(
      `doctrine-digest.md is missing its ${OPEN} … ${CLOSE} markers, so the picture section cannot be swapped. ` +
        `Restore the markers rather than deleting this check.`,
    );
  }
  const replacement = pictureIntakeOn()
    ? digest.slice(a + OPEN.length, b)
    : `\n${readFileSync(path.join(promptsDir, "doctrine-picture-off.md"), "utf8")}\n`;
  return digest.slice(0, a) + replacement + digest.slice(b + CLOSE.length);
}

export const staticSystemPrompt = [
  characterBible,
  "\n---\n",
  withPictureDoctrine(doctrineDigest),
  // LAST, so the newest facts are the last thing she reads before his words —
  // and because the picture file's own opening paragraph declares its
  // precedence over anything above it that disagrees about a fact.
  "\n---\n",
  operatingPicture,
].join("\n");

// Layer 3 (the context pack) lives in context.ts — full Phase-2 assembly:
// today snapshot, open loops, recall. Volatile content rides in the user
// turn, not the system prompt, so the cached prefix survives.
