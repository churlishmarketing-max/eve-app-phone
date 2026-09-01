// owner: stream S4 (her voice) — the boot-time build handshake, on screen.
//
// WHAT THIS IS FOR. On 2026-09-01 King's EVE ran a main process from 13:42 the
// previous day against a renderer bundle rebuilt through 11:14 that morning.
// Her voice made no sound and filing said it had no desk briefing; both were
// the same fault wearing two costumes, and the app had NO WAY TO SAY SO. He
// spent a day guessing at ElevenLabs, at his token, and at his speakers, and
// the answer was "quit the app properly".
//
// This banner is the sentence that was missing. It appears at renderer boot,
// on every window, before he has clicked anything — because the failure it
// names invalidates every other thing the UI is about to tell him. The voice
// card carries the same verdict, but a diagnosis you have to go looking for is
// no diagnosis at all for a fault whose entire signature is "nothing works and
// nothing says why".
//
// THREE PROPERTIES IT MUST HAVE, and why each one is deliberate.
//
//  · IMPOSSIBLE TO MISS. Fixed to the top of the window, spanning it, above
//    everything. Not a toast (toasts expire), not a card inside a pane (panes
//    are opt-in), not a console line (he does not have devtools open).
//
//  · IMPOSSIBLE TO DISMISS INTO SILENCE. No close button, no "don't show
//    again", no timeout. That is not stubbornness: while this is true, every
//    IPC channel added since the old process booted is dead, and a dismissed
//    banner would hand him back the exact silence that cost him the day. The
//    only thing that clears it is the thing that fixes it — a full quit and
//    relaunch, which takes this window with it. It re-checks on focus, so a
//    verdict that stops being true stops being shown.
//
//  · IT NAMES BOTH BUILDS. "Something is wrong" is what he already had. This
//    prints when this window was built, when the process behind it was built,
//    and both raw stamps — so the fault is a fact he can read off the screen
//    and paste at me, not a mood.
//
// COLOUR LAW. Gold, not red. --red / --rgbRed are the RED confirm tier and the
// live mic and nothing else, in all four worlds (eve-desktop.css:20-23). Gold
// is this system's hot-state channel and a build skew is a hot state, not a
// confirm. Every value below is a token; there is not one colour literal in
// this file, because this codebase has shipped two CRITICAL contrast bugs from
// exactly that and both of them ate the sentence explaining the headline.

import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BUILD_STAMP } from "@shared/build-stamp";
import { checkBuild, type BuildCheck } from "./buildCheck";

const MONO = {
  fontFamily: "var(--mono)",
  letterSpacing: ".14em",
} as const;

export function BuildSkewBanner({ initial = null }: { initial?: BuildCheck | null }): JSX.Element | null {
  const [build, setBuild] = useState<BuildCheck | null>(initial);
  const [copied, setCopied] = useState(false);

  const run = useCallback(() => {
    void checkBuild().then(setBuild);
  }, []);

  useEffect(() => {
    if (!initial) run();
    // A verdict that stops being true must stop being shown. Focus is the only
    // moment anything could have changed from this window's point of view.
    window.addEventListener("focus", run);
    return () => window.removeEventListener("focus", run);
  }, [initial, run]);

  if (!build?.skewed || !build.message) return null;

  const detail = [
    `verdict: ${build.verdict}`,
    `this window: ${build.rendererStamp}`,
    `background process: ${build.mainStamp ?? "(carries no build stamp — it predates the handshake)"}`,
    build.startedAt ? `process started: ${build.startedAt}` : null,
    build.builtAt ? `artifacts on disk: ${build.builtAt}` : null,
    build.version ? `process version: ${build.version}` : null,
    build.message,
  ]
    .filter(Boolean)
    .join("\n");

  const copy = (): void => {
    try {
      void navigator.clipboard?.writeText(detail).then(
        () => setCopied(true),
        () => setCopied(false),
      );
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "11px 14px",
        background: "var(--panel)",
        borderBottom: "2px solid var(--gold)",
        boxShadow: "0 6px 24px rgba(var(--rgbVoid),.7)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...MONO, fontSize: 10, color: "var(--gold)" }}>
          EVE IS RUNNING TWO DIFFERENT BUILDS AT ONCE
        </span>
        <span style={{ ...MONO, fontSize: 8.5, color: "var(--dim)" }}>
          QUIT AND RELAUNCH — RELOADING THIS WINDOW WILL NOT FIX IT
        </span>
      </div>

      <span style={{ ...MONO, fontSize: 8.5, color: "rgba(var(--rgbCream),.82)", lineHeight: 1.65 }}>
        {build.message.toUpperCase()}
      </span>

      {/* The two identities, side by side and unabbreviated. This row is the
          whole point of the banner: the fault IS that these two differ. */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <span style={{ ...MONO, fontSize: 8, color: "var(--dim)" }}>
          THIS WINDOW <span style={{ color: "var(--cream)" }}>{build.rendererStamp}</span>
        </span>
        <span style={{ ...MONO, fontSize: 8, color: "var(--dim)" }}>
          BACKGROUND PROCESS{" "}
          <span style={{ color: "var(--cream)" }}>
            {build.mainStamp ?? "NO STAMP — OLDER THAN THE HANDSHAKE"}
          </span>
        </span>
      </div>

      {build.remedy ? (
        <span style={{ ...MONO, fontSize: 8.5, color: "var(--gold)", lineHeight: 1.65 }}>
          {build.remedy.toUpperCase()}
        </span>
      ) : null}

      {/* No close control, by design — see the header. The one button copies
          the facts out; it never takes the banner away. */}
      <button
        type="button"
        onClick={copy}
        style={{
          ...MONO,
          alignSelf: "flex-start",
          fontSize: 8,
          color: "var(--gold)",
          background: "transparent",
          border: "1px solid rgba(var(--rgbGold),.45)",
          borderRadius: 6,
          padding: "4px 8px",
          cursor: "pointer",
        }}
      >
        {copied ? "[ COPIED ]" : "[ COPY THESE DETAILS ]"}
      </button>
    </div>
  );
}

/**
 * Mount the banner into its OWN root, appended to <body>.
 *
 * Deliberately NOT inside the app tree: it must render even when the app tree
 * throws, and it must not be reachable by a parent that could unmount it. The
 * three renderer entries call this once, at boot, before mounting their app.
 *
 * Returns silently in shot mode. `?shot=` renders one isolated scenario for
 * scripts/shots.mjs, and a banner painted over a screenshot would be one
 * diagnostic breaking another.
 */
export function mountBuildBanner(): void {
  let shot = false;
  try {
    shot = new URLSearchParams(window.location.search).has("shot");
  } catch {
    shot = false;
  }

  // Hold the shutter. A capture of a live window (scripts/shot.mjs on
  // summon.html / flyout.html with no ?shot) must not be taken before the
  // verdict is in — a screenshot with no banner on it would otherwise be
  // indistinguishable from a screenshot of a healthy pair. The overlay entries
  // only set the flag when nobody has claimed it; the deck's ShotHost
  // force-sets it and is unaffected. Never touched in ?shot= scenarios.
  const claimed = !shot && window.__RENDER_DONE === undefined;
  if (claimed) window.__RENDER_DONE = false;

  // ONE ping, then both the banner and the log speak from the same verdict.
  void checkBuild()
    .then((b) => {
      // IN THE LOG, unconditionally — shot mode included. He pastes console
      // output at me; the first question is always "is this one build or two?"
      // and it should never cost a second round trip. A PASS prints too — a
      // check that only speaks on failure is indistinguishable from a check
      // that never ran, which is the whole disease this file was written to cure.
      const head = `[eve] build handshake — renderer ${BUILD_STAMP} · main ${b.mainStamp ?? "(no stamp)"}`;
      if (b.skewed) console.error(`${head} · SKEWED (${b.verdict})
${b.message ?? ""}
${b.remedy ?? ""}`);
      else if (b.verdict === "unknown") console.warn(`${head} · NOT CHECKED (${b.message ?? "unknown"})`);
      else console.log(`${head} · OK`);
      // Left on the window for a devtools console: `__EVE_BUILD_CHECK`.
      (window as unknown as { __EVE_BUILD_CHECK?: BuildCheck }).__EVE_BUILD_CHECK = b;

      if (shot) return;
      try {
        if (document.getElementById("eve-build-banner")) return;
        const host = document.createElement("div");
        host.id = "eve-build-banner";
        document.body.appendChild(host);
        createRoot(host).render(<BuildSkewBanner initial={b} />);
      } catch {
        /* the banner failing must never be the reason a window does not paint */
      }
    })
    .finally(() => {
      if (claimed && window.__RENDER_DONE === false) window.__RENDER_DONE = true;
    });
}
