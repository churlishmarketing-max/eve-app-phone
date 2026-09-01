// owner: stream S4 (her voice)
//
// EVERY WAY HER VOICE CAN FAIL, EACH SAYING SOMETHING DIFFERENT.
//
// A shot scenario, not product UI — reachable only at
// "index.html?shot=voice-failure-modes", registered in s4-scenarios.tsx, and
// in the same family as "voice-receipt": a receipt for the pipeline instead of
// a claim about it.
//
// WHAT IT IS PROVING. Before 2026-09-01 postSpeak returned `ArrayBuffer|null`,
// so a refused token, an unwired ElevenLabs key, a ten-second timeout, a dead
// socket and an empty 200 arrived at the renderer as the SAME value, and the
// only sentence the UI could write was "NO AUDIO". King spent a day unable to
// tell which of those he had. The fix was a discriminated result — and a fix
// like that is worth exactly as much as its proof, because the failure it
// prevents is invisible by definition. So this page MAKES each failure happen,
// down the real path (renderer -> preload -> IPC -> main -> postSpeak), and
// prints the sentence each one produces. Two rows reading the same words would
// be the regression.
//
// It drives the SHIPPED functions. Nothing here reimplements a code path, and
// nothing here decides what a failure "should" say.
//
// The harness (verify/voice-failure-modes.mjs) points EVE_BRAIN_URL at a local
// server that answers 401, then an empty 200, then a hang — in that order, one
// case per request. The device case needs no server: it seeds a device id that
// is not on this machine and asks the real router where the audio would go.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  OUTPUT_DEVICE_KEY,
  OUTPUT_DEVICE_LABEL_KEY,
  probeOutputRoute,
  savedOutputId,
} from "./audioOut";
import { speak } from "./playback";

interface Row {
  /** What was made to go wrong. */
  given: string;
  /** The machine-readable discriminator that came back. */
  tag: string;
  /** The sentence a human is shown. This is the column that must never repeat. */
  said: string;
  /** What to do about it, when the code knows. */
  remedy: string | null;
}

const MONO = {
  fontFamily: "var(--mono)",
  fontSize: 10,
  letterSpacing: ".06em",
  lineHeight: 1.6,
} as const;

/** A device id that is not on any machine. */
const GHOST_DEVICE = "0000000000000000000000000000000000000000000000000000000000000000";

export default function VoiceFailureModes(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const started = useRef(false);

  useLayoutEffect(() => {
    // Claim the flag so the capture waits for the last case instead of
    // photographing an empty table — the timeout case alone takes ten seconds.
    window.__RENDER_DONE = false;
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const out: Row[] = [];
      // Logged the instant it lands, not batched at the end: a receipt that
      // only prints once every case is done prints nothing at all when the
      // harness's ceiling arrives first.
      const push = (r: Row): void => {
        out.push(r);
        setRows([...out]);
        console.log(`FAILMODE| ${r.given} | ${r.tag} | ${r.said}`);
      };

      // ---- the three brain-side failures, through the whole real stack ------
      //
      // IN PARALLEL, and that is not an optimisation. The timeout case cannot
      // finish in under ten seconds — that IS the case — and the shot harness
      // gives a scenario fifteen seconds to declare itself rendered. Run
      // sequentially, the last two cases fall off the end of the capture and
      // the receipt silently proves three things instead of four.
      //
      // The harness server keys off the probe text rather than the call order,
      // precisely so these may overlap without the mapping from cause to
      // sentence becoming a guess.
      const cases: { probe: string; given: string }[] = [
        { probe: "probe one — the brain refuses this desktop's token", given: "HTTP 401 from the brain" },
        { probe: "probe two — the brain answers 200 with no bytes", given: "HTTP 200 with a zero-byte body" },
        { probe: "probe three — the brain never answers at all", given: "no reply within the 10s ceiling" },
      ];
      const spoken = await Promise.all(
        cases.map(async (c) => {
          const r = await speak(c.probe);
          return {
            given: c.given,
            tag: `${r.reason ?? "none"}${r.detail ? ` · ${r.detail}` : ""}`,
            said: r.message,
            remedy: r.remedy,
          };
        }),
      );
      // Fixed order in the table regardless of which finished first.
      for (const r of spoken) push(r);

      // ---- the device failure, which never reaches the brain ---------------
      // Seed a pick that cannot resolve, then ask the SHIPPED router where the
      // audio would actually go. Live, this was "NotFoundError: Requested
      // device not found" thrown into a swallowing catch, with nothing shown.
      const priorId = savedOutputId();
      const priorLabel = (() => {
        try {
          return localStorage.getItem(OUTPUT_DEVICE_LABEL_KEY);
        } catch {
          return null;
        }
      })();
      try {
        localStorage.setItem(OUTPUT_DEVICE_KEY, GHOST_DEVICE);
        localStorage.setItem(OUTPUT_DEVICE_LABEL_KEY, "SPEAKERS (HIDOCK H1E)");
      } catch {
        /* storage blocked — the probe below will simply report the default */
      }
      const route = await probeOutputRoute();
      push({
        given: "the saved output device is gone",
        tag: `fellBack=${route.fellBack} · applied=${route.appliedId}`,
        said: route.fallbackReason ?? `No fallback — audio is routed to ${route.appliedLabel}.`,
        remedy: route.fellBack ? "Pick a different OUTPUT DEVICE in Settings, or reconnect that one." : null,
      });
      // Put his real pick back. A diagnostic that edits the setting it is
      // diagnosing is a diagnostic that causes the next bug.
      try {
        if (priorId) localStorage.setItem(OUTPUT_DEVICE_KEY, priorId);
        else localStorage.removeItem(OUTPUT_DEVICE_KEY);
        if (priorLabel) localStorage.setItem(OUTPUT_DEVICE_LABEL_KEY, priorLabel);
        else localStorage.removeItem(OUTPUT_DEVICE_LABEL_KEY);
      } catch {
        /* nothing was stored, so nothing to restore */
      }

      const distinct = new Set(out.map((r) => r.said.trim().toLowerCase())).size;
      console.log(`FAILMODE| DISTINCT ${distinct} OF ${out.length}`);
      window.__RENDER_DONE = true;
    })();
  }, []);

  return (
    <div
      style={{
        width: 1180,
        padding: "16px 18px",
        background: "var(--panel)",
        border: "1px solid var(--hair2)",
        borderRadius: 12,
        color: "var(--cream)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ ...MONO, color: "var(--tealHi)" }}>
        HER VOICE — EVERY FAILURE, AND THE SENTENCE IT PRODUCES
      </div>
      <div style={{ ...MONO, fontSize: 9, color: "var(--dim)" }}>
        EACH ROW IS A REAL CALL DOWN THE REAL PATH. ALL FOUR USED TO READ &ldquo;NO AUDIO&rdquo;.
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            padding: "8px 10px",
            border: "1px solid rgba(var(--rgbGold),.35)",
            background: "rgba(var(--rgbGold),.05)",
            borderRadius: 8,
          }}
        >
          <span style={{ ...MONO, fontSize: 9, color: "var(--gold)" }}>
            GIVEN: {r.given.toUpperCase()}
          </span>
          <span style={{ ...MONO, fontSize: 9, color: "var(--dim)" }}>TAG: {r.tag.toUpperCase()}</span>
          <span style={{ ...MONO, color: "var(--cream)" }}>{r.said.toUpperCase()}</span>
          {r.remedy ? (
            <span style={{ ...MONO, fontSize: 9, color: "var(--ice)" }}>{r.remedy.toUpperCase()}</span>
          ) : null}
        </div>
      ))}
      {rows.length < 4 ? (
        <span style={{ ...MONO, fontSize: 9, color: "var(--dim)" }}>
          RUNNING CASE {rows.length + 1} OF 4 — THE TIMEOUT CASE TAKES TEN SECONDS BY DEFINITION…
        </span>
      ) : null}
    </div>
  );
}
