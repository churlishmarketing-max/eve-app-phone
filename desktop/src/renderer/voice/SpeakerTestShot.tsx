// owner: stream S4 (her voice)
//
// THE SPEAKER TEST, RUN AS A SHOT — reachable only at
// "summon.html?shot=speaker-test". A receipt for runSpeakerTest() itself: the
// same function the [ SPEAKER TEST ] button in Settings → VOICE calls, driven
// down the same path (bridge -> IPC -> postSpeak -> bytes -> setSinkId ->
// <audio>), and every line it produces printed to the console as
// "SPEAKERTEST| ..." so a launcher with --enable-logging can read it back.
//
// Under EVE_MOCK=1 the brain leg returns the fixture MP3 (silent, real
// bytes), so the receipt proves the reporting — bytes received, device used,
// play outcome, duration — without a network. Against a live brain it costs
// one ElevenLabs call, exactly as the button does.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { runSpeakerTest, type SpeakerTestResult } from "./speakerTest";

const MONO = {
  fontFamily: "var(--mono)",
  fontSize: 10,
  letterSpacing: ".06em",
  lineHeight: 1.6,
} as const;

export default function SpeakerTestShot(): JSX.Element {
  const [result, setResult] = useState<SpeakerTestResult | null>(null);
  const started = useRef(false);

  useLayoutEffect(() => {
    // Hold the shutter until the test has finished — it plays a real sample.
    window.__RENDER_DONE = false;
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runSpeakerTest().then((r) => {
      for (const l of r.lines) console.log(`SPEAKERTEST| ${l}`);
      console.log(`SPEAKERTEST| played=${r.played} bytes=${r.receipt?.bytes ?? 0} device=${r.receipt?.sink.appliedLabel ?? "(none)"} reached=${r.receipt?.reachedSec.toFixed(2) ?? "0"} source=${r.sample.source}`);
      setResult(r);
      requestAnimationFrame(() => {
        window.__RENDER_DONE = true;
      });
    });
  }, []);

  return (
    <div
      style={{
        padding: 18,
        background: "var(--panel)",
        color: "var(--cream)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: "100%",
      }}
    >
      <span style={{ ...MONO, color: result ? (result.played ? "var(--tealHi)" : "var(--gold)") : "var(--dim)" }}>
        SPEAKER TEST — {result ? (result.played ? "SOUND CAME OUT" : "NO SOUND") : "RUNNING…"}
      </span>
      {(result?.lines ?? []).map((l, i) => (
        <span key={i} style={{ ...MONO, fontSize: 8.5, color: "rgba(var(--rgbCream),.78)" }}>
          {l}
        </span>
      ))}
    </div>
  );
}
