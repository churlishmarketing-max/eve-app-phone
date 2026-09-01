// THE CORE — the hybrid screen. Owning stream: THE CORE.
//
// THE FUSION, IN ONE PARAGRAPH. THE CORE (ui_kits/eve-anime/G-core.html)
// supplied the LAYOUT and the DEVICES: a full-bleed fleet strip over a
// three-column body over a telemetry rail; a living core of counter-rotating
// rings; a counter rail; dot-leader status lines; a terminal prompt; a section
// head with a solid state plate. The shipped teal terminal-noir system supplied
// the PALETTE, the COMPONENT VOCABULARY (.card, .node, .orb, .stateline,
// .cmdinput, .sendb, .fbr, .cur, .footline, .kbd) and the LAWS. Layout and
// palette are separate axes, and this app already has four palettes — so this
// is a fifth LAYOUT that renders in all four worlds, not a fifth world.
//
// PRESENTATIONAL ON PURPOSE, exactly like Deck.tsx: every figure arrives as a
// prop, so a shot scenario can drive the whole board from a fixture with no
// brain, no poll and no bridge round-trip. CoreScreen.tsx is the thin container
// that supplies /health and the session log to the real app.
//
// WHAT IS NOT HERE, AND WHY — the short list. Leads, clips, spend, angles,
// tribunal, threads, vectors, latency, confidence, the weather, signed-today,
// held-today, and eight agent load bars are all absent because no field on the
// wire produces them. THE CORE's "Speaking — analyzing the renewal" caption is
// absent because she does not speak canned lines. Its "core --attach fleet"
// prompt is absent because a command line showing a command he never typed is a
// fiction on the one device whose whole job is to take his commands — the
// prompt echoes his last real turn or it stays empty.

import { useCallback, useRef, useState } from "react";
import type { EveState, Health } from "@shared/contract";
import type { ChatView, EveMode } from "../deck/types";
import { APP_VERSION, pad3 } from "../deck/format";
import { SHELL_COPY } from "../deck/panes/shell";
import FleetStrip from "./FleetStrip";
import LivingCore from "./LivingCore";
import { DASH, railCounters, telemetryCells, type Tone } from "./counters";
import type { CoreLogEntry } from "./useCoreLog";
import "../../styles/core.css";

function toneClass(t: Tone): string {
  if (t === "hot") return "hot";
  if (t === "red") return "red";
  if (t === "off") return "off";
  return "";
}

export interface CorePaneProps {
  sessionNo: number;
  state: EveState;
  fetchedAt: string | null;
  /** GET /health — the ONLY source of the REGISTERED count and MEMORY. */
  health: Health | null;
  /** api.ts's error from the most recent /health poll, or null when it answered. */
  healthError?: string | null;
  chat: ChatView;
  /** The resolved presence mode: preview > voice override > chat-derived. */
  mode: EveMode;
  quietHours: boolean;
  /** Real events observed this session. Never seeded with plausible history. */
  log: CoreLogEntry[];
  /** The existing chat path. This screen starts no second chat state machine. */
  onSend: (text: string) => void;
}

export default function CorePane(p: CorePaneProps) {
  const rows = railCounters(p.state);
  const cells = telemetryCells(p.state, p.health, p.quietHours);
  const reds = p.state.online ? (p.state.pendingConfirms ?? []).length : null;

  return (
    <div className="corepane">
      <FleetStrip state={p.state} health={p.health} />

      <div className="corebody">
        {/* ---- left: the counter rail + the clearance ladder ------------- */}
        <div className="corecol">
          <div className="card tickrail">
            <div className="railhead">// THE WIRE — LIVE COUNTERS</div>
            {rows.map((r) => (
              <div className="trow" key={r.key}>
                <span className="s">{r.label}</span>
                <span className={`n ${toneClass(r.tone)}`.trim()}>{r.value}</span>
              </div>
            ))}
            {!p.state.online ? (
              <div className="corenote coreshell">
                Every counter above reads a field her brain serves. It is not
                answering, so they read as dashes rather than zeroes.
              </div>
            ) : null}
          </div>

          {/* THE CORE's LV.0 / LV.1 / LV.2 boxes, drawn as what they actually
              are in this app: the autonomy ladder, stated verbatim on every
              surface. This is the ONE place on this screen where green is
              lawful — there it IS the GREEN autonomy dot. */}
          <div className="card" style={{ padding: "12px 14px", flex: "none" }}>
            <div className="railhead" style={{ borderBottom: "none", paddingBottom: 6 }}>
              // CLEARANCE — HOUSE RULES
            </div>
            <div className="lvrow">
              <span className="kbd corelv">
                <span className="tierdot" style={{ background: "var(--green)" }} />
                GREEN
              </span>
              <span className="kbd corelv">
                <span className="tierdot" style={{ background: "var(--gold)" }} />
                YELLOW
              </span>
              <span className={reds ? "kbd corelv lit" : "kbd corelv"}>
                <span className="tierdot" style={{ background: "var(--red)" }} />
                RED
              </span>
            </div>
            <div className="dotline" style={{ marginTop: 10 }}>
              <span className="gt">&gt;</span>
              <span>waiting on your thumb</span>
              <span className="dots" aria-hidden="true">
                ..........................................
              </span>
              <span className={reds ? "val" : "val off"}>{reds === null ? DASH : reds}</span>
            </div>
            <div className="corenote" style={{ marginTop: 8 }}>
              The ladder is set in the wire — key 4.
            </div>
          </div>

          {/* The rows sit at the top of the rail; this eats the slack so they
              never stretch to fill a tall column. */}
          <div style={{ flex: 1, minHeight: 0 }} />
        </div>

        {/* ---- centre: the living core ----------------------------------- */}
        <LivingCore
          mode={p.mode}
          toolNote={p.chat.toolNote}
          streaming={p.chat.streamingId !== null}
          state={p.state}
          health={p.health}
          healthError={p.healthError ?? null}
          fetchedAt={p.fetchedAt}
        />

        {/* ---- right: the session log + the command bar ------------------ */}
        <div className="corecol">
          <div className="card logwrap" style={{ padding: "12px 14px" }}>
            <div className="railhead" style={{ borderBottom: "none", paddingBottom: 0 }}>
              // 03 · SESSION LOG — SES {pad3(p.sessionNo)}
            </div>
            {p.log.length === 0 ? (
              <div className="shellcopy coreshell">
                Nothing has happened on this screen yet. It fills as she works —
                turns, tools, refreshes, failures, RED cards. It is never seeded.
              </div>
            ) : (
              <div className="log">
                {p.log.map((e) => (
                  <div className={`logrow ${e.tone === "dim" ? "" : e.tone}`.trim()} key={e.id}>
                    <span className="t">{e.at}</span>
                    <span className="m">{e.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* The slack sits BETWEEN the two cards, so the command bar stays
              pinned to the bottom of the column and the log card stays the
              size of the log. */}
          <div style={{ flex: 1, minHeight: 0 }} />

          <CommandCard
            online={p.state.online}
            busy={p.chat.busy}
            onSend={p.onSend}
          />
        </div>
      </div>

      {/* ---- ZONE C: the telemetry strip -------------------------------- */}
      <div className="card telem">
        {cells.map((c, i) => (
          <div className={i === cells.length - 1 ? "tcell last" : "tcell"} key={c.key}>
            <span className="k">{c.label}</span>
            <span className={`v ${toneClass(c.tone) === "" ? "acc" : toneClass(c.tone)}`}>
              {c.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- the command bar ------------------------------------------------------
   A REAL input on the REAL chat path. `onSend` is App.tsx's sendMessage, the
   same function the deck's composer calls, so this screen adds no second chat
   state machine, no second conversationId and no second frame reducer. The
   prompt line above it echoes his LAST ACTUAL TURN — never a typed command he
   did not type. */

function CommandCard({
  online,
  busy,
  onSend,
}: {
  online: boolean;
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);
  const box = useRef<HTMLInputElement | null>(null);

  const blocked = !online || busy;

  const send = useCallback(() => {
    const t = draft.trim();
    if (!t || blocked) return;
    onSend(t);
    setLastSent(t);
    setDraft("");
    box.current?.focus();
  }, [draft, blocked, onSend]);

  return (
    <div className="card" style={{ padding: "12px 14px", flex: "none" }}>
      <div className="prompt">
        <span className="usr">eve@hq</span>:~ ${" "}
        {lastSent ? `${lastSent.slice(0, 64)}${lastSent.length > 64 ? "…" : ""}` : ""}
        <span className="cur">▌</span>
      </div>

      <div className="cmdbar" style={{ marginTop: 8 }}>
        <span className="pfx" aria-hidden="true">
          &gt;_
        </span>
        <input
          ref={box}
          className="cmdinput"
          type="text"
          value={draft}
          disabled={blocked}
          placeholder={online ? "Give her the job." : "Offline."}
          aria-label="Send a turn to EVE"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          className="sendb"
          onClick={send}
          disabled={blocked || draft.trim().length === 0}
          title="Send"
          aria-label="Send"
        >
          ➤
        </button>
      </div>

      <div className="corenote" style={{ marginTop: 8 }}>
        {!online
          ? SHELL_COPY
          : busy
            ? "She is mid-turn. The next one waits until this one closes."
            : `Typed turns only here — push-to-talk lives on the deck. EVE//OS ${APP_VERSION}`}
      </div>
    </div>
  );
}
