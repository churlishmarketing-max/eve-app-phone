import { useEffect, useState } from "react";
import EveApp from "./EveApp";
import Pairing, { type PairReason } from "./Pairing";
import { hasPriorInstall, loadToken } from "./tokenStore";

// THE GATE (P1/P5, 2026-09-06).
//
// One decision, made before a single pixel of the deck exists: is there a
// token on this device? No token means the pairing screen and NOTHING ELSE —
// not a dimmed deck, not a modal over a board of numbers she never measured.
// She is a thin client; without her brain there is nothing true to render.
//
// The store read is awaited first ("loading"), so the deck never mounts with a
// cold cache and fires twenty unauthenticated requests at her brain on boot.
// In practice that read is a synchronous localStorage hit and this phase is a
// single frame — it exists so the store can become a real async plugin later
// (see tokenStore.ts) without this file changing.

type Phase =
  | { at: "loading" }
  | { at: "pair"; reason: PairReason }
  | { at: "app" };

export default function Root() {
  const [phase, setPhase] = useState<Phase>({ at: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const token = await loadToken();
      if (!alive) return;
      if (token) {
        setPhase({ at: "app" });
        return;
      }
      // MIGRATION (P5). No token AND traces of a previous install = his phone
      // after the update that removed the baked one. He gets the pairing
      // screen with the reason spelled out, never a silent logout. Why the
      // baked value cannot be carried across is argued in Pairing.tsx.
      setPhase({ at: "pair", reason: hasPriorInstall() ? "upgraded" : "first" });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (phase.at === "loading") return null;

  if (phase.at === "pair") {
    return (
      <Pairing
        reason={phase.reason}
        onPaired={() => setPhase({ at: "app" })}
        // Only offered on "rotate", where the old token is still stored and
        // still working. Backing out of the others would land on nothing.
        onCancel={phase.reason === "rotate" ? () => setPhase({ at: "app" }) : undefined}
      />
    );
  }

  return <EveApp onSignedOut={(reason) => setPhase({ at: "pair", reason })} />;
}
