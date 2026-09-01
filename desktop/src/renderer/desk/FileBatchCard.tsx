// owner: stream S3 (DESK/UI) — THE CONFIRM CARD FOR FILE OPERATIONS.
//
// ConfirmCard.tsx delegates here for `kind === "file_batch"` and keeps its
// FROZEN props/signature. Every other confirm kind goes down the untouched
// path, so nothing in this file can regress a shipped card.
//
// Why this is a separate card rather than a body swap: a file batch's whole
// LIFECYCLE differs. Approval does not end it — approval starts a job on his
// disk that reports progress, ends in a partial or total outcome, and holds an
// UNDO for a minute afterwards. Bolting that onto ConfirmCard's three-state
// resolution would have meant editing the state machine every other kind runs
// through.
//
// The findings this anatomy encodes, each named where it is implemented:
//
//   CARD-3  a 500-row card is not consent, and grouping is where the lie lives
//           -> 50-row hard cap, every from->to pair rendered, nothing grouped,
//              nothing collapsed to "+N more", above-the-fold facts computed by
//              the renderer, APPROVE gated on scrolling the list to its end,
//              and Enter never approves.
//   PATH-3  bidi/homoglyphs defeat the card's one visual guarantee
//           -> every name goes through <Untrusted> (see untrusted.tsx).
//   PATH-4  case-only destination collisions inside one approved batch
//           -> deriveFacts() folds case + NFC and the card refuses on a hit.
//   INJ-4   the model's own `intent` is the most prominent text on the card
//           -> header/verb/counts/destinations come from the payload's moves;
//              `intent` is below the fold, labelled HER REASON, untrusted.
//   CARD-1  the hash binds none of the paths
//           -> the hash prefix prints in the header AND on the outcome line.
//   CARD-4  TOCTOU between preflight, approval and execution
//           -> preflight on mount, again on window focus, and the button count
//              is the VERIFIED count, never the planned one.
//   PART-1  a partial batch is worse than either endpoint
//           -> >30% failure flips the primary action to PUT THE N BACK.
//   PART-5  dry-run is the most dangerous mode in either design
//           -> a persistent chip, WOULD HAVE on every verb, and a button that
//              says APPROVE — DRY RUN.
//   PART-2  Controlled Folder Access is the likeliest mass failure
//           -> the outcome's massRefusal line is rendered verbatim.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type {
  ConfirmResolution,
  DeskOutcome,
  DeskPreflight,
  DeskProgress,
  DeskUndoResult,
  FileBatchPayload,
  ItemStatus,
  PendingConfirm,
  PreflightRow,
} from "@shared/contract";
import Untrusted from "./untrusted";
import { deriveFacts, fmtBytes, fmtHM, fmtHMS, hashPrefix, isHotExtension, dirOf, winPath } from "./payload";
import "./desk.css";

/** A file batch holds for a full minute after it resolves so UNDO is reachable
 *  before the card leaves the screen (every other kind holds 5 s). */
export const FILE_BATCH_HOLD_MS = 60_000;
const EXPIRY_TICK_MS = 15_000;

/** The subset of window.eve.desk this card needs. Injectable so a shot
 *  scenario can photograph a state without a live main process. */
export interface FileCardBridge {
  preflight(payload: FileBatchPayload): Promise<DeskPreflight>;
  undo(batchId: string): Promise<DeskUndoResult>;
  cancel(jobId: string): Promise<{ ok: boolean }>;
  outcome(jobId: string): Promise<DeskOutcome | null>;
  onProgress(cb: (e: DeskProgress) => void): () => void;
}

type Stage =
  | { s: "checking" }
  | { s: "cantcheck"; why: string }
  | { s: "ready" }
  | { s: "sending" }
  | { s: "running"; jobId: string; done: number; total: number }
  | { s: "applied"; outcome: DeskOutcome }
  | { s: "deskrefused"; why: string }
  | { s: "cancelled" }
  | { s: "failed"; why: string };

export interface FileBatchCardProps {
  confirm: PendingConfirm;
  payload: FileBatchPayload;
  variant: "inline" | "modal" | "summon";
  onResolved: (id: string) => void;
  /** Shot/test seams. None of these are used in the app. */
  bridge?: FileCardBridge;
  initialPreflight?: DeskPreflight;
  initialStage?: Stage;
  /** Skip the scroll gate in a still capture — the gate itself is proven by
   *  the "large" scenario, which does NOT set this. */
  assumeRead?: boolean;
}

function liveBridge(): FileCardBridge {
  return window.eve.desk;
}

const STATUS_TEXT: Record<PreflightRow["status"], { label: string; cls: string }> = {
  "will-move": { label: "WILL MOVE", cls: "ok" },
  gone: { label: "GONE SINCE SHE LOOKED", cls: "warn" },
  collision: { label: "NAME TAKEN — WILL BE SKIPPED", cls: "warn" },
  changed: { label: "CHANGED SINCE SHE LOOKED", cls: "warn" },
  refused: { label: "REFUSED", cls: "no" },
};

/**
 * G-A5 / PART-5. The SAME rows, on a card whose batch is a rehearsal.
 *
 * The summary line under the list already said "{dry ? WOULD : WILL} move", and
 * the outcome verb already said WOULD HAVE MOVED — but every row in between
 * said WILL MOVE, in the "ok" green, on a batch where nothing was ever going to
 * move. Fifty rows of WILL MOVE is the loudest thing on the card and it was the
 * one surface still saying it in the wrong tense. A rehearsal that reads like a
 * commitment is exactly the confusion PART-5 is about.
 *
 * Only the two rows that assert an outcome change. GONE, CHANGED and REFUSED
 * are facts about the disk right now and are true in either mode.
 */
const STATUS_TEXT_DRY: Record<PreflightRow["status"], { label: string; cls: string }> = {
  ...STATUS_TEXT,
  "will-move": { label: "WOULD MOVE", cls: "warn" },
  collision: { label: "NAME TAKEN — WOULD BE SKIPPED", cls: "warn" },
};

/**
 * What happened, per row, AFTER the batch ran. Before this existed, a finished
 * batch kept showing its PREFLIGHT column — so a card whose outcome line read
 * `FAILED 20` showed fifty rows all saying WILL MOVE (or CHECKING…), and there
 * was no way on the screen to learn WHICH twenty failed. "A half-failed batch
 * must say exactly what moved and what did not" is not satisfied by a total.
 */
const OUTCOME_TEXT: Record<ItemStatus, { label: string; cls: string }> = {
  moved: { label: "MOVED", cls: "ok" },
  "would-have-moved": { label: "WOULD HAVE MOVED", cls: "warn" },
  skipped: { label: "SKIPPED", cls: "warn" },
  failed: { label: "FAILED", cls: "no" },
  refused: { label: "REFUSED", cls: "no" },
  cancelled: { label: "NEVER RAN — STOPPED FIRST", cls: "warn" },
};

export default function FileBatchCard({
  confirm,
  payload,
  variant,
  onResolved,
  bridge,
  initialPreflight,
  initialStage,
  assumeRead = false,
}: FileBatchCardProps) {
  const io = bridge ?? liveBridge();
  const facts = useMemo(() => deriveFacts(payload), [payload]);

  const [pre, setPre] = useState<DeskPreflight | null>(initialPreflight ?? null);
  const [stage, setStage] = useState<Stage>(initialStage ?? (initialPreflight ? { s: "ready" } : { s: "checking" }));
  const [readToEnd, setReadToEnd] = useState(assumeRead);
  const [undo, setUndo] = useState<DeskUndoResult | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const listRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const resolvingRef = useRef(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expiresAtMs = new Date(confirm.expiresAt).getTime();
  const expired = !Number.isNaN(expiresAtMs) && now >= expiresAtMs;

  // ---- the renderer's own refusals, before anything else --------------------
  // These are UI-side restatements of guard rules. They do not replace the
  // guard — the guard runs again in main and binds at execute. They exist so a
  // card that the executor is going to refuse never offers him an APPROVE.
  const localRefusal =
    facts.overCap
      ? `THAT'S ${facts.rows} FILES ON ONE CARD. THE CAP IS ${facts.cap}. SHE HAS TO SPLIT IT.`
      : facts.internalCollisions.length > 0
        ? `TWO ROWS IN THIS BATCH AIM AT THE SAME FILE (${facts.internalCollisions.join(", ")}). WINDOWS TREATS THEM AS ONE NAME.`
        : null;

  const deskRefusal = pre?.refusal ?? null;
  const refusal = localRefusal ?? deskRefusal;

  // ---- preflight: on mount, and again on window focus (CARD-4) -------------
  const runPreflight = useCallback(async () => {
    try {
      const r = await io.preflight(payload);
      setPre(r);
      setStage((s) => (s.s === "checking" || s.s === "cantcheck" ? { s: "ready" } : s));
      if (!r.ok && !r.refusal) {
        setStage({ s: "cantcheck", why: r.error || "the desk could not check these" });
      }
    } catch (err) {
      setStage({ s: "cantcheck", why: err instanceof Error ? err.message : "the desk did not answer" });
    }
  }, [io, payload]);

  useEffect(() => {
    if (initialPreflight || initialStage) return; // a shot supplies its own truth
    void runPreflight();
  }, [initialPreflight, initialStage, runPreflight]);

  useEffect(() => {
    if (initialPreflight || initialStage) return;
    const onFocus = () => {
      setStage((s) => (s.s === "ready" || s.s === "cantcheck" ? s : s));
      void runPreflight();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [initialPreflight, initialStage, runPreflight]);

  // ---- expiry tick ---------------------------------------------------------
  useEffect(() => {
    if (stage.s !== "ready" && stage.s !== "checking") return;
    const id = setInterval(() => setNow(Date.now()), EXPIRY_TICK_MS);
    return () => clearInterval(id);
  }, [stage.s]);

  useEffect(() => () => { if (holdRef.current) clearTimeout(holdRef.current); }, []);

  // ---- the scroll gate (CARD-3) -------------------------------------------
  // "APPROVE is disabled until the list region has been scrolled to its end. It
  // is the only UI mechanism that reliably forces reading." A list that is
  // fully visible without scrolling satisfies the gate on sight — measured, not
  // assumed, so a batch that grows past the fold re-arms it.
  const measureGate = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 1) setReadToEnd(true);
  }, []);

  useLayoutEffect(() => {
    if (assumeRead) return;
    measureGate();
  }, [assumeRead, measureGate, pre]);

  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) setReadToEnd(true);
  }, []);

  // ---- progress ------------------------------------------------------------
  useEffect(() => {
    if (stage.s !== "running") return;
    const jobId = stage.jobId;
    const unsub = io.onProgress((e) => {
      if (e.jobId !== jobId) return;
      if (e.phase === "refused") {
        setStage({ s: "deskrefused", why: e.refusal || "the desk refused that batch" });
        return;
      }
      if (e.phase === "done" && e.outcome) {
        setStage({ s: "applied", outcome: e.outcome });
        return;
      }
      setStage({ s: "running", jobId, done: e.done, total: e.total });
    });
    return unsub;
  }, [io, stage]);

  // ---- decide --------------------------------------------------------------
  const decide = useCallback(
    async (approve: boolean) => {
      if (resolvingRef.current) return;
      resolvingRef.current = true;
      setStage({ s: "sending" });
      let r: ConfirmResolution;
      try {
        r = await window.eve.confirm(confirm.id, confirm.hash, approve);
      } catch (err) {
        setStage({ s: "failed", why: err instanceof Error ? err.message : "unknown" });
        holdRef.current = setTimeout(() => onResolved(confirm.id), FILE_BATCH_HOLD_MS);
        return;
      }
      // deskJobId FIRST. `{ok:true, executed:false}` on an approved
      // client-executed confirm is the shipped CANCELLED bug, and a filing
      // build that inherits it tells him nothing moved while his disk is
      // changing under him. (§7.4)
      if (r.ok && r.deskJobId) setStage({ s: "running", jobId: r.deskJobId, done: 0, total: facts.rows });
      else if (r.ok && r.deskRefusal) setStage({ s: "deskrefused", why: r.deskRefusal });
      else if (r.ok && !approve) setStage({ s: "cancelled" });
      else if (r.ok) setStage({ s: "cancelled" });
      else setStage({ s: "failed", why: r.error || "unknown" });

      if (!(r.ok && r.deskJobId)) {
        holdRef.current = setTimeout(() => onResolved(confirm.id), FILE_BATCH_HOLD_MS);
      }
    },
    [confirm.id, confirm.hash, facts.rows, onResolved],
  );

  // Once a batch finishes, hold the card for a minute so UNDO is reachable.
  useEffect(() => {
    if (stage.s !== "applied" && stage.s !== "deskrefused") return;
    if (holdRef.current) return;
    holdRef.current = setTimeout(() => onResolved(confirm.id), FILE_BATCH_HOLD_MS);
  }, [stage.s, confirm.id, onResolved]);

  // ---- keyboard: ESC cancels, ENTER NEVER APPROVES (CARD-3) ---------------
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (variant === "inline") return;
      if (e.key === "Enter") {
        // Swallowed deliberately. A file batch is never approved by a keystroke
        // that a person presses to dismiss things all day.
        e.stopPropagation();
        return;
      }
      if (e.key === "Escape" && stage.s === "ready") {
        e.stopPropagation();
        void decide(false);
      }
    },
    [variant, stage.s, decide],
  );

  useEffect(() => {
    if (variant === "inline") return;
    cardRef.current?.focus();
  }, [variant]);

  // ---- undo ---------------------------------------------------------------
  const doUndo = useCallback(async () => {
    if (undoBusy) return;
    setUndoBusy(true);
    try {
      setUndo(await io.undo(payload.batchId));
    } catch (err) {
      setUndo({
        ok: false,
        batchId: payload.batchId,
        undoId: "",
        dryRun: false,
        restored: 0,
        refused: 0,
        failed: 0,
        items: [],
        removedDirs: [],
        refusal: err instanceof Error ? err.message : "the desk did not answer",
        complete: false,
      });
    }
    setUndoBusy(false);
  }, [io, payload.batchId, undoBusy]);

  // ---- derived display -----------------------------------------------------
  const dry = payload.dryRun;
  /** The outcome, or null while the batch has not run. Narrowed once here so
   *  the row loop below never has to re-discriminate the stage union. */
  const ranOutcome: DeskOutcome | null = stage.s === "applied" ? stage.outcome : null;
  const rows: PreflightRow[] | null = pre?.rows ?? null;
  const verifiedCount = pre?.verifiedCount ?? facts.rows;
  const verifiedBytes = pre?.verifiedBytes ?? facts.bytes;
  const hash = hashPrefix(pre?.hashPrefix || confirm.hash);
  const newFolders = pre?.newFolders?.length ? pre.newFolders : (payload.newFolders ?? []);

  const canApprove =
    stage.s === "ready" && !refusal && !expired && readToEnd && (pre?.ok ?? false) && verifiedCount > 0;

  const approveLabel = dry
    ? `APPROVE — DRY RUN ${verifiedCount} ${verifiedCount === 1 ? "FILE" : "FILES"}`
    : `APPROVE — MOVE ${verifiedCount} ${verifiedCount === 1 ? "FILE" : "FILES"}`;

  return (
    <div
      className="confirmv6 fbcard"
      ref={cardRef}
      tabIndex={variant === "inline" ? undefined : -1}
      onKeyDown={variant === "inline" ? undefined : onKeyDown}
    >
      <div className="hd">▲ NEEDS YOU · FILE BATCH — NOTHING MOVES WITHOUT YOU</div>

      <div className="fbwrap">
        <div className="deskrow spread">
          {dry ? (
            <span className="fbdry">● DRY RUN — NOTHING WILL MOVE</span>
          ) : (
            <span className="fblive">● LIVE — THESE FILES ACTUALLY MOVE</span>
          )}
          <span className="fbhash">PLAN {hash}</span>
        </div>

        {/* ABOVE THE FOLD. Unscrollable. Every number here is the renderer's
            own arithmetic over `moves`, never the payload's self-description. */}
        <div className="fbfacts">
          <b>{facts.rows} FILES</b>
          <span className="sep">·</span>
          <b>{fmtBytes(facts.bytes)}</b>
          <span className="sep">·</span>
          <span>
            {facts.destinations.length} {facts.destinations.length === 1 ? "DESTINATION" : "DESTINATIONS"}
          </span>
          <span className="sep">·</span>
          <span>
            {newFolders.length} NEW {newFolders.length === 1 ? "FOLDER" : "FOLDERS"}
          </span>
        </div>

        <div className="fbexts">
          {facts.extensions.length === 0 && <span className="fbext">NO EXTENSIONS</span>}
          {facts.extensions.map((e) => (
            <span key={e} className={`fbext${isHotExtension(e) ? " hot" : ""}`}>
              {e}
              {isHotExtension(e) ? " ⚠" : ""}
            </span>
          ))}
        </div>

        <div className="fbroute">
          <span className="k">FROM</span>
          <span>
            {facts.sourceRoots.map((r) => (
              <span key={r} style={{ marginRight: 8 }}>
                <Untrusted value={r} />
              </span>
            ))}
          </span>
          <span className="k">INTO</span>
          <span>
            {facts.destinations.map((d) => {
              const shown = winPath(d);
              const isNew = newFolders.some((n) => winPath(n).toLowerCase() === shown.toLowerCase());
              return (
                <span key={d} style={{ display: "block" }}>
                  <Untrusted value={shown} disclose />
                  {isNew && <span className="fbnew"> ← WILL BE CREATED</span>}
                </span>
              );
            })}
          </span>
        </div>

        {/* CONSTANT STRINGS. Not payload fields — a confused or injected plan
            cannot print its own guarantees. (INJ-4) */}
        <div className="fblaw">NOTHING IS DELETED. NOTHING IS OVERWRITTEN.</div>

        {pre && (
          <div className="fbchecked">
            CHECKED planned {fmtHM(confirm.createdAt)} · re-checked {fmtHMS(pre.checkedAt)} —{" "}
            <em>
              {pre.verifiedCount} of {pre.plannedCount} still there
            </em>
          </div>
        )}

        {payload.crossesSyncBoundary && (
          <div className="fbbanner">
            ⚠ THESE LEAVE ONEDRIVE. THEY WILL DISAPPEAR FROM EVERY DEVICE YOU SYNC. The copy stays on
            this machine only.
          </div>
        )}

        {facts.payloadDisagrees && (
          <div className="fbbanner">
            ⚠ THIS PLAN'S OWN SUMMARY DOES NOT MATCH ITS ROWS. {facts.disagreements.join(" · ")}. The
            numbers above are counted from the rows below, not from what the plan claims.
          </div>
        )}

        {/* PATH-3, the half a per-row badge cannot catch. Two destinations that
            print identically and are two different folders on disk read as one
            folder listed twice — which looks like a rendering glitch and is
            actually half of these files going somewhere else. */}
        {facts.lookalikeDests.length > 0 && (
          <div className="fbbanner stop">
            ⛔ TWO DESTINATIONS ON THIS CARD LOOK IDENTICAL AND ARE NOT.{" "}
            {facts.lookalikeDests.map((d) => `"${d}"`).join(", ")} appears more than once above, and
            each one is a DIFFERENT folder on disk — the letters are from different alphabets. Open
            SEE IT RAW on the destination rows. Do not approve this until you know which is which.
          </div>
        )}

        {facts.alteredRows > 0 && (
          <div className="fbbanner">
            ⚠ {facts.alteredRows} {facts.alteredRows === 1 ? "ROW CARRIES A NAME" : "ROWS CARRY NAMES"}{" "}
            THAT DO NOT MATCH THE BYTES ON DISK — invisible characters, or letters from another
            alphabet. Open SEE IT RAW on those rows before you approve.
          </div>
        )}

        {refusal && <div className="fbbanner stop">⛔ {refusal}</div>}

        {stage.s === "cantcheck" && (
          <div className="fbbanner stop">
            ⛔ CAN'T CHECK THESE RIGHT NOW — {stage.why}. Nothing is approved blind.
          </div>
        )}

        {/* THE LIST. Every pair. No grouping, no "+N more". */}
        <div className="fblistwrap">
          <div className="fblisthd">
            <span>
              EVERY FILE, EVERY DESTINATION — {facts.rows} {facts.rows === 1 ? "ROW" : "ROWS"}
            </span>
            <span className={`gate${readToEnd ? " done" : ""}`}>
              {readToEnd ? "✓ READ TO THE END" : "SCROLL TO THE END TO ENABLE APPROVE"}
            </span>
          </div>
          <div
            className={`fblist${variant === "modal" ? " tall" : ""}`}
            ref={listRef}
            onScroll={onListScroll}
          >
            {payload.moves.map((m, i) => {
              // ONCE IT HAS RUN, THE OUTCOME IS THE TRUTH. The preflight column
              // describes a plan; after the job it is a stale prediction, and a
              // stale prediction sitting beside "FAILED 20" is the card lying
              // about the only thing he now needs from it.
              const item = ranOutcome?.items.find((x) => x.idx === i) ?? null;
              const row = rows?.find((r) => r.idx === i) ?? null;
              const st = item ? OUTCOME_TEXT[item.status] : row ? (dry ? STATUS_TEXT_DRY : STATUS_TEXT)[row.status] : null;
              const why = item ? item.why : row?.why;
              const rule = item ? item.rule : row?.rule;
              const toDir = dirOf(m.toRel);
              return (
                <div className="fbrow" key={`${m.fromRoot}/${m.fromRel}/${i}`}>
                  <span className="n">{i + 1}</span>
                  <div className="fbpair">
                    <span className="lbl">FROM</span>
                    <span>
                      <Untrusted value={winPath(`${m.fromRoot}\\${m.fromRel}`)} disclose />
                    </span>
                    <span className="sz">{fmtBytes(item?.size ?? row?.size ?? m.size)}</span>

                    <span className="lbl">INTO</span>
                    <span>
                      <Untrusted value={winPath(`${m.toRoot}\\${m.toRel}`)} disclose />
                      {toDir === "" && <span className="fbnew"> (root of {m.toRoot})</span>}
                    </span>
                    <span className={`fbstat ${st?.cls ?? "warn"}`}>
                      {st?.label ?? (pre ? "—" : "CHECKING…")}
                    </span>

                    {why && (
                      <span className="fbwhy">
                        {why}
                        {rule ? ` (${rule})` : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* HER REASON — below the fold, demoted, untrusted. (INJ-4 / G-I8) */}
        <div className="fbintent">
          <b>HER REASON (her words, not verified)</b>
          <Untrusted value={payload.intent || "(she gave none)"} />
        </div>

        {pre && !refusal && (
          <div className="fbverdict">
            {verifiedCount} {verifiedCount === 1 ? "file" : "files"} · {fmtBytes(verifiedBytes)}{" "}
            {dry ? "WOULD" : "WILL"} move. {facts.rows - verifiedCount} would not.
          </div>
        )}
      </div>

      <div className="cexpires">expires {fmtHM(confirm.expiresAt)}</div>

      {/* --------------------------- the action row --------------------------- */}
      {stage.s === "checking" && <div className="cnote pending">CHECKING THESE AGAINST THE DISK…</div>}

      {stage.s === "sending" && <div className="cnote pending">…</div>}

      {stage.s === "cancelled" && (
        <div className="cnote cancelled">CANCELLED — NOTHING WAS TOUCHED.</div>
      )}

      {stage.s === "failed" && <div className="cnote failed">FAILED — {stage.why}</div>}

      {stage.s === "deskrefused" && (
        <div className="fbout">
          <div className="cnote failed">REFUSED BY THE DESK — {stage.why}</div>
          <div className="fbhint">Nothing moved. The journal has the refusal, with this plan id.</div>
        </div>
      )}

      {stage.s === "running" && (
        <div className="fbout">
          <div className="fboutline">
            RUNNING — {stage.done} of {stage.total || facts.rows}
          </div>
          <div className="fbprog">
            <i style={{ width: `${Math.round((stage.done / Math.max(1, stage.total || facts.rows)) * 100)}%` }} />
          </div>
          <div className="crow">
            <button className="cbtn gh" type="button" onClick={() => void io.cancel(stage.jobId)}>
              STOP — CANCEL THIS BATCH
            </button>
          </div>
          <div className="fbhint">
            A cancel lands BETWEEN operations. Files already moved stay moved and the log says which.
          </div>
        </div>
      )}

      {stage.s === "applied" && (
        <Outcome outcome={stage.outcome} undo={undo} undoBusy={undoBusy} onUndo={() => void doUndo()} />
      )}

      {(stage.s === "ready" || stage.s === "cantcheck") &&
        (expired ? (
          <div className="cexpired">EXPIRED — SHE'LL RE-RAISE IT IF IT STILL MATTERS</div>
        ) : (
          <div className="crow">
            {refusal ? (
              <p className="fblocked">REFUSED — {refusal}</p>
            ) : (
              <button
                className="cbtn ok"
                type="button"
                disabled={!canApprove}
                onClick={() => void decide(true)}
              >
                {approveLabel}
              </button>
            )}
            <button className="cbtn gh" type="button" onClick={() => void decide(false)}>
              CANCEL
            </button>
            {variant !== "inline" && (
              <span className="ckbd">
                <span className="kbd">ESC</span>
              </span>
            )}
          </div>
        ))}

      {(stage.s === "ready" || stage.s === "cantcheck") && !refusal && !expired && !readToEnd && (
        <div className="fbhint">
          APPROVE unlocks when you have scrolled that list to the end. There is no other way past it.
        </div>
      )}
      {(stage.s === "ready" || stage.s === "cantcheck") && !expired && (
        <div className="fbhint">ENTER does nothing on this card. ESC cancels.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The outcome. Honest about half-landings, and never past tense on a dry run.
// ---------------------------------------------------------------------------

function Outcome({
  outcome,
  undo,
  undoBusy,
  onUndo,
}: {
  outcome: DeskOutcome;
  undo: DeskUndoResult | null;
  undoBusy: boolean;
  onUndo: () => void;
}) {
  const dry = outcome.dryRun;
  // G-A5: no surface renders a past-tense verb for a dryRun outcome. The verb
  // comes off the outcome itself, which the executor stamps.
  const verb = outcome.verb;
  const skippedWhy = summariseSkips(outcome);

  return (
    <div className="fbout">
      {outcome.rollbackRecommended && !dry && (
        <div className="fbbanner stop">
          THAT HALF-LANDED. {outcome.moved} moved, {outcome.failed} did not. Your files are now in two
          places.
          {outcome.massRefusal ? <br /> : null}
          {outcome.massRefusal ?? ""}
        </div>
      )}

      <div className="fboutline">
        <span className={dry ? "would" : "moved"}>
          {verb} {outcome.moved}
        </span>
        {" · "}
        <span>
          SKIPPED {outcome.skipped}
          {skippedWhy ? ` (${skippedWhy})` : ""}
        </span>
        {" · "}
        <span className={outcome.failed > 0 ? "bad" : undefined}>FAILED {outcome.failed}</span>
        {outcome.refused > 0 && (
          <>
            {" · "}
            <span className="bad">REFUSED {outcome.refused}</span>
          </>
        )}
        {" · "}
        {fmtBytes(outcome.bytes)}
        {" · "}
        {hashPrefix(outcome.hashPrefix)}
      </div>

      {typeof outcome.cancelledAtOp === "number" && (
        <div className="fboutline bad">STOPPED AT OPERATION {outcome.cancelledAtOp}. The rest never ran.</div>
      )}

      {outcome.createdDirs.length > 0 && (
        <div className="fbhint">
          {dry ? "WOULD HAVE CREATED" : "CREATED"} {outcome.createdDirs.length}{" "}
          {outcome.createdDirs.length === 1 ? "FOLDER" : "FOLDERS"}:{" "}
          {outcome.createdDirs.map((d) => (
            <span key={d} style={{ marginRight: 8 }}>
              <Untrusted value={winPath(d)} className="dim" disclose />
            </span>
          ))}
        </div>
      )}

      {undo ? (
        <div className="fboutline">
          {undo.refusal ? (
            <span className="bad">UNDO REFUSED — {undo.refusal}</span>
          ) : (
            <>
              <span className="moved">PUT BACK {undo.restored}</span>
              {" · "}
              <span>REFUSED {undo.refused}</span>
              {" · "}
              <span className={undo.failed > 0 ? "bad" : undefined}>FAILED {undo.failed}</span>
              {!undo.complete && (
                <div className="fbhint">
                  Not everything came back. Run it again from the log — undo is one-shot per FILE, not
                  per batch, so the ones that failed are still retriable.
                </div>
              )}
            </>
          )}
        </div>
      ) : dry ? (
        <div className="fbhint">Dry run — nothing to undo. Nothing was touched.</div>
      ) : outcome.moved > 0 ? (
        <div className="crow">
          <button
            className={outcome.rollbackRecommended ? "cbtn ok" : "cbtn gh"}
            type="button"
            disabled={undoBusy}
            onClick={onUndo}
          >
            {outcome.rollbackRecommended ? `PUT THE ${outcome.moved} BACK` : "UNDO THIS BATCH"}
          </button>
          {outcome.rollbackRecommended && (
            <span className="fbhint" style={{ flex: 1 }}>
              or LEAVE IT — the log keeps this batch and the undo stays available there.
            </span>
          )}
        </div>
      ) : (
        <div className="fbhint">Nothing moved, so there is nothing to put back.</div>
      )}
    </div>
  );
}

function summariseSkips(o: DeskOutcome): string {
  const byWhy = new Map<string, number>();
  for (const it of o.items) {
    if (it.status !== "skipped") continue;
    const k = (it.why || it.rule || "no reason given").toUpperCase();
    byWhy.set(k, (byWhy.get(k) ?? 0) + 1);
  }
  if (byWhy.size === 0) return "";
  return [...byWhy.entries()].map(([w, n]) => `${n} ${w}`).join(", ");
}
