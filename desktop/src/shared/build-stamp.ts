// owner: stream S4 (her voice) — the build handshake.
//
// ONE VALUE, BAKED INTO BOTH HALVES AT BUILD TIME.
//
// THE FAULT THIS EXISTS TO MAKE IMPOSSIBLE. On 2026-09-01 her voice made no
// sound. The shipped code was correct — proved by running it. What was wrong
// is that the MAIN process had been started at 13:42 on 2026-08-31 while the
// renderer bundle it was serving had been rebuilt repeatedly through 11:14 the
// next morning: a twenty-two hour skew. A main process reads its script ONCE,
// at launch. A BrowserWindow reads preload and HTML from disk when the WINDOW
// is created — and on Windows, clicking the app icon while EVE is already
// running does not start a new process, it asks the OLD one for a NEW window
// (the single-instance lock). So today's renderer spent the day calling IPC
// channels on yesterday's main. `eve:voice:speak` had no handler, the invoke
// rejected, and a `catch {}` turned the only sentence that named the fault
// into the word "NO AUDIO".
//
// WHY THIS FILE IS NOT A MTIME READ. main.ts already stats out/ at boot and
// compares it to its own start time, which catches "he rebuilt while it was
// running". That signal is real but it is NOT sufficient, and the way it fails
// is the way that matters: if the old main is LAUNCHED AFTER the new renderer
// was built — quit at noon, rebuild at one, relaunch yesterday's out/main at
// two — every artifact on disk is OLDER than the process, `stale` is false,
// and both halves read the same files off the same disk and cheerfully AGREE
// while running completely different code. Anything read at runtime by both
// sides agrees when skewed. That is exactly the case this stamp closes.
//
// So: `__EVE_BUILD_STAMP__` is a string replaced TEXTUALLY by Vite's `define`
// at build time (electron.vite.config.ts). It is computed once per
// `electron-vite build` invocation and inlined as a literal into out/main,
// out/preload AND out/renderer. There is no file to read and nothing to agree
// about at runtime — each half is CARRYING its identity, not looking it up.
// Two halves from one build hold the same literal. Two halves from different
// builds cannot, by construction.
//
// The renderer sends nothing; it asks main for main's stamp over `eve:ping`
// and compares it to its own. A mismatch is not a heuristic, a threshold, or a
// clock comparison — it is two different strings.

/**
 * Injected by Vite `define`. Declared, never imported: after the build there
 * is no identifier left, only the literal it was replaced with.
 */
declare const __EVE_BUILD_STAMP__: string;

/**
 * What this half of the app was built as: `<iso>#<6 hex>`.
 *
 * The random tail is load-bearing. Two builds inside the same second would
 * otherwise carry the same ISO string and a genuine skew would read as a
 * match — and a skew detector that can say "same" about two different builds
 * is worse than none, because it is trusted.
 *
 * `typeof` rather than a bare reference: an unstamped bundle (a hand-run tsc,
 * a define that did not apply) must degrade to a named, visible "unstamped"
 * rather than a ReferenceError at module load, and `typeof` on an undeclared
 * identifier is the one safe read in JavaScript. Vite rewrites the whole
 * `typeof` expression when the define IS in force, so this costs nothing.
 */
export const BUILD_STAMP: string =
  typeof __EVE_BUILD_STAMP__ === "string" && __EVE_BUILD_STAMP__ ? __EVE_BUILD_STAMP__ : "unstamped";

/** True when this half could not be stamped — an unbuilt or hand-made bundle. */
export const IS_UNSTAMPED = BUILD_STAMP === "unstamped";

/**
 * The build time carried inside a stamp, or null when it carries none.
 * Used only to write a sentence a human can act on; the COMPARISON is always
 * string equality on the whole stamp, never on this.
 */
export function stampTime(stamp: string | null | undefined): Date | null {
  if (!stamp) return null;
  const iso = stamp.split("#")[0];
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `14:23 on 2026-09-01`, or an honest shrug. Never invents a time. */
export function stampLabel(stamp: string | null | undefined): string {
  const d = stampTime(stamp);
  if (!d) return stamp ? `an unstamped build (${stamp})` : "an unknown build";
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} on ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
