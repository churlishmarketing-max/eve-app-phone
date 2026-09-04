// DESK — THE PACK. Census assembly, caps, coverage accounting, wire budget.
// (FILE-MARSHAL-SPEC hop 2)
//
// This file owns the single most important boundary in the feature, and it is
// a boundary between two objects, not between two comments:
//
//   buildCensus()  is handed RootStats. It is NEVER handed index entries. It
//                  is therefore structurally incapable of putting a filename
//                  into the region the brain introduces as his private
//                  briefing and closes with "trust these over guesses".
//                  (G-I1 / INJ-1)
//
//   buildIndex()   is handed entries and emits SANITISED names. Those names
//                  reach the model only through a `desk_scan` tool result,
//                  inside the <untrusted_filenames> envelope, on a turn where
//                  she asked for them. (G-I4 / G-V4)
//
// The pack lives for exactly one turn. There is no brain-side cache, no new
// endpoint, and no push channel: it rides the /chat body and dies with the
// request. That is what makes a forged snapshot unreachable — there is nothing
// to forge one INTO. (INJ-3)
//
// Owning stream: DESK/S2.

import { MAX_ABS_LEN } from "./guard.js";
import type { IndexEntry, IndexSnapshot, RootStats } from "./index-store.js";
import type { DeskBatchSummary, DeskEntry, DeskMoveWire, DeskPack, DeskRoot, DeskRootCensus } from "./types.js";

// ---------------------------------------------------------------------------
// Wire budget
// ---------------------------------------------------------------------------

/** Hard cap. Over this the desktop DROPS the index and says so. (G-I5 / INJ-5) */
export const MAX_PACK_BYTES = 256 * 1024;
/** Leave room for the message and conversation id in the same body. */
export const PACK_BUDGET_BYTES = 224 * 1024;
export const MAX_BATCH = 50; // G-C5
export const MAX_SCAN_ROWS = 60; // G-I5
export const MAX_SCAN_CALLS = 4; // G-I5
export const MAX_INDEX = 1_200; // G-I5
/** Journal rows on the wire. Matches brain/src/desk.ts MAX_MOVES exactly. */
export const MAX_MOVES = 300;

export interface TrashUsage {
  files: number;
  bytes: number;
  freeOnVolume: number;
}

// ---------------------------------------------------------------------------
// The census — counts and King's own labels. NOT ONE FILENAME. (G-I1)
// ---------------------------------------------------------------------------

/**
 * Note the argument list: `RootStats`, a `DeskRoot`, a trash reading and an
 * indexed count. There is no parameter here through which a filename could
 * arrive, which is the only kind of guarantee worth having about this.
 */
export function buildRootCensus(root: DeskRoot, stats: RootStats, trash: TrashUsage, indexed: number): DeskRootCensus {
  const files = Math.max(0, stats.files);
  // Coverage is honest, not flattering: it is the fraction of the files this
  // root actually holds that she can name. Withheld, unsettled and truncated
  // entries all pull it down, and §5 G-I9 makes the census SAY so in words.
  const coverage = files === 0 ? 1 : Math.max(0, Math.min(1, indexed / files));
  return {
    label: root.label,
    files,
    bytes: stats.bytes,
    dirs: stats.dirs,
    synced: root.synced,
    dryRun: root.dryRun,
    arrivedToday: stats.arrivedToday,
    olderThan90d: stats.olderThan90d,
    byClass: { ...stats.byClass },
    bytesByClass: { ...stats.bytesByClass },
    hiddenByRule: stats.hiddenByRule,
    withheldAsInstruction: stats.withheldAsInstruction,
    unsettled: stats.unsettled,
    indexed,
    coverage,
    trash: { files: trash.files, bytes: trash.bytes, freeOnVolume: trash.freeOnVolume },
  };
}

// ---------------------------------------------------------------------------
// The index — sanitised names, and the id that brings a plan home
// ---------------------------------------------------------------------------

/**
 * The wire form of one entry. The REAL name and the REAL relative path stay in
 * the main process: what ships is the sanitised display form, and `i`, which is
 * the only handle a plan is allowed to use. (G-P1 / G-I2)
 */
export function wireEntry(e: IndexEntry, now: number): DeskEntry {
  return {
    i: e.i,
    r: e.root,
    d: e.dispDir.slice(0, MAX_ABS_LEN),
    n: e.dispName,
    kb: Math.round(e.size / 1024),
    ageD: Math.round(((now - e.mtimeMs) / 86_400_000) * 10) / 10,
    cls: e.cls,
    st: `${Math.round(e.size)}:${Math.round(e.mtimeMs)}`,
    f: e.flags,
  };
}

// ---------------------------------------------------------------------------
// pack()
// ---------------------------------------------------------------------------

export interface PackInput {
  deskId: string;
  roots: DeskRoot[];
  snap: IndexSnapshot;
  trashOf: (root: DeskRoot) => TrashUsage;
  lastBatches: DeskBatchSummary[];
  /**
   * THE FILING HISTORY SLICE. Newest first, already capped and already
   * placed-by-label by index.ts's `moves()`.
   *
   * UNDEFINED AND [] ARE DIFFERENT ANSWERS AND MUST STAY DIFFERENT. Undefined
   * omits the `moves` key entirely, and the brain reads a missing key as "his
   * desktop didn't send me any filing history" — which is NOT "I have no record
   * of that file". `[]` says the journal really is empty. Collapsing the two is
   * how she would end up telling him she never moved a file she moved on
   * Tuesday, so nothing in this function is allowed to turn one into the other.
   */
  moves?: DeskMoveWire[];
  maxIndex: number;
  now?: number;
}

export interface PackResult {
  pack: DeskPack | null;
  /** Set when the pack was built but the index had to be dropped for size. */
  note?: string;
  bytes: number;
}

export function buildPack(input: PackInput): PackResult {
  const now = input.now ?? Date.now();
  const { snap, roots } = input;

  const statsFor = new Map<string, RootStats>();
  for (const s of snap.roots) statsFor.set(s.label, s);

  const indexedPerRoot = new Map<string, number>();
  for (const e of snap.entries) indexedPerRoot.set(e.root, (indexedPerRoot.get(e.root) ?? 0) + 1);

  const census: DeskRootCensus[] = [];
  const unreadable: string[] = [];
  for (const root of roots) {
    const s = statsFor.get(root.label);
    if (!s) continue; // a root with no walk contributes nothing, not a zeroed lie
    // G-A1, narrowed. A root whose attribute sweep failed walked to all-zeroes,
    // and shipping that is a census of "0 files" for a folder that is full —
    // a lie in the shape of a fact. It is dropped from the pack and named to
    // KING instead, and the roots that CAN be read still ship.
    if (s.sweepOk === false) {
      unreadable.push(root.label);
      continue;
    }
    census.push(buildRootCensus(root, s, input.trashOf(root), indexedPerRoot.get(root.label) ?? 0));
  }
  if (census.length === 0) return { pack: null, bytes: 0 };
  const readable = new Set(census.map((c) => c.label));

  const maxIndex = Math.min(Math.max(1, input.maxIndex || MAX_INDEX), MAX_INDEX);
  // An entry can only ride if its root rode. A dropped root's entries would be
  // ids pointing at a folder she was never briefed on.
  const eligible = snap.entries.filter((e) => readable.has(e.root));
  const entries = eligible.slice(0, maxIndex).map((e) => wireEntry(e, now));
  const droppedByCeiling = Math.max(0, eligible.length - entries.length);

  const pack: DeskPack = {
    protocol: 1,
    deskId: input.deskId,
    at: new Date(now).toISOString(),
    attrSweepOk: true,
    limits: { maxBatch: MAX_BATCH, maxScanRows: MAX_SCAN_ROWS, maxScanCalls: MAX_SCAN_CALLS, maxIndex },
    census: { roots: census },
    index: {
      rev: snap.rev,
      entries,
      truncated: snap.truncated || droppedByCeiling > 0,
      omitted: snap.omitted + droppedByCeiling,
    },
    lastBatches: input.lastBatches.slice(0, 5),
    ...(input.moves ? { moves: input.moves.slice(0, MAX_MOVES) } : {}),
  };

  const unreadableNote = unreadable.length
    ? `I can't read Windows file attributes on ${unreadable.join(", ")} right now, so ${unreadable.length === 1 ? "that folder is" : "those folders are"} ` +
      "hidden from her entirely this turn. The rest still work."
    : "";

  let bytes = Buffer.byteLength(JSON.stringify(pack), "utf8");
  if (bytes <= PACK_BUDGET_BYTES) {
    return unreadableNote ? { pack, bytes, note: unreadableNote } : { pack, bytes };
  }

  // OVER BUDGET, AND HISTORY GIVES WAY FIRST. She cannot file with a history
  // and she can still answer "where did it go" from his desk log, which holds
  // the whole thing locally — so the index is the last thing to go, not the
  // first. The key is TRIMMED, never removed: an empty array still says "I was
  // given a history and it was this short", and removing the key would say the
  // desktop sent none at all. Those are different sentences on her side.
  if (pack.moves && pack.moves.length > 0) {
    for (const keep of [120, 40, 0]) {
      pack.moves = pack.moves.slice(0, keep);
      bytes = Buffer.byteLength(JSON.stringify(pack), "utf8");
      if (bytes <= PACK_BUDGET_BYTES) {
        const note = `${unreadableNote ? `${unreadableNote} ` : ""}the pack was over the ${Math.round(PACK_BUDGET_BYTES / 1024)} KB wire budget, so she has ${keep === 0 ? "none" : `only the last ${keep}`} of your filing history this turn — the whole log is still on this machine, in FILING — LOG & UNDO`;
        return { pack, bytes, note };
      }
    }
  }

  // INJ-5 / G-I9 — over budget the index is DROPPED, never silently truncated
  // to a size that fits. Coverage is rewritten to the truth (she can name
  // nothing) so the census line says so in words rather than implying a view
  // of his folders that she does not have.
  const dropped = pack.index.entries.length;
  pack.index = { rev: snap.rev, entries: [], truncated: true, omitted: pack.index.omitted + dropped };
  for (const r of pack.census.roots) {
    r.indexed = 0;
    r.coverage = 0;
  }
  bytes = Buffer.byteLength(JSON.stringify(pack), "utf8");
  return {
    pack,
    bytes,
    note: `${unreadableNote ? `${unreadableNote} ` : ""}the index was ${Math.round((bytes + dropped * 120) / 1024)} KB, over the ${Math.round(PACK_BUDGET_BYTES / 1024)} KB wire budget, so she has the counts this turn and no filenames at all`,
  };
}

// ---------------------------------------------------------------------------
// The audit that matters: no filename outside the two envelope-wrapped slots
// ---------------------------------------------------------------------------

/**
 * Structural proof, runnable in the harness and cheap enough to keep.
 * Serialises the pack with the name-carrying slots removed and reports whether
 * any of the given names survives anywhere in what is left. If this ever
 * returns a hit, the CENSUS has grown a filename and INJ-1 is back.
 *
 * THERE ARE NOW TWO SLOTS STRIPPED, NOT ONE, AND THE SECOND IS A REAL WIDENING
 * OF THIS AUDIT — so it is stated here rather than discovered later.
 *
 *   index.entries  a SANITISED filename, reaching the model only through a
 *                  `desk_scan` result inside `<untrusted_filenames>`, on a turn
 *                  where she asked. (G-I4 / G-V4)
 *   moves          a SANITISED root-relative path, reaching the model only
 *                  through a `desk_where` result inside `<untrusted_journal>`.
 *                  Same discipline, same envelope law, different tool.
 *
 * What has NOT changed is the thing this audit exists for: the CENSUS — the
 * block that lands in `<context_pack>`, the high-trust region the brain
 * introduces as his private briefing — still carries counts, bytes and the
 * labels HE typed, and not one filename. Getting those two regions backwards is
 * the CRITICAL injection finding the whole design exists to prevent, and this
 * function is still the structural proof that it has not happened.
 *
 * `namesInCensusOnly` below is the narrower audit for anyone who wants it: it
 * strips NOTHING but asserts against the census alone.
 */
export function namesOutsideIndex(pack: DeskPack, names: string[]): string[] {
  const stripped: DeskPack = {
    ...pack,
    index: { ...pack.index, entries: [] },
    ...(pack.moves ? { moves: [] } : {}),
  };
  const wire = JSON.stringify(stripped);
  const hay = wire.toLowerCase();
  return names.filter((n) => n.length > 2 && hay.includes(n.toLowerCase()));
}

/**
 * The tightest form of the same law, against the one block that must never
 * carry a name under any circumstance. Nothing is stripped and nothing is
 * excused: if a name is in here, it is in `<context_pack>`.
 */
export function namesInCensus(pack: DeskPack, names: string[]): string[] {
  const hay = JSON.stringify(pack.census).toLowerCase();
  return names.filter((n) => n.length > 2 && hay.includes(n.toLowerCase()));
}
