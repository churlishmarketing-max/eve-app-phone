// DESK — the wire contract for filing hands.
//
// Lives in src/shared so BOTH the main process and the renderer type against
// exactly one definition. Nothing here executes, and nothing here lets a
// renderer express a file operation — see electron/desk/index.ts.
//
// Owning stream: DESK/S1 (new file; contract.ts imports one line from it).
export const DESK_PROTOCOL = 1;

/** The only three verbs that exist. There is no delete. (G-D1) */
export type DeskOp = "move" | "rename" | "stage";

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

/** What lands in userData/config.json under `deskRoots`. */
export interface DeskRootConfig {
  label: string;
  path: string;
  dryRun: boolean;
  synced: boolean;
  trash: string;
}

/** A root after enrollment probing — the live in-memory record. */
export interface DeskRoot extends DeskRootConfig {
  /** realpathSync.native of `path`. Every containment test measures against THIS. */
  real: string;
  /** realpathSync.native of `trash`. */
  trashReal: string;
  /** Volume id (fs.Stats.dev) of the root. Cross-volume ops are refused. (G-D9) */
  dev: number;
  attrSweepOk: boolean;
  writeProbeOk: boolean;
}

export interface DeskRootProbe {
  ok: boolean;
  /** Present on failure — plain English, shown verbatim to King. */
  refusal?: string;
  label?: string;
  path?: string;
  real?: string;
  trash?: string;
  synced?: boolean;
  sameVolume?: boolean;
  writeProbeOk?: boolean;
  attrSweepOk?: boolean;
}

/** The renderer's view of a root. Absolute paths appear here and nowhere on the wire. */
export interface DeskRootView {
  label: string;
  path: string;
  real: string;
  trash: string;
  dryRun: boolean;
  synced: boolean;
  attrSweepOk: boolean;
  writeProbeOk: boolean;
  sameVolume: boolean;
  freeOnVolume: number;
  trashFiles: number;
  trashBytes: number;
  /** Set when the root failed a probe and is refused rather than silently dropped. */
  refusal?: string;
}

// ---------------------------------------------------------------------------
// The payload — minted by the brain, hashed, carded, executed
// ---------------------------------------------------------------------------

export interface FileMove {
  /** Index into the pack this plan was minted from. Provenance only. */
  i: number;
  fromRoot: string;
  fromRel: string;
  toRoot: string;
  toRel: string;
  size: number;
  mtimeMs: number;
  /** Sanitiser flags: "" | "~" altered | "L" reparse | "U" unsettled | "P" placeholder */
  f?: string;
}

export interface FileBatchPayload {
  protocol: number;
  batchId: string;
  deskId: string;
  indexRev?: string;
  op: DeskOp;
  /** Stamped AT MINT TIME. The executor refuses on disagreement, never picks a winner. (G-A4/PART-5) */
  dryRun: boolean;
  intent: string;
  count: number;
  bytes: number;
  distinctDests?: number;
  newFolders?: string[];
  extensions?: string[];
  crossesSyncBoundary?: boolean;
  sanitisedNames?: number;
  moves: FileMove[];
}

// ---------------------------------------------------------------------------
// Guard verdicts
// ---------------------------------------------------------------------------

export type OpDisposition = "allow" | "refuse" | "skip";

export interface OpVerdict {
  idx: number;
  disposition: OpDisposition;
  /** Stable rule id from §5 — "G-P9", "G-D7", … Empty for an allow. */
  rule: string;
  /** Plain English, shown to King verbatim. Never an errno. */
  why: string;
  /** Absolute source path — main process only, never on the wire to the brain. */
  fromAbs?: string;
  toAbs?: string;
  size?: number;
  /** True when the sanitiser altered the display form of either name. */
  altered?: boolean;
}

export interface BatchVerdict {
  ok: boolean;
  /** Batch-level refusal. When set, NOTHING runs regardless of per-op verdicts. */
  rule?: string;
  why?: string;
  ops: OpVerdict[];
  allowCount: number;
  skipCount: number;
  refuseCount: number;
  bytesAllowed: number;
  dryRun: boolean;
  /** Distinct destination directories, absolute. Used by execute for the mkdir set. */
  destDirs: string[];
}

// ---------------------------------------------------------------------------
// Preflight / outcome / progress
// ---------------------------------------------------------------------------

export interface PreflightRow {
  idx: number;
  /** Sanitised display name. Never the raw bytes. */
  name: string;
  /** Escaped codepoints, for the card's SEE IT RAW disclosure. */
  raw?: string;
  altered: boolean;
  toRel: string;
  size: number;
  status: "will-move" | "gone" | "collision" | "changed" | "refused";
  why: string;
  rule: string;
}

export interface DeskPreflight {
  ok: boolean;
  error?: string;
  batchId: string;
  hashPrefix: string;
  dryRun: boolean;
  plannedCount: number;
  verifiedCount: number;
  verifiedBytes: number;
  rows: PreflightRow[];
  newFolders: string[];
  extensions: string[];
  distinctDests: number;
  crossesSyncBoundary: boolean;
  /** Set when the whole batch is refused. The card renders the list and locks APPROVE. */
  refusal?: string;
  refusalRule?: string;
  /**
   * FALSE when the plan was minted against an index revision this machine no
   * longer holds, so its sources could not be resolved by id and were re-stated
   * from the payload instead. Every containment rule still binds; the card says
   * RE-CHECKED rather than implying a provenance it does not have. (G-C9)
   */
  idResolved?: boolean;
  checkedAt: string;
}

export type ItemStatus =
  | "moved"
  | "would-have-moved"
  | "skipped"
  | "failed"
  | "refused"
  | "cancelled";

export interface ItemOutcome {
  idx: number;
  status: ItemStatus;
  rule: string;
  why: string;
  fromAbs?: string;
  toAbs?: string;
  size?: number;
  sha256?: string;
}

export interface DeskOutcome {
  ok: boolean;
  batchId: string;
  jobId: string;
  dryRun: boolean;
  /** Past tense ONLY when dryRun === false. (G-A5) */
  verb: "MOVED" | "WOULD HAVE MOVED";
  moved: number;
  skipped: number;
  failed: number;
  refused: number;
  bytes: number;
  items: ItemOutcome[];
  createdDirs: string[];
  /** Set when >30% of a non-empty plan failed — the card's default flips to rollback. (G-C14) */
  rollbackRecommended: boolean;
  /** One actionable line when every failure was EPERM. (G-C13) */
  massRefusal?: string;
  cancelledAtOp?: number;
  startedAt: string;
  finishedAt: string;
  hashPrefix: string;
}

export interface DeskProgress {
  jobId: string;
  batchId: string;
  phase: "started" | "op" | "done" | "refused";
  done: number;
  total: number;
  dryRun: boolean;
  outcome?: DeskOutcome;
  refusal?: string;
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export interface JournalRootSnapshot {
  label: string;
  real: string;
  trashReal: string;
  dev: number;
}

export interface JournalPlanLine {
  t: "plan";
  at: string;
  batchId: string;
  jobId: string;
  deskId: string;
  op: DeskOp;
  dryRun: boolean;
  hash: string;
  intent: string;
  roots: JournalRootSnapshot[];
  items: { idx: number; fromAbs: string; toAbs: string; size: number; mtimeMs: number }[];
}

export interface JournalOpLine {
  t: "op";
  at: string;
  batchId: string;
  jobId: string;
  idx: number;
  status: ItemStatus;
  rule: string;
  why: string;
  fromAbs: string;
  toAbs: string;
  size: number;
  sha256?: string;
}

export interface JournalResultLine {
  t: "result";
  at: string;
  batchId: string;
  jobId: string;
  dryRun: boolean;
  moved: number;
  skipped: number;
  failed: number;
  refused: number;
  bytes: number;
  createdDirs: string[];
  cancelledAtOp?: number;
}

export interface JournalUndoLine {
  t: "undo";
  at: string;
  batchId: string;
  undoId: string;
  restored: number;
  refused: number;
  failed: number;
  items: { idx: number; status: "restored" | "refused" | "failed"; why: string }[];
  removedDirs: string[];
}

export interface JournalReconcileLine {
  t: "reconcile";
  at: string;
  batchId: string;
  jobId: string;
  reason: "interrupted";
  items: {
    idx: number;
    state: "reconciled-moved" | "reconciled-untouched" | "AMBIGUOUS" | "reconciled-unknown";
    note: string;
  }[];
}

export type JournalLine =
  | JournalPlanLine
  | JournalOpLine
  | JournalResultLine
  | JournalUndoLine
  | JournalReconcileLine;

/** What the log panel renders. Absolute paths only on expand, main-process sourced. */
export interface DeskBatchRecord {
  batchId: string;
  jobId: string;
  at: string;
  op: DeskOp;
  dryRun: boolean;
  intent: string;
  hashPrefix: string;
  moved: number;
  skipped: number;
  failed: number;
  refused: number;
  bytes: number;
  undone: boolean;
  interrupted: boolean;
  items: { idx: number; fromAbs: string; toAbs: string; status: ItemStatus; why: string }[];
}

/** The five-summary tail that rides `lastBatches` to the brain. No paths, no names. (G-R10) */
export interface DeskBatchSummary {
  batchId: string;
  at: string;
  op: DeskOp;
  dryRun: boolean;
  moved: number;
  skipped: number;
  failed: number;
  undone: boolean;
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

export interface DeskUndoItem {
  idx: number;
  status: "restored" | "refused" | "failed";
  why: string;
  fromAbs: string;
  toAbs: string;
}

export interface DeskUndoResult {
  ok: boolean;
  batchId: string;
  undoId: string;
  /** True for a PREVIEW — the dry-run pass that UNDO EVERYTHING SINCE shows first. */
  dryRun: boolean;
  restored: number;
  refused: number;
  failed: number;
  items: DeskUndoItem[];
  removedDirs: string[];
  refusal?: string;
  /** True when every item that could come back has come back. */
  complete: boolean;
}

// ---------------------------------------------------------------------------
// Config additions (hop 0). All defaulted, so an existing config.json upgrades
// silently and filing hands stay OFF until he turns them on.
// ---------------------------------------------------------------------------

export interface DeskConfigFields {
  deskEnabled: boolean;
  deskId: string;
  deskRoots: DeskRootConfig[];
  deskNeverList: string[];
  deskMaxIndex: number;
  deskTrashCeilingBytes: number;
}

/**
 * What `arm()` and `kill()` hand back. `killAccel` is the accelerator that
 * ACTUALLY bound in main — never the one the spec wished for. `Ctrl+Shift+Esc`
 * is Windows Task Manager and `globalShortcut.register` returns false for it on
 * every install, so main falls back and reports what really took. A stop that
 * silently fails to bind is not a stop, and a Settings screen printing a key
 * that does nothing is the same defect one layer up.
 *
 * ADDED BY DESK/S3 (renderer stream). The master switch and the kill switch are
 * both renderer-visible state changes that had no channel to reach them, and a
 * filing feature that cannot be turned on or stopped from the screen is not a
 * shippable feature. Purely additive; nothing above this line changed.
 */
export interface DeskArmResult {
  ok: boolean;
  /** The live value of `deskEnabled` AFTER the call. */
  enabled: boolean;
  killAccel: string | null;
  /** kill() only — in-flight batches aborted between operations. */
  stopped?: number;
  error?: string;
}

/** The narrow, typed IPC surface the renderer gets. There is no desk.move(). */
export interface DeskBridge {
  /**
   * THE MASTER SWITCH. Off until he turns it on, after the disclosure screen.
   * `arm(true)` writes `deskEnabled:true` and re-probes every root; `arm(false)`
   * is a clean disarm that does NOT abort a running batch — that is `kill()`.
   */
  arm(on: boolean): Promise<DeskArmResult>;
  /**
   * THE STOP (G-A6). Disarms AND aborts every in-flight batch between
   * operations. The tray item and the global hotkey land on the same function.
   */
  kill(): Promise<DeskArmResult>;
  roots(): Promise<DeskRootView[]>;
  /** The ONLY channel that takes an absolute path, and only one main itself produced. */
  enroll(): Promise<DeskRootProbe>;
  setRoot(label: string, patch: { dryRun?: boolean; remove?: true }): Promise<{ ok: boolean; error?: string }>;
  preflight(payload: FileBatchPayload): Promise<DeskPreflight>;
  cancel(jobId: string): Promise<{ ok: boolean }>;
  undo(batchId: string): Promise<DeskUndoResult>;
  previewUndo(batchId: string): Promise<DeskUndoResult>;
  undoSince(iso: string, preview?: boolean): Promise<DeskUndoResult[]>;
  log(limit?: number): Promise<DeskBatchRecord[]>;
  status(): Promise<DeskStatus>;
  outcome(jobId: string): Promise<DeskOutcome | null>;
  onProgress(cb: (e: DeskProgress) => void): () => void;
}

export interface DeskStatus {
  enabled: boolean;
  ready: boolean;
  attrSweepOk: boolean;
  deskId: string;
  journalPath: string;
  rootCount: number;
  refusedRoots: { label: string; path: string; refusal: string }[];
  lastRefusal: string;
  /**
   * DESK/S3 additions, both filled in by main (not by the desk module):
   * the accelerator that actually bound, and the never-list as it is on disk.
   * Settings prints the real key rather than the spec'd one, and shows the
   * rules that are actually applied rather than the documented defaults.
   */
  killAccel?: string | null;
  neverList?: string[];
}

// ---------------------------------------------------------------------------
// THE PACK — the desk briefing that rides ONE /chat turn and dies with it.
// (FILE-MARSHAL-SPEC hop 2 / §3.2)
//
// These shapes must stay byte-compatible with `brain/src/desk.ts`'s
// `deskFromBody` validator. That validator is HARD: a wrong protocol, a missing
// census, a duplicate index id, `attrSweepOk !== true`, or a body over 256 KB
// all produce `null` on the brain, and the whole feature is simply ABSENT for
// that turn — she is told so by the tool, in words, never by silence.
//
// The division of trust in this file is the whole design:
//
//   DeskRootCensus  — counts, bytes, class tallies, labels HE typed. NOT ONE
//                     FILENAME. This is what lands in <context_pack>, the
//                     high-trust region the brain introduces as "your private
//                     briefing". (G-I1 / INJ-1)
//   DeskEntry       — carries `n`, a SANITISED filename. It reaches the model
//                     only through a `desk_scan` tool result wrapped in the
//                     <untrusted_filenames> envelope, on a turn where she asked.
//                     (G-I4 / G-V4)
//
// Getting those two backwards is the CRITICAL injection finding this whole
// design exists to prevent.
//
// Owning stream: DESK/S2.
// ---------------------------------------------------------------------------

/** One indexed file. `i` is the ONLY way she can name a source. (G-P1) */
export interface DeskEntry {
  i: number;
  /** Root label. */
  r: string;
  /** Sanitised root-relative directory, "" at the root. */
  d: string;
  /** SANITISED filename. Untrusted third-party text. Never in the census. */
  n: string;
  kb: number;
  ageD: number;
  cls: string;
  /** "<size>:<mtimeMs>" — the TOCTOU stamp. (G-T1) */
  st: string;
  /** "" | "~" altered | "L" reparse | "U" unsettled | "P" placeholder */
  f: string;
}

/** Per-root census. Numbers the desktop measured and labels King typed. Nothing else. */
export interface DeskRootCensus {
  label: string;
  files: number;
  bytes: number;
  dirs: number;
  synced: boolean;
  dryRun: boolean;
  arrivedToday: number;
  olderThan90d: number;
  byClass: Record<string, number>;
  bytesByClass: Record<string, number>;
  hiddenByRule: number;
  withheldAsInstruction: number;
  unsettled: number;
  indexed: number;
  coverage: number;
  trash: { files: number; bytes: number; freeOnVolume: number };
}

export interface DeskPack {
  protocol: 1;
  deskId: string;
  at: string;
  /** false is not a value the pack ships with — a false sweep withholds the pack. (G-A1) */
  attrSweepOk: boolean;
  limits: { maxBatch: number; maxScanRows: number; maxScanCalls: number; maxIndex: number };
  census: { roots: DeskRootCensus[] };
  index: { rev: string; entries: DeskEntry[]; truncated: boolean; omitted: number };
  lastBatches: DeskBatchSummary[];
}

/**
 * Why `pack()` returned null. Rendered on screen — the feature never fails
 * silently. (§3.8)
 *
 * It is ALSO the wire shape the desktop puts in the `desk` slot of a /chat body
 * when there is no pack to send. `pack: null` is the discriminator: the brain's
 * `deskFromBody` rejects it (no protocol), and `deskRefusalFromBody` picks it up
 * and hands the tools the REAL reason. Sending nothing at all is what left her
 * guessing at a cause and telling King to "try from the desktop app" while he
 * was standing in it.
 */
export interface PackRefusal {
  pack: null;
  why: string;
  /** A short banner key the deck renders: OFF, NO_ROOTS, ATTR, OVERSIZE, NOT_READY. */
  code: "OFF" | "NO_ROOTS" | "ATTR" | "OVERSIZE" | "NOT_READY";
  /**
   * Root LABELS this refusal is about — folders King named in his own config,
   * never a path and never a filename. Empty for a refusal that is about the
   * whole desk (OFF, or nothing enrolled at all); populated when one named root
   * failed its probe or its attribute sweep, so she can say WHICH folder.
   */
  roots?: string[];
}
