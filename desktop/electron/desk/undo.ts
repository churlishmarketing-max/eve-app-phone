// DESK — UNDO. Journal-driven, brain-free, re-runnable per item.
//
// This is the one renderer-triggerable mutation in the design and it is a
// deliberate exception. An undo is derived entirely from the local journal, it
// can only restore state King already had, it is re-guarded on both endpoints,
// and it must work with the brain offline — which is precisely when he needs
// it. The model has NO undo tool. She cannot undo; only he can.
//
// One-shot per ITEM, not per batch (G-R7): a partially-refused undo is
// re-runnable for exactly the items that failed, which is the whole point after
// a half-landed batch.
//
// Owning stream: DESK/S1.

import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync, realpathSync, rmdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { atomicMove } from "./execute.js";
import * as journal from "./journal.js";
import * as roster from "./roster.js";
import { contains } from "./roster.js";
import { MTIME_TOL_MS, MTIME_TOL_SYNCED_MS } from "./guard.js";
import type { JournalUndoLine } from "./types.js";

export interface UndoItemResult {
  idx: number;
  status: "restored" | "refused" | "failed";
  why: string;
  fromAbs: string;
  toAbs: string;
}

export interface UndoResult {
  ok: boolean;
  batchId: string;
  undoId: string;
  dryRun: boolean;
  restored: number;
  refused: number;
  failed: number;
  items: UndoItemResult[];
  removedDirs: string[];
  refusal?: string;
  /** True when every item that could come back has come back. */
  complete: boolean;
}

function sha256Of(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

/**
 * Undo one batch. `preview` computes the whole verdict and touches nothing —
 * that is what `UNDO EVERYTHING SINCE` shows him before it acts. (G-R8)
 */
export function undoBatch(batchId: string, preview = false): UndoResult {
  const undoId = randomUUID();
  const base: UndoResult = {
    ok: false,
    batchId,
    undoId,
    dryRun: preview,
    restored: 0,
    refused: 0,
    failed: 0,
    items: [],
    removedDirs: [],
    complete: false,
  };

  const plan = journal.planFor(batchId);
  if (!plan) return { ...base, refusal: "I have no record of that batch" };
  if (plan.dryRun) {
    return { ...base, refusal: "that one was a rehearsal — nothing moved, so there's nothing to put back" };
  }

  // G-R9 — the roots snapshot. An undo after he re-points a label must not act
  // on the wrong disk.
  const live = roster.snapshot();
  for (const snap of plan.roots) {
    const now = live.find((r) => r.label === snap.label);
    if (!now) return { ...base, refusal: `the folder "${snap.label}" isn't set up any more` };
    if (now.real.toLowerCase() !== snap.real.toLowerCase()) {
      return {
        ...base,
        refusal: `"${snap.label}" points somewhere else now than it did when this ran. I won't undo onto a different disk.`,
      };
    }
  }

  // Which items actually moved, and which are already back.
  const ops = journal.opsFor(batchId).filter((o) => o.status === "moved");
  const alreadyDone = new Set<number>();
  for (const u of journal.undosFor(batchId)) {
    for (const it of u.items) if (it.status === "restored") alreadyDone.add(it.idx);
  }
  if (ops.length === 0) return { ...base, refusal: "nothing in that batch moved" };
  if (ops.every((o) => alreadyDone.has(o.idx))) {
    return { ...base, refusal: "that one's already back" };
  }

  const items: UndoItemResult[] = [];
  // Reverse order: batch 4 may have moved a file into a name batch 2 vacated.
  const ordered = [...ops].reverse();

  for (const o of ordered) {
    if (alreadyDone.has(o.idx)) continue;
    const from = o.toAbs; // where it is now
    const to = o.fromAbs; // where it came from

    const planned = plan.items.find((p) => p.idx === o.idx);
    const verdict = checkRestorable(from, to, o.size, planned?.mtimeMs ?? 0, o.sha256);
    if (verdict) {
      items.push({ idx: o.idx, status: "refused", why: verdict, fromAbs: from, toAbs: to });
      continue;
    }
    if (preview) {
      items.push({ idx: o.idx, status: "restored", why: "would go back", fromAbs: from, toAbs: to });
      continue;
    }

    const destRoot = roster.list().find((r) => contains(r.real, to));
    const synced = destRoot?.synced === true;
    const r = atomicMove(from, to, synced);
    if (r.kind === "moved") {
      // G-R6 — for a copy-based restore the recorded hash is re-verified.
      if (synced && o.sha256) {
        try {
          if (sha256Of(to) !== o.sha256) {
            items.push({
              idx: o.idx,
              status: "failed",
              why: "it came back but the bytes don't match what I recorded — go look at it",
              fromAbs: from,
              toAbs: to,
            });
            continue;
          }
        } catch {
          /* fall through to restored; the file is at its original path */
        }
      }
      items.push({ idx: o.idx, status: "restored", why: "", fromAbs: from, toAbs: to });
    } else if (r.kind === "collision") {
      items.push({ idx: o.idx, status: "refused", why: "ORIGINAL SPOT TAKEN", fromAbs: from, toAbs: to });
    } else if (r.kind === "gone") {
      items.push({ idx: o.idx, status: "refused", why: "it isn't where I put it any more", fromAbs: from, toAbs: to });
    } else {
      items.push({ idx: o.idx, status: "failed", why: r.why, fromAbs: from, toAbs: to });
    }
  }

  // G-D10 — rmdirSync ONLY here, ONLY for directories this batch created, ONLY
  // when readdirSync says they are empty. Deepest first.
  const removedDirs: string[] = [];
  if (!preview) {
    const res = journal.resultFor(batchId);
    const dirs = [...(res?.createdDirs ?? [])].sort((a, b) => b.length - a.length);
    for (const d of dirs) {
      try {
        if (readdirSync(d).length === 0) {
          rmdirSync(d);
          removedDirs.push(d);
        }
      } catch {
        /* not empty, or gone; either way it stays */
      }
    }
  }

  const restored = items.filter((i) => i.status === "restored").length;
  const refused = items.filter((i) => i.status === "refused").length;
  const failed = items.filter((i) => i.status === "failed").length;

  if (!preview) {
    const line: JournalUndoLine = {
      t: "undo",
      at: new Date().toISOString(),
      batchId,
      undoId,
      restored,
      refused,
      failed,
      items: items.map((i) => ({ idx: i.idx, status: i.status, why: i.why })),
      removedDirs,
    };
    journal.writeUndo(line);
  }

  return {
    ok: true,
    batchId,
    undoId,
    dryRun: preview,
    restored,
    refused,
    failed,
    items,
    removedDirs,
    complete: refused === 0 && failed === 0,
  };
}

/**
 * G-R5. Refuse rather than clobber. Returns a plain-English reason, or null
 * when the item can safely go back.
 */
function checkRestorable(
  from: string,
  to: string,
  size: number,
  plannedMtimeMs: number,
  sha?: string,
): string | null {
  let st;
  try {
    st = lstatSync(from);
  } catch {
    return "it isn't where I put it any more";
  }
  if (st.isSymbolicLink()) return "what's there now is a shortcut, not the file I moved";
  if (!st.isFile()) return "what's there now isn't an ordinary file";
  if (size && st.size !== size) return "MODIFIED SINCE — you've changed that file, so I left it alone";

  // A hard link and a verified copy both preserve the modification time exactly,
  // so any drift beyond tolerance is HIS edit and his edit is not ours to clobber.
  // Tolerance is widened for a synced root because OneDrive touches mtime — and
  // the card says so rather than relaxing it quietly.
  const root = roster.list().find((r) => contains(r.real, from) || contains(r.trashReal, from));
  const tol = root?.synced ? MTIME_TOL_SYNCED_MS : MTIME_TOL_MS;
  if (plannedMtimeMs && Math.abs(st.mtimeMs - plannedMtimeMs) > tol) {
    return "MODIFIED SINCE — you've changed that file, so I left it alone";
  }

  if (sha) {
    try {
      if (sha256Of(from) !== sha) return "MODIFIED SINCE — you've changed that file, so I left it alone";
    } catch {
      return "I can't read that file to check it hasn't changed";
    }
  }

  // The original spot must be free. This is advisory only — atomicMove's
  // reservation is what actually stops an overwrite.
  try {
    lstatSync(to);
    return "ORIGINAL SPOT TAKEN";
  } catch {
    /* free, which is what we want */
  }

  // Containment, re-asserted on both ends. An undo is still a write.
  const roots = roster.list();
  const fromOk = roots.some((r) => contains(r.real, from) || contains(r.trashReal, from));
  const toOk = roots.some((r) => contains(r.real, to));
  if (!fromOk || !toOk) return "that one is outside your folders now — I won't touch it";

  const parent = path.dirname(to);
  try {
    const real = realpathSync.native(parent);
    if (!roots.some((r) => contains(r.real, real) || r.real.toLowerCase() === real.toLowerCase())) {
      return "the folder it came from resolves outside your roots now";
    }
  } catch {
    return "the folder it came from isn't there any more";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Time-ranged undo (G-R8)
// ---------------------------------------------------------------------------

export function undoSince(iso: string, preview = false): UndoResult[] {
  const since = Date.parse(iso);
  if (Number.isNaN(since)) return [];
  const recs = journal
    .batches(500)
    .filter((b) => !b.dryRun && Date.parse(b.at) >= since && b.moved > 0 && !b.undone)
    .sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first
  return recs.map((b) => undoBatch(b.batchId, preview));
}

/** Roll back exactly the items a half-landed batch moved. (G-C14, PART-1) */
export function rollback(batchId: string): UndoResult {
  return undoBatch(batchId, false);
}
