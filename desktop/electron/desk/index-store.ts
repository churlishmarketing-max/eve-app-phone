// DESK — THE EYE. (FILE-MARSHAL-SPEC hop 1)
//
// Walks each enrolled root, watches it, and holds one snapshot of what is
// actually on the disk. It is a SENSE ORGAN: it describes and it cannot choose.
// The one-brain test applied — a component is a second brain if it can choose;
// the indexer describes, the guard refuses, the executor obeys.
//
// Five laws it enforces on itself:
//
//   1. Bounded depth. Depth 3 below each root and no further.
//   2. NEVER descend a reparse point. A junction planted inside Downloads that
//      points at C:\Windows must not make C:\Windows appear inside a root's
//      census, and must not put one of his system files behind an index id.
//   3. Never-list matches are COUNTED, NEVER NAMED. (G-V1 / PRIV-2)
//   4. Instruction-shaped names never enter the index at all. They are counted
//      and surfaced to KING, never to her. (G-I3 / INJ-1)
//   5. The 16 magic bytes never leave the machine. Only the class label does.
//      (§5.H G-V2)
//
// The real relative path of every entry stays HERE, in the main process. What
// rides the wire is the sanitised display form plus the index id, and the id is
// how a plan comes home: `resolve(rev, i)` is the only way a brain-minted move
// becomes a path on this disk, so a source she was never shown is not
// expressible. (G-P1)
//
// Owning stream: DESK/S2.

import { createHash } from "node:crypto";
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  readFileSync,
  renameSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "node:fs";
import path from "node:path";
import {
  FILE_ATTRIBUTE_DIRECTORY,
  FILE_ATTRIBUTE_HIDDEN,
  FILE_ATTRIBUTE_REPARSE_POINT,
  FILE_ATTRIBUTE_SYSTEM,
  PLACEHOLDER_BITS,
  sweep,
} from "./attrs.js";
import { looksLikeInstruction, neverListMatcher, sanitise } from "./sanitise.js";
import type { DeskRoot } from "./types.js";

/* eslint-disable no-bitwise */

// ---------------------------------------------------------------------------
// Ceilings and cadence
// ---------------------------------------------------------------------------

/** Depth below the root. Hop 1: "Depth 3". */
export const MAX_DEPTH = 3;
/** Hard ceiling on entries in one pack. (G-I5) */
export const DEFAULT_MAX_INDEX = 1_200;
/** fs.watch is chatty; one rebuild per quiet period. */
export const WATCH_DEBOUNCE_MS = 800;
/** The reconcile walk. */
export const RECONCILE_MS = 10 * 60_000;
/** A focus-triggered walk is skipped when the snapshot is younger than this. */
export const FOCUS_MIN_AGE_MS = 30_000;
/** A file younger than this has not settled. (G-T3) */
export const SETTLE_MS = 30_000;
/** How many snapshots stay resolvable. A plan minted three revisions ago still comes home. */
export const REV_RING = 8;
/** Directories visited per root per walk. A pathological tree cannot hang the app. */
export const MAX_DIRS_PER_ROOT = 4_000;

// ---------------------------------------------------------------------------
// Shapes — MAIN PROCESS ONLY. `rel` and `name` are the real bytes on his disk.
// ---------------------------------------------------------------------------

export interface IndexEntry {
  /** Index id. Unique within a snapshot, and the ONLY handle she is given. */
  i: number;
  /** Root label. */
  root: string;
  /** REAL root-relative path, forward slashes. NEVER leaves this process. */
  rel: string;
  /** REAL root-relative directory, "" at the root. NEVER leaves this process. */
  dirRel: string;
  /** REAL filename. NEVER leaves this process. */
  name: string;
  /** Sanitised directory, safe to ship. */
  dispDir: string;
  /** Sanitised filename, safe to ship. */
  dispName: string;
  size: number;
  mtimeMs: number;
  cls: string;
  /** "" | "~" sanitiser altered | "L" reparse | "P" cloud placeholder */
  flags: string;
}

export interface RootStats {
  label: string;
  /** Regular files counted (never-listed and hidden/system are NOT in here). */
  files: number;
  bytes: number;
  dirs: number;
  arrivedToday: number;
  olderThan90d: number;
  byClass: Record<string, number>;
  bytesByClass: Record<string, number>;
  /** Never-list, hidden, system, and Windows housekeeping. Counted, never named. */
  hiddenByRule: number;
  /** Names shaped like instructions. Counted, never named, surfaced to KING. */
  withheldAsInstruction: number;
  unsettled: number;
  /** Directories we refused to descend because they are reparse points. */
  reparseDirs: number;
  /** Candidate entries before the ceiling was applied. */
  candidates: number;
  /**
   * Did the Windows attribute sweep work for THIS root on THIS walk? (G-A1)
   *
   * False means every number above is zero because we could not read the disk,
   * not because the folder is empty — so the root is dropped from the pack
   * entirely rather than shipped as a census of zeroes, which is a lie in the
   * shape of a fact.
   */
  sweepOk: boolean;
}

export interface IndexSnapshot {
  rev: string;
  at: string;
  entries: IndexEntry[];
  roots: RootStats[];
  truncated: boolean;
  omitted: number;
  /** Walk wall-clock, for the Settings diagnostics line. */
  ms: number;
}

// ---------------------------------------------------------------------------
// Class labels — extension first, a 16-byte local sniff second
// ---------------------------------------------------------------------------

const EXT_CLASS: Record<string, string> = {};
const put = (cls: string, exts: string[]): void => {
  for (const e of exts) EXT_CLASS[e] = cls;
};
put("video", [".mp4", ".mov", ".mkv", ".avi", ".wmv", ".webm", ".m4v", ".mpg", ".mpeg", ".flv", ".mts", ".braw", ".r3d"]);
put("image", [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff", ".heic", ".svg", ".raw", ".cr2", ".nef", ".dng"]);
put("audio", [".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg", ".wma", ".aiff"]);
put("document", [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".odt", ".ods", ".csv", ".md", ".epub", ".pages"]);
put("archive", [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso", ".cab"]);
put("installer", [".exe", ".msi", ".msix", ".appx", ".dmg", ".pkg", ".deb", ".rpm"]);
put("code", [".js", ".ts", ".tsx", ".jsx", ".py", ".rs", ".go", ".java", ".c", ".h", ".cpp", ".cs", ".rb", ".php", ".sh", ".ps1", ".json", ".yml", ".yaml", ".xml", ".html", ".css", ".sql"]);
put("design", [".psd", ".ai", ".indd", ".xd", ".fig", ".sketch", ".afdesign", ".afphoto"]);
put("shortcut", [".lnk", ".url", ".website"]);

/**
 * The 16-byte magic sniff. LOCAL ONLY — the bytes are read, compared, and
 * dropped on the floor inside this function. Nothing but the returned label
 * ever leaves this machine, and there is no code path out of here that carries
 * a byte of his file content. (§5.H G-V2)
 */
export function sniffClass(abs: string): string | null {
  let fd = -1;
  try {
    fd = openSync(abs, "r");
    const buf = Buffer.alloc(16);
    const n = readSync(fd, buf, 0, 16, 0);
    if (n < 4) return null;
    const b = buf.subarray(0, n);
    const hex = b.toString("hex");
    const ascii = b.toString("latin1");
    if (ascii.startsWith("%PDF")) return "document";
    if (hex.startsWith("504b0304")) return "archive"; // PK — zip, docx, xlsx, jar
    if (hex.startsWith("52617221")) return "archive"; // Rar!
    if (hex.startsWith("377abcaf271c")) return "archive"; // 7z
    if (hex.startsWith("1f8b")) return "archive"; // gzip
    if (hex.startsWith("ffd8ff")) return "image";
    if (hex.startsWith("89504e47")) return "image";
    if (ascii.startsWith("GIF8")) return "image";
    if (ascii.startsWith("BM")) return "image";
    if (hex.startsWith("49492a00") || hex.startsWith("4d4d002a")) return "image";
    if (ascii.slice(0, 4) === "RIFF") return ascii.slice(8, 12) === "WAVE" ? "audio" : "video";
    if (ascii.slice(4, 8) === "ftyp") return "video";
    if (hex.startsWith("1a45dfa3")) return "video"; // matroska / webm
    if (hex.startsWith("494433") || hex.startsWith("fffb")) return "audio";
    if (hex.startsWith("664c6143")) return "audio"; // fLaC
    if (ascii.startsWith("MZ")) return "installer";
    if (ascii.startsWith("{\\rtf")) return "document";
    if (hex.startsWith("d0cf11e0")) return "document"; // OLE2 — legacy Office
    return null;
  } catch {
    return null;
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd);
      } catch {
        /* the descriptor is going away with the process anyway */
      }
    }
  }
}

/** Cached by path + size + mtime, so a stable tree sniffs once. */
const sniffCache = new Map<string, string>();

export function classify(abs: string, name: string, size: number, mtimeMs: number, allowSniff: boolean): string {
  const ext = path.extname(name).toLowerCase();
  const byExt = EXT_CLASS[ext];
  if (byExt) return byExt;
  if (!allowSniff || size === 0) return "other";
  const key = `${abs.toLowerCase()}:${size}:${mtimeMs}`;
  const hit = sniffCache.get(key);
  if (hit) return hit;
  const sniffed = sniffClass(abs) ?? "other";
  if (sniffCache.size > 5_000) sniffCache.clear();
  sniffCache.set(key, sniffed);
  return sniffed;
}

// ---------------------------------------------------------------------------
// The never-list — glob-ish, applied at SCAN time, defaults non-empty (G-V1)
//
// The matcher itself moved to sanitise.ts so the DESK GUARD can apply the same
// rule to a batch that has already arrived — the index is not the authority,
// the desk is. Re-exported here because this is where it has always been read
// from. See sanitise.ts `neverHit` for the ancestor-folder half of the rule.
// ---------------------------------------------------------------------------

export { neverListMatcher } from "./sanitise.js";

/** Windows housekeeping. Never indexed, and not interesting enough to count twice. */
const SYSTEM_NAMES = /^(desktop\.ini|thumbs\.db|\.ds_store|ntuser\.dat.*|iconcache\.db|~eve-probe-.*\.tmp)$/i;
/** In-flight downloads and Office lock files. (G-T3) */
const UNSETTLED_EXT = /\.(crdownload|part|partial|tmp|download|opdownload|ecd|aria2|!ut|filepart)$/i;
const OFFICE_LOCK = /^~\$.*\.(doc|docx|xls|xlsx|ppt|pptx)$/i;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

interface StoreConfig {
  userDataDir: string;
  neverList: string[];
  maxIndex: number;
  rootsOf: () => DeskRoot[];
  onChange?: (snap: IndexSnapshot) => void;
  /** Called once per root per walk with the LIVE attribute-sweep result. (G-A1) */
  onSweep?: (label: string, ok: boolean) => void;
}

let cfg: StoreConfig | null = null;
let current: IndexSnapshot | null = null;
/** rev -> snapshot. Bounded ring, newest last. A plan minted a few revs ago still resolves. */
const revRing = new Map<string, IndexSnapshot>();
const watchers: FSWatcher[] = [];
let debounceTimer: NodeJS.Timeout | null = null;
let reconcileTimer: NodeJS.Timeout | null = null;
let walking = false;
let lastError = "";

export function configure(c: StoreConfig): void {
  cfg = c;
}

/** True once a walk has completed and there is something to plan against. */
export function isLive(): boolean {
  return current !== null;
}

export function snapshot(): IndexSnapshot | null {
  return current;
}

export function error(): string {
  return lastError;
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

interface WalkAcc {
  stats: RootStats;
  candidates: IndexEntry[];
}

function emptyStats(label: string): RootStats {
  return {
    label,
    files: 0,
    bytes: 0,
    dirs: 0,
    arrivedToday: 0,
    olderThan90d: 0,
    byClass: {},
    bytesByClass: {},
    hiddenByRule: 0,
    withheldAsInstruction: 0,
    unsettled: 0,
    reparseDirs: 0,
    candidates: 0,
    sweepOk: true,
  };
}

/**
 * One root. `attrOf` is the attribute lookup — the PowerShell sweep's map, or a
 * stub in a test. It returns null for UNKNOWN, and UNKNOWN is never read as
 * zero: a file whose bits we cannot read is treated as hidden by rule, because
 * every attribute rule downstream would otherwise silently pass. (G-A1)
 */
export function walkRoot(root: DeskRoot, attrOf: (abs: string) => number | null, never: (rel: string, name: string) => boolean, now: number): WalkAcc {
  const acc: WalkAcc = { stats: emptyStats(root.label), candidates: [] };
  let dirBudget = MAX_DIRS_PER_ROOT;

  const visit = (abs: string, relDir: string, depth: number): void => {
    if (depth > MAX_DEPTH || dirBudget <= 0) return;
    dirBudget -= 1;
    let names: string[];
    try {
      names = readdirSync(abs);
    } catch {
      return; // an unreadable directory is simply not described
    }
    for (const name of names) {
      const childAbs = path.join(abs, name);
      const childRel = relDir ? `${relDir}/${name}` : name;
      let st;
      try {
        st = lstatSync(childAbs);
      } catch {
        continue; // raced away between readdir and lstat
      }
      const attr = attrOf(childAbs);

      // LAW 2 — never descend a reparse point, and test it BEFORE asking
      // whether the thing is a directory. libuv reports an NTFS junction as a
      // symbolic link, so `lstat().isDirectory()` is FALSE for the exact object
      // this rule exists to stop: a door out of the root, wearing a folder's
      // name. Asking "is it a directory" first walks straight past it.
      const isReparse = st.isSymbolicLink() || (attr !== null && (attr & FILE_ATTRIBUTE_REPARSE_POINT) !== 0);
      if (isReparse) {
        // Directory-shaped or file-shaped, we neither descend it nor index it.
        // The two are counted separately so the census can say which happened.
        const dirBit =
          attr !== null ? (attr & FILE_ATTRIBUTE_DIRECTORY) !== 0 : st.isDirectory();
        if (dirBit) acc.stats.reparseDirs += 1;
        else acc.stats.hiddenByRule += 1;
        continue;
      }

      if (st.isDirectory()) {
        if (attr !== null && (attr & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)) !== 0) continue;
        if (never(childRel, name)) {
          acc.stats.hiddenByRule += 1;
          continue;
        }
        acc.stats.dirs += 1;
        visit(childAbs, childRel, depth + 1);
        continue;
      }

      if (!st.isFile()) continue;

      // LAW 3 — never-list, hidden, system: counted, never named, and they do
      // not contribute a byte or a class to his census either.
      if (never(childRel, name) || SYSTEM_NAMES.test(name)) {
        acc.stats.hiddenByRule += 1;
        continue;
      }
      if (attr === null || (attr & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)) !== 0) {
        acc.stats.hiddenByRule += 1;
        continue;
      }

      const size = st.size;
      const mtimeMs = st.mtimeMs;
      const ageD = (now - mtimeMs) / 86_400_000;
      const placeholder = (attr & PLACEHOLDER_BITS) !== 0;
      const cls = classify(childAbs, name, size, mtimeMs, !placeholder);

      acc.stats.files += 1;
      acc.stats.bytes += size;
      acc.stats.byClass[cls] = (acc.stats.byClass[cls] ?? 0) + 1;
      acc.stats.bytesByClass[cls] = (acc.stats.bytesByClass[cls] ?? 0) + size;
      if (ageD < 1) acc.stats.arrivedToday += 1;
      if (ageD > 90) acc.stats.olderThan90d += 1;

      // G-T3 — unsettled files are never indexed. Counted, so the census is
      // honest about why a number does not add up.
      if (UNSETTLED_EXT.test(name) || OFFICE_LOCK.test(name) || now - mtimeMs < SETTLE_MS) {
        acc.stats.unsettled += 1;
        continue;
      }

      // LAW 4 — G-I3. An instruction-shaped name does not reach the model at
      // all. It is counted here and surfaced to KING, never to her.
      if (looksLikeInstruction(name)) {
        acc.stats.withheldAsInstruction += 1;
        continue;
      }

      const sn = sanitise(name);
      const sd = relDir ? sanitise(relDir) : { display: "", altered: false };
      let flags = "";
      if (sn.altered || sd.altered) flags += "~";
      if ((attr & FILE_ATTRIBUTE_REPARSE_POINT) !== 0) flags += "L";
      if (placeholder) flags += "P";

      acc.candidates.push({
        i: -1, // assigned when the snapshot is sealed
        root: root.label,
        rel: childRel,
        dirRel: relDir,
        name,
        dispDir: sd.display,
        dispName: sn.display,
        size,
        mtimeMs,
        cls,
        flags,
      });
    }
  };

  visit(root.real, "", 1);
  acc.stats.candidates = acc.candidates.length;
  return acc;
}

/** Rebuild the snapshot from scratch. Synchronous; a depth-3 walk is cheap. */
export function rebuild(): IndexSnapshot | null {
  if (!cfg) return null;
  if (walking) return current;
  walking = true;
  const t0 = Date.now();
  try {
    const roots = cfg.rootsOf();
    const never = neverListMatcher(cfg.neverList);
    const now = Date.now();
    const stats: RootStats[] = [];
    let pool: IndexEntry[] = [];

    for (const root of roots) {
      // One PowerShell sweep per root walk, and the map is the attribute
      // oracle for every path under it. A root whose sweep failed contributes
      // NOTHING — not a silent zero. (G-A1)
      //
      // FORCED, never cached: a rebuild is triggered by the tree CHANGING, and
      // a 30-second-old attribute map is exactly the map that does not contain
      // the file that just landed. Every unlisted path reads as UNKNOWN, and
      // UNKNOWN is refused — so a stale sweep does not leak, it silently
      // erases his newest files from her census. That is its own kind of lie.
      const sw = sweep(root.real, MAX_DEPTH, true);
      // G-A1, narrowed. The per-root flag is refreshed on EVERY walk rather
      // than frozen at enrollment: a transient PowerShell failure at boot used
      // to disarm filing permanently, on every root at once, while every walk
      // afterwards swept perfectly well.
      cfg.onSweep?.(root.label, sw.ok);
      if (!sw.ok) {
        lastError = `attribute sweep failed for "${root.label}": ${sw.error ?? "unknown"}`;
        const s = emptyStats(root.label);
        s.sweepOk = false;
        stats.push(s);
        continue;
      }
      const attrOf = (abs: string): number | null => sw.map.get(abs.toLowerCase()) ?? null;
      const acc = walkRoot(root, attrOf, never, now);
      stats.push(acc.stats);
      pool = pool.concat(acc.candidates);
    }

    // The ceiling. Newest first, because the file he is asking about is almost
    // always the one that just landed. (G-I5)
    const max = Math.max(1, cfg.maxIndex || DEFAULT_MAX_INDEX);
    pool.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const truncated = pool.length > max;
    const omitted = truncated ? pool.length - max : 0;
    const entries = pool.slice(0, max).map((e, i) => ({ ...e, i }));

    const rev = createHash("sha256")
      .update(entries.map((e) => `${e.root}\u0000${e.rel}\u0000${e.size}:${e.mtimeMs}`).join("\n"))
      .digest("hex")
      .slice(0, 8);

    const snap: IndexSnapshot = {
      rev,
      at: new Date().toISOString(),
      entries,
      roots: stats,
      truncated,
      omitted,
      ms: Date.now() - t0,
    };
    current = snap;
    revRing.set(rev, snap);
    while (revRing.size > REV_RING) {
      const oldest = revRing.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      revRing.delete(oldest);
    }
    persist(snap);
    cfg.onChange?.(snap);
    return snap;
  } catch (err) {
    lastError = err instanceof Error ? err.message.slice(0, 200) : String(err);
    return current;
  } finally {
    walking = false;
  }
}

// ---------------------------------------------------------------------------
// Resolution — how a brain-minted plan comes home. (G-P1)
// ---------------------------------------------------------------------------

export interface Resolved {
  root: string;
  rel: string;
  name: string;
  size: number;
  mtimeMs: number;
  flags: string;
  /** The sanitised root-relative path that actually rode the wire. */
  wireRel: string;
}

/** True when this exact index revision is still resolvable. */
export function hasRev(rev: string): boolean {
  return typeof rev === "string" && rev.length > 0 && revRing.has(rev);
}

/**
 * `i` -> the real path, ONLY through a revision this machine actually built.
 * There is no other way for a move to name a source, so a file she was never
 * shown has no expressible handle. Returns null for an id that is not in that
 * revision — the caller refuses the batch, it does not guess.
 */
export function resolve(rev: string, i: number): Resolved | null {
  const snap = revRing.get(rev);
  if (!snap) return null;
  const e = snap.entries.find((x) => x.i === i);
  if (!e) return null;
  return {
    root: e.root,
    rel: e.rel,
    name: e.name,
    size: e.size,
    mtimeMs: e.mtimeMs,
    flags: e.flags,
    wireRel: e.dispDir ? `${e.dispDir}/${e.dispName}` : e.dispName,
  };
}

// ---------------------------------------------------------------------------
// Watchers and cadence
// ---------------------------------------------------------------------------

function schedule(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    rebuild();
  }, WATCH_DEBOUNCE_MS);
  debounceTimer.unref?.();
}

export function start(): void {
  if (!cfg) return;
  stop();
  rebuild();
  for (const root of cfg.rootsOf()) {
    try {
      const w = watch(root.real, { recursive: true }, () => schedule());
      w.on("error", () => {
        /* a watcher that dies leaves the reconcile interval as the floor */
      });
      watchers.push(w);
    } catch {
      /* no watcher on this root; the 10-minute reconcile still runs */
    }
  }
  reconcileTimer = setInterval(() => rebuild(), RECONCILE_MS);
  reconcileTimer.unref?.();
}

export function stop(): void {
  for (const w of watchers) {
    try {
      w.close();
    } catch {
      /* already closed */
    }
  }
  watchers.length = 0;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  if (reconcileTimer) clearInterval(reconcileTimer);
  reconcileTimer = null;
}

/** The window got focus. Refresh only if the snapshot has gone stale. */
export function noteFocus(): void {
  if (!cfg) return;
  if (!current) {
    rebuild();
    return;
  }
  if (Date.now() - Date.parse(current.at) > FOCUS_MIN_AGE_MS) rebuild();
}

/** Drops everything. Called on disarm, so a disarmed desk holds no index. */
export function clear(): void {
  stop();
  current = null;
  revRing.clear();
  sniffCache.clear();
  lastError = "";
}

// ---------------------------------------------------------------------------
// Persistence — temp then rename, config.ts's pattern. LOCAL ONLY.
// ---------------------------------------------------------------------------

function indexPath(): string {
  return path.join(cfg?.userDataDir ?? ".", "desk-index.json");
}

/**
 * Temp-then-rename, config.ts's pattern (config.ts:74-89).
 *
 * There is DELIBERATELY no cleanup call on the failure path. Nothing under
 * electron/desk/ outside the executor is allowed to hold a delete primitive —
 * G-D4 is asserted by grep over this whole directory, and a `rmSync` here would
 * be a delete primitive sitting one careless refactor away from his trash. The
 * temp name is deterministic per process, so a failed write leaves at most one
 * inert file in userData and the next attempt overwrites it. That is a cheaper
 * price than owning an unlink in the eye.
 */
function persist(snap: IndexSnapshot): void {
  if (!cfg?.userDataDir) return;
  const target = indexPath();
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(snap)}\n`, "utf8");
    renameSync(tmp, target);
  } catch {
    /* the index is a cache, not a record — a failed write is re-tried next walk */
  }
}

/** Diagnostics only — the index is rebuilt at boot, never trusted from disk. */
export function readPersisted(): IndexSnapshot | null {
  try {
    return JSON.parse(readFileSync(indexPath(), "utf8")) as IndexSnapshot;
  } catch {
    return null;
  }
}
