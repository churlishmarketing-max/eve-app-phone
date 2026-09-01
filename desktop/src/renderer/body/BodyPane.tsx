// owner: stream S3 — Artboard D, DECK/BODY.
//
// Mounted by deck/DataColumn.tsx inside the DATA column's own padded `.col`
// (see body.css for why this component owns no padding of its own). Feed:
// window.eve.vitals(14) / checkin / routineTick / routineUntick /
// routineCreate — /vitals is deliberately NOT in /state, so this pane fetches
// for itself on mount (cancelled-flag pattern, ported from
// app/src/EveApp.tsx :400-409).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Vitals, VitalsHabit, WriteResult } from "@shared/contract";
import "./body.css";

export interface BodyPaneProps {
  onBack: () => void;
}

const NOTE_HOLD_MS = 6000;

export default function BodyPane({ onBack }: BodyPaneProps) {
  const [vitals, setVitals] = useState<Vitals>({ online: false });
  const [energyEcho, setEnergyEcho] = useState<number | null>(null);
  const [sleepEcho, setSleepEcho] = useState<number | null>(null);
  const [habitEcho, setHabitEcho] = useState<Record<string, boolean>>({});
  const [habitDraft, setHabitDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchVitals = useCallback(() => window.eve.vitals(14), []);

  useEffect(() => {
    let cancelled = false;
    void fetchVitals().then((v) => {
      if (!cancelled) setVitals(v);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchVitals]);

  useEffect(
    () => () => {
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    },
    [],
  );

  // Esc backs out of the pane; BodyPane draws no visible affordance for it
  // (the spec calls this one "unused visually").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const refetch = useCallback(async () => {
    const v = await fetchVitals();
    setVitals(v);
  }, [fetchVitals]);

  const noteWrite = useCallback((r: WriteResult) => {
    setWriteNote(r.ok ? "SAVED" : `NOT SAVED — ${(r.error ?? "her brain didn't answer").toUpperCase()}`);
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(() => setWriteNote(null), NOTE_HOLD_MS);
  }, []);

  const pickEnergy = async (n: number) => {
    setEnergyEcho(n);
    const r = await window.eve.checkin({ energy: n });
    noteWrite(r);
    if (r.ok) await refetch();
    setEnergyEcho(null);
  };

  const pickSleep = async (n: number) => {
    setSleepEcho(n);
    const r = await window.eve.checkin({ sleepHours: n });
    noteWrite(r);
    if (r.ok) await refetch();
    setSleepEcho(null);
  };

  const toggleHabit = async (h: VitalsHabit) => {
    const on = habitEcho[h.id] ?? h.done_today;
    setHabitEcho((e) => ({ ...e, [h.id]: !on }));
    const r = on ? await window.eve.routineUntick(h.id) : await window.eve.routineTick(h.id);
    noteWrite(r);
    if (r.ok) await refetch();
    setHabitEcho((e) => {
      const { [h.id]: _drop, ...rest } = e;
      return rest;
    });
  };

  const addHabit = async () => {
    const name = (habitDraft ?? "").trim();
    if (!name) {
      setHabitDraft(null);
      return;
    }
    const r = await window.eve.routineCreate(name);
    noteWrite(r);
    if (r.ok) {
      setHabitDraft(null);
      await refetch();
    }
  };

  const flushNote = async () => {
    if (noteDraft === null) return;
    if (noteDraft === (vitals.checkin?.note ?? "")) {
      setNoteDraft(null);
      return;
    }
    const r = await window.eve.checkin({ note: noteDraft });
    noteWrite(r);
    if (r.ok) {
      setNoteDraft(null);
      await refetch();
    }
  };

  const energyValue = energyEcho ?? vitals.checkin?.energy ?? null;
  const sleepValue = sleepEcho ?? vitals.checkin?.sleep_hours ?? null;
  const habitDone = (h: VitalsHabit) => habitEcho[h.id] ?? h.done_today;
  const noteValue = noteDraft ?? vitals.checkin?.note ?? "";

  const habits = Array.isArray(vitals.habits) ? vitals.habits : [];
  const checkRows = habits.filter((h) => h.slot === "checkin");
  const habitRows = habits.filter((h) => h.slot === "habit");
  const week = vitals.week ?? [];

  return (
    <div className="bodypane">
      <div className="eyeb" style={{ flex: "none" }}>
        <span>▸ BODY // THE ENGINE</span>
        <span className="r">{vitals.online ? "LOGGED LIVE" : "OFFLINE"}</span>
      </div>

      {!vitals.online ? (
        <div className="shell-wrap">
          <p className="shellcopy">Her brain is unreachable, so this screen is a shell. It fills in the moment she answers.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ flex: "none", padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".2em", color: "rgba(28,185,200,.8)" }}>
              TODAY&apos;S CHECK-IN
            </div>
            <div className="checkin-row">
              <div className="checkin-col">
                <div className="checkin-label">ENERGY</div>
                <div className="segrow">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`seg${energyValue === n ? " on" : ""}`}
                      aria-pressed={energyValue === n}
                      onClick={() => void pickEnergy(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="checkin-col wide">
                <div className="checkin-label">SLEEP (HRS)</div>
                <div className="segrow">
                  {[4, 5, 6, 7, 8, 9].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`seg${sleepValue === n ? " on" : ""}`}
                      aria-pressed={sleepValue === n}
                      onClick={() => void pickSleep(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="boxrow">
              {checkRows.length ? (
                checkRows.map((h) => {
                  const done = habitDone(h);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      className={`boxtoggle${done ? " on" : ""}`}
                      aria-pressed={done}
                      onClick={() => void toggleHabit(h)}
                    >
                      {h.name} {done ? "✓" : "○"}
                    </button>
                  );
                })
              ) : (
                <span className="boxtoggle">no boxes yet</span>
              )}
            </div>
          </div>

          {writeNote && <div className={`writenote${writeNote.startsWith("NOT SAVED") ? " bad" : ""}`}>{writeNote}</div>}

          <div className="lowergrid">
            <div className="habitcol">
              <div className="divrow" style={{ margin: "2px 0" }}>
                <span className="l">NON-NEGOTIABLE HABITS</span>
                <span className="rule" />
              </div>

              {week.length > 0 && (
                <div className="weekrow" style={{ marginBottom: 4 }}>
                  {week.map((d, i) => (
                    <div className={`weekcell${i === week.length - 1 ? " now" : ""}`} key={d.on_date || i}>
                      <span className="d">{d.dow}</span>
                      <span className={`e${d.energy == null ? " none" : ""}`}>{d.energy ?? "·"}</span>
                      <span className="weekdots">
                        <i className={d.trained ? "on" : ""} />
                        <i className={d.calls_ok ? "on" : ""} />
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {habitRows.length ? (
                habitRows.map((h) => {
                  const done = habitDone(h);
                  return (
                    <button key={h.id} type="button" className="oprow" style={{ width: "100%", textAlign: "left" }} aria-pressed={done} onClick={() => void toggleHabit(h)}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: done ? "var(--tealHi)" : "rgba(240,237,232,.35)", width: 14, flex: "none" }}>
                        {done ? "✓" : "○"}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="tt">{h.name}</span>
                        <span className="sub" style={{ display: "block" }}>
                          {done ? "DONE TODAY" : "NOT YET TODAY"}
                        </span>
                      </span>
                      <span className={`stat ${(h.streak ?? 0) >= 7 ? "gold" : "dim"}`} style={{ marginLeft: "auto" }}>
                        {h.streak ?? 0}d
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="oprow">
                  <span className="tt">Nothing tracked yet</span>
                </div>
              )}

              {habitDraft === null ? (
                <button type="button" className="oprow habit-add" onClick={() => setHabitDraft("")}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>+</span>
                  <span className="tt">ADD HABIT</span>
                </button>
              ) : (
                <div className="habit-add-row">
                  <input
                    className="cmdinput"
                    style={{ flex: 1, minHeight: 36, padding: "8px 10px" }}
                    value={habitDraft}
                    placeholder="name the non-negotiable"
                    aria-label="New habit name"
                    autoFocus
                    onChange={(e) => setHabitDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addHabit();
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setHabitDraft(null);
                      }
                    }}
                  />
                </div>
              )}
            </div>

            <div className="rightcol">
              <div className="card" style={{ padding: "12px 14px" }}>
                <div className="eyeb" style={{ fontSize: 9 }}>
                  <span>ONE LINE</span>
                  <span className="r">SAVES WHEN YOU LOOK AWAY</span>
                </div>
                <textarea
                  className="cmdinput"
                  rows={1}
                  style={{ width: "100%", marginTop: 8 }}
                  placeholder="how's the head today?"
                  value={noteValue}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => void flushNote()}
                />
                <div style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: ".16em", color: "rgba(240,237,232,.3)", marginTop: 6 }}>
                  SHE READS IT. SHE DOESN&apos;T PERFORM IT BACK.
                </div>
              </div>

              <div className="mini">
                <div className="k">SALES FLOOR — READ ONLY</div>
                <div className="n" style={{ marginTop: 4 }}>
                  {vitals.floor?.count ?? 0}
                  <em>/{vitals.floor?.goal ?? 3}</em>
                </div>
                <div className="x">the floor owns this one. tell her, and it moves.</div>
              </div>

              <div className="card" style={{ padding: "12px 14px" }}>
                <div className="eyeb">
                  <span>GOALS</span>
                  <span className="r">EMPTY BY DESIGN</span>
                </div>
                <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "rgba(240,237,232,.45)", marginTop: 7 }}>
                  Your goals live in the Churlish OS. She can write one there, but nothing can read them back yet — so this
                  panel stays empty rather than showing you a copy that might already be wrong.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="footnote" style={{ flex: "none" }}>
        she counts the days so you don&apos;t have to.
      </div>
    </div>
  );
}
