// DESK — THE GATE.
//
// Every rule in the guardrail table is a function here. No writes, no network,
// no fs of its own: every syscall arrives through the injected `GuardIo`, so
// the whole table is unit-testable offline and every deny has a testable allow
// twin.
//
// The guard runs three times: brain-side (advisory), desktop preflight
// (read-only, drives the card), and desktop execute (BINDING). Only the third
// matters for safety. A brain-side check is advisory the moment the payload is
// on the wire.
//
// Rule ids are stable and are the assertion names in the harness.
//
// Owning stream: DESK/S1.

import path from "node:path";
import { PLACEHOLDER_BITS, FILE_ATTRIBUTE_HIDDEN, FILE_ATTRIBUTE_REPARSE_POINT, FILE_ATTRIBUTE_SYSTEM } from "./attrs.js";
import { destScriptOk, foldPath, neverHit, sanitise } from "./sanitise.js";
import { contains, DENIED_SEGMENTS, deniedHit, hasShortName, inAnyTrash, SHORT_NAME_SEG } from "./roster.js";
import type { BatchVerdict, DeskRoot, FileBatchPayload, FileMove, OpVerdict } from "./types.js";
import { DESK_PROTOCOL } from "./types.js";

/* eslint-disable no-bitwise */

// ---------------------------------------------------------------------------
// Ceilings
// ---------------------------------------------------------------------------

export const MAX_BATCH = 50; // G-C5
export const MAX_RENAMES = 20; // G-C7
export const MAX_ABS_LEN = 240; // G-P14
export const MTIME_TOL_MS = 2_000; // G-T1
export const MTIME_TOL_SYNCED_MS = 10_000; // G-T1, widened for synced roots and SAID so
export const EXCLUSIVE_OPEN_OVER_BYTES = 8 * 1024 * 1024; // G-T5
export const FREE_FLOOR_BYTES = 20 * 1024 * 1024 * 1024; // G-C6
export const FREE_FLOOR_FRACTION = 0.1; // G-C6

// ---------------------------------------------------------------------------
// Injected I/O
// ---------------------------------------------------------------------------

export interface GuardStat {
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  size: number;
  mtimeMs: number;
  dev: number;
}

export interface GuardIo {
  /** lstat, NEVER stat: a symlinked source must not be followed. (G-P10) */
  lstat(abs: string): GuardStat | null;
  /** realpathSync.native, or null when the path does not exist. */
  realpath(abs: string): string | null;
  exists(abs: string): boolean;
  /** Raw Win32 attribute int, or null for UNKNOWN. Null is refused, not zeroed. */
  attr(abs: string): number | null;
  /** Free bytes on the volume holding `abs`. */
  free(abs: string): number;
  /** Bytes currently sitting in a root's trash. */
  trashBytes(root: DeskRoot): number;
  /** Exclusive open test for large files. True = we got it, false = in use. (G-T5) */
  canOpenExclusive(abs: string): boolean;
  /** Names in a directory. Used only to spot a live project tree. (G-T4) */
  siblings(dir: string): string[];
  /**
   * G-T4b — "is this file referenced by a project somewhere else?" OPTIONAL,
   * and absence is not innocence: an `io` without it produces no annotation,
   * and the card then prints the map's own UNKNOWN sentence rather than an
   * all-clear it was never told. See electron/desk/projects.ts.
   */
  projectRef?(abs: string): { project: string } | null;
  /**
   * G-V1 — his never-list, verbatim from config. REQUIRED, not optional: an
   * `io` that forgot to carry it would be a guard with the never-list silently
   * off, which is the exact failure this field exists to close. Empty array is
   * a legitimate value and says so out loud.
   */
  neverList: string[];
  userDataDir: string;
  now: number;
  trashCeilingBytes: number;
  /**
   * Binding pass or advisory pass. At preflight the destination chain may not
   * exist yet, so G-P9's post-mkdir realpath assertion is deferred to execute.
   */
  binding: boolean;
}

// ---------------------------------------------------------------------------
// Segment-level path rules (G-P2 .. G-P6)
// ---------------------------------------------------------------------------

const BAD_CHARS = new RegExp("[:*?\"<>|\\u0000-\\u001f]");
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
const DOT_SEG = /^(\.|\.\.)$/;
const TRAILING = /[ .]$/;

/** In-flight / lock-file names that must never be sources. (G-T3) */
const UNSETTLED_EXT =
  /\.(crdownload|part|partial|tmp|download|opdownload|ecd|aria2|!ut|filepart)$/i;
const OFFICE_LOCK = /^~\$.*\.(doc|docx|xls|xlsx|ppt|pptx)$/i;

/** Live project markers. Moving one of these out from under a tool breaks it. (G-T4) */
const PROJECT_SEGMENTS = new Set([".git", "node_modules", ".vscode", "venv", ".venv"]);
export const PROJECT_SIBLING_EXT = /\.(prproj|aep|psd|sln|csproj|xcodeproj)$/i;
const PROJECT_SIBLING_NAME = /^(package\.json|cargo\.toml|go\.mod)$/i;

/**
 * G-T4b — THE DEEP HALF OF G-T4, AND THE ONLY RULE IN THIS TABLE THAT REFUSES
 * NOTHING.
 *
 * G-T4 above catches a file whose own FOLDER is a project's working directory.
 * It cannot catch the case King actually screenshotted: a Premiere project in
 * one folder referencing C9452.MP4 sitting in another. Nothing is next to that
 * clip, so G-T4 is silent — correctly, because the two situations deserve two
 * different answers.
 *
 * His decision on this one, in his words: "I'll know where she moves it because
 * I'll have it planned ahead of time." So this rule WARNS and stops. The
 * disposition stays `allow`, `allowCount` and `bytesAllowed` are untouched,
 * execute.ts never sees a fourth disposition, and APPROVE stays enabled. What
 * changes is that the row carries a project name the card prints in gold.
 *
 * It is a separate id from G-T4 on purpose: two ids, two dispositions, two sets
 * of harness assertions, and no way for a future edit to one to quietly move
 * the other.
 *
 * The lookup itself is injected (`GuardIo.projectRef`) like every other syscall
 * in this file, so the whole rule is drivable offline from a stub.
 */
export const PROJECT_REF_RULE = "G-T4b";

/** Names that are never indexed and never moved. (G-T7) */
const SYSTEM_NAMES = /^(desktop\.ini|thumbs\.db|\.ds_store|ntuser\.dat.*|iconcache\.db)$/i;

export interface SegCheck {
  ok: boolean;
  rule: string;
  why: string;
  segs: string[];
}

/**
 * G-P2. Split and validate BEFORE composition. Never `path.resolve` on an
 * untrusted string: `path.resolve(base, "C:\\Windows\\x")` discards the base
 * entirely. Everything absolute-shaped is rejected here, before any join.
 */
export function checkRel(rel: string, forDestination: boolean): SegCheck {
  const fail = (rule: string, why: string): SegCheck => ({ ok: false, rule, why, segs: [] });
  if (typeof rel !== "string" || rel.length === 0) return fail("G-P2", "empty path");
  if (rel.length > MAX_ABS_LEN) return fail("G-P14", "that path is too long");

  // --- absolute smuggling, UNC, device paths (G-P2, G-P12) ------------------
  if (path.isAbsolute(rel)) return fail("G-P2", "that's an absolute path, not a folder inside your root");
  if (/^[A-Za-z]:/.test(rel)) return fail("G-P2", "that names a drive letter");
  if (/^[\\/]/.test(rel)) return fail("G-P2", "that starts at the root of a drive or a network share");
  if (rel.includes("\\\\?\\") || rel.includes("\\\\.\\") || rel.includes("//?/") || rel.includes("//./")) {
    return fail("G-P2", "that's a device path");
  }
  if (rel.includes("\u0000")) return fail("G-P4", "that name has a null byte in it");

  const segs = rel.split(/[\\/]/).filter(Boolean);
  if (segs.length === 0) return fail("G-P2", "that path has no name in it");
  if (segs.length > 16) return fail("G-P2", "that's nested too deep");

  for (const seg of segs) {
    if (DOT_SEG.test(seg)) return fail("G-P3", "no '..' or '.' segments");
    if (BAD_CHARS.test(seg)) {
      // `:` here is also the alternate-data-stream vector: notes.txt:hidden
      return fail("G-P4", `"${sanitise(seg).display}" has a character Windows won't allow in a name`);
    }
    if (RESERVED.test(seg)) {
      return fail("G-P5", `"${seg}" is a reserved Windows device name`);
    }
    if (TRAILING.test(seg)) {
      return fail("G-P6", `"${seg}" ends in a dot or a space — Windows silently strips those`);
    }
    if (DENIED_SEGMENTS.has(seg.toLowerCase())) {
      return fail("G-P15", `"${seg}" is a folder EVE is never allowed to touch`);
    }
    // G-P13 — an MS-DOS alias segment. A destination is MODEL-authored: there
    // is no legitimate reason for one to name a folder `PROGRA~1`, and one
    // that does is either aiming at the long path that alias resolves to, or
    // creating a folder whose name will be permanently confusable with it.
    if (forDestination && SHORT_NAME_SEG.test(seg)) {
      return fail("G-P13", `"${seg}" is an MS-DOS short name. Use the real folder name.`);
    }
    if (forDestination && !destScriptOk(seg)) {
      return fail(
        "G-P-SCRIPT",
        `"${sanitise(seg).display}" has a character outside the Latin alphabet — two folder names ` +
          "that look identical would end up as two different folders",
      );
    }
  }
  return { ok: true, rule: "", why: "", segs };
}

// ---------------------------------------------------------------------------
// The batch
// ---------------------------------------------------------------------------

function op(idx: number, disposition: OpVerdict["disposition"], rule: string, why: string, extra: Partial<OpVerdict> = {}): OpVerdict {
  return { idx, disposition, rule, why, ...extra };
}

export interface GuardInput {
  payload: FileBatchPayload;
  roots: DeskRoot[];
  deskId: string;
  io: GuardIo;
}

export interface ShapeVerdict {
  ok: boolean;
  rule?: string;
  why?: string;
}

/**
 * The batch-level gates that need NO syscall at all. Split out so the executor
 * can run them synchronously — and refuse a malformed or mis-armed plan on the
 * spot — while the per-op guard, which does touch the disk, runs off the event
 * loop and never blocks the IPC handler. (G-C15 / PART-3)
 */
export function checkBatchShape(payload: FileBatchPayload, roots: DeskRoot[], deskId: string): ShapeVerdict {
  const no = (rule: string, why: string): ShapeVerdict => ({ ok: false, rule, why });

  if (!payload || typeof payload !== "object") return no("G-C8", "that plan isn't a plan");
  if (payload.protocol !== DESK_PROTOCOL) return no("G-C8", "that plan was made for a different version of EVE");
  if (payload.deskId !== deskId) return no("G-C8", "that plan was raised on a different machine");
  if (payload.op !== "move" && payload.op !== "rename" && payload.op !== "stage") {
    return no("G-D1", "I only know how to move, rename and stage. There is no delete.");
  }
  if (!Array.isArray(payload.moves) || payload.moves.length === 0) return no("G-C5", "that plan has nothing in it");
  if (payload.moves.length > MAX_BATCH) {
    return no("G-C5", `that's ${payload.moves.length} files in one card. The ceiling is ${MAX_BATCH} — split it.`);
  }
  if (payload.op === "rename" && payload.moves.length > MAX_RENAMES) {
    return no("G-C7", `renames cap at ${MAX_RENAMES} per card, whatever the plan says`);
  }
  if (typeof payload.dryRun !== "boolean") return no("G-A4", "that plan doesn't say whether it's a rehearsal");

  const touched = new Set<string>();
  for (const m of payload.moves) {
    if (typeof m?.fromRoot === "string") touched.add(m.fromRoot);
    if (typeof m?.toRoot === "string") touched.add(m.toRoot);
  }
  for (const label of touched) {
    const r = roots.find((x) => x.label === label);
    if (!r) return no("G-P1", `I don't have a folder called "${sanitise(label).display}"`);
    // G-A4 — dryRun was stamped at mint. Disagreement REFUSES; it never picks a
    // winner, because both possible winners are a lie about what he approved.
    if (r.dryRun !== payload.dryRun) {
      return no(
        "G-A4",
        `this plan was made when "${r.label}" was ${payload.dryRun ? "in rehearsal" : "live"} and it is ` +
          `${r.dryRun ? "in rehearsal" : "live"} now. I won't guess which one you meant — raise it again.`,
      );
    }
    if (!r.attrSweepOk) {
      return no(
        "G-A1",
        `I can't read Windows file attributes on "${r.label}" right now, so I can't tell a shortcut from a file. ` +
          "Filing is paused until that works.",
      );
    }
  }
  return { ok: true };
}

export function checkBatch(input: GuardInput): BatchVerdict {
  const { payload, roots, deskId, io } = input;
  const empty = (rule: string, why: string): BatchVerdict => ({
    ok: false,
    rule,
    why,
    ops: [],
    allowCount: 0,
    skipCount: 0,
    refuseCount: 0,
    bytesAllowed: 0,
    dryRun: true,
    destDirs: [],
  });

  const shape = checkBatchShape(payload, roots, deskId);
  if (!shape.ok) return empty(shape.rule as string, shape.why as string);

  const rootFor = (label: string): DeskRoot | null => roots.find((r) => r.label === label) ?? null;
  const ops: OpVerdict[] = [];
  const destDirs = new Set<string>();
  // Case-folded, NFC-normalised destination set. Plain string equality here
  // destroys a file inside an approved batch. (G-D7 / PATH-4)
  const destSeen = new Map<string, number>();
  let stagedBytes = 0;

  for (let idx = 0; idx < payload.moves.length; idx += 1) {
    ops.push(checkOne(payload, payload.moves[idx] as FileMove, idx, roots, io, destSeen, destDirs));
  }

  // --- G-D7: a within-batch destination collision refuses the WHOLE batch ---
  // He approved a SET of from->to pairs. If two of them are one NTFS path the
  // set is incoherent, and running the coherent half of an incoherent plan is
  // not what he approved. Refusing the batch also means neither source file is
  // touched, which is the assertion that matters. (PATH-4)
  const collided = ops.find((o) => o.rule === "G-D7");
  if (collided) {
    return empty(
      "G-D7",
      `${collided.why}. Windows can't tell those two names apart, so I won't run any of it — ask her to raise it again.`,
    );
  }

  // --- G-C6: trash ceiling and free-space floor, named in real numbers ------
  if (payload.op === "stage") {
    for (const v of ops) {
      if (v.disposition === "allow") stagedBytes += v.size ?? 0;
    }
    const first = rootFor(payload.moves[0]?.fromRoot ?? "");
    if (first) {
      const already = io.trashBytes(first);
      if (already + stagedBytes > io.trashCeilingBytes) {
        return empty(
          "G-C6",
          `your trash already holds ${gb(already)} and this would add ${gb(stagedBytes)}, over the ` +
            `${gb(io.trashCeilingBytes)} ceiling. Empty some of it first — I never will.`,
        );
      }
      const free = io.free(first.real);
      const floor = Math.max(FREE_FLOOR_BYTES, free * FREE_FLOOR_FRACTION);
      if (free - stagedBytes < floor) {
        return empty(
          "G-C6",
          `that would leave ${gb(free - stagedBytes)} free on that drive and I stop at ${gb(floor)}.`,
        );
      }
    }
  }

  const allowCount = ops.filter((o) => o.disposition === "allow").length;
  const skipCount = ops.filter((o) => o.disposition === "skip").length;
  const refuseCount = ops.filter((o) => o.disposition === "refuse").length;
  const bytesAllowed = ops.reduce((n, o) => n + (o.disposition === "allow" ? (o.size ?? 0) : 0), 0);

  return {
    ok: true,
    ops,
    allowCount,
    skipCount,
    refuseCount,
    bytesAllowed,
    dryRun: payload.dryRun,
    destDirs: [...destDirs],
  };
}

function gb(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

// ---------------------------------------------------------------------------
// One operation
// ---------------------------------------------------------------------------

export function checkOne(
  payload: FileBatchPayload,
  m: FileMove,
  idx: number,
  roots: DeskRoot[],
  io: GuardIo,
  destSeen: Map<string, number>,
  destDirs: Set<string>,
): OpVerdict {
  const refuse = (rule: string, why: string, extra: Partial<OpVerdict> = {}): OpVerdict =>
    op(idx, "refuse", rule, why, extra);
  const skip = (rule: string, why: string, extra: Partial<OpVerdict> = {}): OpVerdict =>
    op(idx, "skip", rule, why, extra);

  if (!m || typeof m !== "object") return refuse("G-P1", "that row isn't a file operation");

  const fromRoot = roots.find((r) => r.label === m.fromRoot);
  if (!fromRoot) return refuse("G-P1", `I don't have a folder called "${sanitise(String(m.fromRoot)).display}"`);
  const toRoot = roots.find((r) => r.label === m.toRoot);
  if (!toRoot) return refuse("G-P1", `I don't have a folder called "${sanitise(String(m.toRoot)).display}"`);

  // --- SOURCE ---------------------------------------------------------------
  const srcSegs = checkRel(m.fromRel, false);
  if (!srcSegs.ok) return refuse(srcSegs.rule, `source: ${srcSegs.why}`);
  const fromAbs = path.join(fromRoot.real, ...srcSegs.segs);

  // G-P7 — containment on the COMPOSED path.
  if (!contains(fromRoot.real, fromAbs)) {
    return refuse("G-P7", "that source lands outside the folder it claims to be in");
  }
  // G-P15 — denied set as a SOURCE too, on the alias form AND the long form.
  if (deniedHit(io.userDataDir, fromAbs)) {
    return refuse("G-P15", "that source is somewhere EVE is never allowed to touch");
  }
  // G-V1 — THE NEVER-LIST, RE-CHECKED AT THE GATE.
  //
  // The eye applies this when it builds the index, so in the ordinary case no
  // never-listed path is ever nameable. That is not a reason to trust the path
  // in front of us: the index is a cache, and this is the authoritative gate.
  // A stale revision, a file that landed after the walk, a bug upstream or a
  // tampered plan all arrive here, and this is the last place they can be
  // stopped. The name is NOT echoed — G-V1's whole point is that these are
  // counted, never named.
  if (neverHit(io.neverList, srcSegs.segs.join("/"))) {
    return refuse("G-V1", "that one is on your never-list. I don't read it, move it, or say its name.");
  }
  // G-D3 — the trash is never a source. Only undo reads from it.
  if (inAnyTrash(fromAbs)) return refuse("G-D3", "that's in your trash. Only you take things back out of there.");

  const name = path.basename(fromAbs);
  if (SYSTEM_NAMES.test(name)) return refuse("G-T7", `"${name}" is a Windows housekeeping file`);
  if (UNSETTLED_EXT.test(name) || OFFICE_LOCK.test(name)) {
    return refuse("G-T3", `"${sanitise(name).display}" is still being written or is an open-document lock file`);
  }

  const st = io.lstat(fromAbs);
  if (!st) return skip("G-T2", "that one's gone since she looked", { fromAbs });
  // G-P10 — lstat, never stat. A symlinked file inside the root pointing out
  // of it must not be movable by its inside name.
  if (st.isSymbolicLink) {
    return refuse("G-P10", "that's a shortcut to somewhere else, not a file", { fromAbs });
  }
  if (st.isDirectory) return refuse("G-P11", "that's a folder. This build moves files, not trees.", { fromAbs });
  if (!st.isFile) return refuse("G-P11", "that isn't an ordinary file", { fromAbs });

  // G-P8 / G-P13 — the path is settled against the disk BEFORE anything reads
  // its attributes. Order matters here and the harness found out why: the
  // attribute sweep is keyed by LONG paths, so a source named through an 8.3
  // alias simply misses the map, and the op was refused as "I can't read
  // Windows attributes for that file" — safe, and a completely misleading
  // sentence about a completely different problem. Prove what the path IS
  // first, then ask what it holds.
  const srcReal = io.realpath(fromAbs);
  if (!srcReal) return skip("G-T2", "that one's gone since she looked", { fromAbs });
  if (!contains(fromRoot.real, srcReal)) {
    return refuse("G-P8", "that source actually resolves outside your folder", { fromAbs });
  }
  // For a path that EXISTS the alias question is not a guess. The root anchor
  // is already long — roster refuses a short-named root — so if the realpath
  // differs from the composed path by anything other than case, the composed
  // path named this file through an MS-DOS alias or through a link. A file
  // genuinely NAMED "notes~1.txt" realpaths to itself and is untouched by this.
  if (foldPath(srcReal) !== foldPath(fromAbs)) {
    const rel = path.relative(fromRoot.real, fromAbs);
    return refuse(
      "G-P13",
      hasShortName(rel)
        ? `"${sanitise(rel).display}" is an MS-DOS short name for a different path. I only move a file by the name on the card.`
        : "that source only resolves somewhere else — the path on the card isn't the path on disk",
      { fromAbs },
    );
  }

  const srcAttr = io.attr(fromAbs);
  if (srcAttr === null) {
    return refuse("G-A1", "I can't read Windows attributes for that file, so I can't tell what it is", { fromAbs });
  }
  if ((srcAttr & FILE_ATTRIBUTE_REPARSE_POINT) !== 0) {
    return refuse("G-P10", "that's a reparse point, not a file", { fromAbs });
  }
  if ((srcAttr & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)) !== 0) {
    return refuse("G-T7", "that's a hidden or system file", { fromAbs });
  }
  if ((srcAttr & PLACEHOLDER_BITS) !== 0) {
    return refuse(
      "G-T6",
      "that one is in the cloud, not on this disk. Moving it would download it first, and a download " +
        "that fails halfway leaves you with half a file.",
      { fromAbs },
    );
  }


  // G-T4 — live project trees. Moving project.prproj out from under Premiere
  // breaks his edit and nothing errors; he finds out when the media goes
  // offline. Both the ancestor chain and the immediate siblings are checked.
  const relFromRoot = path.relative(fromRoot.real, fromAbs);
  for (const seg of relFromRoot.split(/[\\/]/).slice(0, -1)) {
    if (PROJECT_SEGMENTS.has(seg.toLowerCase())) {
      return refuse("G-T4", `that sits inside "${seg}" — a live project tree, not filing`, { fromAbs });
    }
  }
  for (const sib of io.siblings(path.dirname(fromAbs))) {
    if (PROJECT_SIBLING_EXT.test(sib) || PROJECT_SIBLING_NAME.test(sib) || PROJECT_SEGMENTS.has(sib.toLowerCase())) {
      return refuse(
        "G-T4",
        `there's a "${sanitise(sib).display}" sitting next to that file — that's a live project folder, not filing`,
        { fromAbs },
      );
    }
  }

  // G-T1 — the stamp. size:mtimeMs, tolerance widened for synced roots and SAID.
  const tol = fromRoot.synced ? MTIME_TOL_SYNCED_MS : MTIME_TOL_MS;
  if (typeof m.size === "number" && st.size !== m.size) {
    return skip("G-T1", "that changed since she looked", { fromAbs, size: st.size });
  }
  if (typeof m.mtimeMs === "number" && Math.abs(st.mtimeMs - m.mtimeMs) > tol) {
    return skip("G-T1", "that changed since she looked", { fromAbs, size: st.size });
  }
  // G-T3 — nothing written in the last 30 s is settled.
  if (io.now - st.mtimeMs < 30_000) {
    return skip("G-T3", "that was written seconds ago and hasn't settled", { fromAbs, size: st.size });
  }
  // G-T5 — the only reliable in-use test on Windows, for anything big enough
  // that losing it matters. Chrome and Adobe open with FILE_SHARE_DELETE and
  // a file opened that way CAN be renamed out from under them, silently.
  if (st.size >= EXCLUSIVE_OPEN_OVER_BYTES && !io.canOpenExclusive(fromAbs)) {
    return skip("G-T5", "another program has that file open", { fromAbs, size: st.size });
  }

  // --- DESTINATION ----------------------------------------------------------
  // G-D2 — a stage destination is FORCED to <root-trash>/YYYY-MM-DD/<batchId>/
  // <original relative path>. The model does not choose it and `m.toRel` is
  // ignored entirely for a stage, so a stage can never be aimed anywhere.
  // The script restriction applies to model-authored destinations only; his
  // own filenames ride through a stage untouched.
  const isStage = payload.op === "stage";
  const dstSegs = checkRel(isStage ? relFromRoot : m.toRel, !isStage);
  if (!dstSegs.ok) return refuse(dstSegs.rule, `destination: ${dstSegs.why}`, { fromAbs, size: st.size });

  const day = new Date(io.now).toISOString().slice(0, 10);
  const toAbs =
    payload.op === "stage"
      ? path.join(fromRoot.trashReal, day, payload.batchId, ...dstSegs.segs)
      : path.join(toRoot.real, ...dstSegs.segs);
  const containRoot = payload.op === "stage" ? fromRoot.trashReal : toRoot.real;

  if (toAbs.length > MAX_ABS_LEN) {
    return refuse("G-P14", "that destination path is too long for Windows", { fromAbs, size: st.size });
  }
  // G-P7 on the destination.
  if (!contains(containRoot, toAbs)) {
    return refuse("G-P7", "that destination lands outside your folder", { fromAbs, size: st.size });
  }
  if (deniedHit(io.userDataDir, toAbs)) {
    return refuse("G-P15", "that destination is somewhere EVE is never allowed to write", { fromAbs, size: st.size });
  }
  // G-V1 on the DESTINATION. A rename to `secrets.pem`, or a move into a folder
  // he has told me never to look at, files the thing where neither of us can
  // see it afterwards. Ignored for a stage, whose destination is forced from
  // the source path and has already been tested above.
  if (payload.op !== "stage" && neverHit(io.neverList, dstSegs.segs.join("/"))) {
    return refuse("G-V1", "that destination is on your never-list. I don't file anything in there.", {
      fromAbs,
      size: st.size,
    });
  }
  // G-D3 / T26a — only `stage` may write into a trash.
  if (payload.op !== "stage" && inAnyTrash(toAbs)) {
    return refuse("G-D3", "I don't move things into your trash. That's what staging is for.", {
      fromAbs,
      size: st.size,
    });
  }
  // G-D8 — Windows can't do a case-only rename in one step, so we never claim
  // to. This is checked BEFORE the identical-path test so the more specific
  // reason is the one he reads.
  if (foldPath(toAbs) === foldPath(fromAbs)) {
    return path.basename(toAbs) !== path.basename(fromAbs)
      ? refuse("G-D8", "Windows won't let me do a rename that only changes case in one step", {
          fromAbs,
          size: st.size,
        })
      : refuse("G-D8", "that's the same file — nothing to do", { fromAbs, size: st.size });
  }

  // G-P16 (extension immutability) — a rename that changes .pdf to .exe is not
  // filing. Held for move and rename alike; a stage keeps the original name.
  const fromExt = path.extname(fromAbs).toLowerCase();
  const toExt = path.extname(toAbs).toLowerCase();
  if (payload.op !== "stage" && fromExt !== toExt) {
    return refuse("G-EXT", `that changes "${fromExt || "no extension"}" to "${toExt || "no extension"}"`, {
      fromAbs,
      size: st.size,
    });
  }

  // G-D7 — case-folded, NFC-normalised collision detection, WITHIN the batch.
  // Two rows targeting Invoice.pdf and invoice.PDF are ONE NTFS path.
  const key = foldPath(toAbs);
  const clash = destSeen.get(key);
  if (clash !== undefined) {
    return refuse(
      "G-D7",
      `two files in this batch want the same destination — row ${clash + 1} and this one are one path on Windows`,
      { fromAbs, toAbs, size: st.size },
    );
  }
  destSeen.set(key, idx);

  // --- G-P9: the destination's realpath'd ancestor chain ---------------------
  // A junction planted at Downloads\Clients pointing at Startup passes every
  // lexical check above. This is the single worst containment bug in either
  // source architecture and it is defeated here and again in execute.ts, after
  // mkdir, immediately before the write.
  const chainVerdict = checkDestChain(containRoot, toAbs, io);
  if (chainVerdict) return { ...chainVerdict, idx, fromAbs, size: st.size, toAbs };

  // G-D5 is enforced by CONSTRUCTION in execute.ts. This is the advisory half,
  // so the card can say NAME TAKEN before he approves — it is never the thing
  // standing between his file and an overwrite.
  if (io.exists(toAbs)) {
    return skip("G-D6", "there's already a file with that name there", { fromAbs, toAbs, size: st.size });
  }

  // G-D9 — cross-volume is refused outright. The only line in either source
  // design that removes one of his files lives in the cross-volume fallback,
  // and this build does not have that line.
  const destRootDev = payload.op === "stage" ? fromRoot.dev : toRoot.dev;
  if (st.dev !== destRootDev) {
    return refuse("G-D9", "that's on a different drive — I don't move across drives yet", {
      fromAbs,
      toAbs,
      size: st.size,
    });
  }

  destDirs.add(path.dirname(toAbs));
  const nameCheck = sanitise(name);
  const toCheck = sanitise(path.basename(toAbs));
  // G-T4b — the annotation, and it is the LAST thing that happens to an allow.
  // Deliberately: it can only decorate a row that every binding rule above has
  // already passed, so a lookup that throws, lies or is simply absent cannot
  // change what moves. A warning is not a gate.
  let projectRef: { project: string } | null = null;
  try {
    projectRef = io.projectRef?.(fromAbs) ?? null;
  } catch {
    projectRef = null;
  }
  return op(idx, "allow", "", "", {
    fromAbs,
    toAbs,
    size: st.size,
    altered: nameCheck.altered || toCheck.altered,
    ...(projectRef && typeof projectRef.project === "string" && projectRef.project
      ? { projectRef: { project: projectRef.project } }
      : {}),
  });
}

/**
 * G-P9. Walk every component of the destination from the root down. Refuse if
 * any existing component is a reparse point, and re-assert containment on the
 * realpath of the deepest component that actually exists.
 *
 * Returns null when the chain is clean.
 */
export function checkDestChain(containRoot: string, toAbs: string, io: GuardIo): OpVerdict | null {
  const rel = path.relative(containRoot, toAbs);
  const segs = rel.split(/[\\/]/).filter(Boolean);
  let cur = containRoot;
  let deepestExisting = containRoot;

  for (let i = 0; i < segs.length; i += 1) {
    cur = path.join(cur, segs[i] as string);
    const isLast = i === segs.length - 1;
    if (!io.exists(cur)) continue;
    deepestExisting = cur;
    const a = io.attr(cur);
    if (a === null) {
      return op(0, "refuse", "G-A1", `I can't read Windows attributes for "${segs[i]}" on the way to that folder`);
    }
    if ((a & FILE_ATTRIBUTE_REPARSE_POINT) !== 0) {
      return op(
        0,
        "refuse",
        "G-P9",
        `"${segs[i]}" on the way to that destination is a junction pointing somewhere else. I won't write through it.`,
      );
    }
    const stc = io.lstat(cur);
    if (stc?.isSymbolicLink) {
      return op(
        0,
        "refuse",
        "G-P9",
        `"${segs[i]}" on the way to that destination is a link, not a real folder. I won't write through it.`,
      );
    }
    if (!isLast && stc && !stc.isDirectory) {
      return op(0, "refuse", "G-P9", `"${segs[i]}" is a file, so nothing can go inside it`);
    }
  }

  // Re-assert containment on the REALPATH of the nearest existing ancestor.
  const real = io.realpath(deepestExisting);
  if (real === null) return op(0, "refuse", "G-P9", "I can't resolve the folder that destination goes into");
  const rootReal = io.realpath(containRoot) ?? containRoot;
  if (real.toLowerCase() !== rootReal.toLowerCase() && !contains(rootReal, real)) {
    return op(0, "refuse", "G-P9", "that destination resolves outside your folder once Windows follows the links");
  }
  return null;
}
