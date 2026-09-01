// owner: stream S4
//
// LOCALSTORAGE PROBE — proves (or disproves) the frozen integration contract
// that the deck, the summon overlay and the flyout share ONE localStorage, and
// therefore one "eve.desktop.conversationId".
//
// Reachable only as "<page>.html?shot=ls-probe". It prints location.origin (the
// thing that decides the storage partition), appends a marker keyed to the page
// it is running on, and dumps every marker it can see — so running it on
// summon.html and then on flyout.html answers the question by observation
// instead of by assumption.

import { useLayoutEffect, useState } from "react";
import { CONVERSATION_KEY } from "./useVoiceTurn";

const MARKER_KEY = "eve.s4.lsprobe";

const WRAP = {
  width: 680,
  background: "#0C1417",
  border: "1px solid rgba(28,185,200,.45)",
  borderRadius: 12,
  padding: "14px 16px",
  fontFamily: "var(--mono), Consolas, monospace",
  fontSize: 11,
  lineHeight: 1.6,
  color: "#E8E2D6",
} as const;

export default function LsProbe(): JSX.Element {
  const [rows, setRows] = useState<string[]>([]);

  useLayoutEffect(() => {
    const out: string[] = [];
    const page = window.location.pathname.split("/").pop() || "?";
    out.push(`page          ${page}`);
    out.push(`origin        ${window.location.origin}`);
    out.push(`protocol      ${window.location.protocol}`);
    try {
      const before = localStorage.getItem(MARKER_KEY) ?? "";
      out.push(`markers.before ${before || "(none)"}`);
      const next = before ? `${before} | ${page}` : page;
      localStorage.setItem(MARKER_KEY, next);
      out.push(`markers.after  ${localStorage.getItem(MARKER_KEY)}`);
      out.push(`convId        ${localStorage.getItem(CONVERSATION_KEY) ?? "(unset)"}`);
      out.push(`keys          ${localStorage.length}`);
    } catch (err) {
      out.push(`localStorage  THREW ${err instanceof Error ? err.message : String(err)}`);
    }
    setRows(out);
    window.__RENDER_DONE = true;
  }, []);

  return (
    <div style={WRAP}>
      <div style={{ color: "#1CB9C8", letterSpacing: ".2em", marginBottom: 8 }}>
        S4 · SHARED-ORIGIN PROBE
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ whiteSpace: "pre-wrap" }}>
          {r}
        </div>
      ))}
    </div>
  );
}
