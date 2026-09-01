// THE TWO WINDOWS.
//
// DECK — the main window. Frameless (S2 draws the 1440x32 title bar), 1440x900
// default, 1120x720 floor, #030506 background so there is never a white flash
// before the renderer paints. Geometry remembered in userData/window.json.
//
// SUMMON — the overlay. 680x500, frameless, transparent, always-on-top, off
// the taskbar, HIDDEN by default. Horizontally centred on the primary display's
// work area at y=140 (handoff Artboard B: "Centered horizontally, top edge
// y=140"). Hides on blur and on Esc (renderer -> IPC summon.hide).
//
// Under EVE_SMOKE / EVE_SHOTS both windows are created with show:false and are
// never shown. The desktop must never steal King's screen to run its own tests.
//
// Owning stream: S1. S2 owns what is drawn inside the deck; S4 owns the summon
// panel's contents and its show/hide choreography beyond the primitives here.

import { app, BrowserWindow, screen } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { windowsHidden } from "./config.js";

export const BG = "#030506";

const DECK_DEFAULT = { width: 1440, height: 900 };
const DECK_MIN = { width: 1120, height: 720 };
const SUMMON = { width: 680, height: 500, y: 140 };

let deck: BrowserWindow | null = null;
let summon: BrowserWindow | null = null;

// ---------------------------------------------------------------------------
// Geometry persistence — userData/window.json
// ---------------------------------------------------------------------------

interface Geometry {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function geometryPath(): string {
  return path.join(app.getPath("userData"), "window.json");
}

function readGeometry(): Geometry {
  try {
    const p = geometryPath();
    if (!existsSync(p)) return { ...DECK_DEFAULT };
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<Geometry>;
    const g: Geometry = {
      width: Math.max(DECK_MIN.width, Number(raw.width) || DECK_DEFAULT.width),
      height: Math.max(DECK_MIN.height, Number(raw.height) || DECK_DEFAULT.height),
      maximized: raw.maximized === true,
    };
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      // A saved position on a monitor that is now unplugged would put the deck
      // somewhere King cannot reach. Only restore it if it still intersects a
      // live display.
      const pt = { x: Number(raw.x), y: Number(raw.y) };
      const near = screen.getDisplayMatching({ ...pt, width: g.width, height: g.height });
      const wa = near.workArea;
      if (pt.x < wa.x + wa.width && pt.y < wa.y + wa.height && pt.x + g.width > wa.x && pt.y + g.height > wa.y) {
        g.x = pt.x;
        g.y = pt.y;
      }
    }
    return g;
  } catch {
    return { ...DECK_DEFAULT };
  }
}

function writeGeometry(g: Geometry): void {
  const target = geometryPath();
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(g, null, 2)}\n`, "utf8");
    renameSync(tmp, target);
  } catch {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* nothing to salvage; losing remembered geometry is cosmetic */
    }
  }
}

function rememberDeck(): void {
  if (!deck || deck.isDestroyed()) return;
  const maximized = deck.isMaximized();
  // getNormalBounds gives the pre-maximize rectangle, which is the one worth
  // remembering — otherwise un-maximizing lands on a full-screen-sized window.
  const b = deck.getNormalBounds();
  writeGeometry({ x: b.x, y: b.y, width: b.width, height: b.height, maximized });
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

export interface WindowPaths {
  preload: string;
  /** dev: the electron-vite renderer origin. prod: undefined. */
  rendererUrl?: string;
  /** prod: out/renderer on disk. */
  rendererDir: string;
}

let paths: WindowPaths | null = null;

export function setWindowPaths(p: WindowPaths): void {
  paths = p;
}

function loadPage(win: BrowserWindow, file: "index.html" | "summon.html"): void {
  if (!paths) throw new Error("setWindowPaths() must run before a window loads");
  if (paths.rendererUrl) void win.loadURL(`${paths.rendererUrl}/${file}`);
  else void win.loadFile(path.join(paths.rendererDir, file));
}

export function createDeck(): BrowserWindow {
  if (deck && !deck.isDestroyed()) return deck;
  const g = readGeometry();
  const hidden = windowsHidden();

  deck = new BrowserWindow({
    width: g.width,
    height: g.height,
    ...(g.x !== undefined ? { x: g.x, y: g.y } : {}),
    minWidth: DECK_MIN.width,
    minHeight: DECK_MIN.height,
    show: false, // shown on ready-to-show, unless hidden mode
    frame: false,
    backgroundColor: BG,
    title: "EVE",
    autoHideMenuBar: true,
    webPreferences: {
      preload: paths?.preload,
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox MUST stay false: the preload needs node's require to reach
      // ipcRenderer through contextBridge in this build setup.
      sandbox: false,
      // Screenshots of a hidden window come out blank if the renderer is
      // throttled while unfocused/occluded.
      backgroundThrottling: false,
    },
  });

  if (g.maximized && !hidden) deck.maximize();

  deck.on("ready-to-show", () => {
    if (!hidden) deck?.show();
  });
  deck.on("resize", rememberDeck);
  deck.on("move", rememberDeck);
  deck.on("maximize", rememberDeck);
  deck.on("unmaximize", rememberDeck);
  deck.on("close", rememberDeck);
  deck.on("closed", () => {
    deck = null;
  });

  loadPage(deck, "index.html");
  return deck;
}

export function getDeck(): BrowserWindow | null {
  return deck && !deck.isDestroyed() ? deck : null;
}

/** Focus the deck, creating it if the user closed it. Toast clicks land here. */
export function focusDeck(): BrowserWindow {
  const win = getDeck() ?? createDeck();
  if (windowsHidden()) return win; // never surface during smoke/shots
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  return win;
}

export function deckFocused(): boolean {
  const w = getDeck();
  return !!w && w.isFocused();
}

// ---------------------------------------------------------------------------
// Summon
// ---------------------------------------------------------------------------

export function createSummon(): BrowserWindow {
  if (summon && !summon.isDestroyed()) return summon;

  summon = new BrowserWindow({
    width: SUMMON.width,
    height: SUMMON.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    title: "EVE — Summon",
    webPreferences: {
      preload: paths?.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  // Blur dismisses (handoff Artboard B: "Esc or click-outside dismisses"). An
  // in-flight reply keeps streaming into the deck — hiding a window does not
  // abort a chat, and nothing here calls abortChat.
  summon.on("blur", () => {
    if (!windowsHidden()) hideSummon();
  });
  summon.on("closed", () => {
    summon = null;
  });

  loadPage(summon, "summon.html");
  return summon;
}

export function getSummon(): BrowserWindow | null {
  return summon && !summon.isDestroyed() ? summon : null;
}

/** Centre horizontally on the primary display's WORK AREA, top edge y=140. */
export function positionSummon(win: BrowserWindow): void {
  const wa = screen.getPrimaryDisplay().workArea;
  const x = Math.round(wa.x + (wa.width - SUMMON.width) / 2);
  const y = Math.round(wa.y + SUMMON.y);
  win.setBounds({ x, y, width: SUMMON.width, height: SUMMON.height });
}

export function showSummon(): BrowserWindow {
  const win = getSummon() ?? createSummon();
  if (windowsHidden()) return win;
  positionSummon(win);
  win.showInactive();
  win.setAlwaysOnTop(true, "screen-saver");
  win.focus();
  return win;
}

export function hideSummon(): void {
  const win = getSummon();
  if (win && win.isVisible()) win.hide();
}

export function summonVisible(): boolean {
  const w = getSummon();
  return !!w && w.isVisible();
}

// ---------------------------------------------------------------------------
// Named window registry — a generic slot for windows that OTHER streams
// create (e.g. S4's tray flyout), so main.ts's IPC handlers can reach them by
// name without importing a stream-owned file here. Register once at creation
// time; get returns null once destroyed so callers never hold a stale handle.
// ---------------------------------------------------------------------------

const namedWindows = new Map<string, BrowserWindow>();

export function registerWindow(name: string, win: BrowserWindow): void {
  namedWindows.set(name, win);
  win.on("closed", () => {
    if (namedWindows.get(name) === win) namedWindows.delete(name);
  });
}

export function getWindow(name: string): BrowserWindow | null {
  const w = namedWindows.get(name);
  return w && !w.isDestroyed() ? w : null;
}

/** Broadcast to every live window. The poll and the PTT emitter use this. */
export function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}
