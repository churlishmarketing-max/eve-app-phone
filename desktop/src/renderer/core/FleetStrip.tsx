// ZONE A — THE FLEET STRIP. Owning stream: THE CORE.
//
// THE CORE's centrepiece, rebuilt on the shipped .node card so it inherits all
// four worlds' treatments for free (NEON's 2px ink outline + hard shadow,
// PAPER's 2px square + print offset, AMBER's 3px chamfer, and .node.future's
// dashed border for anything half-wired).
//
// A CARD IS A PROMISE THAT A JOB CAN BE GIVEN HERE. See fleet.ts for why there
// are six or seven of them and not eight, why one of them is dashed and says
// NO EXECUTION PATH, and where the load bar went.
//
// THE HEADER CARRIES TWO NUMBERS FROM TWO SOURCES so neither can imply the
// other: REGISTERED is health.fleet.count (the brain's own registration count,
// which is NOT an execution count) and DISPATCHABLE is the length of the
// executable set, derived from the array rather than typed.

import type { EveState, Health } from "@shared/contract";
import { DISPATCHABLE, fleetUnits, type FleetUnit } from "./fleet";

function dotClass(d: FleetUnit["dot"]): string {
  if (d === "live") return "fleetdot live";
  if (d === "hot") return "fleetdot hot";
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
  /** GET /health, or null before the first answer / when the link is down. */
  health: Health | null;
}

export default function FleetStrip({ state, health }: FleetStripProps) {
  const units = fleetUnits(state);
  const registered = health?.fleet?.count;

  // Three honest headers, not one header with a fallback number in it.
  const plate = !state.online
    ? "FLEET — SOURCE DOWN"
    : registered === undefined
      ? `REGISTERED — NO ANSWER YET · ${DISPATCHABLE.length} DISPATCHABLE`
      : `${registered} REGISTERED · ${DISPATCHABLE.length} DISPATCHABLE`;

  return (
    <div style={{ flex: "none" }}>
      <div className="sechead">
        <span className="en">The Fleet</span>
        <span className={state.online && registered !== undefined ? "coreplate" : "coreplate off"}>
          {plate}
        </span>
        <span className="rule" />
        <span className="tag">CARDS READ /health.fleet + STATE.JOBS</span>
      </div>

      <div
        className="fleetstrip"
        // Set from the number of cards actually rendered: a missing unit
        // narrows the grid instead of leaving a hole where a card should be.
        style={{ gridTemplateColumns: `repeat(${units.length}, minmax(0, 1fr))` }}
      >
        {units.map((u) => (
          <div
            key={u.id}
            className={u.future ? "node fleetcard future" : "node fleetcard"}
            title={
              u.future
                ? "Not directly dispatchable — see the sub-line."
                : `window.eve.dispatch(task, "${u.id}")`
            }
          >
            <div className="hd">
              <span className={dotClass(u.dot)} aria-hidden="true" />
              <span className="nm">{u.name}</span>
            </div>
            {/* The job code is the string he would see on an ops row for a
                job this unit is running. A card that can never run a job has
                no job code, so it does not print one. */}
            <div className="role">{u.future ? u.role : `${u.code} · ${u.role}`}</div>
            <span className={stClass(u.statusTone)}>{u.status}</span>
            <span className="lastrun">{u.lastRun}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
