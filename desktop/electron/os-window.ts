// THE CHURLISH OS WINDOW (One House Step 10, "One icon", phase 1).
//
// A dedicated BrowserWindow on the Churlish OS, so the desk has the OS beside
// her deck without a browser tab to lose. It is deliberately NOT one of the
// deck's windows and it shares nothing with them:
//
//   - its own persistent session partition, `persist:churlish-os`, so the OS
//     login (a Supabase cookie) survives restarts and never mixes with the
//     deck's session;
//   - NO preload. The OS page cannot see `window.eve`, the bridge, or the
//     token — it is a website, and it gets what a website gets;
//   - sandboxed, contextIsolation on, nodeIntegration off;
//   - it only navigates inside the OS host. A link anywhere else opens in the
//     real browser (http/https only), never in this window.
//
// The renderer asks for a PAGE KEY (inbox / today / ledger / team / eve) —
// the `openExternal` allowlist precedent: a key crosses the bridge, never a
// URL. Main turns the key into the address.
//
// The base URL: Settings' `osUrl` if set, else CHURLISH_OS_URL, else
// https://churlishos.app. The existing flyout "open OS in the browser" path
// (IPC.openExternal "os") is untouched.

import { BrowserWindow, session, shell } from "electron";
import { readConfig, windowsHidden } from "./config.js";
import { registerWindow } from "./windows.js";
import type { OsPage } from "../src/shared/contract.js";

export const DEFAULT_OS_URL = "https://churlishos.app";
export const OS_PARTITION = "persist:churlish-os";
const OS_BG = "#080809";

export const OS_PAGE_PATHS: Readonly<Record<OsPage, string>> = {
  inbox: "/inbox",
  today: "/today",
  ledger: "/ledger",
  team: "/team",
  eve: "/eve",
};

export function isOsPage(v: unknown): v is OsPage {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(OS_PAGE_PATHS, v);
}

function parseHttp(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** The OS base, no trailing slash. */
export function osBaseUrl(): string {
  const u = parseHttp(readConfig().osUrl) ?? parseHttp(process.env.CHURLISH_OS_URL) ?? new URL(DEFAULT_OS_URL);
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
}

/** Same host as the OS base; https, or http only when the base itself is http. */
export function isOsUrl(link: unknown): link is string {
  if (typeof link !== "string" || !link) return false;
  const base = new URL(osBaseUrl());
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return false;
  }
  if (u.host !== base.host) return false;
  return u.protocol === "https:" || (u.protocol === "http:" && base.protocol === "http:");
}

export function osPageUrl(page: OsPage): string {
  return `${osBaseUrl()}${OS_PAGE_PATHS[page]}`;
}

let osWin: BrowserWindow | null = null;
let hardened = false;

/** Once per process: the OS partition may copy to the clipboard, nothing else. */
function hardenSession(): void {
  if (hardened) return;
  hardened = true;
  const ses = session.fromPartition(OS_PARTITION);
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === "clipboard-sanitized-write" && isOsUrl(wc.getURL()));
  });
}

function openOutside(url: string): void {
  if (parseHttp(url)) void shell.openExternal(url);
}

function createOsWindow(): BrowserWindow {
  hardenSession();
  const hidden = windowsHidden();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "Churlish OS",
    backgroundColor: OS_BG,
    autoHideMenuBar: true,
    webPreferences: {
      partition: OS_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on("ready-to-show", () => {
    if (!hidden) win.show();
  });
  // target=_blank inside the OS stays in this window; anything else goes to
  // the real browser. Nothing ever opens a second Electron window from here.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOsUrl(url)) void win.loadURL(url);
    else openOutside(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (isOsUrl(url)) return;
    e.preventDefault();
    openOutside(url);
  });
  win.on("closed", () => {
    if (osWin === win) osWin = null;
  });
  registerWindow("os", win);
  return win;
}

/**
 * Open (or focus) the OS window. `target` is a page key, or an absolute OS URL
 * (a deep link from a toast); anything else lands on the Inbox.
 */
export function openOsWindow(target?: OsPage | string): { ok: boolean; url: string } {
  const url = isOsPage(target) ? osPageUrl(target) : isOsUrl(target) ? target : osPageUrl("inbox");
  const win = osWin && !osWin.isDestroyed() ? osWin : (osWin = createOsWindow());
  void win.loadURL(url);
  if (!windowsHidden()) {
    if (win.isMinimized()) win.restore();
    if (win.isVisible()) win.focus();
  }
  return { ok: true, url };
}
