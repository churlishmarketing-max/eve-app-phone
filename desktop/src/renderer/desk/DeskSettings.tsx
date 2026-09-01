// owner: stream S3 (DESK/UI) — THE FILING SECTION IN SETTINGS.
//
// Hop 0 of the spec: enrollment. Nothing about filing exists until King wires a
// root by hand here, and the master switch is OFF until he turns it on after
// reading the disclosure.
//
// Four things this panel refuses to do:
//
//   1. It never types a path. `enroll()` takes NO argument — main opens the
//      native dialog and uses its own result. The renderer cannot express a
//      folder, which is why there is no text input on this screen. (§4.3)
//   2. It never claims a probe passed that it cannot see. Every badge reads off
//      DeskRootView; a root that failed renders REFUSED with the reason,
//      verbatim, and is never silently dropped.
//   3. It never arms without the disclosure. The screen below is shown every
//      time the switch is about to go from OFF to ARMED — the spec asks for
//      once, and every-time is the superset. (G-V3)
//   4. It never says a folder is safe. It says what she will be able to SEE and
//      what she will be able to DO, in the same words the executor uses.
import { useCallback, useEffect, useState } from "react";
import type { DeskRootProbe, DeskRootView, DeskStatus } from "@shared/contract";
import Untrusted from "./untrusted";
import { fmtBytes } from "./payload";
import KillSwitch from "./KillSwitch";
import "./desk.css";

/** The subset of window.eve.desk this panel needs — injectable for shots. */
export interface DeskSettingsBridge {
  roots(): Promise<DeskRootView[]>;
  status(): Promise<DeskStatus>;
  enroll(): Promise<DeskRootProbe>;
  setRoot(label: string, patch: { dryRun?: boolean; remove?: true }): Promise<{ ok: boolean; error?: string }>;
  arm(on: boolean): Promise<{ ok: boolean; enabled: boolean; killAccel: string | null; error?: string }>;
  kill(): Promise<{ ok: boolean; enabled: boolean; killAccel: string | null; stopped?: number }>;
}

export interface DeskSettingsProps {
  bridge?: DeskSettingsBridge;
  /** Shot seams. */
  initialRoots?: DeskRootView[];
  initialStatus?: DeskStatus;
  initialDisclosure?: boolean;
}

function liveBridge(): DeskSettingsBridge {
  return window.eve.desk;
}

export default function DeskSettings({
  bridge,
  initialRoots,
  initialStatus,
  initialDisclosure = false,
}: DeskSettingsProps) {
  const io = bridge ?? liveBridge();
  const seeded = initialRoots !== undefined || initialStatus !== undefined;

  const [roots, setRoots] = useState<DeskRootView[] | null>(initialRoots ?? null);
  const [status, setStatus] = useState<DeskStatus | null>(initialStatus ?? null);
  const [disclosure, setDisclosure] = useState(initialDisclosure);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([io.roots(), io.status()]);
      setRoots(r);
      setStatus(s);
    } catch {
      setRoots([]);
      setNotice("THE DESK DID NOT ANSWER. FILING IS NOT AVAILABLE THIS SESSION.");
    }
  }, [io]);

  useEffect(() => {
    if (seeded) return;
    void load();
  }, [seeded, load]);

  const enrolled = roots ?? [];
  const good = enrolled.filter((r) => !r.refusal);
  const refused = enrolled.filter((r) => r.refusal);
  const armed = status?.enabled === true;
  const trashFiles = good.reduce((a, r) => a + r.trashFiles, 0);
  const trashBytes = good.reduce((a, r) => a + r.trashBytes, 0);
  const freeMin = good.length ? Math.min(...good.map((r) => r.freeOnVolume)) : 0;
  const allDry = good.length > 0 && good.every((r) => r.dryRun);
  const anyLive = good.some((r) => !r.dryRun);

  const doEnroll = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const p = await io.enroll();
      if (!p.ok) setNotice(`FOLDER REFUSED — ${(p.refusal ?? "no reason given").toUpperCase()}`);
      else setNotice(`ADDED ${(p.label ?? "").toUpperCase()} — DRY RUN IS ON.`);
    } catch (err) {
      setNotice(`COULD NOT ADD THAT FOLDER — ${(err instanceof Error ? err.message : "unknown").toUpperCase()}`);
    }
    setBusy(false);
    await load();
  };

  const setDry = async (label: string, dryRun: boolean) => {
    setBusy(true);
    const r = await io.setRoot(label, { dryRun });
    if (!r.ok) setNotice((r.error ?? "COULD NOT CHANGE THAT").toUpperCase());
    setBusy(false);
    await load();
  };

  const remove = async (label: string) => {
    setBusy(true);
    setConfirmRemove(null);
    await io.setRoot(label, { remove: true });
    setBusy(false);
    await load();
  };

  const arm = async (on: boolean) => {
    setBusy(true);
    const r = await io.arm(on);
    if (!r.ok) setNotice((r.error ?? "COULD NOT CHANGE THE MASTER SWITCH").toUpperCase());
    setDisclosure(false);
    setBusy(false);
    await load();
  };

  return (
    <div className="card deskset" style={{ padding: "14px 16px" }}>
      <div className="eyeb">
        <span>▸ FILING HANDS — FOLDERS SHE MAY TOUCH</span>
        <span className="r">SHIPS OFF · NOTHING MOVES WITHOUT A CARD YOU APPROVED</span>
      </div>

      {/* ---------------- master switch ---------------- */}
      <div className="deskmaster">
        <span className={armed ? "on" : "off"}>
          {armed ? "● ARMED" : "● OFF"} — FILING IS {armed ? "ON" : "OFF"}
        </span>
        {armed ? (
          <button type="button" className="chipv6" disabled={busy} onClick={() => void arm(false)}>
            TURN IT OFF
          </button>
        ) : (
          <button
            type="button"
            className="chipv6"
            disabled={busy || disclosure}
            onClick={() => setDisclosure(true)}
          >
            TURN IT ON
          </button>
        )}
        {status && !status.attrSweepOk && (
          <span className="deskprobe bad">ATTRIBUTE SWEEP FAILED — FILING IS PAUSED</span>
        )}
        {armed && allDry && <span className="fbdry">● EVERY FOLDER IS IN DRY RUN</span>}
        {armed && anyLive && <span className="fblive">● SOME FOLDERS ARE LIVE</span>}
      </div>

      {/* ---------------- the disclosure (G-V3 / PRIV-3) ---------------- */}
      {disclosure && (
        <div className="deskdisc">
          <h4>BEFORE YOU TURN THIS ON — WHAT LEAVES THIS MACHINE</h4>
          <p>
            Every message you send from this desk carries a <b>count</b> of what is in these folders:
            how many files, how big, how old, what kinds. <b>No names.</b>
          </p>
          <p>
            When she needs names, she asks for them, and <b>then</b> filenames — not contents, names —
            go to your brain on Railway and on to Anthropic's API. Not the files. Not a single byte of
            what is inside them. Names, sizes and dates.
          </p>
          <p>
            When she tells you what she filed, she says the filenames out loud, and{" "}
            <b>that sentence is saved to your Supabase memory</b> like every other thing she says, and
            the 02:00 pass can promote it into a permanent memory. Filenames end up in your ledger.
            That is not avoidable and you should know it before you start.
          </p>
          <p>
            What <b>never</b> leaves: file contents, anything outside the folders you name below,
            anything matching your never-list — applied when she looks, and again at this desk
            before anything moves, so the rule still holds on a file she indexed before you wrote it
            — your journal, and your trash.
          </p>
          <div className="deskrow">
            <button type="button" className="cbtn ok" disabled={busy} onClick={() => void arm(true)}>
              I'VE READ THIS — ARM FILING HANDS
            </button>
            <button type="button" className="cbtn gh" onClick={() => setDisclosure(false)}>
              NOT YET
            </button>
          </div>
        </div>
      )}

      {/* ---------------- what enrollment actually grants ---------------- */}
      <div className="deskgrant">
        <span className="can">
          ✓ SHE WILL SEE: file names, sizes, dates and a type label, three folders deep, in the folders
          below only.
        </span>
        <span className="can">
          ✓ SHE WILL BE ABLE TO: propose a move, a rename, or a move into that folder's own trash —
          and each one arrives as a card you read and approve.
        </span>
        <span className="cannot">
          ✗ SHE WILL NEVER: delete anything, empty the trash, overwrite a file, open a file, touch a
          folder that is not below, or act on any schedule. There is no unattended path.
        </span>
        <span className="cannot">
          ✗ SHE CANNOT UNDO. Undo is yours, from the log, and it works with the brain offline.
        </span>
      </div>

      {/* ---------------- the roots ---------------- */}
      {roots === null && <div className="deskempty">READING YOUR FOLDERS…</div>}

      {roots !== null && enrolled.length === 0 && (
        <div className="deskempty">
          NO FOLDERS ENROLLED. She can see nothing and touch nothing.
          <br />
          Add one below — it starts in DRY RUN and stays there until you say otherwise.
        </div>
      )}

      {good.map((r) => (
        <div className="deskroot" key={r.label}>
          <div className="deskrow spread">
            <span className="lbl">{r.label.toUpperCase()}</span>
            <span className="meta">
              trash {r.trashFiles} {r.trashFiles === 1 ? "file" : "files"} · {fmtBytes(r.trashBytes)} ·{" "}
              {fmtBytes(r.freeOnVolume)} free
            </span>
          </div>
          <div className="path">
            <Untrusted value={r.path} />
          </div>
          {r.real && r.real.toLowerCase() !== r.path.toLowerCase() && (
            <div className="meta">
              RESOLVES TO <Untrusted value={r.real} className="dim" /> — containment is measured
              against this, not the name above.
            </div>
          )}
          <div className="meta">
            TRASH <Untrusted value={r.trash} className="dim" />
          </div>

          {r.synced && (
            <div className="fbbanner">
              ⚠ ONEDRIVE-SYNCED. Anything she files here UPLOADS to Microsoft and appears on every
              device you sync. Anything she moves OUT of here DISAPPEARS from those devices — the copy
              survives in your trash, locally, and nowhere else.
            </div>
          )}

          <div className="deskprobes">
            <span className={`deskprobe ${r.writeProbeOk ? "ok" : "bad"}`}>
              WRITE PROBE {r.writeProbeOk ? "✓" : "✗"}
            </span>
            <span className={`deskprobe ${r.attrSweepOk ? "ok" : "bad"}`}>
              ATTRIBUTE SWEEP {r.attrSweepOk ? "✓" : "✗"}
            </span>
            <span className={`deskprobe ${r.sameVolume ? "ok" : "bad"}`}>
              TRASH SAME VOLUME {r.sameVolume ? "✓" : "✗"}
            </span>
            <span className={`deskprobe ${r.synced ? "warn" : "ok"}`}>
              {r.synced ? "SYNCED" : "NOT SYNCED"}
            </span>
          </div>

          <div className="deskrow">
            <button
              type="button"
              className={`chipv6${r.dryRun ? " on" : ""}`}
              disabled={busy}
              aria-pressed={r.dryRun}
              onClick={() => void setDry(r.label, !r.dryRun)}
            >
              DRY RUN {r.dryRun ? "● ON" : "OFF ● SHE CAN REALLY MOVE THESE"}
            </button>
            {confirmRemove === r.label ? (
              <>
                <span className="fbhint">Remove it? She loses sight of this folder entirely.</span>
                <button type="button" className="cbtn ok" disabled={busy} onClick={() => void remove(r.label)}>
                  YES, REMOVE
                </button>
                <button type="button" className="cbtn gh" onClick={() => setConfirmRemove(null)}>
                  KEEP IT
                </button>
              </>
            ) : (
              <button type="button" className="chipv6" onClick={() => setConfirmRemove(r.label)}>
                REMOVE
              </button>
            )}
          </div>

          {!r.dryRun && (
            <div className="fbbanner">
              ⚠ DRY RUN IS OFF FOR THIS FOLDER. An approved card here moves real files. The card will
              say so, and the trash and the log still hold everything.
            </div>
          )}
        </div>
      ))}

      {/* A refused root is never silently dropped. */}
      {refused.map((r) => (
        <div className="deskroot refused" key={r.label}>
          <div className="deskrow spread">
            <span className="lbl">{r.label.toUpperCase()}</span>
            <span className="deskprobe bad">REFUSED</span>
          </div>
          <div className="path">
            <Untrusted value={r.path} />
          </div>
          <div className="fbbanner stop">{r.refusal}</div>
          <div className="deskrow">
            <button type="button" className="chipv6" disabled={busy} onClick={() => void remove(r.label)}>
              REMOVE IT FROM THE LIST
            </button>
          </div>
        </div>
      ))}

      <div className="deskrow">
        <button type="button" className="chipv6" disabled={busy} onClick={() => void doEnroll()}>
          + ADD A FOLDER
        </button>
        <span className="fbhint">
          Opens Windows' own folder picker. This app cannot type a path — the only folder it can
          enroll is the one you pick in that dialog.
        </span>
      </div>

      {notice && <div className="deskoffline">{notice}</div>}

      {/* ---------------- never-list ---------------- */}
      <div className="eyeb" style={{ marginTop: 4 }}>
        <span>NEVER-LIST</span>
        <span className="r">APPLIED AT SCAN TIME · MATCHES NEVER ENTER THE INDEX</span>
      </div>
      {status?.neverList && status.neverList.length > 0 ? (
        <div className="desknever">
          {status.neverList.map((rule) => (
            <i key={rule}>
              <Untrusted value={rule} />
            </i>
          ))}
        </div>
      ) : (
        <div className="deskempty">
          {status
            ? "YOUR NEVER-LIST IS EMPTY. Nothing in these folders is hidden from her."
            : "NOT READ YET."}
        </div>
      )}
      <div className="footline">
        she is told only that N entries are hidden from her, never which. editing this list is a
        config-file edit today — there is no channel that lets this screen write it.
      </div>

      {/* ---------------- trash + the stop ---------------- */}
      <div className="eyeb" style={{ marginTop: 4 }}>
        <span>TRASH</span>
        <span className="r">PER ROOT, SAME VOLUME · SHE NEVER EMPTIES IT</span>
      </div>
      <div className="deskrow spread">
        <span className="deskcounts">
          {trashFiles} {trashFiles === 1 ? "FILE" : "FILES"} · {fmtBytes(trashBytes)}
        </span>
        <span className="meta" style={{ fontFamily: "var(--mono)", fontSize: 9 }}>
          {good.length ? `${fmtBytes(freeMin)} FREE ON THE TIGHTEST VOLUME` : "NO VOLUME TO REPORT"}
        </span>
      </div>
      <div className="footline">
        nothing in this app empties a trash directory. not on a schedule, not on a size threshold, not
        on approval, not on request. you empty it.
      </div>

      <KillSwitch
        bridge={io}
        armed={armed}
        killAccel={status?.killAccel ?? null}
        onChanged={() => void load()}
      />

      {status && (
        <div className="footline">
          journal <Untrusted value={status.journalPath} className="dim" /> · desk {status.deskId.slice(0, 8)}
          {status.lastRefusal ? ` · last refusal: ${status.lastRefusal}` : ""}
        </div>
      )}
    </div>
  );
}
