// HER CLOSET, SYNCED — main process only.
//
// WHY THIS IS HERE AND NOT IN THE BRAIN. His authoring folder is
// brain/data/wardrobe ON HIS DISK. Railway cannot see it. On 2026-09-05 he
// dropped in fourteen new looks, nobody ran scripts/sync-wardrobe.mjs, and she
// could not see any of them for a day — with no way for him to know. So the
// machine that CAN see the folder does the seeing: this file lists it, asks the
// brain what the bucket already holds, and pushes the bytes that are missing.
//
// THE ONE-SECRET LAW IS WHY IT IS SHAPED THIS WAY. The desktop holds exactly
// one secret, the brain bearer token, in safeStorage, main-process only.
// SUPABASE_SERVICE_ROLE_KEY stays brain-side, so this process CANNOT talk to
// storage and does not try. It sends bytes over the authenticated wire and the
// brain is the only thing that touches the bucket.
//
// AND THERE IS NO INTELLIGENCE HERE. It compares two lists of filenames and
// uploads the difference. It does not decide what a look is, does not name
// anything, does not rename anything, does not judge. The brain refuses a
// filename it does not like; this file does not argue with it.
//
// ============================================================================
// IT NEVER DELETES. NOT ONCE, NOT EVER, NOT UNDER ANY CONDITION.
// ============================================================================
// There is no delete call in this file and no code path that could produce one.
// That is deliberate and it is the most important line in it. A file missing
// from that folder does NOT mean he retired the look: OneDrive may not have
// synced it down yet, the folder may have moved, a drive may be disconnected, a
// copy may have died halfway. An automatic prune on any of those days silently
// empties her closet and there is no undo — 99 real renders of his.
//
// So: AN EMPTY FOLDER MEANS NOTHING WAS ADDED. A MISSING FOLDER MEANS NOTHING
// WAS ADDED. Neither is ever read as "everything was deleted". Pruning stays a
// deliberate hand-run of `node scripts/sync-wardrobe.mjs --prune`, by a human
// who has just looked at the folder.
//
// Owning stream: S1 (main process), following poll.ts's shape.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "./api.js";
import { isHarness } from "./config.js";
import { broadcast } from "./windows.js";
import { IPC, type WardrobeSyncEvent } from "../src/shared/contract.js";

// electron-vite emits CJS here; the same resolution style main.ts uses so an
// ESM flip does not silently break __dirname.
const here = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

/** First pass a beat after launch — boot owns the first seconds, not this. */
const FIRST_DELAY_MS = 8_000;
/** Then quarterly-hourly. He drops looks in by hand; this is not a hot loop. */
const INTERVAL_MS = 15 * 60_000;
/** The looks this file recognises — the same four wardrobe.ts recognises. */
const LOOK_EXT = /\.(png|jpe?g|webp)$/i;
/** Matches the brain's MAX_LOOK_BYTES; oversize is skipped here so the wire
 *  never carries a body the far end is going to refuse anyway. */
const MAX_LOOK_BYTES = 10 * 1024 * 1024;
/** Uploads attempted in one pass. The brain's own cap is 120/minute. */
const MAX_PER_PASS = 100;

// ---------------------------------------------------------------------------
// FINDING THE FOLDER
//
// Derived from this bundle's own location, the way brain/src/wardrobe.ts
// derives its localDir from its own — never a hardcoded C:\ path. out/main
// sits inside desktop/, and desktop/ sits beside brain/, so walking up for a
// directory that CONTAINS brain/data/wardrobe finds it in a dev tree and finds
// nothing anywhere else. Nothing is created; this only ever looks.
//
// EVE_WARDROBE_DIR overrides it — the same seam EVE_BRAIN_URL and
// EVE_DESK_SCRATCH already are, so the verification harness can point this at a
// temp folder without going near his.
// ---------------------------------------------------------------------------

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function findWardrobeDir(): string | null {
  const override = process.env.EVE_WARDROBE_DIR;
  if (override && override.trim()) {
    const abs = path.resolve(override.trim());
    return isDir(abs) ? abs : null;
  }
  let dir = here;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "brain", "data", "wardrobe");
    if (isDir(candidate)) return candidate;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

// ---------------------------------------------------------------------------
// State + the quiet voice
// ---------------------------------------------------------------------------

export interface SyncPass {
  /** Looks uploaded in THIS pass. Counted from 200s, never assumed. */
  added: number;
  /** Local looks the bucket already had — the skip that keeps this cheap. */
  alreadyThere: number;
  /** Attempted and refused by the brain (a name it won't take, a collision). */
  refused: number;
  /** Why nothing happened, when nothing happened. Never an error he must act on. */
  note: string | null;
}

let addedThisSession = 0;
let lastRunAt: string | null = null;
let timer: NodeJS.Timeout | null = null;
let inFlight = false;

/** Said-once ledger: an offline brain must not print 96 times an hour. */
const said = new Set<string>();
function quietly(key: string, line: string): void {
  if (said.has(key)) return;
  said.add(key);
  console.log(`[wardrobe-sync] ${line}`);
}

export function wardrobeSyncState(): WardrobeSyncEvent {
  return { addedThisSession, lastRunAt };
}

/** Test seam — the E2E block runs several passes in one launch. */
export function _resetWardrobeSyncForTests(): void {
  addedThisSession = 0;
  lastRunAt = null;
  said.clear();
}

// ---------------------------------------------------------------------------
// One pass
// ---------------------------------------------------------------------------

export async function syncOnce(): Promise<SyncPass> {
  const nothing = (note: string): SyncPass => ({ added: 0, alreadyThere: 0, refused: 0, note });

  const dir = findWardrobeDir();
  if (!dir) {
    // A missing folder is not an error worth shouting about — he may simply not
    // author on this machine. It is emphatically NOT "everything was deleted".
    quietly("nofolder", "no brain/data/wardrobe on this machine — nothing to sync, and nothing is being removed");
    return nothing("no wardrobe folder");
  }

  let local: string[];
  try {
    local = readdirSync(dir).filter((f) => LOOK_EXT.test(f));
  } catch (err) {
    quietly("unreadable", `couldn't read ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return nothing("folder unreadable");
  }
  if (local.length === 0) {
    // An EMPTY folder is a folder with nothing to add. It is not an instruction.
    return nothing("folder is empty — nothing to add");
  }

  const m = await api.lookManifest();
  if (!m.ok) {
    // Offline brain, 401, a 5xx. Quiet, honest, and it claims NOTHING: an
    // unreadable manifest is never treated as an empty bucket, because "the
    // bucket is empty" would mean uploading the whole closet on a bad answer.
    quietly(`manifest:${m.error}`, `brain didn't answer with the closet (${m.error}) — trying again later`);
    return nothing(`couldn't read the closet: ${m.error}`);
  }
  said.delete("manifest");

  const remote = new Set(m.looks.map((l) => l.file));
  const missing = local.filter((f) => !remote.has(f));
  let alreadyThere = local.length - missing.length;
  if (missing.length === 0) {
    // THE CHEAP PATH, and the ordinary one: nothing is read off disk, nothing
    // is hashed, nothing crosses the wire. The hand-run script re-uploads all
    // 99 every time; this uploads zero.
    lastRunAt = new Date().toISOString();
    return { added: 0, alreadyThere, refused: 0, note: null };
  }

  let added = 0;
  let refused = 0;
  for (const file of missing.slice(0, MAX_PER_PASS)) {
    let bytes: Buffer;
    try {
      const abs = path.join(dir, file);
      const st = statSync(abs);
      if (st.size > MAX_LOOK_BYTES) {
        quietly(`big:${file}`, `one look is over ${MAX_LOOK_BYTES} bytes and was left alone`);
        refused += 1;
        continue;
      }
      bytes = readFileSync(abs);
    } catch {
      // Locked by the render tool, half-written, or vanished between the listing
      // and the read. Skip it; the next pass will find it.
      refused += 1;
      continue;
    }
    const r = await api.putLook(file, bytes);
    if (r.ok && r.status === "added") added += 1;
    // "unchanged" — the brain compared the bytes and they were already hers.
    else if (r.ok) alreadyThere += 1;
    else {
      refused += 1;
      quietly(`refused:${r.error}`, `the brain refused a look (${r.error})`);
    }
  }

  addedThisSession += added;
  lastRunAt = new Date().toISOString();
  if (added > 0) {
    console.log(`[wardrobe-sync] ${added} new look(s) added to her closet`);
    // W3 — HE HEARS ABOUT IT, ONCE, AND ONLY WHEN SOMETHING HAPPENED.
    // A COUNT AND NOTHING ELSE crosses this line. No filename: a filename is
    // untrusted third-party text (desk.ts's whole thesis), and the deck has no
    // reason to render one to say a number changed.
    broadcast(IPC.wardrobeSync, wardrobeSyncState());
  }
  return { added, alreadyThere, refused, note: null };
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

async function tick(): Promise<void> {
  if (inFlight) return; // never stack passes on a slow brain (poll.ts's rule)
  inFlight = true;
  try {
    await syncOnce();
  } catch (err) {
    // This must never take the app down and never block anything. Say it once.
    quietly("threw", `pass failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    inFlight = false;
  }
}

/**
 * NEVER BLOCKS LAUNCH: this returns immediately and the first pass happens on a
 * timer. Inert under smoke/shots/e2e — a screenshot run must not upload
 * anything — unless EVE_WARDROBE_SYNC=1 says otherwise, which is how the
 * wardrobe E2E block drives it deliberately.
 */
export function startWardrobeSync(): void {
  if (timer) return;
  if (isHarness() && process.env.EVE_WARDROBE_SYNC !== "1") return;
  setTimeout(() => void tick(), FIRST_DELAY_MS).unref?.();
  timer = setInterval(() => void tick(), INTERVAL_MS);
  timer.unref?.();
}

export function stopWardrobeSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
