// TODAY pane — owning stream: S2. Artboard A, DATA column top third.
//
// Honesty law (handoff §8.3): offline says so. The lede slot carries the
// canonical shell line, the floor says `> offline — …` instead of a zero, and
// TODAY'S THREE renders nothing at all rather than an empty list that reads as
// "she gave you no orders".

import type { EveState } from "@shared/contract";
import { Eyeb, Divrow, T3Row } from "../../components/atoms";
import { clockStr, dateStr, dueLabel, isPast, pad2, weekNo } from "../format";
import { SHELL_COPY } from "./shell";

// schedule.ts:127, verified verbatim. /state carries no calendar field, so v1
// shows the cron day and nothing it cannot stand behind.
const CLOCKS = "07:00 BRIEF · 11:45 FLOOR · 12:30 PULSE · 17:30 CLOSEOUT · 20:00 ROUTINES";

export interface TodayPaneProps {
  state: EveState;
  fetchedAt: string | null;
  now: Date;
}

export default function TodayPane({ state, fetchedAt, now }: TodayPaneProps) {
  const online = state.online;
  const floor = state.floor;
  const three = state.todaysThree ?? [];

  const toGo = floor ? Math.max(0, floor.goal - floor.count) : 0;
  const floorline = !online
    ? "> offline — the count lands when her brain answers."
    : !floor
      ? "> offline — the count lands when her brain answers."
      : toGo === 0
        ? `> floor's closed — ${floor.goal} of ${floor.goal}.`
        : `> ${toGo} to go — real conversations, not drafts.`;

  return (
    <div style={{ flex: "none" }}>
      <Eyeb
        left={`▸ EVE//BRIEF — ${dateStr(now)} · WK ${weekNo(now)}`}
        right={`REFRESHED ${fetchedAt ? clockStr(new Date(fetchedAt)) : "—"}`}
      />

      {!online ? (
        <div className="shellcopy" style={{ marginTop: 6 }}>
          {SHELL_COPY}
        </div>
      ) : state.latestBrief?.text ? (
        <div className="lede" style={{ marginTop: 6 }}>
          {state.latestBrief.text}
        </div>
      ) : null}

      <div
        className="card"
        style={{ marginTop: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 18 }}
      >
        <div style={{ flex: "none" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".2em", color: "rgba(28,185,200,.8)" }}>
            SALES FLOOR
          </div>
          <div className="floorbig" style={{ marginTop: 4 }}>
            {online && floor ? (
              <>
                {floor.count}
                <em>/{floor.goal}</em>
              </>
            ) : (
              // Dim, not cream: an absence, not a number she stands behind.
              <span style={{ color: "rgba(240,237,232,.3)" }}>—</span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {online && floor ? (
            <div className="fbars">
              {Array.from({ length: Math.max(1, floor.goal) }, (_, i) => (
                <span key={i} className={i < floor.count ? "on" : undefined} />
              ))}
            </div>
          ) : null}
          <div className="floorline">{floorline}</div>
        </div>
      </div>

      {online ? (
        <>
          <Divrow label="TODAY'S THREE" right="SHE SET THE ORDER" />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {three.map((t, i) => {
              const due = isPast(t.due_at);
              return (
                <T3Row
                  key={t.id}
                  idx={pad2(i + 1)}
                  title={t.title}
                  right={t.due_at ? dueLabel(t.due_at) : (t.detail ?? "")}
                  due={due}
                />
              );
            })}
          </div>
        </>
      ) : null}

      <div
        style={{
          marginTop: 10,
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: ".16em",
          color: "rgba(240,237,232,.4)",
        }}
      >
        {CLOCKS}
      </div>
    </div>
  );
}
