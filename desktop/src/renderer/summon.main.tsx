// SUMMON ENTRY.
//
// S1 scaffolded this; S4 replaced the body with the real panel. What survives
// from the scaffold: the root mount, the transparent page (an opaque body
// would paint a black rectangle around a transparent window), and the
// __RENDER_DONE flag scripts/shots.mjs + scripts/shot.mjs wait on.
//
// resolveShot() runs BEFORE normal routing so "summon.html?shot=<key>" renders
// one isolated scenario instead of the live overlay (src/renderer/shots/index.ts).
//
// Owning stream: S1 (scaffold) -> S4 (summon panel).

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Same two sheets, same order, as deck.main.tsx: the design law, then S2's app
// sheet (self-hosted @font-face — the CSP has no font-src, so without it every
// face falls back to system-ui).
import "../styles/eve-desktop.css";
import "../styles/app.css";
// STREAM T: same world as the deck, applied before first paint. The summon
// overlay is the surface a wrong-theme flash would be most obvious on.
import { applyStoredTheme } from "./theme";

// THE BUILD HANDSHAKE (S4, 2026-09-01). Mounted BEFORE the app, into its own
// root on <body>, so a window can never be serving a renderer bundle from a
// different build than the process answering its IPC without saying so on
// screen. That skew is what silenced her voice and disarmed filing on
// 2026-09-01 with nothing in the UI to name it. No-ops under ?shot=.
import { mountBuildBanner } from "./voice/BuildSkewBanner";
import { resolveShot } from "./shots/index";
import SummonApp from "./summon/SummonApp";

applyStoredTheme();
mountBuildBanner();

document.body.style.margin = "0";
document.body.style.background = "transparent";

const Shot = resolveShot(window.location.search);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>{Shot ? <Shot /> : <SummonApp />}</StrictMode>,
);

// The live SummonApp sets this itself after its first paint; a static scenario
// does not, so the entry sets it. A scenario that needs to finish work first
// claims the flag (sets it false in a layout effect, true when it is done) and
// this leaves it alone — that is how the voice-receipt scenario waits.
requestAnimationFrame(() => {
  if (window.__RENDER_DONE === undefined) window.__RENDER_DONE = true;
});
