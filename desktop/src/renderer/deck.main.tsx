// DECK ENTRY — owning stream: S1 (scaffold) -> S2 (deck UI).
//
// Two jobs, in this order:
//   1. resolveShot(location.search) FIRST. "index.html?shot=deck-alert" must
//      render that one scenario and nothing else — no poll, no greeting seed,
//      no modal layer — which is what makes the screenshots deterministic.
//   2. otherwise mount the real App.
//
// The root mount and window.__RENDER_DONE are load-bearing: scripts/shots.mjs
// and scripts/shot.mjs both poll that flag instead of sleeping. App sets it
// after the first state answer and document.fonts.ready; the shot branch sets
// it on the next frame, which is what the S1 scaffold did.

import { StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import "../styles/eve-desktop.css";
import "../styles/app.css";

// STREAM T: the world he picked, on <html>, before anything paints. ESM has
// already registered the sheets above by the time this line runs, so there is
// no frame of the wrong theme. See src/renderer/theme.ts.
import { applyStoredTheme } from "./theme";


// THE BUILD HANDSHAKE (S4, 2026-09-01). Mounted BEFORE the app, into its own
// root on <body>, so a window can never be serving a renderer bundle from a
// different build than the process answering its IPC without saying so on
// screen. That skew is what silenced her voice and disarmed filing on
// 2026-09-01 with nothing in the UI to name it. No-ops under ?shot=.
import { mountBuildBanner } from "./voice/BuildSkewBanner";
import App from "./deck/App";
import { resolveShot } from "./shots";

applyStoredTheme();
mountBuildBanner();

function ShotHost({ children }: { children: ReactNode }) {
  useEffect(() => {
    requestAnimationFrame(() => {
      window.__RENDER_DONE = true;
    });
  }, []);
  return <>{children}</>;
}

const shot = resolveShot(window.location.search);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>{shot ? <ShotHost>{shot()}</ShotHost> : <App />}</StrictMode>,
);
