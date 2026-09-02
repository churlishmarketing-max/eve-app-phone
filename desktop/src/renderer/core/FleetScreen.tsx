// THE FLEET tab's container — owning stream: THE CORE (P1 v0.2 hub half).
//
// Key 6. Mounts the way CoreScreen does: Deck renders it full-frame, it
// derives the merged jobs view from the same props the deck already carries,
// reads his pins through the same hook THE CORE reads them through, and hands
// everything to FleetPane as props so a shot scenario can drive the whole tab
// from a fixture. No second poll, no second chat state machine.

import { useMemo } from "react";
import type { EveState } from "@shared/contract";
import type { ChatView } from "../deck/types";
import FleetPane from "./FleetPane";
import { jobsView } from "./jobs";
import { usePins } from "./usePins";

export interface FleetScreenProps {
  state: EveState;
  fetchedAt: string | null;
  chat: ChatView;
  /** A row's DISPATCH: App jumps to THE CORE with the command bar prefilled. */
  onDispatchUnit: (key: string) => void;
}

export default function FleetScreen(p: FleetScreenProps) {
  const frames = p.chat.jobFrames ?? [];
  const jobs = useMemo(() => jobsView(p.state, p.fetchedAt, frames), [p.state, p.fetchedAt, frames]);
  const { pins, toggle } = usePins();
  return <FleetPane state={p.state} jobs={jobs} pins={pins} onTogglePin={toggle} onDispatch={p.onDispatchUnit} />;
}
