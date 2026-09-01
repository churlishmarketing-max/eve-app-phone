// DATA column (1fr) — owning stream: S2. Artboard A right column: TODAY / OPS /
// BODY strip, and the host for Artboard D's full BODY pane.
//
// TODAY is flex:none (it is the day, it never scrolls away), OPS takes the
// remaining height and scrolls (the queue is unbounded — approvals, jobs and
// pulse rows all land here), and the BODY strip is pinned above the footnote.

import type { EveState, Vitals } from "@shared/contract";
import { BodyPane } from "./s3-contracts";
import TodayPane from "./panes/TodayPane";
import OpsPane from "./panes/OpsPane";
import BodyStrip from "./panes/BodyStrip";

export interface DataColumnProps {
  state: EveState;
  fetchedAt: string | null;
  now: Date;
  vitals: Vitals | null;
  showBody: boolean;
  onOpenBody: () => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

const HAIR = { height: 1, background: "var(--hair)" } as const;

export default function DataColumn(p: DataColumnProps) {
  if (p.showBody) {
    return (
      <div className="col cant-right" style={{ padding: "16px 16px 10px" }}>
        <BodyPane onBack={p.onBack} />
      </div>
    );
  }

  return (
    <div className="col cant-right" style={{ padding: "16px 16px 10px" }}>
      <TodayPane state={p.state} fetchedAt={p.fetchedAt} now={p.now} />
      <div style={{ ...HAIR, margin: "10px 0", flex: "none" }} />
      <div className="opsscroll">
        <OpsPane state={p.state} onRefresh={p.onRefresh} />
      </div>
      <div style={{ ...HAIR, margin: "10px 0 8px", flex: "none" }} />
      <BodyStrip vitals={p.vitals} state={p.state} onOpen={p.onOpenBody} />
      <div className="footnote" style={{ paddingTop: 8, flex: "none" }}>
        the fleet works. you sign.
      </div>
    </div>
  );
}
