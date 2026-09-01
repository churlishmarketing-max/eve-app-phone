// owner: stream S4
//
// Visual probes for the two S4 behaviours a static scenario cannot show:
// the mic's colour states, and type-to-switch. Registered in s4-scenarios.tsx,
// reachable only via "?shot=", never mounted by the app.

import { useEffect, useRef } from "react";
import MicButton from "../voice/MicButton";
import SummonApp from "./SummonApp";

const LABEL = {
  fontFamily: "var(--mono)",
  fontSize: 8.5,
  letterSpacing: ".2em",
  color: "rgba(240,237,232,.45)",
  marginTop: 10,
} as const;

const MIC_PATH =
  "M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Zm6-4a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.94V22h2v-3.06A8 8 0 0 0 20 11h-2Z";

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {children}
      <span style={LABEL}>{label}</span>
    </div>
  );
}

/**
 * The live MicButton in its two reachable-without-a-mic states, beside a bare
 * `.micv6.on` node. That third cell is a STYLESHEET probe, not the component:
 * the recording state cannot be entered headless (getUserMedia has no device to
 * open), and faking it inside the component would be a lie.
 */
export function MicStates(): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        gap: 44,
        padding: "22px 26px",
        background: "#0C1417",
        border: "1px solid rgba(28,185,200,.45)",
        borderRadius: 12,
        width: 420,
      }}
    >
      <Cell label="IDLE">
        <MicButton />
      </Cell>
      <Cell label="DISABLED">
        <MicButton disabled />
      </Cell>
      <Cell label="ON (CSS PROBE)">
        <div className="micv6 on">
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: "currentColor" }}>
            <path d={MIC_PATH} />
          </svg>
        </div>
      </Cell>
    </div>
  );
}

/**
 * The REAL SummonApp, with one synthetic printable keydown dispatched at the
 * window after mount — the same event a keypress produces. If the .cmdinput row
 * appears carrying that character, type-to-switch works.
 */
export function SummonTyping(): JSX.Element {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    window.__RENDER_DONE = false;
    window.setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true }));
      window.setTimeout(() => {
        window.__RENDER_DONE = true;
      }, 150);
    }, 150);
  }, []);
  return <SummonApp />;
}
