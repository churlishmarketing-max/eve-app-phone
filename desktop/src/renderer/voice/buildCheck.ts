// owner: stream S4 (her voice)
//
// IS THE PROCESS BEHIND THIS WINDOW THE SAME BUILD AS THIS WINDOW?
//
// THE FAULT THIS EXISTS TO NAME. On 2026-09-01 her voice made no sound. The
// shipped code was fine — proved by running it. What was wrong was that the
// main process had been started at 13:42 the previous day while the renderer
// bundle it was serving had been written at 23:39, ten hours later. A main
// process reads its script once, at launch; a BrowserWindow reads the preload
// and the HTML from disk when the window is created. So a rebuild without a
// restart produces a window whose code is from the future relative to the
// process answering its calls. The voice picker he was clicking did not exist
// when that process booted, so `eve:voice:speak` had no handler and
// ipcRenderer.invoke rejected — and playback.ts turned that rejection into the
// word "NO AUDIO", which named nothing.
//
// Nothing in the UI could see this. That is the real defect: not the skew, but
// that a whole class of failure had no way to announce itself. This module is
// the announcement.
//
// THREE SIGNALS, in falling order of authority:
//
//  0. THE BAKED STAMP — the one that actually closes this failure class.
//     `electron-vite build` computes ONE string per invocation and inlines it
//     as a literal into out/main, out/preload and out/renderer alike
//     (src/shared/build-stamp.ts). Each half CARRIES its identity instead of
//     looking one up, so two halves from one build hold the same string and
//     two halves from different builds cannot. Signals 1 and 2 below are both
//     inferences; this one is two strings being different.
//
//     It is what the mtime signal cannot be. If the old main is LAUNCHED AFTER
//     the new renderer was built — quit, rebuild, then start yesterday's
//     out/main — every artifact on disk is older than the process, `stale` is
//     false, and both halves read the same disk and agree while running
//     different code. Anything read at runtime by both sides agrees when
//     skewed.
//
// AND THE TWO INFERENCES IT SUPERSEDES, kept because they still catch the
// pre-stamp process that cannot answer signal 0 at all:
//
//  1. THE HANDSHAKE GAP. main's ping() now reports `startedAt` and `builtAt`.
//     A main process older than this change does not send those fields at all.
//     Their ABSENCE, in a window whose bundle expects them, is itself proof
//     that the process predates the window. That catches the live incident on
//     the very first run after the fix ships — before any restart.
//
//  2. THE MTIME COMPARISON, which is permanent. main stats its own bundles at
//     boot and compares them to its own start time. Any artifact newer than
//     the process means someone rebuilt while it was running. That catches
//     every future recurrence, including ones where the IPC surface did not
//     change and everything would otherwise look fine.
//
// Neither signal guesses. Both are load-bearing facts read off the process.

import { BUILD_STAMP, IS_UNSTAMPED, stampLabel } from "@shared/build-stamp";

export type BuildVerdict =
  /** One build on both sides of the bridge. */
  | "ok"
  /** THE DEFINITIVE ONE. Two baked stamps, two different strings. */
  | "stamp-mismatch"
  /** main stat'd its own artifacts and found one newer than itself. */
  | "stale-main"
  /** main is too old to answer the handshake at all — proof by absence. */
  | "predates-handshake"
  /** No bridge, or a rejection we will not pretend to have understood. */
  | "unknown";

export interface BuildCheck {
  verdict: BuildVerdict;
  /** True when this window and the process serving it are different builds. */
  skewed: boolean;
  /** One sentence naming the fault, or null when there is nothing to say. */
  message: string | null;
  /** What to actually do about it. Null when there is nothing to do. */
  remedy: string | null;
  version: string | null;
  startedAt: string | null;
  builtAt: string | null;
  /** The stamp compiled into the process behind this window. */
  mainStamp: string | null;
  /** The stamp compiled into THIS bundle. Always known. */
  rendererStamp: string;
}

const OK: BuildCheck = {
  verdict: "ok",
  skewed: false,
  message: null,
  remedy: null,
  version: null,
  startedAt: null,
  builtAt: null,
  mainStamp: null,
  rendererStamp: BUILD_STAMP,
};

const RESTART =
  "Quit EVE completely (right-click the tray icon, Quit) and start it again. Reloading the window is not enough — the background process is the stale half.";

/**
 * Ask the process behind this window what build it is. Never throws; a bridge
 * that is not there at all is reported as "unknown", not as fine.
 */
export async function checkBuild(): Promise<BuildCheck> {
  const ping = window.eve?.ping;
  if (typeof ping !== "function") {
    return {
      ...OK,
      verdict: "unknown",
      skewed: false,
      message: "This window has no bridge to EVE's background process, so its build could not be checked.",
    };
  }

  let r: Awaited<ReturnType<typeof ping>>;
  try {
    r = await ping.call(window.eve);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // "No handler registered for 'eve:ping'" is the unmistakable signature of
    // a main process that predates this window's IPC surface.
    return {
      ...OK,
      verdict: /no handler registered/i.test(detail) ? "stale-main" : "unknown",
      skewed: /no handler registered/i.test(detail),
      message: `EVE's background process did not answer a ping: ${detail}`,
      remedy: /no handler registered/i.test(detail) ? RESTART : null,
    };
  }

  const version = typeof r.version === "string" ? r.version : null;
  const startedAt = typeof r.startedAt === "string" ? r.startedAt : null;
  const builtAt = typeof r.builtAt === "string" ? r.builtAt : null;
  const mainStamp = typeof r.buildStamp === "string" && r.buildStamp ? r.buildStamp : null;
  const base = { version, startedAt, builtAt, mainStamp, rendererStamp: BUILD_STAMP };

  // SIGNAL 0 — the baked stamps. Two strings. No clocks, no thresholds, no
  // files. This runs FIRST because it is the only one of the three that is a
  // fact rather than an inference, and it is the only one that survives the
  // launch order (old main started after the new renderer was built) that
  // makes every runtime-read approach agree while skewed.
  if (mainStamp !== null && !IS_UNSTAMPED && mainStamp !== BUILD_STAMP) {
    return {
      ...base,
      verdict: "stamp-mismatch",
      skewed: true,
      message:
        `EVE is running two different builds at once. This window was built at ${stampLabel(BUILD_STAMP)} ` +
        `(${BUILD_STAMP}) but the background process serving it was built at ${stampLabel(mainStamp)} ` +
        `(${mainStamp}). Every feature added between those two builds has no handler on the other side of ` +
        `the bridge — that is how her voice went silent on 2026-09-01, with nothing on screen to say so.`,
      remedy: RESTART,
    };
  }

  // Signal 1 — the field this bundle knows about is simply not there.
  if (startedAt === null) {
    return {
      ...base,
      verdict: "predates-handshake",
      skewed: true,
      startedAt: null,
      builtAt: null,
      message:
        "EVE's background process is running an OLDER build than this window. It answered a ping but could not " +
        "say which build it is — that field did not exist yet when it was compiled — so it predates this " +
        `window (built ${stampLabel(BUILD_STAMP)}). The newest features, her voice among them, have no handler ` +
        "on the other side of the bridge and fail with nothing to say.",
      remedy: RESTART,
    };
  }

  // Signal 2 — main compared its own artifacts to its own start time.
  if (r.stale === true) {
    const when = builtAt ? new Date(builtAt) : null;
    const boot = new Date(startedAt);
    return {
      ...base,
      verdict: "stale-main",
      skewed: true,
      message: `EVE was rebuilt at ${fmt(when)} but the background process serving this window started at ${fmt(boot)} and is still running the older code. This window and that process are different builds.`,
      remedy: RESTART,
    };
  }

  // An unstamped half is not a skew — it is a bundle nobody built with
  // electron-vite. Say it plainly rather than either crying wolf or going
  // quiet, because a handshake that cannot run is not a handshake that passed.
  if (IS_UNSTAMPED || mainStamp === null) {
    return {
      ...base,
      verdict: "unknown",
      skewed: false,
      message:
        `The build handshake could not run: ${IS_UNSTAMPED ? "this window" : "the background process"} carries ` +
        "no build stamp, so the two halves cannot be compared. Rebuild with `npm run build` and relaunch.",
      remedy: null,
    };
  }

  return { ...base, verdict: "ok", skewed: false, message: null, remedy: null };
}

function fmt(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return "an unknown time";
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} on ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Read a failed bridge call and say, in one sentence, whether it is the skew.
 * playback.ts hands us the raw rejection so the picker does not have to guess.
 */
export function bridgeFailureExplanation(detail: string): { skew: boolean; message: string; remedy: string | null } {
  if (/no handler registered/i.test(detail)) {
    return {
      skew: true,
      message: `EVE's background process has no handler for this call (${detail}). That means it is running an older build than this window — the app was rebuilt while it was still running.`,
      remedy: RESTART,
    };
  }
  return { skew: false, message: detail, remedy: null };
}
