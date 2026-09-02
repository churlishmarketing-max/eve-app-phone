// ZONE B CENTRE — THE LIVING CORE. Owning stream: THE CORE.
//
// THE CORE draws a 290px orb inside three counter-rotating rings, a 44-bar
// waveform, a state caption and a 2x2 readout. Four of those five survive; the
// fifth — the readout — survives with all four of its cells replaced, because
// all four of THE CORE's cells report quantities that do not exist:
//
//   THREADS 6      there is exactly one conversationId. Nothing counts threads.
//   VECTORS 1,204  health.memoryReady is a BOOLEAN. No embedding count is on
//                  the wire.
//   LATENCY 240MS  StateUpdate carries {state, fetchedAt} and no round-trip.
//   CONFIDENCE 92% nothing in the brain emits a confidence, and nothing could:
//                  there is no quantity to report.
//
// What is drawn instead is four things that ARE on the wire and that he would
// actually look at: how many tasks she set, whether memory answered, when this
// board's data landed, and how many units the brain says are registered.
//
// THE ORB IS THE SHIPPED ORB. .orb / .orb.red already exist, already carry the
// four-stop --orb1..4 radial, are already cel-flattened under NEON and already
// print-shadowed under PAPER. This wraps it in three new rings; it does not
// replace it. NO SECOND CANVAS IS STARTED — components/RingCanvas.tsx is
// deliberately not mounted here, because it draws a hardcoded #1CB9C8 into a
// bitmap (RingCanvas.tsx:14) and would print terminal teal onto PAPER's cream
// sheet. The rings are CSS, so they follow the tokens.
//
// THE WAVEFORM IS NOT AMBIENCE. It renders only while she is actually speaking
// or while the microphone is actually open. See core.css for the argument.

import type { EveState, Health } from "@shared/contract";
import { APP_VERSION, clockStr } from "../deck/format";
import { ENT, type EveMode } from "../deck/types";
import { DASH, memoryCell } from "./counters";

const BARS = 28;
/** THE CORE's stagger, 0.055s a bar. Motion only — killed by app.css's law. */
const STEP = 0.055;

export interface LivingCoreProps {
  mode: EveMode;
  toolNote: string | null;
  streaming: boolean;
  state: EveState;
  health: Health | null;
  /** api.ts's error from the most recent /health poll, or null when it answered. */
  healthError?: string | null;
  fetchedAt: string | null;
}

export default function LivingCore(p: LivingCoreProps) {
  const alert = p.mode === "alert";
  const ent = ENT[p.mode];
  const online = p.state.online;

  // Verbatim from RailColumn.tsx so the caption means the same thing on both
  // screens — and so her ACTUAL live tool name shows while she is thinking.
  const stateText = `${ent.dot} ${ent.label}${
    p.mode === "thinking" && p.toolNote ? ` · ${p.toolNote.replace(/_/g, " ").toUpperCase()}` : ""
  }`;
  const stateClass = `stateline${
    p.mode === "listening" ? " listen" : p.mode === "thinking" ? " think" : alert ? " alert" : ""
  }`;

  const showWave = p.mode === "speaking" || p.mode === "listening";
  // Red bars mean the microphone is open. That is one of red's two lawful jobs.
  const hotMic = p.mode === "listening";

  const tasks = p.state.todaysThree?.length;
  // P0.4: the fleet count reads /state.fleet (bearer-gated), the same block
  // the strip above draws from, so the two figures cannot disagree. /health's
  // count is the OS roster count, not the fleet's registered count.
  const registered = online ? p.state.fleet?.registered : undefined;
  const memory = memoryCell(p.health);
  // /health failing is not silent and not "DOWN": the cell says NO ANSWER (or
  // holds the last good reading) and this line says why, in the app's own
  // shell-copy register. Nothing here when the link itself is down — the
  // offline caption above the readout already covers that.
  const healthNote =
    online && p.healthError
      ? `HEALTH — ${p.health?.online ? "LAST GOOD ANSWER HELD" : "NO ANSWER"} · ${p.healthError.toUpperCase()}`
      : null;

  return (
    <div
      className={online ? "card corestage" : "card corestage down"}
      style={{ ["--coreOrb" as string]: "clamp(150px, 34vh, 300px)", padding: 16 }}
    >
      <span className="fbr tl" />
      <span className="fbr tr" />
      <span className="fbr bl" />
      <span className="fbr br" />

      <span className="cornertag l">// 02 · PRESENCE</span>
      <span className="cornertag r">
        EVE//OS {APP_VERSION}
        {streamingSuffix(p.streaming)}
      </span>

      <div className="orbwrap">
        <span className="orbring r1" />
        <span className="orbring r2" />
        <span className="orbring r3" />
        <span className={alert ? "orb red orbcore" : "orb orbcore"} />
        {p.mode === "listening" ? (
          <>
            <span className="ripple" style={{ borderRadius: "50%" }} />
            <span className="ripple" style={{ borderRadius: "50%", animationDelay: ".8s" }} />
          </>
        ) : null}
      </div>

      {showWave ? (
        <div className={hotMic ? "corewave hot" : "corewave"} aria-hidden="true">
          {Array.from({ length: BARS }, (_, i) => (
            <i key={i} style={{ animationDelay: `${(i * STEP).toFixed(3)}s` }} />
          ))}
        </div>
      ) : (
        <div className="waveslot" />
      )}

      {/* ONLINE: her five approved chrome captions and their five approved
          token colours — never a sentence written here, because her sentences
          come from the brain and land in the talk column.
          OFFLINE: none of those five is true. "IDLE — HOLDING THE ROOM" over a
          dead link is a claim about her that nothing supports, so the caption
          describes the SCREEN instead, the way SHELL_COPY does. */}
      {online ? (
        <div className={stateClass} style={{ color: ent.col, textAlign: "center" }}>
          {stateText}
        </div>
      ) : (
        <div className="corenote" style={{ textAlign: "center" }}>
          Her presence is not being reported — the link is down.
        </div>
      )}

      <div className="readout">
        <Cell
          k="Tasks"
          v={online && tasks !== undefined ? String(tasks) : DASH}
          off={!online || tasks === undefined}
          unit={online && tasks !== undefined ? "SET" : undefined}
        />
        <Cell k="Memory" v={memory.value} off={memory.tone === "off"} />
        <Cell
          k="Refreshed"
          v={p.fetchedAt ? clockStr(new Date(p.fetchedAt)) : DASH}
          off={!p.fetchedAt}
        />
        <Cell
          k="Fleet"
          v={registered === undefined ? DASH : String(registered)}
          off={registered === undefined}
          unit={registered === undefined ? undefined : "REG"}
        />
      </div>
      {healthNote ? (
        <div className="corenote" style={{ textAlign: "center" }}>
          {healthNote}
        </div>
      ) : null}
    </div>
  );
}

function streamingSuffix(streaming: boolean): string {
  return streaming ? " · STREAMING" : "";
}

function Cell({ k, v, unit, off }: { k: string; v: string; unit?: string; off?: boolean }) {
  return (
    <div className="rcell">
      <span className="k">{k}</span>
      <span className={off ? "v off" : "v"}>
        {v}
        {unit ? <em>{unit}</em> : null}
      </span>
    </div>
  );
}
