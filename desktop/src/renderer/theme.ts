// STREAM T — THE FOUR-WORLD THEME SYSTEM.
//
// One attribute drives everything: `data-theme` on <html>. The token block in
// src/styles/eve-desktop.css is TERMINAL; src/styles/themes/*.css re-declare
// the RGB channel tokens under `:root[data-theme="<id>"]` and the whole sheet
// follows, because every colour in that sheet is now rgba(var(--rgbX),a)
// rather than a literal.
//
// WHY THE ATTRIBUTE IS SET HERE AND NOT IN REACT: a flash of the wrong world is
// a bug. applyStoredTheme() is called at the top of all three renderer entries
// (deck.main.tsx / summon.main.tsx / flyout-main.tsx) BEFORE createRoot, and
// the CSS is already registered by then because ESM hoists the stylesheet
// imports above executable code. Nothing paints untouched.
//
// WHY ALL THREE WINDOWS AGREE: the pick lives in localStorage under one key,
// same origin for deck/summon/flyout, so every window reads the same value at
// boot; the `storage` event listener below moves the other two windows live
// when the deck's settings pane changes it, without a reload.
//
// THE LAW IS NOT THEMEABLE. No theme file declares --red, --rgbRed or --green.
// Red stays #C41E3A and means the RED confirm tier or the live mic; green stays
// #3EA26E and means the GREEN autonomy dot. In all four worlds.

import "../styles/themes/terminal.css";
import "../styles/themes/neon.css";
import "../styles/themes/paper.css";
import "../styles/themes/amber.css";
// Colour declarations another stream's sheet spells as literals, restated in
// token terms and gated so they can never touch TERMINAL. See the file header.
import "../styles/cross-stream.css";

export const THEME_KEY = "eve.theme";

export type ThemeId = "terminal" | "neon" | "paper" | "amber";

export interface ThemeMeta {
  id: ThemeId;
  /** What the settings card is labelled. */
  name: string;
  /** One line of chrome under the name — never her voice. */
  note: string;
  /** Where this world's palette was transcribed from. */
  source: string;
}

// Order is the order the settings cards render in. TERMINAL first because it is
// the default and the baseline every other world is measured against.
export const THEMES: ThemeMeta[] = [
  {
    id: "terminal",
    name: "TERMINAL",
    note: "teal terminal-noir · the default",
    source: "ui_kits/eve-desktop/eve-desktop.css",
  },
  {
    id: "neon",
    name: "NEON RONIN",
    note: "night-cel · flat ink · hard shadows",
    source: "ui_kits/eve-anime/neon.css",
  },
  {
    id: "paper",
    name: "PAPER",
    note: "print-noir dossier · ink on cream",
    source: "ui_kits/eve-paper/paper.css",
  },
  {
    id: "amber",
    name: "AMBER COCKPIT",
    note: "warm black hull · amber primary",
    source: "tokens/colors.css + eve-fusion/fusion-amber.css",
  },
];

const IDS: ThemeId[] = THEMES.map((t) => t.id);

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (IDS as string[]).includes(v);
}

/** The stored pick, or "terminal" when nothing is stored / storage is denied. */
export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (isThemeId(v)) return v;
  } catch {
    /* storage unavailable (private profile, denied) — the default still works */
  }
  return "terminal";
}

/** Paint-only. Does not persist and does not notify. */
export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute("data-theme", id);
}

/** Persist + apply. This is what the settings cards call. */
export function setTheme(id: ThemeId): void {
  applyTheme(id);
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    /* storage unavailable — the in-memory pick still drives this session */
  }
}

/**
 * The shot harness has no localStorage of its own (every capture runs in a
 * throwaway profile), so "?theme=<id>" forces a world for one page load. It
 * never writes — a capture must not be able to change his real pick.
 */
function themeFromSearch(search: string): ThemeId | null {
  try {
    const v = new URLSearchParams(search).get("theme");
    return isThemeId(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Boot-time entry point. Call once, at the top of a renderer entry, before
 * anything renders.
 */
export function applyStoredTheme(): void {
  applyTheme(themeFromSearch(window.location.search) ?? getTheme());

  // The other windows follow the deck without a reload. `storage` only fires in
  // documents that did NOT do the writing, which is exactly the ones that need
  // telling.
  window.addEventListener("storage", (e) => {
    if (e.key !== THEME_KEY) return;
    applyTheme(isThemeId(e.newValue) ? e.newValue : "terminal");
  });
}
