// OPS pane — owning stream: S2. Artboard A, DATA column middle: the RED strip,
// the approval inbox, jobs in flight, client pulse.
//
// Nudges escalate in usefulness, never volume (§8 law 8): N1/N2/N3 render as
// mono sub-labels and a higher nudge just carries more preparation (DRAFT
// READY), never a louder colour.

import { useCallback, useState } from "react";
import type { AttentionAction, EveState } from "@shared/contract";
import { Cbtn, Divrow, OpRow, StatLine } from "../../components/atoms";
import { agentCode, kindGlyphExt, kindLabel } from "../format";
import { isInFlight } from "../../core/jobs";
import { SHELL_COPY } from "./shell";

export interface OpsPaneProps {
  state: EveState;
  onRefresh: () => Promise<void>;
}

const DONE_WORD: Record<AttentionAction, string> = {
  approve: "APPROVED",
  hold: "HELD",
  dismiss: "DISMISSED",
};

export default function OpsPane({ state, onRefresh }: OpsPaneProps) {
  const [notes, setNotes] = useState<Record<string, string>>({});

  const act = useCallback(
    async (id: string, action: AttentionAction) => {
      setNotes((n) => ({ ...n, [id]: "…" }));
      try {
        const r = await window.eve.attention(id, action);
        setNotes((n) => ({ ...n, [id]: r?.ok ? DONE_WORD[action] : `FAILED — ${r?.error ?? "no reason given"}` }));
      } catch (err) {
        setNotes((n) => ({ ...n, [id]: `FAILED — ${err instanceof Error ? err.message : String(err)}` }));
      }
      await onRefresh();
    },
    [onRefresh],
  );

  if (!state.online) {
    return (
      <div style={{ flex: "none" }}>
        <div className="shellcopy">{SHELL_COPY}</div>
      </div>
    );
  }

  const confirms = state.pendingConfirms ?? [];
  const items = state.attentionItems ?? [];
  // DISPATCH v0.1 (CONTRACT-v0.1 §1): `jobs[]` is now every job of the last
  // 24 h, any status. "In flight" is a FILTER, not a length — done and failed
  // rows live on THE CORE's 24 h list, not under this header.
  const jobs = (state.jobs ?? []).filter((j) => isInFlight(j.status));
  const clients = state.clients ?? [];

  return (
    <div style={{ flex: "none" }}>
      {confirms.length > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--mono)",
            fontSize: 9.5,
            letterSpacing: ".18em",
            // 9.5px type -> --redInk. The count badge below keeps the law
            // hex as its BACKGROUND, which is structure.
            color: "var(--redInk)",
          }}
        >
          WAITING ON YOUR THUMB — RED
          <span
            style={{
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: "var(--red)",
              color: "#fff",
              fontSize: 9,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: 0,
            }}
          >
            {confirms.length}
          </span>
        </div>
      ) : null}

      {/* With no RED strip above them the attention rows arrive headerless, so
          the pane opens on an unlabelled list. The strip, when it is there, is
          the header — do not double it up. */}
      {items.length > 0 && confirms.length === 0 ? (
        <Divrow label="APPROVAL INBOX" right={String(items.length)} />
      ) : null}

      {items.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: confirms.length > 0 ? 10 : 0 }}>
          {items.map((a) => {
            const draft = a.ref && typeof a.ref === "object" && "draft" in a.ref ? " · DRAFT READY" : "";
            const note = notes[a.id];
            return (
              <OpRow key={a.id}>
                <span className="gl">{kindGlyphExt(a.kind)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="tt">{a.message}</div>
                  <div className="sub">{`${kindLabel(a.kind)} · N${a.nudge_level}${draft}`}</div>
                </div>
                {note ? (
                  <span
                    className="stat dim"
                    style={{ marginLeft: "auto", color: note.startsWith("FAILED") ? "var(--redInk)" : "var(--tealHi)" }}
                  >
                    {note}
                  </span>
                ) : (
                  <div className="acts">
                    <Cbtn label="APPROVE" tone="ok" onClick={() => void act(a.id, "approve")} />
                    <Cbtn label="HOLD" onClick={() => void act(a.id, "hold")} />
                    <Cbtn label="✕" title="Dismiss" onClick={() => void act(a.id, "dismiss")} />
                  </div>
                )}
              </OpRow>
            );
          })}
        </div>
      ) : null}

      <Divrow label="JOBS IN FLIGHT" right={String(jobs.length)} />
      {jobs.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {jobs.map((j) => {
            const st = (j.status ?? "").toLowerCase();
            const running = st === "running";
            const approvals = st.includes("approval");
            return (
              <OpRow key={j.id}>
                <span className="jcode">{agentCode(j.unit ?? j.agent)}</span>
                <div className="tt">{j.title}</div>
                <StatLine
                  text={running ? "● RUNNING" : approvals ? "IN APPROVALS" : st.replace(/_/g, " ").toUpperCase()}
                  tone={running ? "run" : approvals ? "gold" : "dim"}
                  style={{ marginLeft: "auto" }}
                />
              </OpRow>
            );
          })}
        </div>
      ) : (
        <div className="shellcopy">Nothing in flight. Give her the job — by name or just the outcome.</div>
      )}

      {clients.length > 0 ? (
        <>
          <Divrow label="CLIENT PULSE" right={`${clients.length} WATCHED`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {clients.map((c) => {
              const q = c.days_quiet;
              const hot = q !== null && q !== undefined && q > c.cadence_days;
              return (
                <OpRow key={c.id}>
                  <div className="tt">{c.name}</div>
                  <StatLine
                    text={q === null || q === undefined ? "— QUIET" : `${q}D QUIET`}
                    tone={hot ? "gold" : "dim"}
                    style={{ marginLeft: 12 }}
                  />
                  <span className="sub" style={{ marginLeft: "auto", marginTop: 0 }}>
                    {q === null || q === undefined
                      ? `cadence ${c.cadence_days}d`
                      : hot
                        ? `cadence ${c.cadence_days}d — past it.`
                        : "— inside the window."}
                  </span>
                </OpRow>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
