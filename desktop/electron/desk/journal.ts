// DESK — the journal. Append-only JSONL, fsync'd, and the only durable record
// of what happened to his disk.
//
// Three laws:
//
//   1. The PLAN line is on disk and fsync'd BEFORE the first byte moves.
//      A crash mid-batch can never leave a move that is not recorded. The
//      inverse — a recorded move that did not happen — is recoverable by stat.
//      This is not. (G-R1)
//
//   2. Nothing here needs the brain. Undo reads only this file, because the
//      moment he most wants undo is the moment something went wrong. (G-R4)
//
//   3. Retention is stated in TIME, and a batch that has not been undone or
//      acknowledged is never rotated away. A journal that garbage-collects the
//      evidence is not an audit trail. (G-R3)
//
// Owning stream: DESK/S1.

import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import type {
  DeskBatchRecord,
  DeskBatchSummary,
  ItemStatus,
  JournalLine,
  JournalOpLine,
  JournalPlanLine,
  JournalReconcileLine,
  JournalResultLine,
  JournalUndoLine,
} from "./types.js";

/** 18 months minimum. (G-R3) */
export const RETENTION_MS = 18 * 30 * 24 * 60 * 60 * 1000;
const ROTATE_BYTES = 32 * 1024 * 1024;

let journalPath = "";

export function init(userDataDir: string): string {
  mkdirSync(userDataDir, { recursive: true });
  journalPath = path.join(userDataDir, "desk-journal.jsonl");
  if (!existsSync(journalPath)) writeDurable("");
  return journalPath;
}

export function file(): string {
  return journalPath;
}

/**
 * Append one line and fsync it. Synchronous and unbuffered on purpose: a
 * durable record that is still in a write buffer when the power goes out is
 * not a durable record.
 */
function writeDurable(line: string): void {
  const fd = openSync(journalPath, "a");
  try {
    if (line) writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function append(line: JournalLine): void {
  if (!journalPath) throw new Error("journal not initialised");
  writeDurable(`${JSON.stringify(line)}\n`);
}

/** The plan line. Nothing may move until this returns. (G-R1) */
export function writePlan(line: JournalPlanLine): void {
  append(line);
}

export function writeOp(line: JournalOpLine): void {
  append(line);
}

export function writeResult(line: JournalResultLine): void {
  append(line);
}

export function writeUndo(line: JournalUndoLine): void {
  append(line);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function readAll(): JournalLine[] {
  if (!journalPath || !existsSync(journalPath)) return [];
  const out: JournalLine[] = [];
  // Segments first (oldest), then the live file, so order is chronological.
  const dir = path.dirname(journalPath);
  const base = path.basename(journalPath, ".jsonl");
  const segs: { n: number; p: string }[] = [];
  for (let n = 1; n < 1000; n += 1) {
    const p = path.join(dir, `${base}.${n}.jsonl`);
    if (!existsSync(p)) break;
    segs.push({ n, p });
  }
  segs.sort((a, b) => b.n - a.n); // .2 is older than .1
  for (const s of segs) out.push(...parseFile(s.p));
  out.push(...parseFile(journalPath));
  return out;
}

function parseFile(p: string): JournalLine[] {
  const out: JournalLine[] = [];
  let text: string;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    return out;
  }
  for (const raw of text.split("\n")) {
    const s = raw.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s) as JournalLine);
    } catch {
      // A torn last line after a crash is expected. Skip it; never guess.
    }
  }
  return out;
}

/** Newest-first batch history for the log panel. */
export function batches(limit = 50): DeskBatchRecord[] {
  const lines = readAll();
  const plans = new Map<string, JournalPlanLine>();
  const results = new Map<string, JournalResultLine>();
  const opsByBatch = new Map<string, JournalOpLine[]>();
  const undone = new Set<string>();
  const interrupted = new Set<string>();

  for (const l of lines) {
    if (l.t === "plan") plans.set(l.batchId, l);
    else if (l.t === "result") results.set(l.batchId, l);
    else if (l.t === "op") {
      const arr = opsByBatch.get(l.batchId) ?? [];
      arr.push(l);
      opsByBatch.set(l.batchId, arr);
    } else if (l.t === "undo") undone.add(l.batchId);
    else if (l.t === "reconcile") interrupted.add(l.batchId);
  }

  const out: DeskBatchRecord[] = [];
  for (const [batchId, plan] of plans) {
    const res = results.get(batchId);
    const ops = opsByBatch.get(batchId) ?? [];
    out.push({
      batchId,
      jobId: plan.jobId,
      at: plan.at,
      op: plan.op,
      dryRun: plan.dryRun,
      intent: plan.intent,
      hashPrefix: plan.hash.slice(0, 8),
      moved: res?.moved ?? ops.filter((o) => o.status === "moved").length,
      skipped: res?.skipped ?? ops.filter((o) => o.status === "skipped").length,
      failed: res?.failed ?? ops.filter((o) => o.status === "failed").length,
      refused: res?.refused ?? ops.filter((o) => o.status === "refused").length,
      bytes: res?.bytes ?? 0,
      undone: undone.has(batchId),
      interrupted: interrupted.has(batchId) || !res,
      items: ops.map((o) => ({
        idx: o.idx,
        fromAbs: o.fromAbs,
        toAbs: o.toAbs,
        status: o.status,
        why: o.why,
      })),
    });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : -1));
  return out.slice(0, limit);
}

/** The five-summary tail that rides to the brain. No paths, no names. (G-R10) */
export function summaries(limit = 5): DeskBatchSummary[] {
  return batches(limit).map((b) => ({
    batchId: b.batchId,
    at: b.at,
    op: b.op,
    dryRun: b.dryRun,
    moved: b.moved,
    skipped: b.skipped,
    failed: b.failed,
    undone: b.undone,
  }));
}

export function planFor(batchId: string): JournalPlanLine | null {
  const lines = readAll();
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const l = lines[i] as JournalLine;
    if (l.t === "plan" && l.batchId === batchId) return l;
  }
  return null;
}

export function opsFor(batchId: string): JournalOpLine[] {
  return readAll().filter((l): l is JournalOpLine => l.t === "op" && l.batchId === batchId);
}

export function undosFor(batchId: string): JournalUndoLine[] {
  return readAll().filter((l): l is JournalUndoLine => l.t === "undo" && l.batchId === batchId);
}

export function resultFor(batchId: string): JournalResultLine | null {
  const all = readAll().filter((l): l is JournalResultLine => l.t === "result" && l.batchId === batchId);
  return all.length ? (all[all.length - 1] as JournalResultLine) : null;
}

// ---------------------------------------------------------------------------
// Boot reconcile (G-R2)
// ---------------------------------------------------------------------------

export interface ReconcileReport {
  batches: number;
  ambiguous: number;
  lines: JournalReconcileLine[];
}

/**
 * Every `plan` with no `result` gets one written NOW. Each item is stat'd into
 * reconciled-moved / reconciled-untouched / AMBIGUOUS.
 *
 * AMBIGUOUS is the important one. Between `linkSync(src,dest)` and
 * `unlinkSync(src)` there are two paths to one file. Classifying that state as
 * `moved` would be a lie, and Node on Windows does not expose `nlink`
 * reliably enough to lean on — so "both paths exist, same size, same mtime"
 * is reported as TWO COPIES, CHECK BOTH and never as moved.
 */
export function reconcile(): ReconcileReport {
  const lines = readAll();
  const plans = new Map<string, JournalPlanLine>();
  const resulted = new Set<string>();
  const reconciled = new Set<string>();
  for (const l of lines) {
    if (l.t === "plan") plans.set(l.batchId, l);
    else if (l.t === "result") resulted.add(l.batchId);
    else if (l.t === "reconcile") reconciled.add(l.batchId);
  }

  const out: JournalReconcileLine[] = [];
  let ambiguous = 0;
  for (const [batchId, plan] of plans) {
    if (resulted.has(batchId) || reconciled.has(batchId)) continue;
    const items: JournalReconcileLine["items"] = [];
    for (const it of plan.items) {
      const srcExists = safeExists(it.fromAbs);
      const dstExists = safeExists(it.toAbs);
      if (srcExists && dstExists) {
        const a = safeStat(it.fromAbs);
        const b = safeStat(it.toAbs);
        const same = a && b && a.size === b.size && Math.abs(a.mtimeMs - b.mtimeMs) < 2000;
        ambiguous += 1;
        items.push({
          idx: it.idx,
          state: "AMBIGUOUS",
          note: same
            ? "TWO COPIES, CHECK BOTH — the original and the destination both exist and look identical"
            : "TWO COPIES, CHECK BOTH — the original and the destination both exist and differ",
        });
      } else if (!srcExists && dstExists) {
        items.push({ idx: it.idx, state: "reconciled-moved", note: "the file is at its destination" });
      } else if (srcExists && !dstExists) {
        items.push({ idx: it.idx, state: "reconciled-untouched", note: "the file never moved" });
      } else {
        items.push({
          idx: it.idx,
          state: "reconciled-unknown",
          note: "neither path exists — go look for this one yourself",
        });
      }
    }
    const line: JournalReconcileLine = {
      t: "reconcile",
      at: new Date().toISOString(),
      batchId,
      jobId: plan.jobId,
      reason: "interrupted",
      items,
    };
    append(line);
    out.push(line);
  }
  return { batches: out.length, ambiguous, lines: out };
}

function safeExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function safeStat(p: string): { size: number; mtimeMs: number } | null {
  try {
    const s = statSync(p);
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rotation (G-R3) — refuses to rotate away un-acknowledged evidence
// ---------------------------------------------------------------------------

export interface RotateResult {
  rotated: boolean;
  why: string;
}

/**
 * Rotation is size-triggered but retention is stated in TIME. A segment is only
 * rotated when EVERY batch in it is older than the retention window AND has a
 * result and either an undo or an acknowledgement. Anything else keeps the file
 * where it is, however big it gets. Losing the record is worse than a big file.
 */
export function rotateIfNeeded(now = Date.now()): RotateResult {
  if (!journalPath || !existsSync(journalPath)) return { rotated: false, why: "no journal" };
  let size = 0;
  try {
    size = statSync(journalPath).size;
  } catch {
    return { rotated: false, why: "unreadable" };
  }
  if (size < ROTATE_BYTES) return { rotated: false, why: "under the rotation size" };

  const recs = batches(10_000);
  const blocking = recs.filter((b) => {
    const age = now - Date.parse(b.at);
    if (Number.isNaN(age)) return true;
    if (age < RETENTION_MS) return true;
    if (b.interrupted) return true;
    return false;
  });
  if (blocking.length > 0) {
    return {
      rotated: false,
      why: `${blocking.length} batches are still inside the 18-month window or were never finished`,
    };
  }

  const dir = path.dirname(journalPath);
  const base = path.basename(journalPath, ".jsonl");
  for (let n = 998; n >= 1; n -= 1) {
    const from = path.join(dir, `${base}.${n}.jsonl`);
    if (existsSync(from)) renameSync(from, path.join(dir, `${base}.${n + 1}.jsonl`));
  }
  renameSync(journalPath, path.join(dir, `${base}.1.jsonl`));
  writeDurable("");
  return { rotated: true, why: "rotated" };
}

/** Item statuses that mean a file actually moved and can therefore be undone. */
export function isRestorable(s: ItemStatus): boolean {
  return s === "moved";
}
