// useVitalsStrip — owning stream: S2.
//
// The BODY strip's one line. /vitals is deliberately NOT part of /state (the
// brain keeps it out on purpose), so this is a LAZY one-shot on mount with
// days=1 — it never joins the 30s poll, and it never runs while she is
// unreachable (an offline strip says so instead of inventing a zero).

import { useEffect, useState } from "react";
import type { Vitals } from "@shared/contract";

export function useVitalsStrip(online: boolean): Vitals | null {
  const [vitals, setVitals] = useState<Vitals | null>(null);

  useEffect(() => {
    if (!online || vitals) return;
    let cancelled = false;
    void window.eve
      .vitals(1)
      .then((v) => {
        if (!cancelled) setVitals(v);
      })
      .catch(() => {
        /* main never throws; a rejection here is a dead bridge, not a zero */
      });
    return () => {
      cancelled = true;
    };
  }, [online, vitals]);

  return vitals;
}
