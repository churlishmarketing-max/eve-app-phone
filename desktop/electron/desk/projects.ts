// DESK — THE PROJECT-LINK INDEX.
//
// One question, asked of one file: "is this clip wired into an edit?"
//
// King's own words for the feature this serves: "I'll know where she moves it
// because I'll have it planned ahead of time." So this module NEVER refuses
// anything. It produces a warning and a project name, the card prints it in
// gold, and APPROVE stays enabled. The decision is his; the disclosure is ours.
//
// HOW THIS RELATES TO G-T4, WHICH IS UNTOUCHED.
//
//   guard.ts's G-T4 refuses a file whose OWN FOLDER is a project's working
//   directory — a `.prproj` sitting next to it, or a `.git`/`node_modules`
//   ancestor. It is cheap, high-confidence, and it stays a refusal.
//
//   What G-T4 cannot see is the case King actually screenshotted: a Premiere
//   project in one folder referencing C9452.MP4 in a completely different one.
//   Nothing is next to that clip. G-T4 is silent, correctly. THIS module is the
//   deep half, it wears its OWN rule id (G-T4b in guard.ts), and its
//   disposition is `allow` + an annotation. Two ids, two dispositions, two sets
//   of assertions — so a change to one can never silently move the other.
//
// FIVE LAWS IT ENFORCES ON ITSELF, the eye's laws restated for a second walk:
//
//   1. Bounded. Depth 3 below each root (index-store.MAX_DEPTH), a directory
//      budget per root, a ceiling on projects parsed, and a ceiling on
//      references held per project.
//   2. NEVER descend a reparse point. libuv reports an NTFS junction as a
//      symbolic link, so the symlink test comes FIRST, before isDirectory().
//      A junction pointing at C:\Windows must not make C:\Windows a project.
//   3. Never-list matches are skipped entirely — not parsed, not named, not
//      counted as clean.
//   4. HONEST UNKNOWN. A project we could not open, inflate or parse is
//      recorded in `unparsed` BY NAME and the map reports itself as incomplete.
//      Silence would let a warning that never fired read as "not referenced",
//      which is the one failure mode that loses his footage.
//   5. Bytes stay here. What leaves this module is a project FILENAME and a
//      boolean. No path out of a project file, no XML, no content.
//
// WHAT IS NOT IN V1, DELIBERATELY AND OUT LOUD: `.aep`. After Effects projects
// are a binary RIFX chunk container, not gzip+XML, and guessing at Adobe's
// chunk tags from memory would produce a parser that fails quietly — which by
// law 4 is worse than not having one. `.aep` keeps exactly the cover it has
// today: guard.ts's G-T4 sibling test. That gap is stated in `coverage()` and
// printed on the card, never implied away.
//
// THE SCHEMA IS THE SOFT PART. `.prproj` is gzip-compressed XML; that much is
// mechanically verified. The ELEMENT that carries a source path is community
// knowledge, not documentation, and Adobe has renamed internals across major
// versions. So extraction runs TWO ways — a named-tag pass and a shape pass
// that finds a Windows path in ANY text node — and the shape pass is the one
// that survives a rename. Bias is toward firing: a needless gold line costs him
// a glance, a missing one costs him a relink he never saw coming.
//
// Owning stream: DESK/S2 (the eye's beat), rule id owned by DESK/S1 (guard.ts).

import { gunzipSync } from "node:zlib";
import { lstatSync, openSync, readSync, closeSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { MAX_DEPTH } from "./index-store.js";
import { foldPath, neverListMatcher, sanitise } from "./sanitise.js";
import type { DeskRoot } from "./types.js";

// ---------------------------------------------------------------------------
// Ceilings. Every one of these is a refusal to hang the app on a pathological
// file, and every one of them is COUNTED when it bites.
// ---------------------------------------------------------------------------

/** v1 parses exactly this. `.aep` is covered by G-T4's sibling test and nothing else. */
export const PROJECT_DEEP_EXT = /\.prproj$/i;
/** Compressed ceiling. A real project is single-digit MB; this is a stop, not a budget. */
export const MAX_PROJECT_BYTES = 192 * 1024 * 1024;
/** Inflated ceiling, enforced by zlib itself so a zip bomb aborts instead of allocating. */
export const MAX_INFLATED_BYTES = 512 * 1024 * 1024;
/** Projects parsed per root per walk. */
export const MAX_PROJECTS_PER_ROOT = 40;
/** References held from one project. */
export const MAX_REFS_PER_PROJECT = 20_000;
/** Directories visited per root. index-store's own budget, restated. */
export const MAX_DIRS_PER_ROOT = 4_000;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One project that references a file. `project` is SANITISED — it reaches the card. */
export interface ProjectRef {
  /** Sanitised project filename, e.g. "GE_Outdoors_Edit_v3.prproj". */
  project: string;
  /** Root label the project itself lives in. */
  root: string;
}

/** A project we could not read. Named, because an unnamed unknown is a shrug. */
export interface ProjectUnparsed {
  project: string;
  root: string;
  why: string;
}

export interface ProjectMap {
  at: string;
  /** Projects successfully parsed. */
  parsed: number;
  /** Distinct referenced basenames held. */
  refs: number;
  /** Projects found and NOT parsed. Non-empty means this map is incomplete. */
  unparsed: ProjectUnparsed[];
  /** Root labels this walk covered. A root not here was never looked at. */
  roots: string[];
  /** A ceiling bit somewhere — more projects exist than were parsed. */
  truncated: boolean;
  /** Wall-clock, for the Settings diagnostics line. */
  ms: number;
  byBase: Map<string, ProjectRef[]>;
  byPath: Map<string, ProjectRef[]>;
}

const EMPTY: ProjectMap = {
  at: "",
  parsed: 0,
  refs: 0,
  unparsed: [],
  roots: [],
  truncated: false,
  ms: 0,
  byBase: new Map(),
  byPath: new Map(),
};

// ---------------------------------------------------------------------------
// Parsing one project
// ---------------------------------------------------------------------------

export interface ParseResult {
  ok: boolean;
  /** Absolute paths as the project states them. Stale and cross-drive are expected. */
  paths: string[];
  /** Set when ok === false. Plain English — it reaches a diagnostics line. */
  why: string;
  /** True when the container was gzip. A plain-XML save is legal and parses too. */
  gzip: boolean;
  /** Set when MAX_REFS_PER_PROJECT bit. */
  truncated: boolean;
}

/** The 2-byte gzip magic. index-store.sniffClass already recognises it as an archive. */
function isGzip(abs: string): boolean {
  let fd = -1;
  try {
    fd = openSync(abs, "r");
    const buf = Buffer.alloc(2);
    if (readSync(fd, buf, 0, 2, 0) < 2) return false;
    return buf[0] === 0x1f && buf[1] === 0x8b;
  } catch {
    return false;
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
}

/**
 * Named tags first — these are the elements community reverse-engineering says
 * carry a source path. If Adobe has renamed them, this pass finds nothing and
 * the shape pass below still does.
 */
const TAG_PASS =
  /<(?:ActualMediaFilePath|FilePath|MediaFilePath|ActualFilePath|Path|FullPath)\b[^>]*>([\s\S]{1,600}?)<\//gi;

/**
 * The shape pass — a Windows absolute path in ANY text node, and the file-URI
 * form Premiere writes for some entries. This is the half that survives a
 * schema rename, and it is the reason a tag-name guess is not load-bearing.
 */
const SHAPE_PASS = /(?:file:\/{2,}(?:localhost\/)?)?([A-Za-z]:[\\/][^\u0000-\u001f"'<>|*?]{1,400})/g;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function unescapeXml(s: string): string {
  return s
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => {
      const n = Number.parseInt(h, 16);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    })
    .replace(/&#(\d+);/g, (_m, d: string) => {
      const n = Number.parseInt(d, 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    });
}

/** file:///C:/x/y.mp4 and %20 escapes both arrive here. */
function normalisePath(raw: string): string | null {
  let s = unescapeXml(raw).trim();
  if (!s) return null;
  if (s.includes("%")) {
    try {
      s = decodeURIComponent(s);
    } catch {
      /* a lone % is not an escape — keep the literal */
    }
  }
  s = s.replace(/\//g, "\\").replace(/\\{2,}/g, "\\");
  if (!/^[A-Za-z]:\\/.test(s)) return null;
  const base = path.basename(s);
  if (!base || base === "." || base === "..") return null;
  return s;
}

/**
 * ONE PROJECT. Read, inflate if gzip, extract. Never throws: every failure is a
 * named `why`, because law 4 says an unknown must be reportable.
 */
export function parseProject(abs: string): ParseResult {
  const no = (why: string, gzip = false): ParseResult => ({ ok: false, paths: [], why, gzip, truncated: false });
  let size = 0;
  try {
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) return no("it is a shortcut, not a project file");
    if (!st.isFile()) return no("it is not an ordinary file");
    size = st.size;
  } catch {
    return no("it could not be opened");
  }
  if (size === 0) return no("it is empty");
  if (size > MAX_PROJECT_BYTES) {
    return no(`it is ${Math.round(size / 1024 / 1024)} MB — past the ${Math.round(MAX_PROJECT_BYTES / 1024 / 1024)} MB ceiling I will open`);
  }

  const gzip = isGzip(abs);
  let xml: string;
  try {
    const raw = readFileSync(abs);
    const buf = gzip ? gunzipSync(raw, { maxOutputLength: MAX_INFLATED_BYTES }) : raw;
    xml = buf.toString("utf8");
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return no(gzip ? `it did not decompress — ${m.slice(0, 90)}` : `it could not be read — ${m.slice(0, 90)}`, gzip);
  }

  // A `.prproj` that is neither gzip nor XML is not a project we understand,
  // and saying "no references" about it would be law 4's exact violation.
  if (!/<[A-Za-z]/.test(xml)) return no("it does not look like project XML inside", gzip);

  const out = new Set<string>();
  let truncated = false;
  const take = (candidate: string | undefined): void => {
    if (candidate === undefined || truncated) return;
    const p = normalisePath(candidate);
    if (!p) return;
    if (out.size >= MAX_REFS_PER_PROJECT) {
      truncated = true;
      return;
    }
    out.add(p);
  };

  for (const m of xml.matchAll(TAG_PASS)) take(m[1]);
  for (const m of xml.matchAll(SHAPE_PASS)) take(m[1]);

  return { ok: true, paths: [...out], why: "", gzip, truncated };
}

// ---------------------------------------------------------------------------
// Building the map
// ---------------------------------------------------------------------------

export interface BuildInput {
  roots: DeskRoot[];
  neverList: string[];
  now?: number;
}

/** Finds every `.prproj` under one root, bounded, refusing every door out of it. */
function findProjects(root: DeskRoot, never: (rel: string, name: string) => boolean): string[] {
  const found: string[] = [];
  let dirBudget = MAX_DIRS_PER_ROOT;

  const visit = (abs: string, relDir: string, depth: number): void => {
    if (depth > MAX_DEPTH || dirBudget <= 0 || found.length >= MAX_PROJECTS_PER_ROOT) return;
    dirBudget -= 1;
    let names: string[];
    try {
      names = readdirSync(abs);
    } catch {
      return;
    }
    for (const name of names) {
      if (found.length >= MAX_PROJECTS_PER_ROOT) return;
      const childAbs = path.join(abs, name);
      const childRel = relDir ? `${relDir}/${name}` : name;
      let st;
      try {
        st = lstatSync(childAbs);
      } catch {
        continue;
      }
      // LAW 2 — the symlink test comes first. A junction is reported as a
      // symbolic link and isDirectory() is FALSE for it, so asking "is it a
      // directory" first walks straight through the door this rule exists to
      // shut. index-store.ts:walkRoot learned this the same way.
      if (st.isSymbolicLink()) continue;
      if (never(childRel, name)) continue;
      if (st.isDirectory()) {
        visit(childAbs, childRel, depth + 1);
        continue;
      }
      if (st.isFile() && PROJECT_DEEP_EXT.test(name)) found.push(childAbs);
    }
  };

  visit(root.real, "", 1);
  return found;
}

/** Pure — takes roots, returns a map. `rebuild()` below is the stateful wrapper. */
export function build(input: BuildInput): ProjectMap {
  const t0 = Date.now();
  const never = neverListMatcher(input.neverList ?? []);
  const byBase = new Map<string, ProjectRef[]>();
  const byPath = new Map<string, ProjectRef[]>();
  const unparsed: ProjectUnparsed[] = [];
  const bases = new Set<string>();
  let parsed = 0;
  let truncated = false;

  const push = (map: Map<string, ProjectRef[]>, key: string, ref: ProjectRef): void => {
    const arr = map.get(key);
    if (!arr) {
      map.set(key, [ref]);
      return;
    }
    // One project referencing the same clip twice is one warning, not two.
    if (!arr.some((x) => x.project === ref.project && x.root === ref.root)) arr.push(ref);
  };

  for (const root of input.roots) {
    const files = findProjects(root, never);
    if (files.length >= MAX_PROJECTS_PER_ROOT) truncated = true;
    for (const abs of files) {
      const display = sanitise(path.basename(abs)).display;
      const ref: ProjectRef = { project: display, root: root.label };
      const res = parseProject(abs);
      if (!res.ok) {
        unparsed.push({ project: display, root: root.label, why: res.why });
        continue;
      }
      parsed += 1;
      if (res.truncated) truncated = true;
      for (const p of res.paths) {
        push(byPath, foldPath(p), ref);
        const base = path.basename(p).toLowerCase();
        bases.add(base);
        push(byBase, base, ref);
      }
    }
  }

  return {
    at: new Date(input.now ?? Date.now()).toISOString(),
    parsed,
    refs: bases.size,
    unparsed,
    roots: input.roots.map((r) => r.label),
    truncated,
    ms: Date.now() - t0,
    byBase,
    byPath,
  };
}

// ---------------------------------------------------------------------------
// The lookup — TWO TIERS, and tier 2 is the one that matters
// ---------------------------------------------------------------------------

/**
 * Tier 1 — the same absolute path, case-folded. A certain hit.
 * Tier 2 — the same BASENAME, anywhere, on any drive. This is the tier that
 *   survives the two cases the format guarantees: a project storing a path the
 *   file has since moved away from, and a project written on a machine where
 *   the drive letter was different.
 *
 * Tier 2 over-fires when two unrelated shoots both produced a C9452.MP4. That
 * is the trade this whole rule is built around and it is chosen deliberately: a
 * false positive is a gold line he reads and approves anyway; a false negative
 * is media going offline in an edit with nothing on screen that said so.
 */
export function lookup(map: ProjectMap | null, abs: string): ProjectRef | null {
  if (!map || !abs) return null;
  const exact = map.byPath.get(foldPath(abs));
  if (exact && exact.length > 0) return exact[0] as ProjectRef;
  const base = map.byBase.get(path.basename(abs).toLowerCase());
  if (base && base.length > 0) return base[0] as ProjectRef;
  return null;
}

/** Every project that references this file, not just the first. Used by diagnostics. */
export function lookupAll(map: ProjectMap | null, abs: string): ProjectRef[] {
  if (!map || !abs) return [];
  const seen = new Map<string, ProjectRef>();
  for (const r of map.byPath.get(foldPath(abs)) ?? []) seen.set(`${r.root}\u0000${r.project}`, r);
  for (const r of map.byBase.get(path.basename(abs).toLowerCase()) ?? []) seen.set(`${r.root}\u0000${r.project}`, r);
  return [...seen.values()];
}

/**
 * IS THIS MAP AN ANSWER, OR A SHRUG? True whenever something stops it being a
 * complete picture: a project that would not parse, a ceiling that bit, or no
 * walk at all. The card prints a DIFFERENT sentence for true — it must never
 * print silence and let silence read as safety. (law 4)
 */
export function isUnknown(map: ProjectMap | null): boolean {
  if (!map || !map.at) return true;
  return map.unparsed.length > 0 || map.truncated;
}

/** One line for the card and for Settings. Never "all clear" when it is not. */
export function coverage(map: ProjectMap | null): string {
  if (!map || !map.at) {
    return "I HAVE NOT READ ANY PREMIERE PROJECTS YET — I CANNOT SAY WHETHER THESE ARE IN AN EDIT.";
  }
  const bits: string[] = [];
  bits.push(`${map.parsed} PREMIERE ${map.parsed === 1 ? "PROJECT" : "PROJECTS"} READ`);
  if (map.unparsed.length > 0) {
    bits.push(
      `${map.unparsed.length} I COULD NOT OPEN (${map.unparsed
        .slice(0, 3)
        .map((u) => u.project)
        .join(", ")}${map.unparsed.length > 3 ? ", …" : ""}) — FILES USED BY ${
        map.unparsed.length === 1 ? "IT" : "THOSE"
      } WILL NOT BE FLAGGED`,
    );
  }
  if (map.truncated) bits.push("AND I STOPPED AT MY CEILING, SO THERE MAY BE MORE");
  bits.push("AFTER EFFECTS PROJECTS ARE NOT READ AT ALL IN THIS BUILD");
  return `${bits.join(" · ")}.`;
}

// ---------------------------------------------------------------------------
// Module state — one map, rebuilt on the eye's beat, dropped on disarm
// ---------------------------------------------------------------------------

let current: ProjectMap | null = null;
let cfg: { rootsOf: () => DeskRoot[]; neverList: string[] } | null = null;
let building = false;

export function configure(c: { rootsOf: () => DeskRoot[]; neverList: string[] }): void {
  cfg = c;
}

export function map(): ProjectMap | null {
  return current;
}

/**
 * Rides the eye's cadence rather than owning one: index-store's `onChange`
 * calls this after every walk, so the same 800ms watch debounce and the same
 * 10-minute reconcile that keep the file index fresh keep this fresh, and there
 * is no second timer, no second watcher, and no second answer to "when did you
 * last look".
 */
export function rebuild(): ProjectMap | null {
  if (!cfg) return current;
  if (building) return current;
  building = true;
  try {
    current = build({ roots: cfg.rootsOf(), neverList: cfg.neverList });
    return current;
  } catch {
    // A build that threw is not a build that found nothing. The previous map
    // stands, and if there was none, `isUnknown(null)` is already true.
    return current;
  } finally {
    building = false;
  }
}

/** Disarm drops it, exactly as the eye drops its index. */
export function clear(): void {
  current = null;
}

/** Test seam — the harness installs a map without a walk. */
export function __setMap(m: ProjectMap | null): void {
  current = m;
}

export { EMPTY as EMPTY_MAP };
