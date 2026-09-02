// ZONE A — THE FLEET STRIP. Owning stream: THE CORE (P1 v0.2 hub half).
//
// THE CORE's centrepiece, rebuilt on the shipped .node card so it inherits all
// four worlds' treatments for free (NEON's 2px ink outline + hard shadow,
// PAPER's 2px square + print offset, AMBER's 3px chamfer, and .node.future's
// dashed border for anything with no execution path).
//
// P0.4 — THE DOOR CHANGED. v1 read the REGISTERED count off the unauthenticated
// /health. It now reads EVERYTHING off `/state.fleet`, behind the bearer gate
// (CONTRACT-v0.1 §2): the count, the badge, the live bit, the roster line and
// the last-run stamp. /health is not consulted by this component at all.
//
// v0.2 — THE CARDS ARE THE PINNED UNITS. Forty-two runnable units do not fit
// on a strip; the brain's `pinned` default (through his local pins) does, at
// most eight, runnable first. The big inline roster panel is gone: the
// "+N ON ROSTER" card is now the door to the FLEET tab (key 6), where every
// unit sits in a row with its badge, its triggers, its last run, a DISPATCH
// button and its PIN toggle.
//
// THE HEADER CARRIES ITS NUMBERS FROM ONE SOURCE and all are computed from the
// array the strip draws (fleet.ts), so the plate can never claim a unit the
// cards do not show. The provenance tag reads the TRUE source the brain named
// — OS LIVE or BUNDLED COPY — and the time that view was built.
//
// A MISSING FLEET BLOCK RENDERS THE NO-ANSWER STATE, NEVER ZEROS. See fleet.ts
// rule 4.

import type { EveState } from "@shared/contract";
import { clockStr } from "../deck/format";
import { fleetView, sourceWord, type FleetUnit, type FleetView } from "./fleet";
import type { JobsView } from "./jobs";
import { NO_PINS, type PinOverrides } from "./pins";

export function dotClass(d: FleetUnit["dot"]): string {
  if (d === "live") return "fleetdot live";
  if (d === "ready") return "fleetdot ready";
  if (d === "none") return "fleetdot none";
  return "fleetdot";
}

function stClass(t: FleetUnit["statusTone"]): string {
  if (t === "run") return "st";
  if (t === "gold") return "st gold";
  return "st dash";
}

export interface FleetStripProps {
  state: EveState;
  /** The merged poll+frame jobs view — the chips read it. */
  jobs: JobsView;
  /** His local pin overrides (pins.ts). Default: none — the brain's set. */
  pins?: PinOverrides;
  /** The "+N ON ROSTER" card's click: open the FLEET tab. */
  onOpenFleet: () => void;
}

export default function FleetStrip({ state, jobs, pins, onOpenFleet }: FleetStripProps) {
  const view = fleetView(state, jobs, pins ?? NO_PINS);

  // Three honest headers, not one header with a fallback number in it.
  const plate =
    view.kind === "offline"
      ? "FLEET — SOURCE DOWN"
      : view.kind === "absent"
        ? "FLEET — NO ANSWER YET"
        : `${view.registered} REGISTERED · ${view.dispatchable} DISPATCHABLE · ${
            view.fallback ? "NONE PINNED" : `${view.pinnedCount} PINNED`
          }`;

  const tag =
    view.kind === "offline"
      ? "READS /state.fleet — LINK DOWN"
      : view.kind === "absent"
        ? "READS /state.fleet — NOT ON THIS ANSWER"
        : `READS /state.fleet · ${sourceWord(view.source)}${view.at ? ` · ${clockStr(new Date(view.at))}` : ""} + STATE.JOBS`;

  return (
    <div style={{ flex: "none" }}>
      <div className="sechead">
        <span className="en">The Fleet</span>
        <span className={view.kind === "ready" ? "coreplate" : "coreplate off"}>{plate}</span>
        <span className="rule" />
        <span className="tag">{tag}</span>
      </div>

      {view.kind === "ready" ? <ReadyStrip view={view} onOpenFleet={onOpenFleet} /> : <FleetNoAnswer kind={view.kind} />}
    </div>
  );
}

/* ---- the strip proper ---------------------------------------------------- */

function ReadyStrip({ view, onOpenFleet }: { view: Extract<FleetView, { kind: "ready" }>; onOpenFleet: () => void }) {
  const more = view.rest.length;
  const cols = view.cards.length + (more > 0 ? 1 : 0);
  // Only the categories that are actually there: "0 desk" is a true count,
  // but printing it on every board is noise, not information.
  const breakdown = (["RUNNABLE", "DESK", "WORKSPACE_ONLY"] as const)
    .map((b) => [view.rest.filter((u) => u.badge === b).length, b] as const)
    .filter(([n]) => n > 0)
    .map(([n, b]) => `${n} ${b.replace(/_/g, "-").toLowerCase()}`)
    .join(" · ");

  return (
    <div
      className="fleetstrip"
      // Set from the number of cards actually rendered: a missing unit
      // narrows the grid instead of leaving a hole where a card should be.
      style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))` }}
    >
      {view.cards.map((u) => (
        <UnitCard key={u.id} u={u} />
      ))}

      {more > 0 ? (
        // ONE TERMINAL CARD SPEAKS FOR THE REST, and its numeral is real: it is
        // the length of the array of units not drawn as a card. It is the door
        // to the FLEET tab, not a panel of its own any more.
        <button
          type="button"
          className="node fleetcard future more"
          onClick={onOpenFleet}
          title="Open the FLEET tab — every unit, badged, with its triggers, last run, DISPATCH and PIN. Key 6."
        >
          <div className="hd">
            <span className="fleetdot none" aria-hidden="true" />
            <span className="nm">+{more} ON ROSTER</span>
          </div>
          <div className="role">{breakdown || "nothing more on the roster"}</div>
          <span className="st dash">FLEET TAB ▸</span>
          {/* Sized to the same ~120px the unit cards get: the longer forms
              ("PIN CARDS THERE · KEY 6") ellipsised away the key they existed
              to teach. The keycap is drawn on the nav strip and the full
              sentence is on this card's title. */}
          <span className="lastrun">{view.fallback ? "NOTHING PINNED YET" : "PIN CARDS · KEY 6"}</span>
        </button>
      ) : null}
    </div>
  );
}

function UnitCard({ u }: { u: FleetUnit }) {
  return (
    <div
      className={u.future ? "node fleetcard future" : "node fleetcard"}
      title={
        u.future
          ? `${u.name} — ${u.badgeWord}. No runner reaches it from here; name the unit and its trigger in a workspace session.`
          : u.live
            ? `dispatch_unit("${u.id}") — give her the job in the command bar.`
            : `dispatch_unit("${u.id}") is registered but its runner is not reachable from this brain right now.`
      }
    >
      <div className="hd">
        <span className={dotClass(u.dot)} aria-hidden="true" />
        <span className="nm">{u.name}</span>
      </div>
      {/* The job code is the string he sees on an ops row for a job this unit
          runs. A card that can never run a job has no job code to print. */}
      <div className="role">{u.future ? u.role : `${u.code} · ${u.role}`}</div>
      <span className={stClass(u.statusTone)}>{u.status}</span>
      {/* NO "PINNED" WORD HERE. Outside the fallback the card pool IS the
          pinned set (fleet.ts selectCards), so stamping every card with it
          restated the header's own "N PINNED" nine times and cost the ~9
          characters that pushed the stamp past the card's edge. The pin is
          stated once in the header, and toggled on the FLEET tab.

          AND THE BARE CLOCK, NOT `u.lastRun`. The shared string is "SINCE
          23:44", which is right in the FLEET tab's wide LAST RUN column and six
          characters too long for a card that is ~120px inside its padding at
          nine columns. The chip directly above already names the state, so the
          word SINCE is carried by the layout here; the instant behind it is the
          same `lastRunMs`, formatted by the same clock. A missing stamp is the
          same dash it is everywhere — never a zero, never a guessed time. */}
      {/* The title carries the untruncated form, because at the 1120px minimum
          nine columns leave ~106px and even this short line ellipsises. Hover
          recovers it here; the FLEET tab's LAST RUN column prints it in full. */}
      <span className="lastrun" title={`${u.badgeWord} · ${u.lastRun}`}>
        {u.badgeWord} · {u.lastRunMs === null ? "—" : clockStr(new Date(u.lastRunMs))}
      </span>
    </div>
  );
}

/* ---- no answer ------------------------------------------------------------ */

export function FleetNoAnswer({ kind }: { kind: "offline" | "absent" }) {
  return (
    <div className="fleetstrip" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="node fleetcard future" style={{ maxWidth: 560 }}>
        <div className="hd">
          <span className="fleetdot none" aria-hidden="true" />
          <span className="nm">{kind === "offline" ? "NO ANSWER — LINK DOWN" : "NO FLEET BLOCK ON THE WIRE"}</span>
        </div>
        <div className="role">
          {kind === "offline"
            ? "The roster rides on /state behind the bearer gate. Her brain is not answering, so no unit, badge or count is drawn."
            : "This brain answered /state without a fleet block — an older build, or the roster read failed. Nothing is drawn in its place; no count is guessed."}
        </div>
        <span className="st dash">—</span>
        <span className="lastrun">—</span>
      </div>
    </div>
  );
}
