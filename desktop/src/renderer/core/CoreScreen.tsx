// THE CORE's container — owning stream: THE CORE.
//
// Deck.tsx is pure presentation and stays that way: this is the one component
// between it and CorePane that owns the two things the deck's props do not
// already carry — GET /health (the REGISTERED count and MEMORY) and the
// session log, which is derived by watching real events go past.
//
// The same shape SettingsPane already has: Deck renders it, it fetches its own
// slice, and the presentational component below it takes everything as props so
// a shot scenario can render CorePane directly from a fixture.

import type { EveState } from "@shared/contract";
import type { ChatView, EveMode } from "../deck/types";
import CorePane from "./CorePane";
import { useCoreLog } from "./useCoreLog";
import { useHealth } from "./useHealth";

export interface CoreScreenProps {
  sessionNo: number;
  state: EveState;
  fetchedAt: string | null;
  chat: ChatView;
  mode: EveMode;
  quietHours: boolean;
  onSend: (text: string) => void;
}

export default function CoreScreen(p: CoreScreenProps) {
  // Asking a dead brain for /health once a minute is noise; the fleet header
  // and the MEMORY cell say SOURCE DOWN on their own when this is null.
  const { health, error: healthError } = useHealth(p.state.online);
  const log = useCoreLog({ state: p.state, fetchedAt: p.fetchedAt, chat: p.chat });

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
      log={log}
      onSend={p.onSend}
    />
  );
}
