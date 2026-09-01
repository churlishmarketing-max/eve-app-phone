// FLYOUT ENTRY.
//
// S1b scaffolded this; S4 replaced the body. Mirrors summon.main.tsx: the
// design sheet, resolveShot() ahead of normal routing, the root mount, and the
// __RENDER_DONE flag scripts/shot.mjs waits on.
//
// The flyout window is NOT transparent (electron/flyout-window.ts sets
// backgroundColor #070B0C), but the page still leaves the body unpainted so the
// panel's own border-radius reads against the window colour instead of a second
// opaque rectangle.
//
// Owning stream: S1b (scaffold) -> S4 (flyout body).

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/eve-desktop.css";
import "../styles/app.css";
// STREAM T: same world as the deck, applied before first paint.
import { applyStoredTheme } from "./theme";

// THE BUILD HANDSHAKE (S4, 2026-09-01). Mounted BEFORE the app, into its own
// root on <body>, so a window can never be serving a renderer bundle from a
// different build than the process answering its IPC without saying so on
// screen. That skew is what silenced her voice and disarmed filing on
// 2026-09-01 with nothing in the UI to name it. No-ops under ?shot=.
import { mountBuildBanner } from "./voice/BuildSkewBanner";
import { resolveShot } from "./shots/index";
import TrayFlyout from "./tray-flyout/TrayFlyout";

applyStoredTheme();
mountBuildBanner();

document.body.style.margin = "0";
document.body.style.background = "transparent";

const Shot = resolveShot(window.location.search);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>{Shot ? <Shot /> : <TrayFlyout />}</StrictMode>,
);

// TrayFlyout claims this flag while it loads (see its layout effect); this is
// the fallback for a scenario that paints synchronously.
requestAnimationFrame(() => {
  if (window.__RENDER_DONE === undefined) window.__RENDER_DONE = true;
});
