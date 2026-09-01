// owner: stream S3 (DESK/UI) — reading the file-batch payload, and deriving
// the above-the-fold facts FROM THE MOVES rather than believing the summary.
//
// `PendingConfirm.payload` is `Record<string, unknown>`: it arrived over SSE
// from the brain, and the brain assembled it around a model-authored plan. Two
// consequences the whole file exists to honour:
//
//   1. It is validated, not cast. A payload that does not have the shape below
//      is REFUSED at the card — the generic key/value body must never render a
//      file_batch, because that body has no bidi isolation, no scroll gate, and
//      an Enter key that approves.
//
//   2. Its self-description is not evidence. `count`, `bytes`, `distinctDests`,
//      `newFolders` and `extensions` all ride on the wire, and a plan that lied
//      about any of them would print its own alibi above the fold. The renderer
//      recomputes every one of them from `moves` and shows its own numbers.
//      Where the payload disagrees with the arithmetic, that disagreement is
//      itself shown. (CARD-3, INJ-4)
import type { FileBatchPayload, FileMove } from "@shared/contract";
import { rawExtension, safeText, skeleton } from "./untrusted";

/**
 * Windows treats `/` and `\` as the same separator, so a payload can mix them
 * freely and did: the brain mints `toRel` with forward slashes while every root
 * label and every journal path uses backslashes. Rendering both conventions on
 * one card is its own small lie — the same folder looked like two.
 *
 * This normalises for DISPLAY only, and it cannot hide anything: `/` is an
 * illegal character inside a Windows filename (G-P4 refuses it), so every `/`
 * in a valid payload is already a separator, and every `/` in an invalid one
 * dies at the guard before it reaches a disk.
 */
export function winPath(s: string): string {
  return s.replace(/\//g, "\\").replace(/\\{2,}/g, "\\");
}

/** G-C5: no card may authorise more than this. Over it, the card locks. */
export const MAX_BATCH_ROWS = 50;
/** G-C7: renames get their own, tighter ceiling. */
export const MAX_RENAME_ROWS = 20;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function readMove(v: unknown): FileMove | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const fromRoot = str(o.fromRoot);
  const fromRel = str(o.fromRel);
  const toRoot = str(o.toRoot);
  const toRel = str(o.toRel);
  if (!fromRoot || !fromRel || !toRoot || !toRel) return null;
  return {
    i: num(o.i),
    fromRoot,
    fromRel,
    toRoot,
    toRel,
    size: num(o.size),
    mtimeMs: num(o.mtimeMs),
    f: str(o.f),
  };
}

/**
 * Returns null for anything that is not a readable file batch. Null is a
 * REFUSAL, not a fallback: the caller must lock the card, never degrade to the
 * generic body.
 */
export function readFileBatchPayload(raw: unknown): FileBatchPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const op = str(o.op);
  if (op !== "move" && op !== "rename" && op !== "stage") return null;
  if (!Array.isArray(o.moves)) return null;

  const moves: FileMove[] = [];
  for (const m of o.moves) {
    const parsed = readMove(m);
    // ONE unreadable row poisons the batch. A card that silently drops a row it
    // could not parse is approving something it did not show him.
    if (!parsed) return null;
    moves.push(parsed);
  }
  if (moves.length === 0) return null;

  return {
    protocol: num(o.protocol),
    batchId: str(o.batchId),
    deskId: str(o.deskId),
    indexRev: str(o.indexRev) || undefined,
    op,
    // A missing/garbled dryRun flag must read as DRY RUN, never as live. The
    // executor refuses on disagreement with the live root flag anyway (G-A4);
    // this is the renderer refusing to draw the more dangerous of two readings.
    dryRun: o.dryRun !== false,
    intent: str(o.intent),
    count: num(o.count),
    bytes: num(o.bytes),
    distinctDests: num(o.distinctDests) || undefined,
    newFolders: Array.isArray(o.newFolders) ? o.newFolders.filter((x): x is string => typeof x === "string") : undefined,
    extensions: Array.isArray(o.extensions) ? o.extensions.filter((x): x is string => typeof x === "string") : undefined,
    crossesSyncBoundary: o.crossesSyncBoundary === true,
    sanitisedNames: num(o.sanitisedNames) || undefined,
    moves,
  };
}

// ---------------------------------------------------------------------------
// Derived facts — the renderer's own arithmetic
// ---------------------------------------------------------------------------

/** Extensions that change what a batch MEANS if one turns up in it. */
const HOT_EXTENSIONS = new Set([
  ".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".ps1", ".vbs", ".js",
  ".jse", ".wsf", ".wsh", ".hta", ".dll", ".sys", ".lnk", ".reg", ".jar",
  ".msix", ".appx", ".cpl", ".pif", ".msc", ".gadget",
]);

export interface BatchFacts {
  rows: number;
  bytes: number;
  /** Distinct destination DIRECTORIES, root-qualified, case-folded. */
  destinations: string[];
  /** Distinct source roots. */
  sourceRoots: string[];
  /** Every extension present, derived from RAW bytes (bidi cannot hide one). */
  extensions: string[];
  hotExtensions: string[];
  /** Rows whose DISPLAYED name differs from the bytes on disk. Measured by the
   *  renderer over the raw strings — never read off the payload's `f` flag,
   *  which is the plan describing itself. */
  alteredRows: number;
  /**
   * PATH-3, the half no per-row badge can catch. Two destination folders whose
   * DISPLAY forms are identical but whose bytes differ — `Clients\Acme` with a
   * Latin A and `Clients\Аcme` with a Cyrillic А. Above the fold they render as
   * the same folder listed twice, which reads as a rendering glitch and is
   * actually half his invoices going somewhere else. Anything in here is named
   * on the card in words.
   */
  lookalikeDests: string[];
  /** True when the payload's own summary disagrees with this arithmetic. */
  payloadDisagrees: boolean;
  disagreements: string[];
  /** Case-folded destination collisions WITHIN this batch. (G-D7 / PATH-4) */
  internalCollisions: string[];
  overCap: boolean;
  cap: number;
}

function foldPath(p: string): string {
  return p.replace(/[\\/]+/g, "\\").replace(/^\\+|\\+$/g, "").normalize("NFC").toLowerCase();
}

function dirOf(rel: string): string {
  const norm = rel.replace(/[\\/]+/g, "\\").replace(/^\\+/, "");
  const cut = norm.lastIndexOf("\\");
  return cut < 0 ? "" : norm.slice(0, cut);
}

export function deriveFacts(p: FileBatchPayload): BatchFacts {
  const dests = new Map<string, string>();
  const roots = new Set<string>();
  const exts = new Set<string>();
  const seenTargets = new Map<string, number>();
  const collisions: string[] = [];
  let bytes = 0;
  let altered = 0;

  for (const m of p.moves) {
    bytes += m.size;
    roots.add(m.fromRoot);
    const d = dirOf(m.toRel);
    const key = foldPath(`${m.toRoot}\\${d}`);
    if (!dests.has(key)) dests.set(key, d ? `${m.toRoot}\\${d}` : m.toRoot);
    const e = rawExtension(m.toRel) || rawExtension(m.fromRel);
    if (e) exts.add(e);
    // MEASURED, not believed. `m.f` is the plan's own claim about whether the
    // desktop sanitiser touched this name; the count on the card is what THIS
    // renderer found in the bytes it is holding.
    const fromT = safeText(m.fromRel);
    const toT = safeText(m.toRel);
    if (fromT.hadInvisible || fromT.mixedScript || toT.hadInvisible || toT.mixedScript) altered++;

    // PATH-4: `Invoice.pdf` and `invoice.PDF` are ONE path on NTFS. Two rows
    // aiming at one path inside an approved batch is a file destroyed with
    // never-delete "held". The guard refuses this batch; the card must SHOW it.
    const target = foldPath(`${m.toRoot}\\${m.toRel}`);
    const prior = seenTargets.get(target);
    if (prior !== undefined) collisions.push(`rows ${prior + 1} and ${p.moves.indexOf(m) + 1}`);
    else seenTargets.set(target, p.moves.indexOf(m));
  }

  const extensions = [...exts].sort();
  const hot = extensions.filter((e) => HOT_EXTENSIONS.has(e));
  const cap = p.op === "rename" ? MAX_RENAME_ROWS : MAX_BATCH_ROWS;

  // Two destinations that LOOK the same and are not. Group the distinct
  // destinations by the string this card will actually print; any display form
  // that more than one real destination maps to is a lookalike pair.
  // Grouped by SKELETON, not by display string. Grouping by what the card
  // prints cannot work — `Acme` and `Аcme` print differently at the byte
  // level and identically to a reader, which is the whole attack. The skeleton
  // folds every confusable to the Latin letter it impersonates, so the two land
  // in the same bucket and the pair is found.
  const bySkeleton = new Map<string, { shown: string; raws: Set<string> }>();
  for (const d of dests.values()) {
    const shown = safeText(winPath(d)).display;
    const key = skeleton(winPath(d));
    const e = bySkeleton.get(key) ?? { shown, raws: new Set<string>() };
    e.raws.add(d);
    bySkeleton.set(key, e);
  }
  const lookalikeDests = [...bySkeleton.values()].filter((e) => e.raws.size > 1).map((e) => e.shown);

  const disagreements: string[] = [];
  if (p.count && p.count !== p.moves.length) {
    disagreements.push(`it claims ${p.count} files; there are ${p.moves.length} rows`);
  }
  if (p.bytes && p.bytes !== bytes) {
    disagreements.push(`it claims ${p.bytes} bytes; the rows add up to ${bytes}`);
  }
  if (p.distinctDests && p.distinctDests !== dests.size) {
    disagreements.push(`it claims ${p.distinctDests} destinations; the rows name ${dests.size}`);
  }
  if (p.extensions && p.extensions.length && p.extensions.join("|") !== extensions.join("|")) {
    disagreements.push(
      `it lists extensions ${p.extensions.join(" ") || "(none)"}; the rows contain ${extensions.join(" ") || "(none)"}`,
    );
  }

  return {
    rows: p.moves.length,
    bytes,
    destinations: [...dests.values()],
    sourceRoots: [...roots],
    extensions,
    hotExtensions: hot,
    alteredRows: altered,
    lookalikeDests,
    payloadDisagrees: disagreements.length > 0,
    disagreements,
    internalCollisions: collisions,
    overCap: p.moves.length > cap,
    cap,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Bytes, base-1000, because that is what Windows Explorer's own "size on
 *  disk" column and every download bar he has ever read use. Never rounds a
 *  non-zero size to "0 B". */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  const s = v >= 100 || u === 0 ? Math.round(v).toString() : v.toFixed(1);
  return `${s} ${units[u]}`;
}

export function fmtHMS(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds(),
  ).padStart(2, "0")}`;
}

export function fmtHM(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDayHM(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (sameDay) return `TODAY ${hm}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

/** The first 8 hex of the plan hash, printed on the card header and again on
 *  the outcome so a mismatch is visible to HIM, not only to the code. (G-C4) */
export function hashPrefix(hash: string | undefined | null): string {
  const h = (hash ?? "").replace(/[^0-9a-f]/gi, "");
  return h ? h.slice(0, 8).toLowerCase() : "—";
}

export function isHotExtension(ext: string): boolean {
  return HOT_EXTENSIONS.has(ext.toLowerCase());
}

export { dirOf, foldPath };
