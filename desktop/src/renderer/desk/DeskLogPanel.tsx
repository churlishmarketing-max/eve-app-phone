// owner: stream S3 (DESK/UI) — THE LOG AND THE UNDO.
//
// REC-1, HIGH: "undo is per-batch, one-shot, and buried." Buried is the word
// that matters. At 2am with 200 files in the wrong place, an undo that lives
// three clicks into a settings drawer is an undo he will not find.
//
// So this panel is built to be mounted in the deck's OPS column, not in
// Settings. It is a self-contained component with no deck imports (S2 owns
// deck/**), so mounting it is one line there:
//
//     import DeskLogPanel from "../../desk/DeskLogPanel";
//     <DeskLogPanel />
//
// EVERYTHING HERE WORKS WITH THE BRAIN OFFLINE. `desk.log()`, `desk.undo()`,
// `desk.previewUndo()` and `desk.undoSince()` are journal-driven and never
// touch the network — which is precisely the condition he needs them in.
// (G-R4). The model has no undo tool; she cannot undo, only he can. (§4.3)
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeskBatchRecord, DeskStatus, DeskUndoResult, ItemStatus } from "@shared/contract";
import Untrusted from "./untrusted";
import { fmtBytes, fmtDayHM, hashPrefix } from "./payload";
import KillSwitch from "./KillSwitch";
import "./desk.css";

export interface DeskLogBridge {
  log(limit?: number): Promise<DeskBatchRecord[]>;
  status(): Promise<DeskStatus>;
  undo(batchId: string): Promise<DeskUndoResult>;
  previewUndo(batchId: string): Promise<DeskUndoResult>;
  undoSince(iso: string, preview?: boolean): Promise<DeskUndoResult[]>;
  kill(): Promise<{ ok: boolean; enabled: boolean; killAccel: string | null; stopped?: number }>;
}

export interface DeskLogPanelProps {
  bridge?: DeskLogBridge;
  limit?: number;
  /** Shot seams. */
  initialBatches?: DeskBatchRecord[];
  initialStatus?: DeskStatus;
  initialExpanded?: string;
  initialSincePreview?: DeskUndoResult[];
}

function liveBridge(): DeskLogBridge {
  return window.eve.desk;
}

const ITEM_CLASS: Record<ItemStatus, string> = {
  moved: "ok",
  "would-have-moved": "warn",
  skipped: "warn",
  failed: "no",
  refused: "no",
  cancelled: "warn",
};

/** Today at HH:MM, local. If that is in the future, he means yesterday. */
function isoForTimeToday(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
  return d.toISOString();
}

function defaultSince(): string {
  const d = new Date(Date.now() - 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function DeskLogPanel({
  bridge,
  limit = 50,
  initialBatches,
  initialStatus,
  initialExpanded,
  initialSincePreview,
}: DeskLogPanelProps) {
  const io = bridge ?? liveBridge();
  const seeded = initialBatches !== undefined || initialStatus !== undefined;

  const [batches, setBatches] = useState<DeskBatchRecord[] | null>(initialBatches ?? null);
  const [status, setStatus] = useState<DeskStatus | null>(initialStatus ?? null);
  const [expanded, setExpanded] = useState<string | null>(initialExpanded ?? null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoResults, setUndoResults] = useState<Record<string, DeskUndoResult>>({});
  const [since, setSince] = useState<string>(defaultSince);
  const [sincePreview, setSincePreview] = useState<DeskUndoResult[] | null>(initialSincePreview ?? null);
  const [sinceBusy, setSinceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([io.log(limit), io.status()]);
      setBatches(b);
      setStatus(s);
      setError(null);
    } catch (err) {
      setBatches([]);
      setError(`THE JOURNAL DID NOT ANSWER — ${(err instanceof Error ? err.message : "unknown").toUpperCase()}`);
    }
  }, [io, limit]);

  useEffect(() => {
    if (seeded) return;
    void load();
  }, [seeded, load]);

  const undoOne = useCallback(
    async (batchId: string) => {
      setUndoing(batchId);
      try {
        const r = await io.undo(batchId);
        setUndoResults((m) => ({ ...m, [batchId]: r }));
      } catch (err) {
        setError(`UNDO DID NOT RUN — ${(err instanceof Error ? err.message : "unknown").toUpperCase()}`);
      }
      setUndoing(null);
      await load();
    },
    [io, load],
  );

  const previewOne = useCallback(
    async (batchId: string) => {
      setUndoing(batchId);
      try {
        const r = await io.previewUndo(batchId);
        setUndoResults((m) => ({ ...m, [batchId]: r }));
      } catch (err) {
        setError(`PREVIEW DID NOT RUN — ${(err instanceof Error ? err.message : "unknown").toUpperCase()}`);
      }
      setUndoing(null);
    },
    [io],
  );

  // TIME-RANGED UNDO (G-R8). Preview FIRST, always: the commit button does not
  // exist until he has seen a dry-run list of what would come back.
  const previewSince = async () => {
    setSinceBusy(true);
    try {
      setSincePreview(await io.undoSince(isoForTimeToday(since), true));
    } catch (err) {
      setError(`PREVIEW DID NOT RUN — ${(err instanceof Error ? err.message : "unknown").toUpperCase()}`);
    }
    setSinceBusy(false);
  };

  const commitSince = async () => {
    setSinceBusy(true);
    try {
      setSincePreview(await io.undoSince(isoForTimeToday(since), false));
    } catch (err) {
      setError(`UNDO DID NOT RUN — ${(err instanceof Error ? err.message : "unknown").toUpperCase()}`);
    }
    setSinceBusy(false);
    await load();
  };

  const sinceTotals = useMemo(() => {
    if (!sincePreview) return null;
    return sincePreview.reduce(
      (a, r) => ({
        restored: a.restored + r.restored,
        refused: a.refused + r.refused,
        failed: a.failed + r.failed,
        preview: r.dryRun,
      }),
      { restored: 0, refused: 0, failed: 0, preview: true },
    );
  }, [sincePreview]);

  return (
    <div className="desklog">
      <div className="eyeb">
        <span>▸ FILING — LOG &amp; UNDO</span>
        <span className="r">
          {status ? (status.enabled ? "ARMED" : "OFF") : "—"} · WORKS WITH THE BRAIN OFFLINE
        </span>
      </div>

      <KillSwitch
        bridge={io}
        armed={status?.enabled === true}
        killAccel={status?.killAccel ?? null}
        onChanged={() => void load()}
        compact
      />

      {/* ---------------- time-ranged undo (REC-1 / G-R8) ---------------- */}
      <div className="desklogbar">
        <span className="fbhint" style={{ flex: "none" }}>
          UNDO EVERYTHING SINCE
        </span>
        <input
          className="desklogsince"
          type="time"
          value={since}
          onChange={(e) => {
            setSince(e.target.value);
            setSincePreview(null);
          }}
        />
        <button type="button" className="chipv6" disabled={sinceBusy} onClick={() => void previewSince()}>
          SHOW ME WHAT COMES BACK
        </button>
        {sincePreview && sincePreview.length > 0 && sinceTotals?.preview && (
          <button type="button" className="cbtn ok" disabled={sinceBusy} onClick={() => void commitSince()}>
            PUT THEM ALL BACK
          </button>
        )}
      </div>

      {sincePreview && (
        <div className="fbbanner">
          {sincePreview.length === 0 ? (
            <>NOTHING RAN AFTER THAT TIME. There is nothing to put back.</>
          ) : (
            <>
              {sinceTotals?.preview ? "WOULD PUT BACK" : "PUT BACK"} {sinceTotals?.restored ?? 0} across{" "}
              {sincePreview.length} {sincePreview.length === 1 ? "batch" : "batches"} · REFUSED{" "}
              {sinceTotals?.refused ?? 0} · FAILED {sinceTotals?.failed ?? 0}.
              {sincePreview.some((r) => r.refusal) && (
                <>
                  <br />
                  {sincePreview
                    .filter((r) => r.refusal)
                    .map((r) => `${r.batchId.slice(0, 8)}: ${r.refusal}`)
                    .join(" · ")}
                </>
              )}
              {sinceTotals?.preview && (
                <>
                  <br />
                  This is a preview. Nothing has moved yet.
                </>
              )}
            </>
          )}
        </div>
      )}

      {error && <div className="fbbanner stop">{error}</div>}

      {/* ---------------- the batches ---------------- */}
      {batches === null && <div className="deskempty">READING THE JOURNAL…</div>}

      {batches !== null && batches.length === 0 && (
        <div className="deskempty">
          NO BATCHES YET. She has not proposed a filing job on this machine.
          {status?.journalPath ? (
            <>
              <br />
              journal: <Untrusted value={status.journalPath} className="dim" />
            </>
          ) : null}
        </div>
      )}

      <div className="desklist">
        {(batches ?? []).map((b) => {
          const open = expanded === b.batchId;
          const res = undoResults[b.batchId];
          const cls = b.interrupted ? "interrupted" : b.undone ? "undone" : b.dryRun ? "dry" : "";
          return (
            <div className={`deskbatch ${cls}`} key={b.batchId}>
              <div className="deskbatchhd">
                <span className="tm">{fmtDayHM(b.at)}</span>
                <span className="op">{b.op.toUpperCase()}</span>
                {b.dryRun && <span className="fbdry">DRY RUN</span>}
                {b.undone && <span>UNDONE</span>}
                {b.interrupted && <span className="deskprobe bad">INTERRUPTED — RECONCILED</span>}
                <span className="hash">{hashPrefix(b.hashPrefix)}</span>
              </div>

              <div className="deskcounts">
                <span className={b.dryRun ? "would" : "moved"}>
                  {b.dryRun ? "WOULD HAVE MOVED" : "MOVED"} {b.moved}
                </span>
                {" · SKIPPED "}
                {b.skipped}
                {" · "}
                {/* A non-zero FAILED is the reason he opened this panel. It
                    wears the same red ink as every other failure sentence in
                    the app (.errline, .cnote.failed) instead of hiding in the
                    same cream as the counts that went fine. */}
                <span className={b.failed > 0 ? "bad" : undefined}>FAILED {b.failed}</span>
                {b.refused > 0 ? (
                  <>
                    {" · "}
                    <span className="bad">REFUSED {b.refused}</span>
                  </>
                ) : null}
                {" · "}
                {fmtBytes(b.bytes)}
              </div>

              {b.failed > 0 && b.moved > 0 && !b.dryRun && (
                <div className="deskhalf">
                  THAT ONE HALF-LANDED — {b.moved} moved and {b.failed} did not. Those files are in two
                  places.
                </div>
              )}

              <div className="fbintent">
                <b>HER REASON (her words, not verified)</b>
                <Untrusted value={b.intent || "(none recorded)"} />
              </div>

              <div className="deskrow">
                {/* A button offering nothing is worse than a sentence saying so
                    — and "SHOW ALL 0 FILES" is the app inviting a click into an
                    empty drawer. A dry run and a rotated segment both legitimately
                    carry no per-file rows; that gets said in words. */}
                {b.items.length > 0 ? (
                  <button type="button" className="chipv6" onClick={() => setExpanded(open ? null : b.batchId)}>
                    {open ? "HIDE THE FILES" : `SHOW ALL ${b.items.length} FILES`}
                  </button>
                ) : (
                  <span className="fbhint">
                    {b.dryRun
                      ? "Dry run — nothing moved, nothing to undo. The journal records the plan and the totals for a rehearsal, not a row per file."
                      : "No per-file rows in the journal for this batch."}
                  </span>
                )}
                {!b.dryRun && b.moved > 0 && !b.undone && (
                  <>
                    <button
                      type="button"
                      className="chipv6"
                      disabled={undoing === b.batchId}
                      onClick={() => void previewOne(b.batchId)}
                    >
                      PREVIEW THE UNDO
                    </button>
                    <button
                      type="button"
                      className="cbtn ok"
                      disabled={undoing === b.batchId}
                      onClick={() => void undoOne(b.batchId)}
                    >
                      UNDO THIS BATCH
                    </button>
                  </>
                )}
                {/* Only when the row above did not already say "dry run" — two
                    adjacent hints in a flex row read as one run-on sentence. */}
                {b.dryRun && b.items.length > 0 && (
                  <span className="fbhint">Dry run — nothing moved, nothing to undo.</span>
                )}
                {b.undone && <span className="fbhint">Already put back.</span>}
              </div>

              {res && (
                <div className="deskcounts">
                  {res.refusal ? (
                    <span className="bad">UNDO REFUSED — {res.refusal}</span>
                  ) : (
                    <>
                      {res.dryRun ? "WOULD PUT BACK" : "PUT BACK"} {res.restored} · REFUSED {res.refused} ·
                      FAILED {res.failed}
                      {!res.dryRun && !res.complete && (
                        <div className="fbhint">
                          Not everything came back. Undo is one-shot per FILE, not per batch — press it
                          again for the ones that failed.
                        </div>
                      )}
                      {res.removedDirs.length > 0 && (
                        <div className="fbhint">
                          {res.dryRun ? "would remove" : "removed"} {res.removedDirs.length} empty folder
                          {res.removedDirs.length === 1 ? "" : "s"} it had created
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {open && b.items.length > 0 && (
                <div className="deskitems">
                  {b.items.map((it) => (
                    <div className="deskitem" key={`${b.batchId}-${it.idx}`}>
                      <span className="lbl">FROM</span>
                      <span>
                        <Untrusted value={it.fromAbs} disclose />
                      </span>
                      <span className={`fbstat ${ITEM_CLASS[it.status] ?? "warn"}`}>
                        {it.status.toUpperCase().replace(/-/g, " ")}
                      </span>
                      <span className="lbl">INTO</span>
                      <span>
                        <Untrusted value={it.toAbs} disclose />
                      </span>
                      <span />
                      {it.why && <span className="fbwhy">{it.why}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="footline">
        this is the only screen in the app that shows absolute paths. the brain never sees them, and
        the journal never leaves this machine.
      </div>
    </div>
  );
}
