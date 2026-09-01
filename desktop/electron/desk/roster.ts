// DESK — the roster. The allowlist, and the only thing that turns a label into
// a real directory on this disk.
//
// Two laws:
//
//   1. `resolve()` accepts a LABEL and a RELATIVE path. It does not accept an
//      absolute path from anywhere, ever. The one channel in the whole feature
//      that takes an absolute path is `probe()`, and main only calls it with a
//      value that came back from a native folder dialog it opened itself.
//
//   2. A root that fails ANY enrollment probe is refused loudly, with the
//      reason, and never appears in a pack. It is never silently dropped —
//      a silently dropped root is a folder King thinks is protected.
//
// Owning stream: DESK/S1.

import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { FILE_ATTRIBUTE_REPARSE_POINT, sweep, volumeOf } from "./attrs.js";
import type { DeskRoot, DeskRootConfig, DeskRootProbe, DeskRootView } from "./types.js";

// ---------------------------------------------------------------------------
// G-P15 — the hard-denied set. Source AND destination, and enrollment refuses
// a root that contains or is contained by any of these.
// ---------------------------------------------------------------------------

/** Path SEGMENTS that are denied wherever they appear. */
export const DENIED_SEGMENTS = new Set([".git", "node_modules", ".ssh", ".aws", ".gnupg"]);

// ---------------------------------------------------------------------------
// G-P13 — 8.3 SHORT NAMES
//
// NTFS still mints an MS-DOS alias for most long names: `C:\Program Files`
// answers to `C:\PROGRA~1`, and `Invoice 4411.pdf` answers to `INVOIC~1.PDF`.
// Every containment and denied-set test in this feature is a STRING comparison
// against a realpath'd anchor, and `path.relative("C:\Program Files",
// "C:\PROGRA~1\x")` is `..\PROGRA~1\x` — not contained. The alias walks
// straight through G-P15.
//
// The spec said "roots are realpath'd at boot; relatives are composed from a
// long root. Asserted by test" — and there was no code and no test. Both are
// here now: a shape test for the alias form, and an expansion that turns one
// into the long path it actually names, used on BOTH sides of every denied-set
// comparison.
// ---------------------------------------------------------------------------

/**
 * The MS-DOS alias shape: up to six characters, a tilde, one or two digits,
 * optionally a three-character extension. Deliberately narrow — `budget~1.xlsx`
 * has a four-character extension, is a real filename, and is not this.
 */
export const SHORT_NAME_SEG = /^[^\\/.]{1,6}~[0-9]{1,2}(\.[^.\\/]{1,3})?$/;

/** True when any segment of `p` is shaped like an 8.3 alias. */
export function hasShortName(p: string): boolean {
  return p.split(/[\\/]/).some((seg) => SHORT_NAME_SEG.test(seg));
}

/**
 * The long path an alias actually names. Realpath resolves the deepest ancestor
 * that exists and the remaining tail is appended, so a destination that does
 * not exist yet still expands its existing ancestors. Returns the input
 * unchanged when nothing resolves — and the CALLER treats "still short" as
 * unknown and refuses, the same way an unreadable attribute is refused.
 */
export function expandShort(abs: string): string {
  if (!hasShortName(abs)) return abs;
  const parts = abs.split(/[\\/]/);
  for (let i = parts.length; i >= 1; i--) {
    const head = parts.slice(0, i).join(path.sep);
    if (!head) continue;
    try {
      const real = realpathSync.native(head.endsWith(":") ? `${head}${path.sep}` : head);
      return i === parts.length ? real : path.join(real, ...parts.slice(i));
    } catch {
      /* that prefix does not exist yet; try a shorter one */
    }
  }
  return abs;
}

let deniedRootsCache: string[] | null = null;

/**
 * Absolute directories nothing may read from or write into. Realpath'd once.
 * `userDataDir` is injected because `app.getPath` is not available in a test.
 */
export function deniedRoots(userDataDir: string): string[] {
  if (deniedRootsCache) return deniedRootsCache;
  const raw = [
    userDataDir,
    process.env.WINDIR ?? "C:\\Windows",
    process.env.ProgramFiles ?? "C:\\Program Files",
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    process.env.ProgramData ?? "C:\\ProgramData",
    path.join(homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu"),
    path.join(homedir(), "EVE"),
  ];
  const out: string[] = [];
  for (const p of raw) {
    try {
      out.push(realpathSync.native(p));
    } catch {
      // A denied root that does not exist on this machine still has to be
      // compared against. `%ProgramFiles%` reads as `C:\PROGRA~1` on some
      // installs, and an unexpanded alias here is a denied root that can never
      // match the long path it names.
      out.push(expandShort(path.resolve(p)));
    }
  }
  deniedRootsCache = out;
  return out;
}

export function __resetDeniedCache(): void {
  deniedRootsCache = null;
}

/**
 * G-P7. Containment by `path.relative`, NEVER by `startsWith` —
 * `"…\\Downloads2".startsWith("…\\Downloads")` is true and that is an escape.
 * `path.relative` on win32 is case-insensitive, which is correct for NTFS.
 */
export function contains(root: string, abs: string): boolean {
  const rel = path.relative(root, abs);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** True when either path contains the other, or they are the same path. */
export function overlaps(a: string, b: string): boolean {
  const rel = path.relative(a, b);
  if (rel === "") return true;
  return contains(a, b) || contains(b, a);
}

/**
 * G-P15, with the 8.3 blindness closed. Both the ALIAS form and the expanded
 * long form of the candidate are tested against every denied root, because
 * `C:\PROGRA~1\x` and `C:\Program Files\x` are the same directory and only one
 * of them is a string match.
 */
export function deniedHit(userDataDir: string, abs: string): boolean {
  const candidates = new Set([abs, expandShort(abs)]);
  for (const denied of deniedRoots(userDataDir)) {
    for (const c of candidates) {
      if (overlaps(denied, c)) return true;
    }
  }
  return false;
}

/**
 * The live attribute-sweep flag for one root. (G-A1, narrowed)
 *
 * The enrollment probe seeds it; every subsequent walk refreshes it. Before
 * this existed the value was frozen at boot, so one transient PowerShell
 * failure during enrollment — an AV scan holding the console, a cold Downloads
 * timing out — disarmed filing PERMANENTLY, on every root, until he re-enrolled,
 * while every walk after it swept perfectly well. A rule that refuses when it
 * should not is its own kind of failure.
 */
export function noteSweep(label: string, ok: boolean): void {
  const r = roots.find((x) => x.label === label);
  if (r) r.attrSweepOk = ok;
}

// ---------------------------------------------------------------------------
// The live roster
// ---------------------------------------------------------------------------

let roots: DeskRoot[] = [];
let refusals: { label: string; path: string; refusal: string }[] = [];
let userData = "";

export function init(userDataDir: string, configured: DeskRootConfig[]): DeskRootProbe[] {
  userData = userDataDir;
  roots = [];
  refusals = [];
  const seen = new Set<string>();
  const results: DeskRootProbe[] = [];
  for (const cfg of configured) {
    const p = probe(cfg.path, cfg.label, cfg.trash);
    results.push(p);
    if (!p.ok || !p.real) {
      refusals.push({ label: cfg.label, path: cfg.path, refusal: p.refusal ?? "refused" });
      continue;
    }
    const key = p.real.toLowerCase();
    if (seen.has(key)) {
      refusals.push({ label: cfg.label, path: cfg.path, refusal: "another root already covers this exact folder" });
      continue;
    }
    // Two roots where one contains the other makes containment meaningless.
    const clash = roots.find((r) => overlaps(r.real, p.real as string));
    if (clash) {
      refusals.push({
        label: cfg.label,
        path: cfg.path,
        refusal: `that folder overlaps the root "${clash.label}" — one root cannot sit inside another`,
      });
      continue;
    }
    seen.add(key);
    roots.push({
      label: cfg.label,
      path: cfg.path,
      dryRun: cfg.dryRun !== false, // dry-run is ON unless explicitly turned off
      synced: p.synced === true,
      trash: p.trash as string,
      real: p.real,
      trashReal: realpathSync.native(p.trash as string),
      dev: volumeOf(p.real) ?? -1,
      attrSweepOk: p.attrSweepOk === true,
      writeProbeOk: p.writeProbeOk === true,
    });
  }
  return results;
}

export function list(): DeskRoot[] {
  return roots;
}

export function byLabel(label: string): DeskRoot | null {
  return roots.find((r) => r.label === label) ?? null;
}

export function userDataDir(): string {
  return userData;
}

/**
 * The ONLY composition function. Takes a label and a relative path and returns
 * an absolute path inside that root — or null. It cannot be handed an absolute
 * path: `path.join` does not have `path.resolve`'s base-discarding behaviour,
 * and the caller has already rejected absolute-shaped strings (see guard.ts
 * G-P2, which runs BEFORE this).
 */
export function resolve(root: DeskRoot, segs: string[]): string {
  return path.join(root.real, ...segs);
}

/** True when `abs` sits inside ANY enrolled root's trash. (G-D3) */
export function inAnyTrash(abs: string): boolean {
  return roots.some((r) => contains(r.trashReal, abs) || path.relative(r.trashReal, abs) === "");
}

export function refusedRoots(): { label: string; path: string; refusal: string }[] {
  return refusals;
}

// ---------------------------------------------------------------------------
// Enrollment probing (hop 0)
// ---------------------------------------------------------------------------

function refuse(why: string): DeskRootProbe {
  return { ok: false, refusal: why };
}

/** OneDrive / sync detection. Path-shape first, then the reparse/pinned bits. */
export function detectSynced(real: string): boolean {
  const lower = real.toLowerCase();
  if (/[\\/]onedrive([\\/]|$)|[\\/]onedrive - /.test(lower)) return true;
  if (/[\\/](dropbox|google drive|googledrive|box|icloud ?drive)([\\/]|$)/.test(lower)) return true;
  if (process.env.OneDrive && contains(path.resolve(process.env.OneDrive), real)) return true;
  if (process.env.OneDriveCommercial && contains(path.resolve(process.env.OneDriveCommercial), real)) return true;
  return false;
}

/** Where a root's trash lives by default: a sibling on the SAME volume. (LOSS-4) */
export function defaultTrashFor(real: string, label: string): string {
  return path.join(path.dirname(real), `.eve-trash-${label}`);
}

export function freeOnVolume(absPath: string): number {
  try {
    const r = statfsSync(absPath);
    return Number(r.bsize) * Number(r.bavail);
  } catch {
    return 0;
  }
}

/** Test seam so the free-space refusal (G-C6) can be driven without a full disk. */
export function __setFreeSpaceImpl(fn: ((p: string) => number) | null): void {
  freeSpaceOverride = fn;
}
let freeSpaceOverride: ((p: string) => number) | null = null;
export function freeSpace(absPath: string): number {
  return freeSpaceOverride ? freeSpaceOverride(absPath) : freeOnVolume(absPath);
}

/**
 * Hop 0. realpath, containment, denied-set, sync detection, attribute sweep,
 * same-volume trash, and a write probe using a file WE create and delete.
 *
 * The never-delete law is about HIS files. Deleting our own probe file is not
 * a violation of it, and it is the only way to learn at setup time — rather
 * than during his first real batch — that Controlled Folder Access will refuse
 * every single op. (G-A2, PART-2)
 */
export function probe(dirPath: string, label: string, trashPath?: string): DeskRootProbe {
  if (typeof dirPath !== "string" || !dirPath.trim()) return refuse("no folder given");
  if (!/^[a-z0-9_-]{1,24}$/i.test(label)) {
    return refuse("a root label must be 1-24 characters of letters, digits, dash or underscore");
  }

  let real: string;
  try {
    const st = lstatSync(dirPath);
    if (!st.isDirectory() && !st.isSymbolicLink()) return refuse("that isn't a folder");
    real = realpathSync.native(dirPath);
    if (!statSync(real).isDirectory()) return refuse("that isn't a folder");
  } catch {
    return refuse("I can't find that folder");
  }

  // G-P13 — the root ANCHOR must be a long path. Everything downstream composes
  // relatives onto `real` and then string-compares the result against the
  // denied set, so an anchor still carrying an 8.3 alias makes every one of
  // those comparisons wrong in the direction that lets a path through.
  // `realpathSync.native` expands aliases, so reaching this line at all means
  // the expansion did not happen and we do not know which folder this is.
  if (hasShortName(real)) {
    return refuse(
      `that folder resolves to "${real}", which still carries an MS-DOS short name. ` +
        "I can't tell which folder that really is, so I won't touch it.",
    );
  }

  // Roots stay inside his user profile. Anything above it is a system tree.
  const home = realpathSync.native(homedir());
  const scratch = process.env.EVE_DESK_SCRATCH;
  const inScratch = scratch ? contains(path.resolve(scratch), real) || real.toLowerCase() === path.resolve(scratch).toLowerCase() : false;
  if (!contains(home, real) && !inScratch) {
    return refuse("that folder is outside your user profile");
  }

  for (const denied of deniedRoots(userData || path.join(homedir(), "AppData", "Roaming"))) {
    if (overlaps(denied, real)) {
      return refuse(`that folder overlaps ${denied}, which EVE is never allowed to touch`);
    }
  }
  for (const seg of real.split(/[\\/]/)) {
    if (DENIED_SEGMENTS.has(seg.toLowerCase())) {
      return refuse(`that path runs through "${seg}", which EVE is never allowed to touch`);
    }
  }

  const synced = detectSynced(real);
  const dev = volumeOf(real);
  if (dev === null) return refuse("I can't read that volume");

  // --- trash, same volume, created by us ------------------------------------
  const trash = trashPath && trashPath.trim() ? path.resolve(trashPath) : defaultTrashFor(real, label);
  try {
    mkdirSync(trash, { recursive: true });
  } catch (err) {
    return refuse(`I can't create a trash folder at ${trash} (${errCode(err)})`);
  }
  let trashReal: string;
  try {
    trashReal = realpathSync.native(trash);
  } catch {
    return refuse(`I can't resolve the trash folder at ${trash}`);
  }
  const trashDev = volumeOf(trashReal);
  const sameVolume = trashDev !== null && trashDev === dev;
  if (!sameVolume) {
    return refuse(
      "that folder's trash would land on a different drive. A cross-drive stage is a copy-then-delete, " +
        "and this build does not have that line. Pick a trash folder on the same drive.",
    );
  }
  if (contains(trashReal, real) || path.relative(trashReal, real) === "") {
    return refuse("the trash folder can't contain the root");
  }

  // --- attribute sweep — the mechanism must be PROVEN, not assumed (G-A1) ---
  const sw = sweep(real, 1, true);
  const attrSweepOk = sw.ok;

  // --- write probe (G-A2) ---------------------------------------------------
  const probeName = `~eve-probe-${randomUUID()}.tmp`;
  const probeFile = path.join(real, probeName);
  let writeProbeOk = false;
  let writeErr = "";
  try {
    writeFileSync(probeFile, "eve write probe\n", { flag: "wx" });
    writeProbeOk = true;
  } catch (err) {
    writeErr = errCode(err);
  } finally {
    try {
      if (existsSync(probeFile)) rmSync(probeFile, { force: true });
    } catch {
      /* our own probe file; if it lingers it is inert and named for us */
    }
  }
  if (!writeProbeOk) {
    const cfa =
      writeErr === "EPERM" || writeErr === "EACCES"
        ? " That is almost always Controlled Folder Access: Settings -> Privacy & security -> " +
          "Windows Security -> Virus & threat protection -> Ransomware protection -> " +
          "Allow an app through Controlled folder access."
        : "";
    return refuse(`Windows refused to let me write a test file in that folder (${writeErr}).${cfa}`);
  }

  // A root that is itself a reparse point is FINE — containment is measured
  // against the RESOLVED root, which is what `real` already is. (T09a)
  return {
    ok: true,
    label,
    path: dirPath,
    real,
    trash: trashReal,
    synced,
    sameVolume: true,
    writeProbeOk: true,
    attrSweepOk,
  };
}

function errCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) return String((err as { code: unknown }).code);
  return err instanceof Error ? err.message.slice(0, 80) : String(err);
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function trashUsage(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const walk = (d: string, depth: number): void => {
    if (depth > 6) return;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e);
      try {
        const st = lstatSync(p);
        if (st.isDirectory()) walk(p, depth + 1);
        else if (st.isFile()) {
          files += 1;
          bytes += st.size;
        }
      } catch {
        /* raced away between readdir and lstat; it is not in the total */
      }
    }
  };
  walk(dir, 0);
  return { files, bytes };
}

export function views(): DeskRootView[] {
  const live = roots.map((r) => {
    const t = trashUsage(r.trashReal);
    return {
      label: r.label,
      path: r.path,
      real: r.real,
      trash: r.trashReal,
      dryRun: r.dryRun,
      synced: r.synced,
      attrSweepOk: r.attrSweepOk,
      writeProbeOk: r.writeProbeOk,
      sameVolume: true,
      freeOnVolume: freeSpace(r.real),
      trashFiles: t.files,
      trashBytes: t.bytes,
    } satisfies DeskRootView;
  });
  const refused = refusals.map((r) => ({
    label: r.label,
    path: r.path,
    real: "",
    trash: "",
    dryRun: true,
    synced: false,
    attrSweepOk: false,
    writeProbeOk: false,
    sameVolume: false,
    freeOnVolume: 0,
    trashFiles: 0,
    trashBytes: 0,
    refusal: r.refusal,
  }));
  return [...live, ...refused];
}

/** A snapshot stored with every batch so undo can refuse a re-pointed label. (G-R9) */
export function snapshot(): { label: string; real: string; trashReal: string; dev: number }[] {
  return roots.map((r) => ({ label: r.label, real: r.real, trashReal: r.trashReal, dev: r.dev }));
}

// ---------------------------------------------------------------------------
// The test seam — narrow, self-containing, and loud
// ---------------------------------------------------------------------------

/**
 * The executor refuses to run under a harness (G-A3). That would make this
 * engine untestable, so there is exactly one seam: EVE_DESK_SCRATCH.
 *
 * It is only honoured when the directory it names is inside the OS temp tree
 * AND every enrolled root resolves inside it. A test can therefore never point
 * the engine at Downloads, Desktop, OneDrive, or anything else of his — the
 * seam is bounded by construction, not by a promise.
 */
export function scratchSeamOk(): { ok: boolean; why: string; dir?: string } {
  const raw = process.env.EVE_DESK_SCRATCH;
  if (!raw) return { ok: false, why: "no scratch seam set" };
  let dir: string;
  let tmp: string;
  try {
    dir = realpathSync.native(raw);
    tmp = realpathSync.native(tmpdir());
  } catch {
    return { ok: false, why: "scratch seam does not resolve" };
  }
  if (!contains(tmp, dir)) return { ok: false, why: "scratch seam is not inside the OS temp tree" };
  for (const r of roots) {
    if (!contains(dir, r.real) && r.real.toLowerCase() !== dir.toLowerCase()) {
      return { ok: false, why: `root "${r.label}" is outside the scratch seam` };
    }
  }
  return { ok: true, why: "", dir };
}

/** Reparse-point check for a directory, used by the destination chain walk. */
export function isDirReparse(abs: string, attr: number | null): boolean {
  if (attr !== null && (attr & FILE_ATTRIBUTE_REPARSE_POINT) !== 0) return true;
  try {
    return lstatSync(abs).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Trash reading for one root — files, bytes, and free space on that volume.
 * The census carries these three numbers so she can say "your trash is empty"
 * and so G-C6's floor is a number he can check, not a claim. (DESK/S2)
 */
export function trashUsageFor(root: DeskRoot): { files: number; bytes: number; freeOnVolume: number } {
  const t = trashUsage(root.trashReal);
  return { files: t.files, bytes: t.bytes, freeOnVolume: freeSpace(root.real) };
}
