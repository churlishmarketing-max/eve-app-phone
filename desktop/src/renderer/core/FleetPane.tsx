// THE FLEET — the whole roster, one tab. Owning stream: THE CORE (P1 v0.2).
//
// His ask, verbatim: "have a separate tab to view them all and have the main
// ones be on the core page with her." This is the tab. Every unit the brain
// served on /state.fleet, division-grouped, one row each: the readiness dot,
// the name and the literal dispatch key, the BADGE (solid RUNNABLE plate /
// dashed WORKSPACE ONLY / DESK), the runner kind, the roster's job line, its
// trigger phrases, the job chip + last run, a PIN toggle, and — for a RUNNABLE
// unit only — a DISPATCH button that jumps to THE CORE with the command bar
// already reading "dispatch <key>: " and focused. Nothing is dispatched from
// here: the sentence still goes to her as a turn, she routes it, and the job
// frame is what lights the row (D-DISPATCH §7.4).
//
// Every number in the header is computed from the array (fleet.ts). A missing
// fleet block renders the same no-answer state the strip renders. Pins are
// local (pins.ts) and the tag says so; the brain's default flows through
// everything he never touched.
//
// PRESENTATIONAL ON PURPOSE, like CorePane: FleetScreen supplies the jobs
// view and the pins; a shot scenario supplies a fixture.

import type { EveState } from "@shared/contract";
import { clockStr } from "../deck/format";
import { fleetView, kindsLine, sourceWord, type FleetUnit, type FleetView } from "./fleet";
import { FleetNoAnswer, dotClass } from "./FleetStrip";
import type { JobsView } from "./jobs";
import type { PinOverrides } from "./pins";
import "../../styles/core.css";
import "../../styles/fleet.css";

export interface FleetPaneProps {
  state: EveState;
  jobs: JobsView;
  pins: PinOverrides;
  onTogglePin: (key: string, brainDefault: boolean) => void;
  onDispatch: (key: string) => void;
}

export default function FleetPane(p: FleetPaneProps) {
  const view = fleetView(p.state, p.jobs, p.pins);

  const plate =
    view.kind === "offline"
      ? "FLEET — SOURCE DOWN"
      : view.kind === "absent"
        ? "FLEET — NO ANSWER YET"
        : [
            `${view.registered} REGISTERED`,
            `${view.dispatchable} RUNNABLE`,
            view.desk > 0 ? `${view.desk} DESK` : null,
            `${view.workspaceOnly} WORKSPACE ONLY`,
          ]
            .filter((s): s is string => !!s)
            .join(" · ");

  const tag =
    view.kind === "offline"
      ? "READS /state.fleet — LINK DOWN"
      : view.kind === "absent"
        ? "READS /state.fleet — NOT ON THIS ANSWER"
        : `READS /state.fleet · ${sourceWord(view.source)}${view.at ? ` · ${clockStr(new Date(view.at))}` : ""} + STATE.JOBS · PINS LIVE IN THIS WINDOW`;

  return (
    <div className="corepane fleetpane">
      <div className="sechead">
        <span className="en">The Fleet</span>
        <span className={view.kind === "ready" ? "coreplate" : "coreplate off"}>{plate}</span>
        <span className="rule" />
        <span className="tag">{tag}</span>
      </div>

      {view.kind === "ready" ? <Roster view={view} onTogglePin={p.onTogglePin} onDispatch={p.onDispatch} /> : <FleetNoAnswer kind={view.kind} />}
    </div>
  );
}

/* ---- the roster ------------------------------------------------------------ */

function Roster({
  view,
  onTogglePin,
  onDispatch,
}: {
  view: Extract<FleetView, { kind: "ready" }>;
  onTogglePin: (key: string, brainDefault: boolean) => void;
  onDispatch: (key: string) => void;
}) {
  const kinds = kindsLine(view.kinds);
  const cardsNote = view.fallback
    ? `NOTHING PINNED — THE CORE FALLS BACK TO THE RUNNABLE SET (${Math.min(view.dispatchable, 8)} CARDS)`
    : `${view.pinnedCount} PINNED → ${Math.min(view.pinnedCount, 8)} CARD${Math.min(view.pinnedCount, 8) === 1 ? "" : "S"} ON THE CORE${
        view.pinnedCount > 8 ? " (CAP 8 — RUNNABLE FIRST, THEN ACTIVITY)" : ""
      }`;

  return (
    <>
      <div className="fleetsum">
        {kinds ? <span className="fs">{kinds}</span> : <span className="fs off">RUNNER KINDS NOT ON THIS ANSWER</span>}
        <span className="fsep">·</span>
        <span className="fs">{cardsNote}</span>
        <span className="fsep">·</span>
        <span className="fs off">DISPATCH ▸ PREFILLS THE CORE'S COMMAND BAR — SHE ROUTES THE TURN, NOTHING RUNS FROM THIS ROW</span>
      </div>

      <div className="fleetscroll" role="region" aria-label="The whole roster">
        <div className="fleetcols" aria-hidden="true">
          <span />
          <span>UNIT · KEY</span>
          <span>BADGE · KIND</span>
          <span>JOB</span>
          <span>TRIGGERS</span>
          <span>STATE · LAST RUN</span>
          <span>PIN</span>
          <span>RUN</span>
        </div>
        {view.groups.map((g) => {
          const runnable = g.units.filter((u) => !u.future).length;
          return (
            <section className="card fdiv" key={g.division}>
              <div className="railhead fdivhead">
                <span>// {g.division.toUpperCase()}</span>
                <span className="fcount">
                  {g.units.length} UNIT{g.units.length === 1 ? "" : "S"} · {runnable} RUNNABLE
                </span>
              </div>
              {g.units.map((u) => (
                <FleetRow key={u.id} u={u} onTogglePin={onTogglePin} onDispatch={onDispatch} />
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

function stClass(t: FleetUnit["statusTone"]): string {
  if (t === "run") return "fstate run";
  if (t === "gold") return "fstate gold";
  return "fstate";
}

function FleetRow({
  u,
  onTogglePin,
  onDispatch,
}: {
  u: FleetUnit;
  onTogglePin: (key: string, brainDefault: boolean) => void;
  onDispatch: (key: string) => void;
}) {
  return (
    <div className={u.future ? "frow future" : "frow"}>
      <span className={dotClass(u.dot)} aria-hidden="true" />

      <span className="fnm" title={u.name}>
        <span className="fname">{u.name}</span>
        <span className="fkey">{u.id}</span>
      </span>

      <span className="fbadge">
        <span className={u.badge === "RUNNABLE" ? "rbadge run" : "rbadge"}>{u.badgeWord}</span>
        {u.kind ? <span className="fkind">{u.kind.toUpperCase()}{u.tier ? ` · ${u.tier.toUpperCase()}` : ""}</span> : null}
      </span>

      <span className="frole" title={u.role}>
        {u.role || "—"}
      </span>

      <span className="ftrig" title={u.triggers || undefined}>
        {u.triggers || "—"}
      </span>

      <span className="flast">
        <span className={stClass(u.statusTone)}>{u.status}</span>
        <span className="fwhen">{u.lastRun}</span>
      </span>

      <button
        type="button"
        className={u.pinned ? "tbtn pinb on" : "tbtn pinb"}
        aria-pressed={u.pinned}
        onClick={() => onTogglePin(u.id, u.pinnedDefault)}
        title={
          u.pinned
            ? `Pinned — a card on THE CORE.${u.pinnedDefault ? " (the brain's default)" : " (your pin)"} Click to unpin.`
            : `Not on THE CORE.${u.pinnedDefault ? " (you unpinned the brain's default)" : ""} Click to pin.`
        }
      >
        {u.pinned ? "◆ PINNED" : "◇ PIN"}
      </button>

      {u.future ? (
        <span className="fnorun" title={`${u.badgeWord} — no runner reaches it from here.`}>
          NO RUNNER
        </span>
      ) : (
        <button
          type="button"
          className="tbtn dispb"
          onClick={() => onDispatch(u.id)}
          title={`Jump to THE CORE with "dispatch ${u.id}: " in the command bar. You finish the sentence; she routes it.`}
        >
          DISPATCH ▸
        </button>
      )}
    </div>
  );
}
