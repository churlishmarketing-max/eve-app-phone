// THE TRAY — her resident presence.
//
// Four icon states, drawn as raw BGRA bitmaps at 16px (1x) and 32px (2x). No
// asset files and no native image dependency: the art IS code, so a token
// change is a one-line edit and nothing can drift between the CSS and the icon.
//
// Artboard E, verbatim:
//   idle     = teal orb (the .orb radial gradient)
//   thinking = teal orb + an ice arc riding outside it (.arc, top quadrant)
//   alert    = RED orb (.orb.red) + a white count badge
//   quiet    = the teal orb pushed through CSS's own brightness(.45)
//              saturate(.6), plus a gold moon notch
//
// Click toggles the flyout; double-click focuses the deck (S1's click behaviour
// moved onto the flyout's OPEN DECK button, per the S4 spec).
//
// Owning stream: S1 (tooltip + click seam) -> S4 (icon art, flyout wiring).

import { app, Menu, nativeImage, Tray, type NativeImage, type Rectangle } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { focusDeck } from "./windows.js";
import { hideFlyout, toggleFlyout } from "./flyout-window.js";

export type TrayState = "idle" | "thinking" | "alert" | "quiet";

export interface TrayOptions {
  /** How many things need him. Renders in the alert badge and the tooltip. */
  count?: number;
}

// --- tokens (eve-desktop.css) ----------------------------------------------

type RGB = [number, number, number];
type Stop = [number, RGB];

/** .orb — radial-gradient(circle at 34% 30%, …) */
const ORB_TEAL: Stop[] = [
  [0.0, [0xc9, 0xf7, 0xfb]],
  [0.3, [0x1c, 0xb9, 0xc8]],
  [0.58, [0x00, 0x7a, 0x87]],
  [1.0, [0x06, 0x27, 0x2c]],
];
/** .orb.red */
const ORB_RED: Stop[] = [
  [0.0, [0xf7, 0xc9, 0xd2]],
  [0.3, [0xe0, 0x52, 0x6e]],
  [0.58, [0xc4, 0x1e, 0x3a]],
  [1.0, [0x2c, 0x06, 0x0d]],
];
const ICE: RGB = [0x9b, 0xef, 0xf7];
const GOLD: RGB = [0xc9, 0xa5, 0x4a];
const WHITE: RGB = [0xff, 0xff, 0xff];
const RED: RGB = [0xc4, 0x1e, 0x3a];

// --- a tiny straight-alpha RGBA canvas -------------------------------------

class Canvas {
  readonly size: number;
  private readonly px: Float64Array;

  constructor(size: number) {
    this.size = size;
    this.px = new Float64Array(size * size * 4);
  }

  /** source-over one pixel. `a` is 0..1 coverage. */
  blend(x: number, y: number, [r, g, b]: RGB, a: number): void {
    if (a <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    const da = this.px[i + 3]!;
    const out = a + da * (1 - a);
    if (out <= 0) return;
    this.px[i] = (r * a + this.px[i]! * da * (1 - a)) / out;
    this.px[i + 1] = (g * a + this.px[i + 1]! * da * (1 - a)) / out;
    this.px[i + 2] = (b * a + this.px[i + 2]! * da * (1 - a)) / out;
    this.px[i + 3] = out;
  }

  /** Read a pixel back — used by the quiet state's CSS-filter pass. */
  get(x: number, y: number): { rgb: RGB; a: number } {
    const i = (y * this.size + x) * 4;
    return { rgb: [this.px[i]!, this.px[i + 1]!, this.px[i + 2]!], a: this.px[i + 3]! };
  }

  set(x: number, y: number, [r, g, b]: RGB, a: number): void {
    const i = (y * this.size + x) * 4;
    this.px[i] = r;
    this.px[i + 1] = g;
    this.px[i + 2] = b;
    this.px[i + 3] = a;
  }

  /** Premultiplied BGRA, which is what nativeImage.createFromBitmap wants. */
  toBitmap(): Buffer {
    const buf = Buffer.alloc(this.size * this.size * 4);
    for (let i = 0; i < this.size * this.size; i++) {
      const a = Math.max(0, Math.min(1, this.px[i * 4 + 3]!));
      const alpha = Math.round(a * 255);
      buf[i * 4] = Math.round((this.px[i * 4 + 2]! * alpha) / 255);
      buf[i * 4 + 1] = Math.round((this.px[i * 4 + 1]! * alpha) / 255);
      buf[i * 4 + 2] = Math.round((this.px[i * 4]! * alpha) / 255);
      buf[i * 4 + 3] = alpha;
    }
    return buf;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleGradient(stops: Stop[], t: number): RGB {
  const u = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    const [p0, c0] = stops[i - 1]!;
    const [p1, c1] = stops[i]!;
    if (u <= p1) {
      const k = p1 === p0 ? 0 : (u - p0) / (p1 - p0);
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
    }
  }
  return stops[stops.length - 1]![1];
}

/** 1px-feathered coverage of a disc — the whole anti-aliasing budget. */
function discCoverage(x: number, y: number, cx: number, cy: number, r: number): number {
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  if (d <= r - 0.5) return 1;
  if (d >= r + 0.5) return 0;
  return r + 0.5 - d;
}

// --- the orb ---------------------------------------------------------------

function drawOrb(c: Canvas, stops: Stop[]): void {
  const s = c.size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.39;
  // CSS `circle at 34% 30%` with the default farthest-corner sizing.
  const fx = s * 0.34;
  const fy = s * 0.3;
  const gr = Math.hypot(s - fx, s - fy);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const a = discCoverage(x, y, cx, cy, r);
      if (a <= 0) continue;
      const t = Math.hypot(x + 0.5 - fx, y + 0.5 - fy) / gr;
      c.blend(x, y, sampleGradient(stops, t), a);
    }
  }
}

/** .arc — a thin ice ring outside the orb, top quadrant only. */
function drawArc(c: Canvas): void {
  const s = c.size;
  const cx = s / 2;
  const cy = s / 2;
  const ring = s * 0.45;
  const half = Math.max(0.6, (s / 16) * 0.75);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const band = half + 0.5 - Math.abs(d - ring);
      if (band <= 0) continue;
      // border-top-color only: the visible 90 degrees centred on straight up.
      const ang = Math.atan2(dy, dx);
      if (ang < (-3 * Math.PI) / 4 || ang > -Math.PI / 4) continue;
      c.blend(x, y, ICE, Math.min(1, band));
    }
  }
}

// A 3x5 pixel font — the only glyphs a 9px badge can carry.
const GLYPHS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "+": ["000", "010", "111", "010", "000"],
};

function drawGlyph(c: Canvas, glyph: string, cx: number, cy: number, scale: number, rgb: RGB): void {
  const rows = GLYPHS[glyph];
  if (!rows) return;
  const w = 3 * scale;
  const h = 5 * scale;
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - h / 2);
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      if (rows[gy]![gx] !== "1") continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) c.blend(x0 + gx * scale + sx, y0 + gy * scale + sy, rgb, 1);
      }
    }
  }
}

/** White count badge, top-right. The digit only appears where it can be read. */
function drawBadge(c: Canvas, count: number): void {
  const s = c.size;
  // The E board's badge is 13px against a 32px orb; this keeps roughly that
  // ratio while staying big enough to still register in a 16px tray slot.
  const r = s * 0.2;
  const cx = s - r - 0.5;
  const cy = r + 0.5;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const a = discCoverage(x, y, cx, cy, r);
      if (a > 0) c.blend(x, y, WHITE, a);
    }
  }
  const scale = Math.floor((r * 2 * 0.707) / 5);
  if (scale >= 1 && count > 0) {
    drawGlyph(c, count > 9 ? "+" : String(count), cx, cy, scale, RED);
  }
}

/** Gold crescent, top-right — the quiet-hours moon notch (Artboard E). */
function drawMoonNotch(c: Canvas): void {
  const s = c.size;
  const r = s * 0.19;
  const cx = s - r - 0.5;
  const cy = r + 0.5;
  // The board carves the crescent with a second circle offset up-left.
  const kx = cx - r * 0.62;
  const ky = cy - r * 0.16;
  const kr = r * 0.92;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const a = discCoverage(x, y, cx, cy, r);
      if (a <= 0) continue;
      const carved = discCoverage(x, y, kx, ky, kr);
      const keep = Math.max(0, a - carved);
      if (keep > 0) c.blend(x, y, GOLD, keep);
    }
  }
}

/** CSS `filter: brightness(.45) saturate(.6)`, in that order. */
function applyDim(c: Canvas, brightness: number, saturation: number): void {
  for (let y = 0; y < c.size; y++) {
    for (let x = 0; x < c.size; x++) {
      const { rgb, a } = c.get(x, y);
      if (a <= 0) continue;
      const b: RGB = [rgb[0] * brightness, rgb[1] * brightness, rgb[2] * brightness];
      const lum = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];
      c.set(
        x,
        y,
        [
          Math.max(0, Math.min(255, lum + saturation * (b[0] - lum))),
          Math.max(0, Math.min(255, lum + saturation * (b[1] - lum))),
          Math.max(0, Math.min(255, lum + saturation * (b[2] - lum))),
        ],
        a,
      );
    }
  }
}

/** The whole icon for one state at one pixel size, as premultiplied BGRA. */
export function trayBitmap(state: TrayState, size: number, count = 0): Buffer {
  const c = new Canvas(size);
  if (state === "alert") {
    drawOrb(c, ORB_RED);
    drawBadge(c, count);
  } else if (state === "quiet") {
    drawOrb(c, ORB_TEAL);
    applyDim(c, 0.45, 0.6);
    drawMoonNotch(c);
  } else {
    drawOrb(c, ORB_TEAL);
    if (state === "thinking") drawArc(c);
  }
  return c.toBitmap();
}

/** 16px base with a 32px @2x representation, so HiDPI trays stay crisp. */
export function trayIcon(state: TrayState, count = 0): NativeImage {
  const img = nativeImage.createFromBitmap(trayBitmap(state, 16, count), { width: 16, height: 16 });
  try {
    img.addRepresentation({
      scaleFactor: 2,
      width: 32,
      height: 32,
      buffer: trayBitmap(state, 32, count),
    });
  } catch {
    // A build that refuses the second representation still gets a valid 1x icon.
  }
  return img;
}

// --- the tray itself --------------------------------------------------------

function tooltipFor(state: TrayState, count: number): string {
  if (state === "alert") return `EVE — ${count || 1} need you`;
  if (state === "quiet") return "EVE — quiet hours";
  if (state === "thinking") return "EVE — thinking";
  return "EVE — idle";
}

let tray: Tray | null = null;
let state: TrayState = "idle";
let lastCount = 0;

// ---------------------------------------------------------------------------
// G-A6 — THE PHYSICAL STOP
//
// The spec asks for "tray item + global hotkey -> desk.kill()". The hotkey was
// wired; the tray item did not exist, so half of a guardrail that only matters
// in the one minute someone actually needs it was missing.
//
// The wiring is injected rather than imported because tray.ts must not depend
// on main.ts (main imports tray, and the tray dump harness at the bottom of
// this file runs before main's body). `deskKillWiring` is handed the real
// `deskKill()` and the real `deskKillAccel()` at boot.
//
// THE KEY IT PRINTS IS THE KEY THAT BOUND. The spec names Ctrl+Shift+Esc;
// Windows owns that combination and `globalShortcut.register` returns false for
// it on every install, so main falls back down a list. This menu asks
// `deskKillAccel()` at the moment it is BUILT and prints whatever actually
// bound — or says plainly that nothing did. A stop that advertises a key which
// does nothing is worse than a stop with no key at all.
// ---------------------------------------------------------------------------

export interface DeskKillWiring {
  /** Fires the kill. Returns how many in-flight batches it stopped. */
  kill: (reason: string) => { stopped: number; wasEnabled: boolean };
  /** The accelerator that ACTUALLY bound, or null when none did. */
  accel: () => string | null;
  /** Is filing armed right now? Drives the item's enabled state and label. */
  enabled: () => boolean;
}

let killWiring: DeskKillWiring | null = null;

/** Windows accelerator strings, as a human reads them off a keyboard. */
function humanAccel(accel: string | null): string {
  if (!accel) return "no key is bound";
  return accel.replace(/CommandOrControl|CmdOrCtrl/g, "Ctrl");
}

function buildMenu(): Menu {
  const armed = killWiring ? killWiring.enabled() : false;
  const key = humanAccel(killWiring ? killWiring.accel() : null);
  return Menu.buildFromTemplate([
    {
      label: armed ? `STOP FILING NOW  (${key})` : `Filing is OFF  (stop key: ${key})`,
      enabled: armed && killWiring !== null,
      click: () => {
        killWiring?.kill("tray");
        refreshMenu();
      },
    },
    { type: "separator" },
    { label: "Open the deck", click: () => { hideFlyout(); focusDeck(); } },
    { type: "separator" },
    { label: "Quit EVE", role: "quit" },
  ]);
}

/**
 * The menu as text, for the receipt harness. A grep proves the STRING exists in
 * this file; this proves Electron actually BUILT a menu with an enabled item on
 * it, which is the only version of G-A6 worth having.
 */
export function describeMenu(): string {
  const m = buildMenu();
  return m.items
    .map((i) => (i.type === "separator" ? "  ---" : `  ${i.enabled ? "[on ]" : "[off]"} ${i.label}`))
    .join("\n");
}

/** Rebuild the context menu — the label and the enabled state both move. */
export function refreshMenu(): void {
  if (!tray) return;
  try {
    tray.setContextMenu(buildMenu());
  } catch {
    /* a torn-down tray during quit; nothing to keep in sync */
  }
}

/**
 * Called once at boot with the real kill switch. Until this runs the tray item
 * renders disabled and says so, rather than rendering a button that does
 * nothing when pressed.
 */
export function wireDeskKill(w: DeskKillWiring): void {
  killWiring = w;
  refreshMenu();
}

export function createTray(): Tray | null {
  if (tray) return tray;
  try {
    tray = new Tray(trayIcon("idle"));
    tray.setToolTip(tooltipFor("idle", 0));
    // Click toggles the 4-second surface; the deck now lives behind the
    // flyout's OPEN DECK button. Double-click is the shortcut straight to it.
    tray.on("click", () => toggleFlyout(trayBounds() ?? undefined));
    tray.on("double-click", () => {
      hideFlyout();
      focusDeck();
    });
    // G-A6 — right-click is the stop. Present from the first frame, whether or
    // not the kill has been wired yet.
    tray.setContextMenu(buildMenu());
    return tray;
  } catch (err) {
    // A tray is a nicety, not a requirement — a headless/locked-down session
    // must still boot the deck.
    console.error("[tray] could not create:", err instanceof Error ? err.message : String(err));
    tray = null;
    return null;
  }
}

/** The icon's screen rectangle, for anchoring the flyout. Null when unknown. */
export function trayBounds(): Rectangle | null {
  try {
    return tray ? tray.getBounds() : null;
  } catch {
    return null;
  }
}

export function setTrayState(next: TrayState, opts: TrayOptions = {}): void {
  const count = opts.count ?? (next === "alert" ? lastCount : 0);
  if (next === state && count === lastCount) return;
  state = next;
  lastCount = count;
  if (!tray) return;
  tray.setToolTip(tooltipFor(next, count));
  try {
    tray.setImage(trayIcon(next, count));
  } catch {
    /* setImage can fail on a torn-down tray during quit; the tooltip already went out */
  }
}

export function trayState(): TrayState {
  return state;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

// ---------------------------------------------------------------------------
// RECEIPT HARNESS — `EVE_TRAY_DUMP=<dir> electron .` writes the four icons at
// both sizes as PNGs plus a manifest, then exits before any window is created.
// Same shape as the EVE_SMOKE / EVE_SHOTS / EVE_SHOT_URL blocks in main.ts:
// env-gated, inert otherwise. This module is imported by main.ts, so its body
// runs before main.ts's own.
// ---------------------------------------------------------------------------

/** Writes tray-{state}-{size}.png + tray-manifest.txt into `dir`. */
export function dumpTrayIcons(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const states: TrayState[] = ["idle", "thinking", "alert", "quiet"];
  const manifest: string[] = [];
  for (const s of states) {
    // 16 + 32 are the shipped representations; 128 exists only so a human can
    // actually see what the 16px bitmap is a downscale of.
    for (const size of [16, 32, 128]) {
      const count = s === "alert" ? 2 : 0;
      const png = nativeImage
        .createFromBitmap(trayBitmap(s, size, count), { width: size, height: size })
        .toPNG();
      const file = `tray-${s}-${size}.png`;
      writeFileSync(path.join(dir, file), png);
      manifest.push(`${file}  ${size}x${size}  ${png.length} bytes${count ? `  count=${count}` : ""}`);
    }
  }
  const text = `${manifest.join("\n")}\n`;
  writeFileSync(path.join(dir, "tray-manifest.txt"), text, "utf8");
  return text;
}

if (process.env.EVE_TRAY_DUMP) {
  try {
    process.stdout.write(dumpTrayIcons(process.env.EVE_TRAY_DUMP));
  } catch (err) {
    process.stdout.write(`TRAY DUMP FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  }
  app.exit(0);
}
