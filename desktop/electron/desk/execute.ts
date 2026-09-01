// DESK — THE EXECUTOR. The only module in this repo allowed to import a
// filesystem primitive that changes his disk.
//
// The whole vocabulary is: mkdirSync(recursive), linkSync, openSync(...,"wx"),
// copyFileSync, unlinkSync OF A SOURCE WHOSE VERIFIED COPY ALREADY EXISTS AT
// THE DESTINATION, and rmdirSync (undo only, empty dirs only).
//
// `existsSync` + `renameSync` DOES NOT APPEAR HERE, and must never be added.
// libuv's uv_fs_rename is MoveFileExW(..., MOVEFILE_REPLACE_EXISTING) and it
// silently destroys an existing destination on Windows. Verified on this
// machine — see the harness, LOSS-1. A check-then-act pair around a
// destructive primitive is not a never-overwrite guarantee; it is a race.
//
// Overwrite is impossible here by CONSTRUCTION:
//   same volume, unsynced destination -> linkSync(src,dst) throws EEXIST
//                                        atomically. No TOCTOU window exists.
//   destination inside a sync root     -> openSync(dst,"wx") reserves the name
//                                        atomically, then copy + verify SHA-256
//                                        + size, and only then unlink the src.
//
// Owning stream: DESK/S1.

import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { attrsFor } from "./attrs.js";
import { checkBatch, checkBatchShape, checkDestChain, type GuardIo } from "./guard.js";
import * as journal from "./journal.js";
import * as roster from "./roster.js";
import { sanitise } from "./sanitise.js";
import type {
  BatchVerdict,
  DeskOutcome,
  DeskProgress,
  DeskRoot,
  FileBatchPayload,
  ItemOutcome,
  JournalPlanLine,
} from "./types.js";

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

interface Job {
  jobId: string;
  batchId: string;
  cancelled: boolean;
  done: number;
  total: number;
  outcome: DeskOutcome | null;
}

const jobs = new Map<string, Job>();
let emit: (e: DeskProgress) => void = () => {};
let deskId = "";
let trashCeilingBytes = 20 * 1024 * 1024 * 1024;
let harnessCheck: () => boolean = () => false;
/** G-V1 at the gate. Configured with everything else so realIo always carries it. */
let neverList: string[] = [];

export function configure(opts: {
  emit: (e: DeskProgress) => void;
  deskId: string;
  trashCeilingBytes: number;
  neverList: string[];
  isHarness: () => boolean;
}): void {
  emit = opts.emit;
  deskId = opts.deskId;
  trashCeilingBytes = opts.trashCeilingBytes;
  neverList = opts.neverList;
  harnessCheck = opts.isHarness;
}

export function cancel(jobId: string): { ok: boolean } {
  const j = jobs.get(jobId);
  if (!j) return { ok: false };
  j.cancelled = true;
  return { ok: true };
}

/** Stops everything between ops. The tray kill switch and the hotkey call this. */
export function killAll(): number {
  let n = 0;
  for (const j of jobs.values()) {
    if (!j.outcome) {
      j.cancelled = true;
      n += 1;
    }
  }
  return n;
}

export function jobOutcome(jobId: string): DeskOutcome | null {
  return jobs.get(jobId)?.outcome ?? null;
}

// ---------------------------------------------------------------------------
// The real GuardIo — the binding one
// ---------------------------------------------------------------------------

export function realIo(binding: boolean, attrCache?: Map<string, number | null>): GuardIo {
  const cache = attrCache ?? new Map<string, number | null>();
  return {
    lstat(abs) {
      try {
        const s = lstatSync(abs);
        return {
          isFile: s.isFile(),
          isDirectory: s.isDirectory(),
          isSymbolicLink: s.isSymbolicLink(),
          size: s.size,
          mtimeMs: s.mtimeMs,
          dev: s.dev,
        };
      } catch {
        return null;
      }
    },
    realpath(abs) {
      try {
        return realpathSync.native(abs);
      } catch {
        return null;
      }
    },
    exists(abs) {
      try {
        lstatSync(abs);
        return true;
      } catch {
        return false;
      }
    },
    attr(abs) {
      const k = abs.toLowerCase();
      if (cache.has(k)) return cache.get(k) ?? null;
      const m = attrsFor([abs]);
      const v = m.get(k) ?? null;
      cache.set(k, v);
      return v;
    },
    free: (abs) => roster.freeSpace(abs),
    trashBytes(root: DeskRoot) {
      const v = roster.views().find((x) => x.label === root.label);
      return v?.trashBytes ?? 0;
    },
    canOpenExclusive(abs) {
      let fd: number | null = null;
      try {
        fd = openSync(abs, "r+");
        return true;
      } catch {
        return false;
      } finally {
        if (fd !== null) {
          try {
            closeSync(fd);
          } catch {
            /* already closed */
          }
        }
      }
    },
    siblings(dir) {
      try {
        return readdirSync(dir);
      } catch {
        return [];
      }
    },
    neverList,
    userDataDir: roster.userDataDir(),
    now: Date.now(),
    trashCeilingBytes,
    binding,
  };
}

/**
 * Batching the attribute reads. One PowerShell call for every path the guard
 * is going to ask about, instead of one per path. Called before checkBatch.
 */
export function warmAttrs(payload: FileBatchPayload, roots: DeskRoot[]): Map<string, number | null> {
  const want = new Set<string>();
  for (const m of payload.moves) {
    const fr = roots.find((r) => r.label === m.fromRoot);
    const tr = roots.find((r) => r.label === m.toRoot);
    if (fr && typeof m.fromRel === "string" && !path.isAbsolute(m.fromRel)) {
      const segs = m.fromRel.split(/[\\/]/).filter(Boolean);
      if (segs.length && !segs.some((s) => s === "." || s === "..")) {
        want.add(path.join(fr.real, ...segs));
      }
    }
    const destRootReal = payload.op === "stage" ? fr?.trashReal : tr?.real;
    if (destRootReal && typeof m.toRel === "string" && !path.isAbsolute(m.toRel)) {
      const segs = m.toRel.split(/[\\/]/).filter(Boolean);
      let cur = destRootReal;
      for (const s of segs) {
        if (s === "." || s === "..") break;
        cur = path.join(cur, s);
        want.add(cur);
      }
    }
    if (fr) want.add(fr.trashReal);
  }
  const list = [...want];
  const got = attrsFor(list);
  const cache = new Map<string, number | null>();
  for (const p of list) cache.set(p.toLowerCase(), got.get(p.toLowerCase()) ?? null);
  return cache;
}

// ---------------------------------------------------------------------------
// The atomic move — the one place a file changes place
// ---------------------------------------------------------------------------

export type MoveResult =
  | { kind: "moved"; sha256?: string }
  | { kind: "collision" }
  | { kind: "gone" }
  | { kind: "failed"; code: string; why: string };

function sha256Of(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function codeOf(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) return String((err as { code: unknown }).code);
  return "EUNKNOWN";
}

function humanCode(code: string): string {
  switch (code) {
    case "EPERM":
    case "EACCES":
      return "Windows blocked that one";
    case "EBUSY":
      return "another program has that file open";
    case "ENOENT":
      return "that one's gone";
    case "EEXIST":
      return "there's already a file with that name there";
    case "EXDEV":
      return "that's on a different drive — I don't move across drives yet";
    case "ENOSPC":
      return "that drive is full";
    default:
      return `Windows returned ${code}`;
  }
}

/**
 * Move one file. `syncedDest` picks the reservation primitive.
 *
 * Both paths reserve the destination name ATOMICALLY and fail loudly on a
 * collision. Neither can overwrite. The source is only unlinked once the
 * destination provably holds the same bytes.
 */
export function atomicMove(src: string, dst: string, syncedDest: boolean): MoveResult {
  if (!syncedDest) {
    // linkSync makes a second name for the SAME data. It throws EEXIST
    // atomically when the destination name is taken — there is no window
    // between the check and the act because there is no check.
    try {
      linkSync(src, dst);
    } catch (err) {
      const code = codeOf(err);
      if (code === "EEXIST") return { kind: "collision" };
      if (code === "ENOENT") return { kind: "gone" };
      return { kind: "failed", code, why: humanCode(code) };
    }
    // The data is now reachable from two names. Dropping the old name is the
    // move. If we die here the reconciler reports TWO COPIES, CHECK BOTH —
    // never `moved`. (G-R2)
    try {
      unlinkSync(src);
    } catch (err) {
      const code = codeOf(err);
      return { kind: "failed", code, why: `${humanCode(code)} — the copy at the destination is good, the original is still there` };
    }
    return { kind: "moved" };
  }

  // A hard link inside a sync root confuses the sync client, so a synced
  // destination reserves the NAME with an exclusive create and then copies.
  let fd: number;
  try {
    fd = openSync(dst, "wx");
  } catch (err) {
    const code = codeOf(err);
    if (code === "EEXIST") return { kind: "collision" };
    return { kind: "failed", code, why: humanCode(code) };
  }
  try {
    closeSync(fd);
  } catch {
    /* the reservation exists; the descriptor does not matter */
  }
  let srcSha: string;
  let srcSize: number;
  try {
    srcSha = sha256Of(src);
    srcSize = statSync(src).size;
  } catch (err) {
    const code = codeOf(err);
    try {
      unlinkSync(dst); // our own zero-byte reservation, never his file
    } catch {
      /* leave it; it is empty and named exactly where he approved */
    }
    if (code === "ENOENT") return { kind: "gone" };
    return { kind: "failed", code, why: humanCode(code) };
  }
  try {
    copyFileSync(src, dst);
    const gotSize = statSync(dst).size;
    const gotSha = sha256Of(dst);
    if (gotSize !== srcSize || gotSha !== srcSha) {
      try {
        unlinkSync(dst); // a bad copy WE made, at a name WE reserved
      } catch {
        /* nothing further to do; the original is untouched */
      }
      return { kind: "failed", code: "EVERIFY", why: "the copy didn't match the original, so I left the original alone" };
    }
  } catch (err) {
    const code = codeOf(err);
    try {
      unlinkSync(dst);
    } catch {
      /* our reservation */
    }
    return { kind: "failed", code, why: humanCode(code) };
  }
  try {
    unlinkSync(src);
  } catch (err) {
    const code = codeOf(err);
    return { kind: "failed", code, why: `${humanCode(code)} — the copy is good, the original is still there` };
  }
  return { kind: "moved", sha256: srcSha };
}

// ---------------------------------------------------------------------------
// startBatch
// ---------------------------------------------------------------------------

export interface StartResult {
  ok: boolean;
  jobId?: string;
  refusal?: string;
  rule?: string;
}

/**
 * Returns a jobId in microseconds. The batch runs on its own and reports on the
 * progress channel. The IPC handler NEVER blocks on a 50-file move. (G-C15)
 */
export function startBatch(payload: FileBatchPayload, approvedHash: string, computedHash: string): StartResult {
  // ---- G-A3: the executor never runs under a harness. FIRST LINE. ----------
  if (harnessCheck()) {
    const seam = roster.scratchSeamOk();
    if (!seam.ok) {
      return { ok: false, rule: "G-A3", refusal: `refused: a harness is driving this launch (${seam.why})` };
    }
    // The seam is only honoured when every enrolled root lives inside a
    // directory under the OS temp tree. It cannot reach anything of his.
  }

  // ---- G-C3: the payload arrived twice. Compare the two deliveries. --------
  if (!approvedHash || !computedHash || approvedHash !== computedHash) {
    const line: JournalPlanLine = {
      t: "plan",
      at: new Date().toISOString(),
      batchId: String(payload?.batchId ?? "unknown"),
      jobId: `refused-${randomUUID()}`,
      deskId,
      op: payload?.op ?? "move",
      dryRun: payload?.dryRun !== false,
      hash: `${approvedHash} != ${computedHash}`,
      intent: "HASH MISMATCH — REFUSED",
      roots: roster.snapshot(),
      items: [],
    };
    try {
      journal.writePlan(line);
    } catch {
      /* the refusal still stands even if the journal write fails */
    }
    return {
      ok: false,
      rule: "G-C3",
      refusal:
        "the plan I was handed doesn't match the plan you approved. Nothing moved. Ask her to raise it again.",
    };
  }

  const roots = roster.list();

  // ---- the SYNCHRONOUS half: the checks that need no syscall at all --------
  // Everything below this point touches the disk, so it runs off the event
  // loop. The IPC handler must never block on a 50-file move. (G-C15/PART-3)
  const shape = checkBatchShape(payload, roots, deskId);
  if (!shape.ok) return { ok: false, rule: shape.rule, refusal: shape.why };

  const jobId = randomUUID();
  const job: Job = { jobId, batchId: payload.batchId, cancelled: false, done: 0, total: payload.moves.length, outcome: null };
  jobs.set(jobId, job);

  setImmediate(() => {
    void runBatch(job, payload, approvedHash).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      emit({
        jobId,
        batchId: payload.batchId,
        phase: "refused",
        done: job.done,
        total: job.total,
        dryRun: payload.dryRun === true,
        refusal: `the batch stopped on an unexpected error: ${msg}`,
      });
    });
  });

  return { ok: true, jobId };
}

/** Lets the event loop run between operations, so `cancel` is real. */
function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function runBatch(job: Job, payload: FileBatchPayload, approvedHash: string): Promise<void> {
  const roots = roster.list();
  const attrCache = warmAttrs(payload, roots);
  const io = realIo(true, attrCache);
  const verdict = checkBatch({ payload, roots, deskId, io });

  if (!verdict.ok) {
    job.outcome = null;
    jobs.delete(job.jobId);
    emit({
      jobId: job.jobId,
      batchId: payload.batchId,
      phase: "refused",
      done: 0,
      total: 0,
      dryRun: payload.dryRun,
      refusal: verdict.why,
    });
    return;
  }
  job.total = verdict.ops.length;

  // ---- G-R1: the PLAN LINE IS ON DISK AND FSYNC'D BEFORE THE FIRST BYTE ----
  const startedAt = new Date().toISOString();
  journal.writePlan({
    t: "plan",
    at: startedAt,
    batchId: payload.batchId,
    jobId: job.jobId,
    deskId,
    op: payload.op,
    dryRun: payload.dryRun,
    hash: approvedHash,
    intent: sanitise(String(payload.intent ?? "")).display,
    roots: roster.snapshot(),
    items: verdict.ops
      .filter((o) => o.disposition === "allow")
      .map((o) => ({
        idx: o.idx,
        fromAbs: o.fromAbs as string,
        toAbs: o.toAbs as string,
        size: o.size ?? 0,
        mtimeMs: payload.moves[o.idx]?.mtimeMs ?? 0,
      })),
  });

  // `started` is emitted AFTER the plan line is durable and BEFORE the first
  // operation, so a listener that sees this frame can rely on the record being
  // on disk already. That ordering is the whole point of G-R1.
  emit({ jobId: job.jobId, batchId: job.batchId, phase: "started", done: 0, total: job.total, dryRun: payload.dryRun });

  await runOps(job, payload, verdict, startedAt, approvedHash, attrCache);
}

async function runOps(
  job: Job,
  payload: FileBatchPayload,
  verdict: BatchVerdict,
  startedAt: string,
  approvedHash: string,
  attrCache: Map<string, number | null>,
): Promise<void> {
  const roots = roster.list();
  const items: ItemOutcome[] = [];
  const createdDirs: string[] = [];
  const checkedDestDirs = new Set<string>();
  let cancelledAtOp: number | undefined;

  for (const v of verdict.ops) {
    // Hand the event loop back between EVERY operation. Two things depend on
    // this and neither is optional: `cancel` (and therefore the tray kill
    // switch) can only take effect between ops, and a 50-file batch must not
    // freeze the window while it runs. (G-A6, G-C15)
    await yieldToLoop();
    if (job.cancelled) {
      cancelledAtOp = job.done;
      for (const rest of verdict.ops.slice(items.length)) {
        items.push({ idx: rest.idx, status: "cancelled", rule: "G-A6", why: "you stopped it" });
      }
      break;
    }
    if (v.disposition !== "allow") {
      items.push({
        idx: v.idx,
        status: v.disposition === "skip" ? "skipped" : "refused",
        rule: v.rule,
        why: v.why,
        fromAbs: v.fromAbs,
        toAbs: v.toAbs,
        size: v.size,
      });
      continue;
    }

    const src = v.fromAbs as string;
    const dst = v.toAbs as string;
    const fromRoot = roots.find((r) => r.label === payload.moves[v.idx]?.fromRoot) as DeskRoot;
    const toRoot = roots.find((r) => r.label === payload.moves[v.idx]?.toRoot) as DeskRoot;
    const containRoot = payload.op === "stage" ? fromRoot.trashReal : toRoot.real;
    const syncedDest = payload.op === "stage" ? false : toRoot.synced;
    const destDir = path.dirname(dst);

    // ---- DRY RUN: not one byte, and not one directory. (G-A5, T52) --------
    if (payload.dryRun) {
      items.push({
        idx: v.idx,
        status: "would-have-moved",
        rule: "",
        why: "",
        fromAbs: src,
        toAbs: dst,
        size: v.size,
      });
      job.done += 1;
      emit({ jobId: job.jobId, batchId: job.batchId, phase: "op", done: job.done, total: job.total, dryRun: true });
      continue;
    }

    // ---- create the destination directory ---------------------------------
    // Only directories WE create are recorded, so an undo can never remove a
    // folder he made himself, even an empty one.
    const wouldCreate = dirsCreatedUnder(containRoot, destDir).filter((d) => !safeExists(d));
    try {
      if (wouldCreate.length > 0) mkdirSync(destDir, { recursive: true });
    } catch (err) {
      const code = codeOf(err);
      items.push({ idx: v.idx, status: "failed", rule: "", why: humanCode(code), fromAbs: src, toAbs: dst, size: v.size });
      job.done += 1;
      emit({ jobId: job.jobId, batchId: job.batchId, phase: "op", done: job.done, total: job.total, dryRun: false });
      continue;
    }
    for (const d of wouldCreate) {
      if (!createdDirs.includes(d)) createdDirs.push(d);
    }

    // ---- G-P9: AFTER mkdir, IMMEDIATELY BEFORE THE WRITE -------------------
    // The directory that exists now is not necessarily the directory the
    // preflight looked at. A junction planted here is the documented CRITICAL
    // escape, so the chain is walked and realpath'd again, right here.
    if (!checkedDestDirs.has(destDir.toLowerCase())) {
      for (const k of [...attrCache.keys()]) {
        if (k.startsWith(containRoot.toLowerCase())) attrCache.delete(k);
      }
      const io2 = realIo(true, attrCache);
      const bad = checkDestChain(containRoot, dst, io2);
      if (bad) {
        items.push({ idx: v.idx, status: "refused", rule: bad.rule, why: bad.why, fromAbs: src, toAbs: dst, size: v.size });
        job.done += 1;
        emit({ jobId: job.jobId, batchId: job.batchId, phase: "op", done: job.done, total: job.total, dryRun: false });
        continue;
      }
      checkedDestDirs.add(destDir.toLowerCase());
    }

    // ---- re-verify the source one last time -------------------------------
    const io3 = realIo(true, attrCache);
    const stNow = io3.lstat(src);
    if (!stNow) {
      items.push({ idx: v.idx, status: "skipped", rule: "G-T2", why: "that one's gone since she looked", fromAbs: src, toAbs: dst });
      job.done += 1;
      emit({ jobId: job.jobId, batchId: job.batchId, phase: "op", done: job.done, total: job.total, dryRun: false });
      continue;
    }
    if (stNow.isSymbolicLink || !stNow.isFile) {
      items.push({ idx: v.idx, status: "refused", rule: "G-P10", why: "that isn't an ordinary file any more", fromAbs: src, toAbs: dst });
      job.done += 1;
      emit({ jobId: job.jobId, batchId: job.batchId, phase: "op", done: job.done, total: job.total, dryRun: false });
      continue;
    }

    // ---- THE MOVE ---------------------------------------------------------
    const r = atomicMove(src, dst, syncedDest);
    const status: ItemOutcome["status"] =
      r.kind === "moved" ? "moved" : r.kind === "collision" ? "skipped" : r.kind === "gone" ? "skipped" : "failed";
    const why =
      r.kind === "moved"
        ? ""
        : r.kind === "collision"
          ? "there's already a file with that name there"
          : r.kind === "gone"
            ? "that one's gone since she looked"
            : r.why;
    const item: ItemOutcome = {
      idx: v.idx,
      status,
      rule: r.kind === "collision" ? "G-D6" : r.kind === "gone" ? "G-T2" : "",
      why,
      fromAbs: src,
      toAbs: dst,
      size: v.size,
      ...(r.kind === "moved" && r.sha256 ? { sha256: r.sha256 } : {}),
    };
    items.push(item);

    journal.writeOp({
      t: "op",
      at: new Date().toISOString(),
      batchId: payload.batchId,
      jobId: job.jobId,
      idx: v.idx,
      status,
      rule: item.rule,
      why,
      fromAbs: src,
      toAbs: dst,
      size: v.size ?? 0,
      ...(item.sha256 ? { sha256: item.sha256 } : {}),
    });

    job.done += 1;
    emit({ jobId: job.jobId, batchId: job.batchId, phase: "op", done: job.done, total: job.total, dryRun: false });
  }

  // Dry-run ops are journalled in one pass so the log panel has the full plan.
  if (payload.dryRun) {
    for (const it of items) {
      journal.writeOp({
        t: "op",
        at: new Date().toISOString(),
        batchId: payload.batchId,
        jobId: job.jobId,
        idx: it.idx,
        status: it.status,
        rule: it.rule,
        why: it.why,
        fromAbs: it.fromAbs ?? "",
        toAbs: it.toAbs ?? "",
        size: it.size ?? 0,
      });
    }
  }

  const outcome = finish(job, payload, startedAt, items, createdDirs, approvedHash, cancelledAtOp);
  emit({
    jobId: job.jobId,
    batchId: job.batchId,
    phase: "done",
    done: job.done,
    total: job.total,
    dryRun: payload.dryRun,
    outcome,
  });
}

function finish(
  job: Job,
  payload: FileBatchPayload,
  startedAt: string,
  items: ItemOutcome[],
  createdDirs: string[],
  approvedHash: string,
  cancelledAtOp: number | undefined,
): DeskOutcome {
  const moved = items.filter((i) => i.status === "moved" || i.status === "would-have-moved").length;
  const skipped = items.filter((i) => i.status === "skipped").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const refused = items.filter((i) => i.status === "refused").length;
  const bytes = items
    .filter((i) => i.status === "moved" || i.status === "would-have-moved")
    .reduce((n, i) => n + (i.size ?? 0), 0);

  // G-C13 — an all-EPERM batch is ONE actionable refusal, not N errnos.
  const failures = items.filter((i) => i.status === "failed");
  const allBlocked =
    failures.length > 0 &&
    failures.length === items.filter((i) => i.status !== "skipped").length &&
    failures.every((f) => f.why.startsWith("Windows blocked"));
  const massRefusal = allBlocked
    ? "Windows blocked every one of these. That's Controlled Folder Access: Settings -> Privacy & security -> " +
      "Windows Security -> Virus & threat protection -> Ransomware protection -> Allow an app through " +
      "Controlled folder access. Nothing moved."
    : undefined;

  // G-C14 — a >30% partial failure flips the card's DEFAULT action to rollback.
  const attempted = moved + failed;
  const rollbackRecommended = !payload.dryRun && moved > 0 && attempted > 0 && failed / attempted > 0.3;

  const outcome: DeskOutcome = {
    ok: true,
    batchId: payload.batchId,
    jobId: job.jobId,
    dryRun: payload.dryRun,
    verb: payload.dryRun ? "WOULD HAVE MOVED" : "MOVED",
    moved,
    skipped,
    failed,
    refused,
    bytes,
    items,
    createdDirs,
    rollbackRecommended,
    ...(massRefusal ? { massRefusal } : {}),
    ...(cancelledAtOp !== undefined ? { cancelledAtOp } : {}),
    startedAt,
    finishedAt: new Date().toISOString(),
    hashPrefix: approvedHash.slice(0, 8),
  };

  journal.writeResult({
    t: "result",
    at: outcome.finishedAt,
    batchId: payload.batchId,
    jobId: job.jobId,
    dryRun: payload.dryRun,
    moved,
    skipped,
    failed,
    refused,
    bytes,
    createdDirs,
    ...(cancelledAtOp !== undefined ? { cancelledAtOp } : {}),
  });

  job.outcome = outcome;
  return outcome;
}

function safeExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Every directory between `root` (exclusive) and `leaf` (inclusive), deepest last. */
function dirsCreatedUnder(root: string, leaf: string): string[] {
  const rel = path.relative(root, leaf);
  if (!rel || rel.startsWith("..")) return [];
  const segs = rel.split(/[\\/]/).filter(Boolean);
  const out: string[] = [];
  let cur = root;
  for (const s of segs) {
    cur = path.join(cur, s);
    out.push(cur);
  }
  return out;
}
