// THE BRIEF's container — owning stream: THE BRIEF (C).
//
// The same shape CoreScreen and SettingsPane already have: Deck renders it, it
// owns whatever the deck's props do not already carry, and the presentational
// component below takes everything as props so a shot scenario can render
// BriefPane directly from a fixture.
//
// It owns almost nothing on purpose. The brief rides on /state (brain's
// state.ts serves the whole deck, on the degraded return too), so unlike
// CoreScreen there is no second fetch here — no /health, no extra slice, no
// poll of its own. Deriving the view is one pure call into briefView.ts.

import { useMemo } from "react";
import type { EveState } from "@shared/contract";
import BriefPane from "./BriefPane";
import { briefView } from "./briefView";

export interface BriefScreenProps {
  state: EveState;
  fetchedAt: string | null;
}

export default function BriefScreen(p: BriefScreenProps) {
  const view = useMemo(() => briefView(p.state), [p.state]);
  return <BriefPane view={view} fetchedAt={p.fetchedAt} />;
}
