// owner: stream S3 (DESK/UI) — THE PHYSICAL STOP.
//
// G-A6 / FM-ATTACK §9.7: "Neither source architecture had a physical stop on a
// feature that writes to his disk; that absence was its own finding."
//
// This button does exactly two things, and says both of them before and after:
//   1. It aborts every in-flight batch BETWEEN operations. Not mid-write —
//      there is no mid-write to abort into, and a torn move is worse than a
//      finished one. The journal records CANCELLED AT OP N.
//   2. It sets the master switch to OFF. Nothing can be minted, approved, or
//      executed again until he turns it back on through the disclosure.
//
// What it does NOT do, and says so: it does not reach back into what already
// moved. Those files are in the log with an UNDO beside them, which is the
// honest place for "put it back" to live.
import { useState } from "react";
import "./desk.css";

export interface KillBridge {
  kill(): Promise<{ ok: boolean; enabled: boolean; killAccel: string | null; stopped?: number }>;
}

export interface KillSwitchProps {
  bridge: KillBridge;
  armed: boolean;
  /** The accelerator that ACTUALLY bound in main — never the one the spec
   *  wished for. `Ctrl+Shift+Esc` is Task Manager and Windows will not give it
   *  up, so main falls back and reports what really took. */
  killAccel: string | null;
  onChanged?: () => void;
  /** Compact form for the deck's log panel. */
  compact?: boolean;
}

function prettyAccel(a: string): string {
  return a
    .split("+")
    .map((p) => {
      const s = p.trim().toLowerCase();
      if (s === "commandorcontrol" || s === "control" || s === "ctrl") return "CTRL";
      if (s === "command" || s === "cmd" || s === "meta" || s === "super") return "CMD";
      if (s === "alt" || s === "option") return "ALT";
      if (s === "shift") return "SHIFT";
      if (s === "escape") return "ESC";
      return p.trim().toUpperCase();
    })
    .join("+");
}

export default function KillSwitch({ bridge, armed, killAccel, onChanged, compact = false }: KillSwitchProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ stopped: number; wasArmed: boolean } | null>(null);

  const fire = async () => {
    if (busy) return;
    setBusy(true);
    const wasArmed = armed;
    try {
      const r = await bridge.kill();
      setResult({ stopped: r.stopped ?? 0, wasArmed });
    } catch {
      setResult(null);
    }
    setBusy(false);
    onChanged?.();
  };

  return (
    <div className="deskrow" style={{ alignItems: "flex-start", gap: 10 }}>
      <button type="button" className="deskkill" disabled={busy} onClick={() => void fire()}>
        ⛔ STOP FILING NOW
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {result ? (
          <div className="deskkilled">
            STOPPED. {result.stopped} in-flight {result.stopped === 1 ? "batch" : "batches"} aborted
            between operations. Filing is OFF{result.wasArmed ? "" : " (it was already off)"}.
            <br />
            Anything that had already moved is still moved — the log below says exactly what, and the
            UNDO beside it is how it comes back.
          </div>
        ) : compact ? (
          <div className="fbhint">
            Aborts the running batch and turns filing OFF.
            {killAccel ? (
              <>
                {" "}
                Same stop on <span className="kbd">{prettyAccel(killAccel)}</span> anywhere in Windows,
                and on STOP FILING NOW in the tray menu.
              </>
            ) : (
              <> ⚠ NO GLOBAL HOTKEY BOUND — this button and STOP FILING NOW in the tray menu are the only stops.</>
            )}
          </div>
        ) : (
          <div className="fbhint">
            Aborts any running batch between operations and sets the master switch to OFF. It does not
            reach back into what already moved — that is what UNDO in the log is for.
            <br />
            {killAccel ? (
              <>
                The same stop is on <span className="kbd">{prettyAccel(killAccel)}</span> anywhere in
                Windows, and on <b>STOP FILING NOW</b> in the tray icon&rsquo;s right-click menu. That
                menu prints the key that actually bound, never the one the spec asked for.
              </>
            ) : (
              <>
                ⚠ NO GLOBAL HOTKEY COULD BE BOUND ON THIS MACHINE. This button and{" "}
                <b>STOP FILING NOW</b> in the tray icon&rsquo;s right-click menu are the only stops. (The spec asks for Ctrl+Shift+Esc; Windows owns that combination — it is
                Task Manager — so main falls back, and prints whichever key actually took.)
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
