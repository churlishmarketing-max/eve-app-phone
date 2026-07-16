import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

export const staticSystemPrompt = [
  characterBible,
  "\n---\n",
  doctrineDigest,
].join("\n");

// Layer 3 (the context pack) lives in context.ts — full Phase-2 assembly:
// today snapshot, open loops, recall. Volatile content rides in the user
// turn, not the system prompt, so the cached prefix survives.
