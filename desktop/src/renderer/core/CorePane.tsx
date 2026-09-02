// THE CORE — the hybrid screen. Owning stream: THE CORE (P1 v0.1 hub half).
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
// P1 v0.1 — THE HUB HALF. This screen is now the dispatcher's hub (D-DISPATCH
// §7): the fleet strip reads /state.fleet, THE WIRE carries the dispatch four,
// the session log is the job event feed, a JOBS rail lists the 24 h window
// under the log, and clicking any job row or feed line opens the ONE new
// surface — the job detail — in the centre column in place of the living
// core. The command bar is unchanged: typing a sentence is a chat turn, the
// brain routes it, and the job frame (or the next poll) is what lights the row.
//
// PRESENTATIONAL ON PURPOSE, exactly like Deck.tsx: every figure arrives as a
// prop, so a shot scenario can drive the whole board from a fixture with no
// brain, no poll and no bridge round-trip. CoreScreen.tsx is the thin container
// that supplies /health, the merged jobs view, the selection and the log.
//
// WHAT IS NOT HERE, AND WHY — the short list. Leads, clips, spend, angles,
// tribunal, threads, vectors, latency, confidence, the weather, signed-today,
// held-today, and eight agent load bars are all absent because no field on the
// wire produces them. THE CORE's "Speaking — analyzing the renewal" caption is
// absent because she does not speak canned lines. Its "core --attach fleet"
// prompt is absent because a command line showing a command he never typed is a
// fiction on the one device whose whole job is to take his commands — the
// prompt echoes his last real turn or it stays empty.

import { useCallback, useEffect, useRef, useState } from "react";
import type { EveState, Health, JobRow, PendingConfirm } from "@shared/contract";
import type { ChatView, CorePrefill, EveMode } from "../deck/types";
import type { PinOverrides } from "./pins";
import { APP_VERSION, agentCode, pad3 } from "../deck/format";
import { SHELL_COPY } from "../deck/panes/shell";
import FleetStrip from "./FleetStrip";
import JobDetail from "./JobDetail";
import LivingCore from "./LivingCore";
import { DASH, railCounters, telemetryCells, type Tone } from "./counters";
import { statusTone, statusWord, unitOf, type JobsView } from "./jobs";
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
  /** GET /health — the ONLY source of MEMORY now. The fleet reads /state.fleet. */
  health: Health | null;
  /** api.ts's error from the most recent /health poll, or null when it answered. */
  healthError?: string | null;
  chat: ChatView;
  /** The resolved presence mode: preview > voice override > chat-derived. */
  mode: EveMode;
  quietHours: boolean;
  /** The merged poll+frame jobs view (jobs.ts). */
  jobs: JobsView;
  /** Real events observed this session. Never seeded with plausible history. */
  log: CoreLogEntry[];
  /** Lines the log's cap let go this session. */
  logDropped: number;
  /** The job whose detail is open, or null for the living core. */
  selectedJob: JobRow | null;
  /** The pending card that job is waiting on, if this window knows of one. */
  selectedConfirm: PendingConfirm | null;
  /** This session's log lines for that job, oldest first. */
  selectedEvents: CoreLogEntry[];
  onSelectJob: (id: string | null) => void;
  /** v0.2 — his local pin overrides; the strip's cards are the pinned units. */
  pins: PinOverrides;
  /** v0.2 — a sentence the FLEET tab's DISPATCH put in the command bar. */
  prefill: CorePrefill | null;
  /** v0.2 — the "+N ON ROSTER" card opens the FLEET tab. */
  onOpenFleet: () => void;
  /** The existing chat path. This screen starts no second chat state machine. */
  onSend: (text: string) => void;
  onConfirmResolved: (id: string) => void;
}

export default function CorePane(p: CorePaneProps) {
  const rows = railCounters(p.state, p.jobs);
  const cells = telemetryCells(p.state, p.health, p.quietHours, p.jobs);
  const reds = p.state.online ? (p.state.pendingConfirms ?? []).length : null;

  return (
    <div className="corepane">
      <FleetStrip state={p.state} jobs={p.jobs} pins={p.pins} onOpenFleet={p.onOpenFleet} />

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
            ) : p.jobs.absent ? (
              <div className="corenote coreshell">
                RUNNING · WAITING · HELD · FAILED read /state.jobs. This answer
                carried no jobs list, so they are dashes, not zeroes.
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

        {/* ---- centre: the living core, or the one job he opened ---------- */}
        {p.selectedJob ? (
          <JobDetail
            key={p.selectedJob.id}
            job={p.selectedJob}
            confirm={p.selectedConfirm}
            events={p.selectedEvents}
            onClose={() => p.onSelectJob(null)}
            onConfirmResolved={p.onConfirmResolved}
          />
        ) : (
          <LivingCore
            mode={p.mode}
            toolNote={p.chat.toolNote}
            streaming={p.chat.streamingId !== null}
            state={p.state}
            health={p.health}
            healthError={p.healthError ?? null}
            fetchedAt={p.fetchedAt}
          />
        )}

        {/* ---- right: the session log (the job event feed) + the command bar -- */}
        <div className="corecol">
          <div className="card logwrap" style={{ padding: "12px 14px" }}>
            <div className="railhead" style={{ borderBottom: "none", paddingBottom: 0 }}>
              // 03 · SESSION LOG — SES {pad3(p.sessionNo)}
            </div>
            {p.log.length === 0 ? (
              <div className="shellcopy coreshell">
                Nothing has happened on this screen yet. It fills as she works —
                turns, tools, refreshes, failures, RED cards, jobs changing
                state. It is never seeded.
              </div>
            ) : (
              <div className="log">
                {p.log.map((e) =>
                  e.jobId ? (
                    <div
                      className={`logrow click ${e.tone === "dim" ? "" : e.tone}${p.selectedJob?.id === e.jobId ? " on" : ""}`.trim()}
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      title="Open this job"
                      onClick={() => p.onSelectJob(e.jobId ?? null)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          p.onSelectJob(e.jobId ?? null);
                        }
                      }}
                    >
                      <span className="t">{e.at}</span>
                      <span className="m">{e.text}</span>
                    </div>
                  ) : (
                    <div className={`logrow ${e.tone === "dim" ? "" : e.tone}`.trim()} key={e.id}>
                      <span className="t">{e.at}</span>
                      <span className="m">{e.text}</span>
                    </div>
                  ),
                )}
              </div>
            )}
            {p.logDropped > 0 ? (
              <div className="corenote logdrop">
                {p.logDropped} OLDER LINE{p.logDropped === 1 ? "" : "S"} DROPPED — the log keeps the last{" "}
                {p.log.length}.
              </div>
            ) : null}
          </div>

          {/* The JOBS rail takes the column's slack between the log and the
              command bar (it lives here, not under the counters, because at
              the 1120x720 minimum the left column has no room for it). */}
          <JobsRail
            online={p.state.online}
            jobs={p.jobs}
            selectedId={p.selectedJob?.id ?? null}
            onSelect={p.onSelectJob}
          />

          <CommandCard
            online={p.state.online}
            busy={p.chat.busy}
            prefill={p.prefill}
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

/* ---- the jobs rail --------------------------------------------------------
   Every job of the last 24 h, newest first, from the merged view. A row is a
   real button: click it and the detail opens in the centre column. The header
   count is the length of the list actually drawn. */

function JobsRail({
  online,
  jobs,
  selectedId,
  onSelect,
}: {
  online: boolean;
  jobs: JobsView;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const head = !online ? "—" : jobs.absent ? "NO LIST" : `${jobs.rows.length} · 24 H`;
  return (
    <div className="card jobsrail">
      <div className="railhead" style={{ display: "flex", gap: 8 }}>
        <span>// JOBS</span>
        <span style={{ marginLeft: "auto" }}>{head}</span>
      </div>
      {!online ? (
        <div className="corenote coreshell">The jobs list rides on /state. The link is down.</div>
      ) : jobs.absent ? (
        <div className="corenote coreshell">This answer carried no jobs list.</div>
      ) : jobs.rows.length === 0 ? (
        <div className="corenote coreshell">
          Nothing in the last 24 hours. Give her the job — by name or just the outcome.
        </div>
      ) : (
        <div className="jobrows">
          {jobs.rows.map((j) => {
            const unit = unitOf(j);
            const tone = statusTone(j.status);
            return (
              <button
                type="button"
                className={selectedId === j.id ? "jobrow on" : "jobrow"}
                key={j.id}
                onClick={() => onSelect(selectedId === j.id ? null : j.id)}
                title={j.title}
              >
                <span className="jcode">{agentCode(unit)}</span>
                <span className="jbody">
                  <span className="jt">{j.title}</span>
                  <span className="js">
                    <span className={tone === "run" ? "stat run" : tone === "gold" ? "stat gold" : "stat dim"}>
                      {statusWord(j.status)}
                    </span>
                    <span className="jsep"> · </span>
                    {unit ?? DASH}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {jobs.error ? <div className="corenote coreshell">JOBS READ FAILED — {jobs.error}</div> : null}
    </div>
  );
}

/* ---- the command bar ------------------------------------------------------
   A REAL input on the REAL chat path. `onSend` is App.tsx's sendMessage, the
   same function the deck's composer calls, so this screen adds no second chat
   state machine, no second conversationId and no second frame reducer. The
   prompt line above it echoes his LAST ACTUAL TURN — never a typed command he
   did not type. Nothing dispatch-specific lives here (D-DISPATCH §7.4): the
   sentence goes to her as a turn, she routes it, and the job frame — or the
   next /state poll — is what lights the row. */

function CommandCard({
  online,
  busy,
  prefill,
  onSend,
}: {
  online: boolean;
  busy: boolean;
  prefill: CorePrefill | null;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);
  const box = useRef<HTMLInputElement | null>(null);

  // v0.2 — the FLEET tab's DISPATCH lands here: the sentence goes in the box
  // and the box takes focus with the caret at the end. He finishes it; nothing
  // is sent by this effect. A fresh object per press (App bumps `seq`), so the
  // same unit pressed twice still refocuses.
  useEffect(() => {
    if (!prefill) return;
    setDraft(prefill.text);
    const el = box.current;
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => {
      const n = el.value.length;
      el.setSelectionRange(n, n);
    });
  }, [prefill]);

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
