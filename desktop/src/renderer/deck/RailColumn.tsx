// PRESENCE RAIL (264px) — owning stream: S2. Artboard A left column + the five
// states from Artboard G.
//
// She is a permanent rail, never a window you visit (handoff §5). The chrome
// works — ripples, arc, waveform, red brackets — and the portrait never changes
// expression. Aura + motes live ONLY here (handoff §3.3 desktop dosing): six
// motes over a 613px data column reads as noise; over her portrait it reads as
// presence.

import type { CSSProperties } from "react";
import type { ConnectorStatus } from "@shared/contract";
import RingCanvas from "../components/RingCanvas";
import VoiceLabel from "../voice/VoiceLabel";
import { Chip } from "../components/atoms";
import { ENT, type EveMode, type WardrobeView } from "./types";

export interface RailColumnProps {
  mode: EveMode;
  toolNote: string | null;
  /** A voiceEvents transient note; overrides the state line for its ttl. */
  transientNote: string | null;
  wardrobe: WardrobeView;
  plateMode: "core" | "portrait" | null;
  connectors: ConnectorStatus[];
  /**
   * DEAD as of stream V and left only so the deck's existing call site keeps
   * compiling: it was fed `voices[0].name` off GET /voice/voices, which is
   * ElevenLabs' array order and not her configured voice — that is what made
   * this rail print "ADAM" while she was set to Lara. The line below asks
   * <VoiceLabel> instead, which resolves the CONFIGURED id to a name or prints
   * "—". Nothing may render this prop again.
   */
  voiceName?: string | null;
  silentAtDesk: boolean;
  quietHours: boolean;
  onToggleSilent: () => void;
  onOpenWardrobe: () => void;
  onOpenSettings: () => void;
}

// Artboard A line 9, verbatim: the motes carry their duration and delay inline
// because the .mote shorthand (`animation:floatup linear infinite`) omits both.
const MOTES: CSSProperties[] = [
  { left: 30, top: 300, width: 2, height: 2, background: "rgba(28,185,200,.45)", animationDuration: "13s", animationDelay: "0s" },
  { left: 120, top: 420, width: 3, height: 3, background: "rgba(155,239,247,.35)", animationDuration: "17s", animationDelay: "-4s" },
  { left: 200, top: 520, width: 2, height: 2, background: "rgba(28,185,200,.45)", animationDuration: "11s", animationDelay: "-2s" },
  { left: 60, top: 600, width: 2, height: 2, background: "rgba(155,239,247,.45)", animationDuration: "19s", animationDelay: "-8s" },
  { left: 170, top: 680, width: 3, height: 3, background: "rgba(28,185,200,.45)", animationDuration: "15s", animationDelay: "-6s" },
  { left: 110, top: 760, width: 2, height: 2, background: "rgba(155,239,247,.4)", animationDuration: "12s", animationDelay: "-3s" },
];

function findConnector(cs: ConnectorStatus[], key: string): ConnectorStatus | undefined {
  const k = key.toLowerCase();
  // The live brain keys this "deepgram"; the EVE_MOCK fixtures key it "DG" and
  // name it "Deepgram". Match either so the rail never lies on mock data.
  return cs.find((c) => c.key.toLowerCase() === k || c.name.toLowerCase().startsWith(k));
}

function dotStyle(c: ConnectorStatus): CSSProperties {
  const base: CSSProperties = { width: 6, height: 6, borderRadius: "50%", display: "inline-block" };
  if (c.connected) return { ...base, background: "var(--tealHi)" };
  if (c.detail.includes("KEY")) return { ...base, background: "var(--gold)" };
  if (c.detail.includes("PHASE")) return { ...base, border: "1px dashed rgba(240,237,232,.3)" };
  return { ...base, background: "rgba(240,237,232,.22)" };
}

export default function RailColumn(p: RailColumnProps) {
  const alert = p.mode === "alert";
  const ent = ENT[p.mode];
  const hasLook = !!p.wardrobe.url;
  // Phone :759 — his local toggle wins, otherwise her worn look decides, and
  // the && backstop means "portrait" with no image still falls to the core.
  const showPortrait = (p.plateMode ?? (hasLook ? "portrait" : "core")) === "portrait" && hasLook;

  const stateText = p.transientNote
    ? p.transientNote
    : `${ent.dot} ${ent.label}${p.mode === "thinking" && p.toolNote ? ` · ${p.toolNote.replace(/_/g, " ").toUpperCase()}` : ""}`;
  const stateClass = `stateline${p.mode === "listening" ? " listen" : p.mode === "thinking" ? " think" : alert ? " alert" : ""}`;

  const dg = findConnector(p.connectors, "deepgram");
  const liveCount = p.connectors.filter((c) => c.connected).length;

  return (
    <div className="col cant-left" style={{ padding: "16px 16px 14px" }}>
      <div className="aura" style={{ top: -140, width: 420, height: 360 }} />
      {MOTES.map((m, i) => (
        <i className="mote" key={i} style={m} />
      ))}

      {/* ---- portrait plate ------------------------------------------------ */}
      <div
        className="pcard"
        style={{ width: 232, height: 356, flex: "none", cursor: "pointer" }}
        onClick={p.onOpenWardrobe}
        title="Her closet"
      >
        <span className="pc tl" style={alert ? { borderColor: "var(--red)" } : undefined} />
        <span className="pc tr" style={alert ? { borderColor: "var(--red)" } : undefined} />
        <span className="pc bl" style={alert ? { borderColor: "var(--red)" } : undefined} />
        <span className="pc br" style={alert ? { borderColor: "var(--red)" } : undefined} />
        <div className="pfr">
          <div style={{ position: "absolute", inset: 0, opacity: alert ? 0.6 : 1 }}>
            {showPortrait ? (
              <>
                {p.wardrobe.prevUrl ? <img className="pfrimg" src={p.wardrobe.prevUrl} alt="" /> : null}
                <img
                  key={p.wardrobe.url ?? ""}
                  className={`pfrimg${p.wardrobe.prevUrl ? " fadein" : ""}`}
                  src={p.wardrobe.url ?? ""}
                  alt={p.wardrobe.name ?? "her worn look"}
                />
              </>
            ) : (
              <div className="plateCore">
                <span
                  className={alert ? "orb red" : "orb"}
                  style={{ width: 148, height: 148, display: "block" }}
                />
              </div>
            )}
          </div>
          <div className="sheen" />
          {p.mode === "listening" ? (
            <>
              {/* No inline radius: .ripple's own 10px + inset:0 makes these
                  rings hug the 232x356 plate edge, which is the G-board law.
                  (The summon orb's ripples keep their 50% — that one is round.) */}
              <span className="ripple" />
              <span className="ripple" style={{ animationDelay: ".8s" }} />
              <span className="ripple" style={{ animationDelay: "1.6s" }} />
            </>
          ) : null}
          {p.mode === "thinking" ? <span className="arc" /> : null}
        </div>
        {p.wardrobe.changedCaption ? (
          <div
            style={{
              position: "absolute",
              left: 3,
              right: 3,
              bottom: 3,
              zIndex: 4,
              padding: "6px 8px",
              textAlign: "center",
              background: "rgba(7,11,12,.82)",
              borderTop: "1px solid rgba(28,185,200,.3)",
              borderRadius: "0 0 8px 8px",
            }}
          >
            <span className="wearnote">{p.wardrobe.changedCaption}</span>
          </div>
        ) : null}
      </div>

      {/* ---- badge row ----------------------------------------------------- */}
      <div className="pbadge" style={{ marginTop: 14 }}>
        <span className="wm">EVE</span>
        <span className="dv" />
        <span className="lk">{p.wardrobe.name ?? "—"}</span>
        {p.mode === "speaking" ? (
          <span className="wave" style={{ marginLeft: "auto" }}>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span
            className={alert ? "orb red" : "orb"}
            style={{ width: 22, height: 22, marginLeft: "auto" }}
          />
        )}
      </div>

      {/* ---- state line ---------------------------------------------------- */}
      <div className={stateClass} style={{ marginTop: 12, color: p.transientNote ? "var(--ice)" : ent.col }}>
        {stateText}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 8, flex: "none" }}>
        <RingCanvas />
      </div>

      {/* ---- voice block --------------------------------------------------- */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: ".16em",
          color: "var(--dim)",
        }}
      >
        {dg?.connected ? (
          <span>
            DEEPGRAM <span style={{ color: "var(--tealHi)" }}>●</span> LIVE
          </span>
        ) : (
          <span style={{ color: "var(--gold)" }}>EARS — KEY NEEDED</span>
        )}
        {/* The name is resolved from the id the brain reports as CONFIGURED —
            never a baked-in "LARA"/"RACHEL", and never voices[0]. Unresolvable
            means "—", never a guess. */}
        <VoiceLabel />
      </div>

      <div style={{ marginTop: 10 }}>
        <Chip
          label="[ SILENT AT THE DESK ]"
          on={p.silentAtDesk}
          onClick={p.onToggleSilent}
          title="Voice out stays off while this is lit"
        />
      </div>

      <div
        style={{
          marginTop: 10,
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: ".16em",
          color: p.quietHours ? "var(--gold)" : "rgba(240,237,232,.4)",
        }}
      >
        {p.quietHours ? "☾ " : ""}QUIET 21:30–06:30
      </div>

      {/* ---- wire micro-row, pinned bottom --------------------------------- */}
      <button
        type="button"
        className="wirerow"
        style={{ marginTop: "auto" }}
        onClick={p.onOpenSettings}
        title="The wire"
      >
        {p.connectors.map((c) => (
          <span key={c.key} style={dotStyle(c)} />
        ))}
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 8.5,
            letterSpacing: ".16em",
            color: "rgba(240,237,232,.4)",
            marginLeft: 6,
          }}
        >
          {liveCount}/{p.connectors.length} LIVE
        </span>
      </button>
    </div>
  );
}
