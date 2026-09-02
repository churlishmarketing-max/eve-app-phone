// THE CORE's container — owning stream: THE CORE (P1 v0.1 hub half).
//
// Deck.tsx is pure presentation and stays that way: this is the one component
// between it and CorePane that owns the things the deck's props do not already
// carry — GET /health (MEMORY only, now), the merged jobs view, the session
// log (derived by watching real events go past), the selected job and the set
// of pending cards the detail panel can mount inline.
//
// The same shape SettingsPane already has: Deck renders it, it fetches its own
// slice, and the presentational component below it takes everything as props
// so a shot scenario can render CorePane directly from a fixture.

import { useCallback, useMemo, useState } from "react";
import type { EveState } from "@shared/contract";
import type { ChatView, EveMode } from "../deck/types";
import CorePane from "./CorePane";
import { confirmFor, jobsView, pendingConfirmsOf } from "./jobs";
import { eventsFor, useCoreLog } from "./useCoreLog";
import { useHealth } from "./useHealth";

export interface CoreScreenProps {
  sessionNo: number;
  state: EveState;
  fetchedAt: string | null;
  chat: ChatView;
  mode: EveMode;
  quietHours: boolean;
  /** Open on this job's detail (shot fixtures). Live use opens by click. */
  initialJobId?: string;
  /** Open the roster panel on mount (shot fixtures). */
  initialRosterOpen?: boolean;
  onSend: (text: string) => void;
  onConfirmResolved: (id: string) => void;
}

export default function CoreScreen(p: CoreScreenProps) {
  // Asking a dead brain for /health once a minute is noise; the MEMORY cell
  // says NO ANSWER on its own when this is null. (The fleet no longer reads it.)
  const { health, error: healthError } = useHealth(p.state.online);

  const frames = p.chat.jobFrames ?? [];
  const jobs = useMemo(() => jobsView(p.state, p.fetchedAt, frames), [p.state, p.fetchedAt, frames]);
  const confirms = useMemo(() => pendingConfirmsOf(p.state, p.chat), [p.state, p.chat]);

  const log = useCoreLog({ state: p.state, fetchedAt: p.fetchedAt, chat: p.chat, jobs, frames });

  const [selectedId, setSelectedId] = useState<string | null>(p.initialJobId ?? null);
  const selected = useMemo(() => jobs.rows.find((j) => j.id === selectedId) ?? null, [jobs.rows, selectedId]);
  const selectedConfirm = useMemo(() => (selected ? confirmFor(selected, confirms) : null), [selected, confirms]);
  const selectedEvents = useMemo(() => (selected ? eventsFor(log.rows, selected.id) : []), [log.rows, selected]);
  const onSelectJob = useCallback((id: string | null) => setSelectedId(id), []);

  return (
    <CorePane
      sessionNo={p.sessionNo}
      state={p.state}
      fetchedAt={p.fetchedAt}
      health={p.state.online ? health : null}
      healthError={p.state.online ? healthError : null}
      chat={p.chat}
      mode={p.mode}
      quietHours={p.quietHours}
      jobs={jobs}
      log={log.rows}
      logDropped={log.dropped}
      selectedJob={selected}
      selectedConfirm={selectedConfirm}
      selectedEvents={selectedEvents}
      onSelectJob={onSelectJob}
      rosterOpen={p.initialRosterOpen}
      onSend={p.onSend}
      onConfirmResolved={p.onConfirmResolved}
    />
  );
}
