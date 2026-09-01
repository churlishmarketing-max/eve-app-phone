// THE TRAY FLYOUT WINDOW — 360x480, anchored to the tray icon.
//
// Artboard E. Frameless and always-on-top like Summon, but NOT transparent: the
// flyout is an opaque panel (#070B0C) so the 4-second glance reads instantly
// against whatever is behind it, and so it costs no compositing layer.
//
// It hides on blur — clicking anywhere else dismisses, exactly like Summon —
// and registers itself as "flyout" in windows.ts's named registry so main.ts's
// IPC.flyoutHide handler (and anything keyed by name later) can reach it
// without importing this file.
//
// Owning stream: S4.

import { app, BrowserWindow, screen, type Rectangle } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { windowsHidden } from "./config.js";
import { getWindow, registerWindow } from "./windows.js";

export const FLYOUT = { width: 360, height: 480 };
const GAP = 8;

// windows.ts keeps its resolved paths private and is frozen for this wave, so
// the two paths are recomputed here the same way electron/main.ts computes
// them (out/main/index.js is the bundle, so ".." is out/).
const here =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

let flyout: BrowserWindow | null = null;

function load(win: BrowserWindow): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && rendererUrl) void win.loadURL(`${rendererUrl}/flyout.html`);
  else void win.loadFile(path.join(here, "..", "renderer", "flyout.html"));
}

/**
 * Bottom-right of the work area by default; centred under/over the tray icon
 * when the tray gave us real bounds. Always clamped inside the work area, so a
 * tray on a secondary monitor or a left-docked taskbar cannot push it off-screen.
 */
export function positionFlyout(win: BrowserWindow, anchor?: Rectangle): void {
  const hasAnchor = !!anchor && anchor.width > 0 && anchor.height > 0;
  const display = hasAnchor
    ? screen.getDisplayNearestPoint({
        x: Math.round(anchor.x + anchor.width / 2),
        y: Math.round(anchor.y + anchor.height / 2),
      })
    : screen.getPrimaryDisplay();
  const wa = display.workArea;

  let x = hasAnchor
    ? Math.round(anchor.x + anchor.width / 2 - FLYOUT.width / 2)
    : wa.x + wa.width - FLYOUT.width - GAP;
  // Taskbar on the bottom half -> open upward; on the top half -> downward.
  const above = !hasAnchor || anchor.y > wa.y + wa.height / 2;
  let y = above ? wa.y + wa.height - FLYOUT.height - GAP : wa.y + GAP;

  x = Math.max(wa.x + GAP, Math.min(x, wa.x + wa.width - FLYOUT.width - GAP));
  y = Math.max(wa.y + GAP, Math.min(y, wa.y + wa.height - FLYOUT.height - GAP));
  win.setBounds({ x, y, width: FLYOUT.width, height: FLYOUT.height });
}

export function createFlyout(): BrowserWindow {
  if (flyout && !flyout.isDestroyed()) return flyout;

  flyout = new BrowserWindow({
    width: FLYOUT.width,
    height: FLYOUT.height,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#070B0C",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "EVE — Flyout",
    webPreferences: {
      preload: path.join(here, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  // Click-outside dismisses. Same law as Summon.
  flyout.on("blur", () => {
    if (!windowsHidden()) hideFlyout();
  });
  flyout.on("closed", () => {
    flyout = null;
  });

  // This is what makes IPC.flyoutHide stop being a no-op (OWNERSHIP.md S4).
  registerWindow("flyout", flyout);
  load(flyout);
  return flyout;
}

export function getFlyout(): BrowserWindow | null {
  return flyout && !flyout.isDestroyed() ? flyout : null;
}

export function flyoutVisible(): boolean {
  const w = getFlyout();
  return !!w && w.isVisible();
}

export function showFlyout(anchor?: Rectangle): void {
  const win = getFlyout() ?? createFlyout();
  if (windowsHidden()) return; // never surface during smoke/shots
  positionFlyout(win, anchor);
  win.show();
  win.setAlwaysOnTop(true, "pop-up-menu");
  win.focus();
}

export function hideFlyout(): void {
  const win = getFlyout();
  if (win && win.isVisible()) win.hide();
}

/** Tray click. */
export function toggleFlyout(anchor?: Rectangle): void {
  if (flyoutVisible()) hideFlyout();
  else showFlyout(anchor);
}

// ---------------------------------------------------------------------------
// WIRING PROBE — `EVE_FLYOUT_PROBE=1` builds the window HIDDEN, loads
// flyout.html, and prints whether windows.ts's registry can find it by name
// (that is the seam main.ts's IPC.flyoutHide handler uses) plus the geometry
// positionFlyout() lands on for this machine's work area. Env-gated and inert
// otherwise, same shape as the harness blocks in main.ts. It never shows the
// window, so it cannot take King's screen.
// ---------------------------------------------------------------------------

if (process.env.EVE_FLYOUT_PROBE === "1") {
  void app.whenReady().then(async () => {
    const win = createFlyout();
    await new Promise<void>((r) => {
      if (!win.webContents.isLoading()) r();
      else win.webContents.once("did-finish-load", () => r());
    });
    positionFlyout(win, undefined);
    const b = win.getBounds();
    console.log(
      `FLYOUTPROBE: registered=${getWindow("flyout") === win} visible=${win.isVisible()} ` +
        `url=${win.webContents.getURL().split("/").pop()} bounds=${b.x},${b.y} ${b.width}x${b.height} ` +
        `bg=${win.getBackgroundColor()} alwaysOnTop=${win.isAlwaysOnTop()}`,
    );
  });
}
