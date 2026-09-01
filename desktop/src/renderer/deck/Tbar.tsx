// The 32px title bar — owning stream: S2.
//
// The window is frameless (electron/windows.ts:137), so this strip IS the
// chrome: it drags the window, it carries the link light, and it holds the only
// minimise/maximise/close there is. Layout and copy are Artboard A's title bar;
// the window glyphs are the desktop's own.
//
// It now also carries the NAV STRIP, in the dead space between the clock and
// the session badge — see NavStrip.tsx for why that space and not a column.
// Three flex children under the existing `justify-content: space-between`, so
// the nav is laid OUT between the two text groups and can never overlap them
// the way an absolutely-centred strip would at the 1120px minimum.
//
// The lone `WIRE` .tbtn that used to sit next to the LINK light is gone: WIRE
// is now a named segment in the nav, and two buttons 200px apart in a 32px
// strip that open the same pane is the confusion this stream was sent to fix.
// The wire is still reachable three ways — the nav segment, key 4, and the
// rail's connector micro-row (RailColumn.tsx:222).

import NavStrip, { type NavDest } from "./NavStrip";
import type { DeckView } from "./types";
import { APP_VERSION, clockStr, dateStr, pad3, weekNo } from "./format";

export interface TbarProps {
  now: Date;
  online: boolean;
  sessionNo: number;
  /** Which DeckView is mounted underneath — drives the nav's lit segment. */
  view: DeckView;
  /** The wardrobe overlay is not a DeckView; while it is open it is where he is. */
  closetOpen: boolean;
  onGo: (dest: NavDest) => void;
}

export default function Tbar({ now, online, sessionNo, view, closetOpen, onGo }: TbarProps) {
  return (
    <div className="tbar">
      <span>
        {clockStr(now)} · {dateStr(now)} · WK {weekNo(now)}
      </span>

      <NavStrip view={view} closetOpen={closetOpen} onGo={onGo} />

      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="sesch">SES {pad3(sessionNo)} — WAKE THE ENGINE</span>
        <b>EVE//OS {APP_VERSION}-DESKTOP</b>
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          <span className={online ? "dot" : "dot down"} />
          {online ? "LINK" : "DOWN"}
        </span>
        <span style={{ display: "inline-flex", gap: 2, marginRight: -8 }}>
          <button
            type="button"
            className="winbtn"
            onClick={() => window.eve.win.minimize()}
            title="Minimise"
            aria-label="Minimise"
          >
            –
          </button>
          <button
            type="button"
            className="winbtn"
            onClick={() => window.eve.win.maximize()}
            title="Maximise"
            aria-label="Maximise"
          >
            □
          </button>
          <button
            type="button"
            className="winbtn x"
            onClick={() => window.eve.win.close()}
            title="Close"
            aria-label="Close"
          >
            ✕
          </button>
        </span>
      </span>
    </div>
  );
}
