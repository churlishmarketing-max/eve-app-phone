import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pictureIntakeOn } from "./intake.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const promptsDir = path.join(here, "..", "prompts");

// Layer 1: Character Bible verbatim. Layer 2: doctrine digest.
// Both static — loaded once so the prompt prefix stays byte-identical
// across requests (prompt-cache friendly).
const characterBible = readFileSync(
  path.join(promptsDir, "character-bible.md"),
  "utf8",
);
const doctrineDigest = readFileSync(
  path.join(promptsDir, "doctrine-digest.md"),
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
].join("\n");

// Layer 3 (the context pack) lives in context.ts — full Phase-2 assembly:
// today snapshot, open loops, recall. Volatile content rides in the user
// turn, not the system prompt, so the cached prefix survives.
