// THE COMMAND DECK — owning stream: S2. Artboard A.
//
// Presentational on purpose: every piece of live data arrives as a prop from
// App.tsx, so a shot scenario can drive the whole deck from a fixture without a
// brain, a poll, or a modal layer on top of it.
//
// Frame law: the artboard's .frame is a fixed 1440x900 slab; the real window is
// resizable (min 1120x720), so app.css makes .frame fill it and the grid's last
// column 1fr. The cant is driven by explicit .cant-left / .cant-right classes,
// never by :first-of-type — column order is not a design decision.

import type { EveState, Vitals } from "@shared/contract";
import Tbar from "./Tbar";
import RailColumn from "./RailColumn";
import TalkColumn from "./TalkColumn";
import DataColumn from "./DataColumn";
import { SettingsPane } from "./s3-contracts";
import CoreScreen from "../core/CoreScreen";
import type { NavDest } from "./NavStrip";
import type { ChatView, DeckView, EveMode, WardrobeView } from "./types";

export interface DeckProps {
  now: Date;
  sessionNo: number;
  state: EveState;
  fetchedAt: string | null;
  refresh: () => Promise<void>;
  chat: ChatView;
  /** The resolved presence mode: preview > voice override > chat-derived. */
  mode: EveMode;
  transientNote: string | null;
  wardrobe: WardrobeView;
  plateMode: "core" | "portrait" | null;
  voiceName: string | null;
  silentAtDesk: boolean;
  quietHours: boolean;
  view: DeckView;
  /** The wardrobe overlay's state. It is NOT a DeckView (App.tsx owns it as a
      separate boolean), but the nav has to be able to light it and close it,
      so it is threaded down here alongside `view`. */
  closetOpen: boolean;
  vitals: Vitals | null;
  /** DISPATCH v0.1 — a shot fixture opens THE CORE on this job's detail.
   *  App never sets it; the live screen opens detail by click. */
  coreJobId?: string;
  /** DISPATCH v0.1 — a shot fixture opens THE CORE with the roster panel open. */
  coreRosterOpen?: boolean;
  onSend: (text: string) => void;
  onConfirmResolved: (id: string) => void;
  onToggleSilent: () => void;
  onOpenWardrobe: () => void;
  onCloseWardrobe: () => void;
  onView: (view: DeckView) => void;
}

export default function Deck(p: DeckProps) {
  // ONE router for all four destinations, so a click in the nav, a click on her
  // portrait and a press of 3 all mean the same thing. CLOSET toggles because
  // it is an overlay; the three views do not, because "click DECK while on the
  // deck" should be a no-op, not a trip somewhere else. Any view jump also
  // drops the closet — otherwise the panel would hang over the pane he just
  // asked for.
  const go = (dest: NavDest) => {
    if (dest === "closet") {
      if (p.closetOpen) p.onCloseWardrobe();
      else p.onOpenWardrobe();
      return;
    }
    if (p.closetOpen) p.onCloseWardrobe();
    p.onView(dest);
  };

  return (
    <div className="frame">
      <Tbar
        now={p.now}
        online={p.state.online}
        sessionNo={p.sessionNo}
        view={p.view}
        closetOpen={p.closetOpen}
        onGo={go}
      />

      {p.view === "core" ? (
        // THE CORE mounts exactly the way settings does — a full-frame pane
        // under the title bar, outside the three-column grid — so .scan, .vig
        // and the nav strip are all inherited unchanged. .corewrap rather than
        // .panewrap because this screen fits its frame and must not scroll.
        <div className="corewrap">
          <CoreScreen
            sessionNo={p.sessionNo}
            state={p.state}
            fetchedAt={p.fetchedAt}
            chat={p.chat}
            mode={p.mode}
            quietHours={p.quietHours}
            initialJobId={p.coreJobId}
            initialRosterOpen={p.coreRosterOpen}
            onSend={p.onSend}
            onConfirmResolved={p.onConfirmResolved}
          />
        </div>
      ) : p.view === "settings" ? (
        // Artboard F is a FULL-FRAME pane under the title bar — no rail, no
        // talk column. Artboard D (body) is not: that one only takes the data
        // column, because she stays on screen while he logs his day.
        <div className="panewrap">
          <SettingsPane onBack={() => p.onView("deck")} />
        </div>
      ) : (
        <div className="deck">
          <RailColumn
            mode={p.mode}
            toolNote={p.chat.toolNote}
            transientNote={p.transientNote}
            wardrobe={p.wardrobe}
            plateMode={p.plateMode}
            connectors={p.state.connectors ?? []}
            voiceName={p.voiceName}
            silentAtDesk={p.silentAtDesk}
            quietHours={p.quietHours}
            onToggleSilent={p.onToggleSilent}
            onOpenWardrobe={p.onOpenWardrobe}
            onOpenSettings={() => p.onView("settings")}
          />
          <div className="vr" />
          <TalkColumn
            messages={p.chat.messages}
            streamingId={p.chat.streamingId}
            mode={p.chat.mode}
            errNote={p.chat.errNote}
            online={p.state.online}
            busy={p.chat.busy}
            onSend={p.onSend}
            onConfirmResolved={p.onConfirmResolved}
          />
          <div className="vr" />
          <DataColumn
            state={p.state}
            fetchedAt={p.fetchedAt}
            now={p.now}
            vitals={p.vitals}
            showBody={p.view === "body"}
            onOpenBody={() => p.onView("body")}
            onBack={() => p.onView("deck")}
            onRefresh={p.refresh}
          />
        </div>
      )}

      <div className="scan" />
      <div className="vig" />
    </div>
  );
}
