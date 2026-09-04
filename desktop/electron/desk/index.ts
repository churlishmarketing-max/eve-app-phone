// DESK — the façade `main.ts` imports. Everything the rest of the app is
// allowed to know about filing hands is on this object.
//
// Note what is NOT here: there is no `desk.move(...)`, no `desk.delete(...)`,
// no `desk.emptyTrash(...)`. The renderer cannot express a file operation. The
// only path to a rename starts with a brain-minted, hash-bound confirm that
// main itself resolved against the brain, and the only renderer-triggerable
// mutation is an undo, which can only restore state King already had.
//
// Owning stream: DESK/S1.

import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import path from "node:path";
import * as attrs from "./attrs.js";
import * as digest from "./digest.js";
import * as execute from "./execute.js";
import * as indexStore from "./index-store.js";
import * as journal from "./journal.js";
import * as projects from "./projects.js";
import * as roster from "./roster.js";
import * as undoMod from "./undo.js";
import { checkBatch } from "./guard.js";
import { sanitise } from "./sanitise.js";
import { DESK_PROTOCOL } from "./types.js";
import type {
  DeskBatchRecord,
  DeskBatchSummary,
  DeskOutcome,
  DeskPack,
  DeskPreflight,
  DeskProgress,
  DeskRootConfig,
  DeskRootProbe,
  DeskRootView,
  DeskMoveWire,
  DeskWhereAnswer,
  DeskWhereHit,
  FileBatchPayload,
  ItemStatus,
  PackRefusal,
  PreflightRow,
} from "./types.js";

export * from "./types.js";
export { sanitise, looksLikeInstruction, escapeCodepoints, foldPath } from "./sanitise.js";
export { checkBatch, checkRel, checkDestChain } from "./guard.js";
// G-P13 / G-P15 and the narrowed G-A1 are all mechanisms rather than opinions,
// so they are exported for the harness to drive directly. A rule the test can
// only reach through six layers is a rule nobody checks.
export { deniedHit, deniedRoots, expandShort, hasShortName, SHORT_NAME_SEG } from "./roster.js";
export { __setSweepImpl } from "./attrs.js";
export { atomicMove } from "./execute.js";
export * as journal from "./journal.js";
export * as roster from "./roster.js";
export * as attrs from "./attrs.js";
export * as undo from "./undo.js";
export * as indexStore from "./index-store.js";
export * as digest from "./digest.js";
export * as projects from "./projects.js";

// ---------------------------------------------------------------------------
// Module state — small, explicit, and OFF by default
// ---------------------------------------------------------------------------

interface DeskState {
  enabled: boolean;
  deskId: string;
  userDataDir: string;
  trashCeilingBytes: number;
  ready: boolean;
  lastRefusal: string;
  neverList: string[];
  maxIndex: number;
  eyeOn: boolean;
  /** Set when the last pack() was withheld, and why. The deck renders it. (§3.8) */
  lastPackRefusal: string;
  /**
   * The same refusal, machine-readable. The prose above is for HIS screen; this
   * is what rides to the brain in the pack slot so her tools can name the actual
   * cause instead of guessing at one. "" means the last pack() shipped.
   */
  lastPackRefusalCode: PackRefusal["code"] | "";
  /** Root LABELS the refusal is about. Never a path, never a filename. */
  lastPackRefusalRoots: string[];
  lastPackNote: string;
}

const state: DeskState = {
  enabled: false,
  deskId: "",
  userDataDir: "",
  trashCeilingBytes: 20 * 1024 * 1024 * 1024,
  ready: false,
  lastRefusal: "",
  neverList: [],
  maxIndex: digest.MAX_INDEX,
  eyeOn: false,
  lastPackRefusal: "",
  lastPackRefusalCode: "",
  lastPackRefusalRoots: [],
  lastPackNote: "",
};

export interface InitOptions {
  userDataDir: string;
  deskId: string;
  /** OFF until he turns it on, after the disclosure screen. Ships disabled. */
  deskEnabled: boolean;
  deskRoots: DeskRootConfig[];
  deskTrashCeilingBytes?: number;
  /** The never-list. Defaults non-empty in config.ts; matches are counted, never named. (G-V1) */
  deskNeverList?: string[];
  /** Hard ceiling on entries in one pack. (G-I5) */
  deskMaxIndex?: number;
  emit: (e: DeskProgress) => void;
  isHarness: () => boolean;
  /**
   * The eye is opt-in for a harness. The executor suite drives payloads it
   * mints itself and must not have a background walk racing its fixtures; the
   * real app always passes true.
   */
  startEye?: boolean;
}

export interface InitReport {
  ok: boolean;
  enabled: boolean;
  journalPath: string;
  roots: DeskRootProbe[];
  reconciled: { batches: number; ambiguous: number };
  refusal?: string;
}

export function init(opts: InitOptions): InitReport {
  state.userDataDir = opts.userDataDir;
  state.deskId = opts.deskId;
  state.trashCeilingBytes = opts.deskTrashCeilingBytes ?? state.trashCeilingBytes;
  state.enabled = opts.deskEnabled === true;
  state.neverList = opts.deskNeverList ?? [];
  state.maxIndex = Math.min(opts.deskMaxIndex ?? digest.MAX_INDEX, digest.MAX_INDEX);
  state.eyeOn = opts.startEye === true;

  const journalPath = journal.init(opts.userDataDir);
  const probes = roster.init(opts.userDataDir, state.enabled ? opts.deskRoots : []);
  execute.configure({
    emit: opts.emit,
    deskId: opts.deskId,
    trashCeilingBytes: state.trashCeilingBytes,
    neverList: state.neverList,
    isHarness: opts.isHarness,
  });

  // THE EYE. Configured always so a later arm() needs no second wiring, but it
  // only WALKS when filing is armed and there is at least one root that
  // survived its probes. A disarmed desk holds no index of his folders at all.
  projects.configure({ rootsOf: () => roster.list(), neverList: state.neverList });
  indexStore.configure({
    userDataDir: opts.userDataDir,
    neverList: state.neverList,
    maxIndex: state.maxIndex,
    rootsOf: () => roster.list(),
    onSweep: (label, ok) => roster.noteSweep(label, ok),
    // THE PROJECT-LINK INDEX RIDES THE EYE'S BEAT. Not a second watcher and not
    // a second timer: the same 800 ms watch debounce and the same 10-minute
    // reconcile that keep the file index fresh keep this fresh, so there is one
    // answer to "when did you last look" and not two that can disagree.
    onChange: () => {
      projects.rebuild();
    },
  });
  syncEye();

  // Boot reconcile runs whether or not filing is armed: an interrupted batch
  // from a previous session must be classified before anything else happens.
  const rec = journal.reconcile();
  journal.rotateIfNeeded();
  state.ready = true;

  return {
    ok: true,
    enabled: state.enabled,
    journalPath,
    roots: probes,
    reconciled: { batches: rec.batches, ambiguous: rec.ambiguous },
  };
}

export function isEnabled(): boolean {
  return state.enabled && state.ready;
}

export function deskId(): string {
  return state.deskId;
}

/** True only when EVERY armed root can read Windows attributes. (G-A1) */
export function attrSweepOk(): boolean {
  const rs = roster.list();
  return rs.length > 0 && rs.every((r) => r.attrSweepOk);
}

/**
 * G-A1, NARROWED. True when at least one armed root can read Windows
 * attributes.
 *
 * The refusal itself is untouched and still absolute: a root whose sweep failed
 * contributes no census and no entries, and `checkBatchShape` refuses any plan
 * that so much as names it. What changed is the BLAST RADIUS. `pack()` used to
 * be withheld entirely unless every root swept, so one unreadable folder —
 * a OneDrive root mid-resync, a PowerShell call that timed out — took her eyes
 * off the other folders too, and the deck said only that filing was paused.
 * Refusing where it should not is a failure mode of its own, and the audit
 * named it: the healthy roots stay visible, the sick one is dropped by name.
 */
export function anyAttrSweepOk(): boolean {
  return roster.list().some((r) => r.attrSweepOk);
}

// ---------------------------------------------------------------------------
// THE EYE — lifecycle, the pack, and how an index id comes home
// ---------------------------------------------------------------------------

/** Starts the walk when armed with roots; drops the whole index when not. */
function syncEye(): void {
  const shouldWatch = state.enabled && roster.list().length > 0;
  if (!shouldWatch) {
    indexStore.clear();
    // A disarmed desk holds no index of his folders AND no map of his edits.
    projects.clear();
    return;
  }
  if (state.eyeOn) indexStore.start();
  else indexStore.rebuild(); // a harness gets one deterministic walk, no watchers
}

/** The deck's focus handler. A refresh only if the snapshot has gone stale. */
export function noteFocus(): void {
  if (isEnabled()) indexStore.noteFocus();
}

/** Force one walk now. Settings uses it after an enroll so the panel is not stale. */
export function rebuildIndex(): void {
  if (isEnabled()) indexStore.rebuild();
}

/**
 * THE PACK. Built fresh for one /chat turn and never stored anywhere: there is
 * no brain-side cache and no endpoint to forge one into. Returns null — and
 * SAYS WHY on `packRefusal()` — whenever it must not be sent. (§3.8)
 *
 * The three refusals that matter:
 *   OFF   — he hasn't turned filing on. The tools answer "I can't see any
 *           folders from here", which is the truth.
 *   ATTR  — the Windows attribute sweep failed, so every attribute rule would
 *           silently pass. A rule that cannot fail is not a rule. (G-A1)
 *   NO_ROOTS / NOT_READY — nothing enrolled, or the eye has not walked yet.
 */
export function pack(): DeskPack | null {
  state.lastPackNote = "";
  if (!state.enabled) {
    return withhold("OFF", "OFF — you haven't turned filing hands on.");
  }
  if (!state.ready) {
    return withhold("NOT_READY", "STARTING UP — the desk hasn't finished booting yet.");
  }
  if (roster.list().length === 0) {
    // Two different worlds wear the same "no roots" hat and he cannot act on
    // them the same way. Nothing enrolled at all is a setup step he never took;
    // roots that were enrolled and then REFUSED at probe are folders he already
    // named, which are now missing, denied, or on a drive that isn't there. The
    // second case names them, because "add a folder" is useless advice for it.
    const refused = roster.refusedRoots().map((r) => r.label);
    return refused.length > 0
      ? withhold(
          "NO_ROOTS",
          `NO FOLDERS — nothing survived enrollment: ${refused.join(", ")} could not be opened.`,
          refused,
        )
      : withhold("NO_ROOTS", "NO FOLDERS — nothing is enrolled, so there is nothing for her to see.");
  }
  if (!anyAttrSweepOk()) {
    return withhold(
      "ATTR",
      "FILING HANDS PAUSED — I CAN'T READ WINDOWS FILE ATTRIBUTES RIGHT NOW, SO I CAN'T TELL A SHORTCUT FROM A FILE.",
      roster.list().filter((r) => !r.attrSweepOk).map((r) => r.label),
    );
  }
  const snap = indexStore.snapshot() ?? indexStore.rebuild();
  if (!snap) {
    return withhold(
      "NOT_READY",
      `I haven't finished looking at your folders yet${indexStore.error() ? ` — ${indexStore.error()}` : ""}.`,
    );
  }
  const built = digest.buildPack({
    deskId: state.deskId,
    roots: roster.list(),
    snap,
    trashOf: (r) => roster.trashUsageFor(r),
    lastBatches: journal.summaries(5),
    // WHERE DID IT GO, on her side. Always supplied when a pack ships, even
    // when it is empty — an empty array is "the journal is empty", a missing
    // key is "this desktop sent no history at all", and she has a different
    // sentence for each.
    moves: moves(),
    maxIndex: state.maxIndex,
  });
  if (!built.pack) {
    return withhold("NO_ROOTS", "NO FOLDERS — nothing survived enrollment, so there is nothing for her to see.");
  }
  state.lastPackRefusal = "";
  state.lastPackRefusalCode = "";
  state.lastPackRefusalRoots = [];
  state.lastPackNote = built.note ?? "";
  return built.pack;
}

/** Records a withheld pack in both registers at once and returns null. */
function withhold(code: PackRefusal["code"], why: string, roots: string[] = []): null {
  state.lastPackRefusal = why;
  state.lastPackRefusalCode = code;
  // 12 is the census ceiling on the far shore; a longer list is a bug, not a
  // briefing, and it is truncated here rather than argued about there.
  state.lastPackRefusalRoots = roots.slice(0, 12).map((r) => r.slice(0, 64));
  return null;
}

/** Plain English for the deck when `pack()` returned null. Never silence. (§3.8) */
export function packRefusal(): string {
  return state.lastPackRefusal;
}

/**
 * THE REFUSAL, ON THE WIRE. What `main.ts` puts in the `desk` slot of a /chat
 * body when `pack()` returned null.
 *
 * This exists because of a real failure: King typed "sort my desk-test folder"
 * INTO THE DESKTOP APP with filing never armed, the desktop sent no desk field
 * at all, and the brain — having been told nothing — guessed at the cause and
 * told him to try from the desktop app he was already standing in. Absence is
 * not a reason. This is the reason.
 *
 * Returns null only when the last `pack()` actually shipped a pack, so a caller
 * can never send a stale refusal alongside a live briefing.
 */
export function packRefusalObject(): PackRefusal | null {
  if (!state.lastPackRefusalCode) return null;
  return {
    pack: null,
    why: state.lastPackRefusal,
    code: state.lastPackRefusalCode,
    ...(state.lastPackRefusalRoots.length ? { roots: [...state.lastPackRefusalRoots] } : {}),
  };
}

/** Set when the pack shipped but the index had to be dropped for size. (G-I9) */
export function packNote(): string {
  return state.lastPackNote;
}

// ---------------------------------------------------------------------------
// Source resolution — G-P1, and the reason desk_scan is worth anything
// ---------------------------------------------------------------------------

export interface SourceResolution {
  ok: boolean;
  rule?: string;
  why?: string;
  /**
   * The payload the GUARD sees. Byte-identical to the one that arrived except
   * that every `fromRel` has been replaced with the real path the index id
   * points at. The HASH is always computed over the ORIGINAL, so this rewrite
   * cannot change what King approved — it only decides which file that approval
   * refers to. (G-C3 stays intact.)
   */
  payload: FileBatchPayload;
  /**
   * False when the plan was minted against an index revision this machine no
   * longer holds. Nothing is refused for it — every containment rule still
   * binds — but the card says RE-CHECKED rather than pretending. (G-C9)
   */
  resolved: boolean;
}

/**
 * A brain-minted plan names its sources by index id and by nothing else. This
 * turns those ids back into paths, and it is the only thing that does.
 *
 * The wire carries a SANITISED name. A name the sanitiser altered — a run of
 * two spaces, a zero-width joiner, ninety-nine characters — does not exist on
 * disk under the string she was shown, so a plan that trusted `fromRel` would
 * simply fail to find his file. Worse, a plan that INVENTED a `fromRel` would
 * find one she was never shown. Resolving by id fixes both: the id is the only
 * handle, and an id that is not in the revision is refused outright.
 */
export function resolveSources(payload: FileBatchPayload): SourceResolution {
  const rev = typeof payload?.indexRev === "string" ? payload.indexRev : "";
  const moves = Array.isArray(payload?.moves) ? payload.moves : [];

  // G-C9 — an index revision we no longer hold is not a refusal. The plan is
  // re-checked against the live disk by the guard, which never trusted the
  // payload's paths in the first place: containment, realpath, the denied set
  // and the reparse walk all still run on whatever string arrived.
  if (!indexStore.hasRev(rev)) {
    return { ok: true, payload, resolved: false };
  }

  const out = moves.map((m) => ({ ...m }));
  for (let k = 0; k < out.length; k += 1) {
    const m = out[k];
    const hit = indexStore.resolve(rev, m.i);
    if (!hit) {
      return {
        ok: false,
        rule: "G-P1",
        why:
          `row ${k + 1} points at #${m.i} and that isn't in the index this plan was made from. ` +
          "I only move files she was actually shown.",
        payload,
        resolved: true,
      };
    }
    if (hit.root !== m.fromRoot) {
      return {
        ok: false,
        rule: "G-P1",
        why: `row ${k + 1} says #${m.i} is in "${sanitise(String(m.fromRoot)).display}" and it isn't.`,
        payload,
        resolved: true,
      };
    }
    // The name on the wire must be the sanitised projection of the real one.
    // If it is not, the row was authored rather than referenced.
    if (hit.wireRel !== m.fromRel) {
      return {
        ok: false,
        rule: "G-P1",
        why:
          `row ${k + 1} names a file that doesn't match #${m.i}. She can point at a file by its number; ` +
          "she can't type its path.",
        payload,
        resolved: true,
      };
    }
    m.fromRel = hit.rel;
  }
  return { ok: true, payload: { ...payload, moves: out }, resolved: true };
}

// ---------------------------------------------------------------------------
// The hash — the same canonicaliser the brain uses (§3.1a)
// ---------------------------------------------------------------------------

/**
 * `JSON.stringify(value, replacerArray)` applies the replacer at EVERY depth,
 * so a payload's `moves` array canonicalises to `[{},{},…]` and the hash covers
 * not one single path. This is the recursive canonicaliser that fixes it, and
 * it must stay byte-identical to the brain's or every confirm fails. (CARD-1)
 */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

/** 128 bits, not 64. (G-C2) */
export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(canonical(payload)).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

export function roots(): DeskRootView[] {
  return roster.views();
}

export function enroll(dirPath: string, label: string, trashPath?: string): DeskRootProbe {
  return roster.probe(dirPath, label, trashPath);
}

// ---------------------------------------------------------------------------
// Preflight — read-only, and the card renders VERIFIED numbers, never planned
// ---------------------------------------------------------------------------

export function preflight(payload: FileBatchPayload): DeskPreflight {
  const checkedAt = new Date().toISOString();
  const bad = (error: string): DeskPreflight => ({
    ok: false,
    error,
    batchId: String(payload?.batchId ?? ""),
    hashPrefix: "",
    dryRun: true,
    plannedCount: Array.isArray(payload?.moves) ? payload.moves.length : 0,
    verifiedCount: 0,
    verifiedBytes: 0,
    rows: [],
    newFolders: [],
    extensions: [],
    distinctDests: 0,
    crossesSyncBoundary: false,
    checkedAt,
  });

  if (!isEnabled()) return bad("filing hands are off");
  // G-A1, narrowed: the blanket gate asks whether ANY root is readable, and
  // `checkBatchShape` then refuses per root for the roots this plan actually
  // names. A bad "desktop" no longer refuses a batch that only touches
  // "downloads", and a batch that touches the bad one still refuses with G-A1
  // and says which folder.
  if (!anyAttrSweepOk()) {
    return bad("I can't read Windows file attributes on any of your folders right now, so I can't tell a shortcut from a file");
  }
  if (!payload || payload.protocol !== DESK_PROTOCOL) return bad("that plan isn't one I understand");

  // Index ids become paths BEFORE the guard runs. The hash is taken over the
  // payload that arrived, not the resolved one, so this cannot alter what he
  // is being asked to approve. (G-P1)
  const res = resolveSources(payload);
  const hashPrefix = payloadHash(payload).slice(0, 8);
  if (!res.ok) {
    return { ...bad(res.why ?? "that plan doesn't resolve"), hashPrefix, refusal: res.why, refusalRule: res.rule };
  }
  const resolved = res.payload;

  const rs = roster.list();
  const attrCache = execute.warmAttrs(resolved, rs);
  // G-T4b — the project map, read at PREFLIGHT TIME rather than baked into a
  // snapshot minted minutes ago. It is the debounce-refreshed cache the eye
  // keeps, not a fresh parse of every project on every card: re-inflating
  // hundreds of megabytes of XML while he waits on a confirm would be its own
  // defect. This is the same freshness contract the file index itself has.
  const pmap = projects.map();
  const io = { ...execute.realIo(false, attrCache), projectRef: (abs: string) => projects.lookup(pmap, abs) };
  const verdict = checkBatch({ payload: resolved, roots: rs, deskId: state.deskId, io });

  const rows: PreflightRow[] = verdict.ops.map((v) => {
    const m = resolved.moves[v.idx];
    const raw = m ? path.basename(m.fromRel.replace(/[\\/]+$/, "")) : "";
    const s = sanitise(raw);
    const status: PreflightRow["status"] =
      v.disposition === "allow"
        ? "will-move"
        : v.rule === "G-T2"
          ? "gone"
          : v.rule === "G-D6"
            ? "collision"
            : v.rule === "G-T1" || v.rule === "G-T3" || v.rule === "G-T5"
              ? "changed"
              : "refused";
    return {
      idx: v.idx,
      name: s.display,
      ...(s.altered ? { raw: s.raw } : {}),
      altered: s.altered,
      toRel: m?.toRel ?? "",
      size: v.size ?? m?.size ?? 0,
      status,
      why: v.why,
      rule: v.rule,
      ...(v.projectRef ? { projectRef: { project: v.projectRef.project } } : {}),
    };
  });

  const destDirsRel = new Set<string>();
  const newFolders = new Set<string>();
  const exts = new Set<string>();
  let crosses = false;
  for (const v of verdict.ops) {
    const m = resolved.moves[v.idx];
    if (!m) continue;
    exts.add(path.extname(m.fromRel).toLowerCase() || "(none)");
    const toRoot = rs.find((r) => r.label === m.toRoot);
    const fromRoot = rs.find((r) => r.label === m.fromRoot);
    if (toRoot && fromRoot && toRoot.synced !== fromRoot.synced) crosses = true;
    if (v.toAbs) {
      const dir = path.dirname(v.toAbs);
      destDirsRel.add(dir);
      if (!io.exists(dir)) {
        newFolders.add(
          `${payload.op === "stage" ? `${m.fromRoot} trash` : m.toRoot}${path.sep}${path.relative(
            payload.op === "stage" ? (fromRoot?.trashReal ?? "") : (toRoot?.real ?? ""),
            dir,
          )}`,
        );
      }
    }
  }

  return {
    ok: true,
    batchId: payload.batchId,
    hashPrefix,
    dryRun: payload.dryRun,
    plannedCount: payload.moves.length,
    verifiedCount: verdict.allowCount,
    verifiedBytes: verdict.bytesAllowed,
    rows,
    newFolders: [...newFolders],
    extensions: [...exts].sort(),
    distinctDests: destDirsRel.size,
    crossesSyncBoundary: crosses,
    ...(verdict.ok ? {} : { refusal: verdict.why, refusalRule: verdict.rule }),
    idResolved: res.resolved,
    // G-T4b, all three of them together. The count drives the summary line; the
    // UNKNOWN flag makes the card say what it does not know instead of printing
    // nothing and letting nothing read as safety; the sentence names what was
    // and was not read. A zero count with `projectRefUnknown:true` is a
    // completely different card from a zero count without it, and it must be.
    projectReferencedCount: rows.filter((r) => r.projectRef).length,
    projectRefUnknown: projects.isUnknown(pmap),
    projectCoverage: projects.coverage(pmap),
    checkedAt,
  };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * The payload arrives TWICE — once over SSE with the card, once in the HTTP
 * response to the approve. `approvedHash` is what the card showed him and what
 * he echoed. The hash recomputed here is over the payload we are about to run.
 * If those two disagree, nothing moves. (G-C3 / CARD-1c)
 */
export function startBatch(payload: FileBatchPayload, approvedHash: string): execute.StartResult {
  if (!isEnabled()) return { ok: false, rule: "G-A-OFF", refusal: "filing hands are off" };
  // As at preflight: the blanket gate is ANY, and the per-root refusal inside
  // the guard is the one that binds. (G-A1, narrowed)
  if (!anyAttrSweepOk()) {
    return {
      ok: false,
      rule: "G-A1",
      refusal: "I can't read Windows file attributes on any of your folders right now, so I can't tell a shortcut from a file",
    };
  }
  // The hash is over the payload AS IT ARRIVED — the one he approved. Source
  // resolution happens after, and only decides which real file each index id
  // refers to; it can never change the batch King said yes to. (G-C3 + G-P1)
  const computed = payloadHash(payload);
  const res = resolveSources(payload);
  if (!res.ok) return { ok: false, rule: res.rule ?? "G-P1", refusal: res.why ?? "that plan doesn't resolve" };
  return execute.startBatch(res.payload, approvedHash, computed);
}

export function cancel(jobId: string): { ok: boolean } {
  return execute.cancel(jobId);
}

export function outcome(jobId: string): DeskOutcome | null {
  return execute.jobOutcome(jobId);
}

/** The tray item and the global hotkey. Disarms, and aborts between ops. (G-A6) */
export function kill(): { stopped: number; wasEnabled: boolean } {
  const wasEnabled = state.enabled;
  state.enabled = false;
  const stopped = execute.killAll();
  // The stop stops the EYE too. A killed desk is not still walking his folders
  // in the background, and there is no index left for a late confirm to resolve
  // an id against.
  indexStore.clear();
  return { stopped, wasEnabled };
}

export function arm(on: boolean, cfgRoots: DeskRootConfig[]): InitReport {
  state.enabled = on;
  const probes = roster.init(state.userDataDir, on ? cfgRoots : []);
  syncEye();
  return {
    ok: true,
    enabled: on,
    journalPath: journal.file(),
    roots: probes,
    reconciled: { batches: 0, ambiguous: 0 },
  };
}

// ---------------------------------------------------------------------------
// Undo, log
// ---------------------------------------------------------------------------

export function undoBatch(batchId: string): undoMod.UndoResult {
  return undoMod.undoBatch(batchId, false);
}

export function previewUndo(batchId: string): undoMod.UndoResult {
  return undoMod.undoBatch(batchId, true);
}

export function undoSince(iso: string, preview = false): undoMod.UndoResult[] {
  return undoMod.undoSince(iso, preview);
}

export function log(limit = 50): DeskBatchRecord[] {
  return journal.batches(limit);
}

// ---------------------------------------------------------------------------
// WHERE DID IT GO — one journal, two readers
//
// King's words: "if I do lose it, I should be able to just ask her and she's
// able to tell me where to find it and reconnect it."
//
// `moves()` below is HER reader: a bounded, most-recent slice with root labels
// and root-relative paths, which is exactly how every other row in the pack
// names a place. `whereIs()` is HIS reader: the whole local journal, absolute
// paths, and it works with the brain switched off.
//
// NEITHER OF THEM MOVES ANYTHING. `whereIs` resolves to a batch id and stops.
// Putting a file back is `undoBatch(batchId)` — the mover that already exists,
// triggered by him, from his screen. No new mover was written for this feature
// and the model still has no undo tool.
// ---------------------------------------------------------------------------

/** Rows that describe a file that actually went somewhere. A skip went nowhere. */
const MOVED_STATES = new Set<ItemStatus>(["moved", "would-have-moved"]);

/** Ceiling on the slice that rides the pack. Matches brain/src/desk.ts MAX_MOVES. */
export const MAX_WIRE_MOVES = 300;

interface Placed {
  label: string;
  rel: string;
}

/**
 * An absolute path -> the root label and the root-relative path, or null when
 * it is not under anything he enrolled. Null is the honest answer and the row
 * is DROPPED: putting an absolute path on the wire because we could not place
 * it would break G-R10 to avoid admitting a gap.
 */
function place(abs: string): Placed | null {
  if (typeof abs !== "string" || !abs) return null;
  for (const r of roster.list()) {
    if (roster.contains(r.trashReal, abs)) {
      const rel = path.relative(r.trashReal, abs);
      if (rel && !rel.startsWith("..")) return { label: "trash", rel: rel.split(path.sep).join("/") };
    }
    if (roster.contains(r.real, abs)) {
      const rel = path.relative(r.real, abs);
      if (rel && !rel.startsWith("..")) return { label: r.label, rel: rel.split(path.sep).join("/") };
    }
  }
  return null;
}

/** Is it sitting there right now? A real stat, never the journal replayed. */
function stillThere(abs: string): boolean | null {
  try {
    lstatSync(abs);
    return true;
  } catch (err) {
    // ENOENT is an answer: it is not there. Anything else — a permission
    // failure, a disconnected drive — is NOT an answer, and saying "gone" for
    // one of those would be a confident lie about his footage.
    const code = (err as NodeJS.ErrnoException)?.code;
    return code === "ENOENT" || code === "ENOTDIR" ? false : null;
  }
}

/**
 * THE SLICE THAT RIDES THE PACK. Newest first, capped, names-by-label only.
 *
 * `here` is a FRESH STAT taken right here, at pack-build time — not inferred
 * from the journal. A file she filed and something else then moved again must
 * come back as "not there any more", not as "still filed", and the only way to
 * know that is to look.
 */
export function moves(limit = MAX_WIRE_MOVES): DeskMoveWire[] {
  const out: DeskMoveWire[] = [];
  for (const b of journal.batches(200)) {
    for (const it of b.items) {
      if (out.length >= limit) return out;
      if (!MOVED_STATES.has(it.status)) continue;
      const from = place(it.fromAbs);
      const to = place(it.toAbs);
      if (!from || !to) continue;
      out.push({
        b: b.batchId,
        at: b.at,
        op: b.op,
        fr: from.label,
        fp: sanitise(from.rel).display,
        tr: to.label,
        tp: sanitise(to.rel).display,
        dry: b.dryRun,
        undone: b.undone,
        // A rehearsal never put a file there, so `here` for one is about the
        // SOURCE still being where it always was — but that is a different
        // claim wearing the same field name, and two claims in one field is
        // how a wire shape starts lying. A dry row reports `here:false` and
        // `dry:true`, and the brain's own copy says WOULD HAVE, never moved.
        here: b.dryRun ? false : stillThere(it.toAbs) === true,
      });
    }
  }
  return out;
}

/**
 * HIS reader. Case-insensitive, extension optional (he will type "C9452"), and
 * it matches the name at BOTH ends — the name it had and the name it has now,
 * because a rename batch changes one and not the other.
 *
 * Three things it deliberately does NOT do:
 *   · guess. No fuzzy match, no nearest neighbour, no "it's probably in".
 *   · pick a winner. A file moved twice returns both rows, newest first, with
 *     their timestamps, and he chooses.
 *   · re-walk the disk. It is bounded to what the journal recorded. A file
 *     something else moved afterwards is reported as NOT THERE with no record
 *     of where it went, which is the truth.
 */
export function whereIs(query: string, limit = 40): DeskWhereAnswer {
  const q = String(query ?? "").trim().toLowerCase();
  const empty: DeskWhereAnswer = { query: String(query ?? ""), hits: [], searched: 0, oldest: null, truncated: 0 };
  if (!q) return { ...empty, why: "say which file — a clip name is enough, with or without the extension" };
  if (q.length > 260) return { ...empty, why: "that's longer than any filename I could have written down" };

  const batches = journal.batches(500);
  let oldest: string | null = null;
  for (const b of batches) if (oldest === null || b.at < oldest) oldest = b.at;

  const matches = (abs: string): boolean => {
    const base = path.basename(String(abs ?? "")).toLowerCase();
    if (!base) return false;
    if (base === q) return true;
    // "C9452" must find "C9452.MP4". A bare stem match is exact-on-the-stem,
    // never a substring: "9452" does not find it, and neither does "C".
    const stem = base.slice(0, base.length - path.extname(base).length);
    if (stem === q) return true;
    return base.includes(q) && q.length >= 3;
  };

  const hits: DeskWhereHit[] = [];
  let truncated = 0;
  for (const b of batches) {
    for (const it of b.items) {
      if (!MOVED_STATES.has(it.status)) continue;
      if (!matches(it.fromAbs) && !matches(it.toAbs)) continue;
      if (hits.length >= limit) {
        truncated += 1;
        continue;
      }
      hits.push({
        batchId: b.batchId,
        jobId: b.jobId,
        at: b.at,
        op: b.op,
        fromAbs: it.fromAbs,
        toAbs: it.toAbs,
        status: it.status,
        size: 0,
        dryRun: b.dryRun,
        undone: b.undone,
        hereNow: b.dryRun ? null : stillThere(it.toAbs),
        // Exactly the conditions DeskLogPanel's own UNDO button uses. A button
        // that appears and then refuses is worse than no button.
        canUndo: !b.dryRun && b.moved > 0 && !b.undone,
        intent: b.intent,
      });
    }
  }
  hits.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { query: String(query ?? ""), hits, searched: batches.length, oldest, truncated };
}

/** Counts only, no paths and no names. This is the only thing that rides to the brain. (G-R10) */
export function lastBatches(limit = 5): DeskBatchSummary[] {
  return journal.summaries(limit);
}

/** Diagnostics for the Settings panel. Never leaves the machine. */
export function status(): {
  enabled: boolean;
  ready: boolean;
  attrSweepOk: boolean;
  deskId: string;
  journalPath: string;
  rootCount: number;
  refusedRoots: { label: string; path: string; refusal: string }[];
  lastRefusal: string;
  index: {
    live: boolean;
    rev: string;
    at: string;
    entries: number;
    truncated: boolean;
    omitted: number;
    ms: number;
    error: string;
    /** Withheld and hidden counts belong on HIS screen, never in her briefing. (G-I3) */
    withheldAsInstruction: number;
    hiddenByRule: number;
  };
  packRefusal: string;
  packNote: string;
} {
  const snap = indexStore.snapshot();
  return {
    enabled: state.enabled,
    ready: state.ready,
    attrSweepOk: attrSweepOk(),
    deskId: state.deskId,
    journalPath: journal.file(),
    rootCount: roster.list().length,
    refusedRoots: roster.refusedRoots(),
    lastRefusal: state.lastRefusal,
    index: {
      live: indexStore.isLive(),
      rev: snap?.rev ?? "",
      at: snap?.at ?? "",
      entries: snap?.entries.length ?? 0,
      truncated: snap?.truncated ?? false,
      omitted: snap?.omitted ?? 0,
      ms: snap?.ms ?? 0,
      error: indexStore.error(),
      withheldAsInstruction: (snap?.roots ?? []).reduce((n, r) => n + r.withheldAsInstruction, 0),
      hiddenByRule: (snap?.roots ?? []).reduce((n, r) => n + r.hiddenByRule, 0),
    },
    packRefusal: state.lastPackRefusal,
    packNote: state.lastPackNote,
  };
}

void attrs;
