// HER CLOSET GAINS A LOOK — the brain half of automatic wardrobe sync.
//
// WHY THIS EXISTS. The authoring folder is brain/data/wardrobe ON HIS MACHINE;
// the looks she can actually wear live in the Supabase Storage bucket
// "wardrobe". scripts/sync-wardrobe.mjs was the only bridge and it is run by
// hand. On 2026-09-05 fourteen new looks landed in the folder, nobody ran it,
// and she could not see any of them for a day. Railway cannot read his disk, so
// the brain cannot close that gap alone: his DESKTOP reads the folder and sends
// the bytes here over the authenticated wire, and THIS is the only thing that
// touches storage. The desktop never holds a Supabase key — the one-secret law.
//
// WHERE THESE BYTES GO, SAID OUT LOUD SO NOBODY LATER MISTAKES IT.
// A look uploaded through this door goes to the STORAGE BUCKET AND NOWHERE
// ELSE. It is never decoded, never described, never summarised, never put in a
// prompt, never written to conversations/memory_entries, and never handed to
// the model in any form. THIS IS NOT THE IMAGE-INTAKE PATH. Picture intake is
// switched OFF at the door (src/intake.ts — audit 7 returned NOT DEPLOYABLE and
// Brandon chose the off branch); this is a file store for her portraits, which
// is a different feature that happens to move PNGs. If you are here because you
// are turning intake back on, you are in the wrong file.
//
// THE ASYMMETRY — READ THIS BEFORE ADDING ANYTHING.
// ADDING IS AUTOMATIC. DELETING IS NEVER AUTOMATIC, and there is deliberately
// no delete branch in this module — not a guarded one, not a flagged one, not
// one behind an env var. A look missing from his folder does NOT mean he
// retired it: OneDrive may not have synced it down, the folder may have moved,
// a drive may be disconnected, a copy may have failed halfway. An automatic
// prune in any of those states silently empties her closet and there is no
// undo. Pruning stays a deliberate hand-run of
// `node scripts/sync-wardrobe.mjs --prune`. The absence of the capability here
// IS the guarantee; do not add one.

import { createHash } from "node:crypto";
import { db } from "./db.js";
import { sanitise } from "./desk.js";
import { BUCKET, invalidateLooksCache, mimeOf } from "./wardrobe.js";

// ---------------------------------------------------------------------------
// The ceilings
// ---------------------------------------------------------------------------

/** One look. Matches the bucket's own file_size_limit in scripts/sync-wardrobe.mjs. */
export const MAX_LOOK_BYTES = 10 * 1024 * 1024;

/**
 * A filename, in codepoints. 96 is desk.ts's MAX_DISPLAY on purpose: past it
 * the shared sanitiser middle-ellipsises, which would be a REWRITE, and a
 * rewritten name is exactly the thing this door refuses to do. His longest real
 * look is 25 characters.
 */
export const MAX_NAME_CHARS = 96;

/**
 * THE BATCH CAP. One file per request, so the batch is bounded in time instead
 * of in a body: at most this many adds land in any rolling minute, whoever is
 * asking. 120 clears a cold first sync of his whole closet (99 looks) in one
 * pass and still bounds a runaway client to a knowable amount of writing.
 */
export const MAX_ADDS_PER_WINDOW = 120;
const WINDOW_MS = 60_000;

/** Extension allowlist — the same four wardrobe.ts already recognises. */
const EXT_OK = /\.(png|jpe?g|webp)$/i;

/**
 * Every character his 99 real looks use, plus the punctuation a render tool
 * plausibly emits. An allowlist rather than a denylist: the set of characters a
 * portrait filename needs is small and knowable, and the set of characters that
 * can hurt a storage key is not.
 */
const NAME_CHARS = /^[A-Za-z0-9 ._()+#&'-]+$/;

// ---------------------------------------------------------------------------
// THE NAME IS UNTRUSTED
//
// It is chosen outside the brain — on his disk, by whatever wrote the file — so
// it is third-party text by definition. It is REFUSED, never repaired: a name
// that gets silently rewritten is a name that can be steered onto TOP OF A
// DIFFERENT LOOK, and he did not ask for replacement.
//
// The shared sanitiser in desk.ts is the spine of this (NFC, C0/C1, bidi,
// zero-width, tag chars, whitespace runs, the structural escapes, the length
// ellipsis). Here it is used as a TEST rather than a transform: if it changed
// one byte, the answer is no. The structural rules around it are the ones a
// display sanitiser has no reason to care about but a storage key does —
// separators, traversal, drive letters, and the extension.
// ---------------------------------------------------------------------------

export type NameVerdict = { ok: true; file: string } | { ok: false; reason: string };

export function vetLookName(raw: unknown): NameVerdict {
  if (typeof raw !== "string" || raw === "") return { ok: false, reason: "a look needs a filename" };
  const cps = [...raw];
  if (cps.length > MAX_NAME_CHARS) {
    return { ok: false, reason: `that filename is ${cps.length} characters; the ceiling is ${MAX_NAME_CHARS}` };
  }
  if (/[\\/]/.test(raw)) return { ok: false, reason: "a look filename cannot contain a path separator" };
  if (raw.includes(":")) return { ok: false, reason: "a look filename cannot contain a colon" };
  if (raw.startsWith(".") || raw.includes("..")) {
    return { ok: false, reason: "a look filename cannot start with a dot or contain '..'" };
  }
  // The belt. Control characters, bidi overrides, zero-width joiners, tag
  // characters, doubled spaces, leading/trailing space and the structural
  // escapes all land here as `altered`.
  if (sanitise(raw).altered) return { ok: false, reason: "that filename doesn't survive sanitising — rename it and try again" };
  if (!NAME_CHARS.test(raw)) return { ok: false, reason: "that filename has characters a look can't use" };
  if (!EXT_OK.test(raw)) return { ok: false, reason: "a look has to be .png, .jpg, .jpeg or .webp" };
  // Unchanged, byte for byte. This is the ONLY value that ever reaches storage.
  return { ok: true, file: raw };
}

// ---------------------------------------------------------------------------
// The rolling batch window
// ---------------------------------------------------------------------------

let windowStart = 0;
let windowCount = 0;

function takeSlot(): boolean {
  const now = Date.now();
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_ADDS_PER_WINDOW) return false;
  windowCount += 1;
  return true;
}

/** Test seam — the harness drives the window without waiting a minute. */
export function _resetAddWindowForTests(): void {
  windowStart = 0;
  windowCount = 0;
}

// ---------------------------------------------------------------------------
// The manifest — what the bucket actually holds
// ---------------------------------------------------------------------------

export type Manifest =
  | { ok: true; looks: { file: string; size: number | null }[] }
  | { ok: false; error: string };

/**
 * A FAILED LISTING IS NOT AN EMPTY BUCKET, and this never says it is.
 * listLooksAsync() falls back to the local folder when storage is unreachable,
 * which is right for rendering her portrait and wrong here: the caller of this
 * is deciding what to UPLOAD, so it must get the bucket's own answer or an
 * honest failure. Nothing downstream may read `[]` as "everything was deleted".
 */
export async function bucketManifest(): Promise<Manifest> {
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline — can't read the closet" };
  const { data, error } = await c.storage
    .from(BUCKET)
    .list("", { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "storage returned no listing" };
  const looks = data
    .filter((o) => EXT_OK.test(o.name))
    .map((o) => ({ file: o.name, size: typeof o.metadata?.size === "number" ? o.metadata.size : null }));
  return { ok: true, looks };
}

// ---------------------------------------------------------------------------
// The add
// ---------------------------------------------------------------------------

export type AddStatus = "added" | "unchanged";
export type AddRefusal = "refused" | "conflict" | "too_big" | "throttled" | "offline" | "failed";

export type AddOutcome =
  | { ok: true; status: AddStatus; file: string }
  | { ok: false; status: AddRefusal; error: string; httpStatus: number };

function sha256(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

function looksLikeDuplicate(err: { message?: string; statusCode?: string } | null): boolean {
  if (!err) return false;
  if (err.statusCode === "409") return true;
  return /already exists|duplicate/i.test(err.message ?? "");
}

/**
 * IT NEVER OVERWRITES A DIFFERENT LOOK. The upload is issued with
 * `upsert: false`, so replacement is not a thing this code can express — the
 * storage API itself rejects a second write to a name that is taken. On that
 * rejection the existing object is downloaded and compared byte-for-byte:
 *
 *   same name, same bytes      -> "unchanged". A no-op, and the honest answer
 *                                 on every ordinary re-sync.
 *   same name, different bytes -> REFUSED, 409, and it says which name. That is
 *                                 a decision, and nobody asked for replacement.
 *                                 He resolves it by renaming the file.
 */
export async function addLook(rawName: unknown, bytes: Buffer): Promise<AddOutcome> {
  const vet = vetLookName(rawName);
  if (!vet.ok) return { ok: false, status: "refused", error: vet.reason, httpStatus: 400 };
  const file = vet.file;

  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return { ok: false, status: "refused", error: "that look arrived empty", httpStatus: 400 };
  }
  if (bytes.length > MAX_LOOK_BYTES) {
    // Refused whole, never truncated: half a PNG is not a look.
    return {
      ok: false,
      status: "too_big",
      error: `that look is ${bytes.length} bytes; the ceiling is ${MAX_LOOK_BYTES}`,
      httpStatus: 413,
    };
  }
  if (!takeSlot()) {
    return {
      ok: false,
      status: "throttled",
      error: `more than ${MAX_ADDS_PER_WINDOW} looks in a minute — slow down and try the rest next cycle`,
      httpStatus: 429,
    };
  }

  const c = db();
  if (!c) return { ok: false, status: "offline", error: "memory spine offline — can't reach the closet", httpStatus: 503 };

  const { error } = await c.storage.from(BUCKET).upload(file, bytes, {
    contentType: mimeOf(file),
    // NOT NEGOTIABLE. `true` here would make this endpoint able to destroy a
    // look, which is the one thing it must never be able to do.
    upsert: false,
  });

  if (!error) {
    // Her closet cache is 60s; bust it so she can wear this within the minute.
    invalidateLooksCache();
    return { ok: true, status: "added", file };
  }

  if (!looksLikeDuplicate(error as { message?: string; statusCode?: string })) {
    return { ok: false, status: "failed", error: error.message, httpStatus: 502 };
  }

  const { data: blob, error: dlErr } = await c.storage.from(BUCKET).download(file);
  if (dlErr || !blob) {
    // The name is taken and we could not read what is under it. The safe answer
    // is still "no" — we do not write over something we cannot see.
    return {
      ok: false,
      status: "conflict",
      error: `"${file}" is already in the closet and I couldn't read it to compare`,
      httpStatus: 409,
    };
  }
  const existing = Buffer.from(await blob.arrayBuffer());
  if (sha256(existing) === sha256(bytes)) return { ok: true, status: "unchanged", file };
  return {
    ok: false,
    status: "conflict",
    error: `"${file}" already names a DIFFERENT look — rename the new one; I won't replace hers`,
    httpStatus: 409,
  };
}
