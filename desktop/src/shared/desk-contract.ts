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

/**
 * STRUCTURAL PROVENANCE OF THE TURN THAT MINTED THIS PLAN.
 *
 * Stamped by the brain (brain/src/connectors.ts desk_file_plan) from a fact the
 * hard image validator established BEFORE the model generated a token, and it
 * rides INSIDE the hashed payload — so it cannot be stripped in transit without
 * the approve failing closed, and the model cannot set it, clear it, or argue
 * with it.
 *
 * It exists because of a5: a forged Slack screenshot wearing King's name talked
 * her into narrating "standing authorisation" and raising a real card whose
 * intent line quoted the picture. The prompt is the first defence; this is the
 * one that survives the prompt being talked around, because it puts the fact on
 * the card he actually approves from.
 *
 * ABSENT on an older brain. Absent means UNKNOWN, and the card says nothing —
 * it never says "no picture", because it does not know that.
 *
 * NAMES ONLY (2026-09-02): THE CURRENT BRAIN CANNOT MINT A CARD WITH A PICTURE
 * IN IT. desk_file_plan is refused outright for the whole life of any
 * conversation an image has been in, so every card it raises now carries
 * `{sawImage:false, imageTurnsAgo:null}` — I LOOKED AND FOUND NONE.
 *
 * THE FIELDS BELOW STAY, AND THE CARD STILL RENDERS THEM. They are no longer a
 * warning about a plan the brain allowed; they are a WITNESS that its gate ran.
 * A card reaching this screen stamped `sawImage:true` or with a distance on it
 * would mean that gate did not — which is a thing the card can say out loud,
 * and a field deleted for being unreachable could not.
 */
export interface TurnProvenance {
  /** True when the chat turn that produced this plan carried an image. */
  sawImage: boolean;
  /**
   * WHAT THE BRAIN'S DURABLE RECORD ACTUALLY SAID, AND WHERE THE ANSWER CAME
   * FROM (audit 5, B1).
   *
   * The two fields above it were a CONSTANT. Every card the current brain mints
   * carries `{sawImage:false, imageTurnsAgo:null}` because the gate refuses
   * before a payload can exist — which sounds like a witness and is worth
   * nothing, because it reads identically on a genuinely clean turn and on a
   * turn whose in-memory taint row had been evicted by a restart, a failed turn
   * or a ledger overflow. Those are the only two cases a witness is for, and it
   * could not tell them apart. Audit 5 drove exactly that: a real card, on a
   * conversation that had carried a picture, stamped "I looked and found none".
   *
   * This is a real observation instead. `status` is what
   * `conversations.saw_image` said this turn and `source` is how it was
   * answered — `row` (read from the durable row), `memory` (the picture is
   * still in her live session), `new` (no row AND no transcript: turn one of a
   * conversation that has never existed), `orphan` / `no-row` / `offline` /
   * `error` (it could not be answered at all).
   *
   * AUDIT 6, D6-B ADDED `new` AND `orphan`, AND THE SPLIT IS THE POINT. The
   * brain used to run `ensureConversation` BEFORE this read, so a conversation
   * whose row had been LOST was silently re-minted at sql/005's `not null
   * default false` and reported here as `clean` / `row` — a witness swearing it
   * had read a durable record about a row the reader had created a millisecond
   * earlier. The order is now read-then-mint, and the two no-row cases are told
   * apart by whether any of that conversation's transcript survives: `new`
   * (nothing survives — genuinely turn one, and it files, which is what the
   * fresh-thread button depends on) versus `orphan` (the record is gone and the
   * transcript is not — UNKNOWN, and it refuses).
   *
   * A CARD CANNOT EXIST UNLESS THIS SAYS "clean". The gate refuses on "tainted"
   * AND on "unknown", so anything else arriving here means the gate did not run
   * — which is a sentence this card can say out loud, and a silent field could
   * not.
   *
   * ABSENT on an older brain. Absent is not clean.
   */
  taint?: { status: "clean" | "tainted" | "unknown"; source: string };
  /**
   * HOW MANY TURNS BACK the most recent picture in this CONVERSATION was —
   * 0 for this very turn, n for n turns ago, `null` when there has been no
   * picture inside the brain's taint window (chat.ts IMAGE_TAINT_TURNS = 25).
   *
   * THE TURN IS THE WRONG UNIT (audit 2, b10/b10c). The launder puts the
   * picture on turn N and the plan on turn N+1, where `sawImage` is honestly
   * false — and a card stamped `{sawImage:false}` reads, per §v0.3.3, as
   * "I CHECKED, THERE WAS NO PICTURE". That stamp was actively WRONG about
   * where the plan came from. This field is what makes it right.
   *
   * ABSENT (`undefined`) on an older brain that never looked. `null` means
   * this brain looked and found none in the window. Absent is not `null`, and
   * neither of them is `false`. (§v0.4.2)
   */
  imageTurnsAgo?: number | null;
  /** One short sentence about the picture, e.g. "a PNG he attached to this
   *  message (412 KB)". Built from the brain's OWN measurements — the sniffed
   *  mime and the decoded byte count — never from anything the picture or the
   *  filename claimed. Absent when there was no picture ON THIS TURN — a
   *  picture two turns back leaves `imageTurnsAgo:2` and no note, because the
   *  brain describes only the bytes it validated this turn. */
  imageNote?: string;
  /**
   * A picture is in this SDK SESSION's transcript. v0.5.
   *
   * AUDIT 3 FOUND THE WINDOW LAPSING WHILE THE PIXELS DID NOT. The brain used
   * to expire the taint after 25 turns and then send `imageTurnsAgo: null`,
   * which §v0.4.2 defined as "I looked and there was no picture" — but chat.ts
   * keeps its session map with no expiry and passes `resume:`, so at turn 27
   * the screenshot was still in her context and the card printed nothing at all.
   *
   * This flag is true for the LIFE OF THE SESSION that carried the picture, and
   * the brain clears it in exactly one place: where it drops the SDK session.
   * It is the field to gate a banner on. Absent on an older brain.
   */
  imageSeen?: boolean;
  /**
   * The distance is past the brain's freshness threshold (25 turns). v0.5.
   *
   * It DEGRADES the banner and it gates nothing — none of the brain's refusals
   * soften with it. It exists so a picture 400 turns back reads as "a long way
   * back, and still in her context" rather than as "one turn ago" or, worse, as
   * nothing at all.
   */
  imageExpired?: boolean;
}

/**
 * WHICH ROWS SHE ADDED — d10c, the passenger.
 *
 * Stamped by the brain INSIDE THE HASHED PAYLOAD, and only while a picture is
 * in the session. d10c: his tax return and his passport scan rode into a
 * footage folder inside a batch of camera clips, because WHERE a batch goes was
 * graded and WHAT is in it never was. Six rows were names she read off the
 * picture; two were names she chose herself, and nothing anywhere said so.
 *
 * A batch is NOT wrong for holding a file he did not name — "file the rest of
 * that shoot too" is a normal thing to want. What was wrong was the SILENCE. So
 * this is information, the card prints it in gold above the fold, and APPROVE
 * stays enabled.
 *
 * ABSENT when no picture is in the session (there is no read-off-it half to
 * contrast against) or on an older brain. Absent is silence, not "she added
 * nothing".
 *
 * NAMES ONLY (2026-09-02): THE CURRENT BRAIN NEVER SENDS THIS. It was only ever
 * stamped while a picture was in the session, and a picture in the session can
 * no longer produce a card. The passenger problem it existed for is answered
 * earlier and harder now: the batch he approves is built on a turn with no
 * picture in it, from names he carried in as CHIPS BESIDE his composer —
 * countable, individually deletable, and read by him before sending.
 *
 * THE CARD STILL RENDERS IT if it ever arrives, for the same reason the turn
 * stamp above survives: this process does not take the brain's word for
 * anything, and a payload that turns up carrying this is a payload worth
 * showing him in full.
 */
export interface NameProvenance {
  /** Source basenames the READER pass could read in the picture. */
  fromPicture: string[];
  /** Source basenames in NEITHER the picture NOR his typed message. */
  added: string[];
}

/**
 * DID THE DESTINATION COME OUT OF HIS MOUTH?
 *
 * Computed by the DESKTOP (electron/api.ts destinationCheck) by comparing the
 * plan's destination folders against the message King actually typed on that
 * turn. It is deliberately not something the brain reports and not something
 * the model self-declares: a5/a3/a9 are exactly the case where the turn is
 * compromised, and a compromised turn cannot be trusted to grade itself.
 *
 * It rides on `PendingConfirm`, OUTSIDE the hashed payload, because it is
 * stamped after the hash was minted and must never change it.
 *
 * ABSENT when the desktop has no typed message for that confirm (a card
 * rehydrated from `/state` in a session that never saw the turn), or when the
 * op composes its own destination (`stage` -> his trash). Absent is silence,
 * not a clean bill of health.
 */
/**
 * v0.5 — THIS IS NO LONGER LOAD-BEARING, AND THAT IS DELIBERATE.
 *
 * Audit 3 killed the brain-side twin of this grade outright: a destination test
 * built on whether the words appear in his message tries to infer AUTHORSHIP
 * from STRING OVERLAP, and a picture can write the string. A QUESTION grounds
 * as well as an order ("what's this note about the Clients Northwind thing"),
 * and a bare root label grounds a mass move ("sort my downloads into projects").
 *
 * The brain now refuses on a different and answerable question — does the
 * destination occur IN THE PICTURE — and this grade was demoted rather than
 * deleted, because "you did not type that folder" is still a true and useful
 * thing to print above a batch of his files. It is a BANNER. It gates nothing,
 * it decides nothing, and no refusal anywhere depends on it.
 */
export interface DestinationCheck {
  /** Destinations whose deepest folder name appears in his typed message. */
  grounded: string[];
  /** Destinations that appear NOWHERE in his typed message. The card names
   *  these out loud. APPROVE stays enabled — this is information, not a
   *  refusal.
   *
   *  v0.5: the brain-side twin that REFUSED on this grade is deleted. It tried
   *  to infer authorship from string overlap, and a picture can write the
   *  string — a QUESTION grounded as well as an order. The brain now refuses on
   *  whether the destination occurs IN THE PICTURE. This line is a banner and
   *  only a banner. */
  ungrounded: string[];
  /**
   * NEW FILE STEMS he never typed, on rows whose basename changed. (H3)
   *
   * Folders were graded from the first build; renames were not, and a
   * rename-in-place produced `null` — total silence — because every row landed
   * where it started. That is a photograph renaming his whole desk with nothing
   * on the card to say so.
   *
   * ABSENT on a check computed by an older desktop. Absent is silence.
   */
  renamedUngrounded?: string[];
  /**
   * SHE SAID IT CAME FROM HIM AND IT DID NOT. (H4)
   *
   * Set by MAIN when the grade already found something ungrounded AND her own
   * `intent` line claims his authorship — "per your doc", "as you said", "the
   * destination he named". One regex, no trust in the model: she attributed the
   * picture's text to him on roughly half of audit-2 samples and the prompt law
   * did not stop her.
   *
   * Never set on a clean grade: possessives are ordinary prose on an honest
   * turn, and a banner that fires on honest turns is a banner he stops reading.
   */
  attributionSuspect?: boolean;
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
  /** See TurnProvenance. Inside the hash. Absent on an older brain. */
  provenance?: TurnProvenance;
  /** See NameProvenance. Inside the hash. Absent with no picture in the session. */
  nameProvenance?: NameProvenance;
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
  /**
   * G-T4b. Set on an ALLOW when a Premiere project somewhere in his enrolled
   * folders references this file. It changes no count and gates nothing — it
   * is the warning King asked for, not a refusal. Main-process origin, and the
   * project name is SANITISED before it gets here.
   */
  projectRef?: { project: string };
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
  /**
   * G-T4b — "USED BY <name>.prproj". A sanitised project FILENAME, nothing
   * more: no path out of the project, no clip list, no project content. The
   * card renders it gold and APPROVE stays enabled. (his decision 1)
   */
  projectRef?: { project: string };
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
  /** How many rows carry a `projectRef`. Drives the card's summary line. */
  projectReferencedCount?: number;
  /**
   * TRUE when the project map could not answer completely — a `.prproj` that
   * would not parse, a ceiling that bit, or no walk yet. The card must then say
   * SO, in words, instead of printing nothing: an absent warning that is really
   * an unread project reads as "not in an edit", and that is the one lie in
   * this feature that costs him footage. (projects.ts law 4)
   */
  projectRefUnknown?: boolean;
  /** One honest sentence about what was and was not read. Never "all clear". */
  projectCoverage?: string;
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

// ---------------------------------------------------------------------------
// WHERE DID IT GO — the journal lookup
//
// King's words: "if I do lose it, I should be able to just ask her and she's
// able to tell me where to find it and reconnect it."
//
// There are two readers of the same journal and they are deliberately not the
// same surface. SHE reads a bounded, most-recent slice that rides the pack
// (`DeskMoveWire` below) — root labels and root-relative paths, never an
// absolute path, G-R10 intact. HE reads the whole thing locally in the desk
// log panel, absolute paths and all, with the brain switched off if need be.
//
// Neither reader can move anything. `where` is read-only; the PUT IT BACK
// button it surfaces calls the EXISTING per-batch undo and no new mover was
// written for it. The model still has no undo tool.
// ---------------------------------------------------------------------------

/** One journal row as HE sees it locally: absolute, and freshly stat'ed. */
export interface DeskWhereHit {
  batchId: string;
  jobId: string;
  at: string;
  op: DeskOp;
  /** Absolute. Main process and the desk log panel only — never on any wire. */
  fromAbs: string;
  toAbs: string;
  status: ItemStatus;
  size: number;
  dryRun: boolean;
  undone: boolean;
  /**
   * Is it sitting at `toAbs` RIGHT NOW? A fresh lstat at query time, never the
   * journal replayed: the file could have moved again since, by her hand or
   * his. `null` means the check itself failed and we will not guess.
   */
  hereNow: boolean | null;
  /** The existing per-batch undo would accept this batch. Drives PUT IT BACK. */
  canUndo: boolean;
  /** Her reason for the batch. Untrusted — rendered through <Untrusted>. */
  intent: string;
}

export interface DeskWhereAnswer {
  query: string;
  hits: DeskWhereHit[];
  /** Batches read to answer. */
  searched: number;
  /** Oldest batch timestamp visible, so a short history cannot pose as a whole one. */
  oldest: string | null;
  /** Hits past the ceiling, dropped from `hits` and counted here. */
  truncated: number;
  /** Set when the question could not be asked at all (empty query, no journal). */
  why?: string;
}

/**
 * ONE JOURNAL ROW, THINNED FOR THE WIRE. Byte-compatible with `DeskMove` in
 * brain/src/desk.ts — that validator is hard, and a field of the wrong type
 * makes the row vanish and get COUNTED as dropped, never silently swallowed.
 *
 * No absolute paths, ever. Root label plus root-relative path, exactly as
 * `DeskEntry` names a file. `here` must be a real stat taken when this row was
 * built, not inferred from the journal.
 */
export interface DeskMoveWire {
  b: string;
  at: string;
  op: DeskOp;
  fr: string;
  fp: string;
  tr: string;
  tp: string;
  dry: boolean;
  undone: boolean;
  here: boolean;
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
  /**
   * WHERE DID IT GO. Read-only, journal-driven, works with the brain offline —
   * which is exactly the moment he needs it. It resolves to a batch id and
   * stops there: putting a file back is `undo(batchId)`, the mover that already
   * exists, triggered by him.
   */
  where(query: string, limit?: number): Promise<DeskWhereAnswer>;
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
  /**
   * THE FILING HISTORY SLICE — what `desk_where` searches brain-side.
   *
   * Newest first, capped, and it eats the SAME 256 KB pack budget as the
   * index. Prefer trimming history over trimming the index: she cannot file
   * with a history, and she can still answer "where did it go" from his desk
   * log if this is short.
   *
   * OMITTING THIS KEY ENTIRELY IS A SUPPORTED, DISTINCT STATE. The brain reads
   * a missing key as `supplied:false` and says "his desktop didn't send me any
   * filing history" — which is NOT "I have no record of that file". Sending
   * `[]` says the opposite thing, so an empty array is only ever sent when the
   * journal really is empty.
   */
  moves?: DeskMoveWire[];
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
