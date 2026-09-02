// JOB DETAIL — the one new surface. Owning stream: THE CORE (P1 v0.1 hub half).
//
// D-DISPATCH §7.5, built against CONTRACT-v0.1 §1 / §1.1 / §5. It opens in
// the centre column of THE CORE in place of the living core, in the same
// visual language as the confirm card, and it shows — in this order — what he
// said (verbatim), who she picked and why, the host, the status timeline, the
// tier of the next (or last) action, the pending RED card INLINE when the job
// is waiting on one, the result, and the cost.
//
// THREE LAWS THIS FILE KEEPS:
//   * THE DRAFT READS ABOVE THE CARD. §7.5 lists the card before the result;
//     for the one v0.1 job that raises a card, the result IS the draft the card
//     will send, and the card's payload does not carry it. He reads, then he
//     approves. Order swapped on purpose.
//   * NO SECOND CONFIRM RENDERER. The inline card is the shipped ConfirmCard,
//     variant "inline", the same component the talk column mounts under a
//     bubble. Approve/cancel run through its state machine and nowhere else.
//   * NULL IS A DASH. why, tier, cost, result, host — each renders "—" (or the
//     honest sentence) when the row carries null. Pre-migration rows carry
//     nulls for most of these; that is the contract, not a bug to paper over.
//   * THE TRANSITION IS RENDERED, NOT ASSUMED. When he answers the card, the
//     card says SENT/CANCELLED for its hold, then App refreshes /state and the
//     row settles to done/failed. Between those two moments this panel says
//     "CARD ANSWERED — WAITING FOR THE ROW TO SETTLE" rather than guessing the
//     verdict; the timeline and chip move only when the row does.
//
// What is NOT here from §7.5 and why: ANSWER / UNDO / RE-ROUTE / OPEN FOLDER
// actions. needs_input does not exist in v0.1 (nothing to answer), no undo
// endpoint exists, re-route is "say it again in the command bar" (the bar is
// right there), and no local folder is on the wire for a brain job. APPROVE and
// CANCEL exist exactly where they should — on the card.

import { useEffect, useState } from "react";
import type { JobRow, PendingConfirm } from "@shared/contract";
import ConfirmCard from "../confirm/ConfirmCard";
import { DASH } from "./counters";
import {
  costLabel,
  elapsed,
  humanise,
  isTerminal,
  normStatus,
  resultKind,
  statusTone,
  statusWord,
  unitOf,
} from "./jobs";
import type { CoreLogEntry } from "./useCoreLog";

export interface JobDetailProps {
  job: JobRow;
  /** The pending card this job is waiting on, if this window knows of one. */
  confirm: PendingConfirm | null;
  /** This session's log lines for this job, oldest first (timeline stamps). */
  events: CoreLogEntry[];
  onClose: () => void;
  /** App's resolver: prunes the card, refreshes /state. */
  onConfirmResolved: (id: string) => void;
}

const STATIONS = ["queued", "running", "in_approvals"] as const;

function stClass(t: ReturnType<typeof statusTone>): string {
  return t === "run" ? "stat run" : t === "gold" ? "stat gold" : "stat dim";
}

function hm(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function JobDetail({ job, confirm, events, onClose, onConfirmResolved }: JobDetailProps) {
  const status = normStatus(job.status);
  const terminal = isTerminal(status);
  const unit = unitOf(job);
  const kind = resultKind(job.result);

  // Elapsed ticks while the job is open; a settled job's clock is its two stamps.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (terminal) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [terminal]);

  // The rendered transition: card answered, row not yet settled.
  const [answered, setAnswered] = useState<string | null>(null);
  useEffect(() => {
    if (terminal) setAnswered(null);
  }, [terminal]);

  // ---- the timeline --------------------------------------------------------
  const ladder = ["queued", "running", "in_approvals", "done", "failed"];
  const idx = ladder.indexOf(status);
  const sawApprovals =
    status === "in_approvals" ||
    status === "done" ||
    events.some((e) => e.jobStatus === "in_approvals") ||
    kind === "confirm" ||
    kind === "draft" ||
    !!job.confirm_id;
  const reached = (st: string): boolean => {
    if (st === status) return true;
    if (st === "in_approvals") return sawApprovals && idx > 2;
    const i = ladder.indexOf(st);
    return i >= 0 && idx >= 0 && i < Math.min(idx, 3);
  };
  const stampFor = (st: string): string => {
    if (st === "queued") return hm(job.created_at);
    if (st === "done" || st === "failed") return hm(job.finished_at);
    const seen = events.find((e) => e.jobStatus === st);
    if (seen) return seen.at.slice(0, 5);
    // A worker's in_approvals sets finished_at (CONTRACT §1 status table).
    if (st === "in_approvals" && status === "in_approvals") return hm(job.finished_at);
    return DASH;
  };

  // ---- the tier line -------------------------------------------------------
  const tier = (job.tier ?? "").toLowerCase();
  const tierWord = tier === "red" ? "RED" : tier === "green" ? "GREEN" : tier ? tier.toUpperCase() : null;
  const tierAction =
    tier === "red"
      ? status === "in_approvals"
        ? "SEND CARD IS UP — NOTHING SENDS WITHOUT YOU"
        : status === "done"
          ? "SENT ON YOUR APPROVE"
          : status === "failed"
            ? "NOT SENT"
            : "A SEND CARD WILL BE RAISED"
      : tier === "green"
        ? terminal
          ? "RAN WITHOUT YOU"
          : "RUNS WITHOUT YOU"
        : null;

  const host = (job.host ?? "").toUpperCase();
  const cost = costLabel(job.cost_usd);

  return (
    <div className="card jdetail" role="region" aria-label="Job detail">
      <div className="railhead" style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          // JOB · {job.id.slice(0, 8)} · {unit ? humanise(unit) : DASH}
        </span>
        <button type="button" className="cbtn gh jclose" onClick={onClose} title="Back to the living core">
          CLOSE ✕
        </button>
      </div>

      {/* 1. header — unit, host, status, elapsed */}
      <div className="jhead">
        <span className="jname">{unit ? humanise(unit) : "NO UNIT ON THE ROW"}</span>
        <span className="kbd">{host ? `[${host}]` : `[${DASH}]`}</span>
        <span className={stClass(statusTone(status))}>{statusWord(status)}</span>
        <span className="jelapsed">
          {elapsed(job.created_at, terminal ? job.finished_at : null, now)}
          {terminal ? "" : " · OPEN"}
        </span>
      </div>

      {/* 2. what he said, verbatim */}
      <div className="jsec">
        <div className="jlab">HE SAID</div>
        <div className="jsaid">"{job.spec?.said || job.title}"</div>
      </div>

      {/* 3. who she picked, and why — the re-route affordance */}
      <div className="jsec">
        <div className="jlab">SHE PICKED</div>
        <div className="jline">
          <span className="jstrong">{unit ? humanise(unit) : DASH}</span>
          <span className="jdim"> — {job.why || job.spec?.routedWhy || `${DASH} no routing reason on the row`}</span>
          {job.spec?.routedBy ? <span className="jdim"> · routed by {job.spec.routedBy}</span> : null}
        </div>
        <div className="corenote">To re-route, say it again with the unit's name in the command bar.</div>
      </div>

      {/* 4. the status timeline */}
      <div className="jsec">
        <div className="jlab">TIMELINE</div>
        <div className="jtl">
          {STATIONS.map((st) => (
            <div className={`jst${reached(st) ? " reached" : ""}${status === st ? " now" : ""}`} key={st}>
              <span className="jdot" aria-hidden="true" />
              <span className="jsl">{st === "in_approvals" ? "NEEDS YOU" : st.toUpperCase()}</span>
              <span className="jss">{reached(st) ? stampFor(st) : DASH}</span>
            </div>
          ))}
          <div
            className={`jst${terminal ? " reached now" : ""}${status === "failed" ? " failed" : ""}`}
          >
            <span className="jdot" aria-hidden="true" />
            <span className="jsl">{status === "failed" ? "FAILED" : "DONE"}</span>
            <span className="jss">{terminal ? stampFor(status) : DASH}</span>
          </div>
        </div>
      </div>

      {/* 5. the next action's tier, before it happens */}
      <div className="jsec">
        <div className="jlab">{terminal ? "LAST ACTION" : "NEXT ACTION"}</div>
        {tierWord ? (
          <div className="jline">
            <span className={`kbd corelv jtier ${tier}`}>
              {/* The dot wears the law hex: RED is the confirm tier, GREEN is the
                  autonomy dot — both lawful uses, and structure not type. */}
              <span className="tierdot" style={{ background: tier === "red" ? "var(--red)" : tier === "green" ? "var(--green)" : "var(--gold)" }} />
              {tierWord}
            </span>
            <span className="jdim"> — {tierAction}</span>
          </div>
        ) : (
          <div className="jline jdim">{DASH} no tier on the row</div>
        )}
      </div>

      {/* 6. the result — for a pennyworth job this is the OS draft, and it reads
          ABOVE the card so his approve is an informed one (the card's own
          payload is client_name + jobId, not the text). */}
      <div className="jsec">
        <div className="jlab">RESULT</div>
        <Result job={job} />
      </div>

      {/* 7. the pending confirm card, INLINE — the shipped ConfirmCard */}
      {confirm ? (
        <div className="jsec">
          <div className="jlab">THE CARD</div>
          <ConfirmCard
            confirm={confirm}
            variant="inline"
            onResolved={(id) => {
              setAnswered(id);
              onConfirmResolved(id);
            }}
          />
        </div>
      ) : answered ? (
        <div className="jsec">
          <div className="jlab">THE CARD</div>
          <p className="clocked jclocked">CARD ANSWERED — WAITING FOR THE ROW TO SETTLE</p>
        </div>
      ) : job.confirm_id && status === "in_approvals" ? (
        <div className="jsec">
          <div className="jlab">THE CARD</div>
          <p className="clocked jclocked">
            CARD {job.confirm_id.slice(0, 8)} IS NOT ON THE WIRE — EXPIRED OR ANSWERED ELSEWHERE. ASK HER AGAIN.
          </p>
        </div>
      ) : null}

      {/* 8. cost */}
      <div className="jsec">
        <div className="jlab">COST</div>
        <div className="jline">
          <span className="jstrong">{cost ?? DASH}</span>
          <span className="jdim"> {cost ? "actual SDK spend" : "unmeasured — the SDK reported no price"}</span>
        </div>
      </div>
    </div>
  );
}

function Result({ job }: { job: JobRow }) {
  const r = job.result;
  const kind = resultKind(r);
  if (!r || !kind) {
    return (
      <div className="jline jdim">
        {DASH} {job.result_ref ? `nothing on the row · legacy ref ${job.result_ref}` : "nothing on the row yet"}
      </div>
    );
  }
  if (kind === "draft" && "draft" in r) {
    return (
      <>
        <div className="jline">
          <span className="jstrong">DRAFT</span>
          <span className="jdim"> — in the OS for {r.client || DASH} · {hm(r.at)}</span>
        </div>
        <pre className="jdraft">{r.draft || DASH}</pre>
      </>
    );
  }
  if (kind === "confirm" && "approved" in r) {
    return (
      <div className="jline">
        <span className="jstrong">{r.approved ? (r.executed ? "SENT" : "APPROVED, NOT EXECUTED") : "CANCELLED"}</span>
        <span className="jdim">
          {" "}
          — {r.detail || DASH} · {hm(r.at)}
        </span>
      </div>
    );
  }
  if (kind === "deliverable" && "chars" in r) {
    return (
      <div className="jline">
        <span className="jstrong">DELIVERABLE</span>
        <span className="jdim">
          {" "}
          — {typeof r.chars === "number" ? `${r.chars.toLocaleString()} chars` : DASH} ·{" "}
          {r.path ?? job.result_ref ?? "no local path"} · {hm(r.at)} · the text is in the approval inbox
        </span>
      </div>
    );
  }
  if (kind === "failure" && "reason" in r) {
    return (
      <div className="jline">
        <span className="jstrong">FAILED</span>
        <span className="jdim">
          {" "}
          — {r.reason || "no reason on the row"} · {hm(r.at)}
        </span>
      </div>
    );
  }
  return (
    <div className="jline jdim">
      {kind.toUpperCase()} — a result kind this build does not know how to show
    </div>
  );
}
