// owner: stream S4
//
// VOICE RECEIPT — a shot scenario that DRIVES a full mock voice turn and prints
// what actually happened, so the pipeline has a visual receipt instead of a
// claim. Not part of the product UI: it is only reachable at
// "summon.html?shot=voice-receipt" and is registered in s4-scenarios.tsx.
//
// The recorded-blob half cannot run headless — there is no microphone in a
// hidden Electron window — so the harness feeds a SYNTHETIC blob into
// useVoiceTurn.submitBlob(), which is the exact function the real recorder's
// output is handed to. Everything downstream of the mic is the real code path:
// window.eve.voice.transcribe -> user-turn event -> chat.start -> frames ->
// done -> the TTS gate -> window.eve.voice.speak -> Audio.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mockState } from "@shared/fixtures";
import { voiceEvents } from "./events";
import * as playback from "./playback";
import { micAvailable, pickMimeType } from "./recorder";
import { conversationId, CONVERSATION_KEY, ttsConnected, useVoiceTurn } from "./useVoiceTurn";

const WRAP = {
  width: 680,
  background: "#0C1417",
  border: "1px solid rgba(28,185,200,.45)",
  borderRadius: 12,
  padding: "14px 16px",
  fontFamily: "var(--mono), Consolas, monospace",
  fontSize: 10.5,
  lineHeight: 1.55,
  color: "#E8E2D6",
} as const;

export default function VoiceReceipt(): JSX.Element {
  const [log, setLog] = useState<string[]>([]);
  const turn = useVoiceTurn({ surface: "summon", hotkey: false });
  const t0 = useRef(Date.now());
  const started = useRef(false);
  const lines = useRef<string[]>([]);

  useLayoutEffect(() => {
    window.__RENDER_DONE = false;
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const push = (s: string): void => {
      lines.current = [...lines.current, `+${String(Date.now() - t0.current).padStart(5)}ms  ${s}`];
      setLog(lines.current);
    };

    // Is a blocked media load CSP, or Blink's own file:// URL safety check?
    // The listener answers it instead of us guessing.
    const onCsp = (e: SecurityPolicyViolationEvent): void =>
      push(`CSP          blocked ${e.violatedDirective} <- ${e.blockedURI.slice(0, 40)}`);
    window.addEventListener("securitypolicyviolation", onCsp);

    const unVoice = voiceEvents.on((e) => push(`voiceEvents  ${JSON.stringify(e)}`));
    const unFrame = window.eve.onChatFrame((e) =>
      push(`chatFrame    ${e.chatId.slice(0, 8)} ${JSON.stringify(e.frame)}`),
    );

    void (async () => {
      try {
        // 0. environment
        const ping = await window.eve.ping();
        push(`env          mock=${ping.mock} smoke=${ping.smoke} v${ping.version}`);
        push(`recorder     micAvailable=${await micAvailable()} mimeLadder->"${pickMimeType()}"`);
        try {
          localStorage.removeItem(CONVERSATION_KEY);
        } catch {
          /* nothing stored */
        }
        push(`conversation before=${String(conversationId())}`);

        // 1. the synthetic blob standing in for the recorder's output
        const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00])], {
          type: "audio/webm",
        });
        push(`blob         ${blob.size} bytes type=${blob.type}  (SYNTHETIC — no mic headless)`);

        // 2. transcribe, called directly first so the receipt shows the answer
        const t = await window.eve.voice.transcribe(await blob.arrayBuffer(), blob.type);
        push(`transcribe   ${JSON.stringify(t)}`);

        // 3. the real turn: submitBlob is what the recorder feeds
        await turn.submitBlob(blob);
        push(`chat.start   fired (see chatFrame lines)`);

        // 4. wait for the turn to land back on idle
        const deadline = Date.now() + 9000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 100));
          if (lines.current.some((l) => l.includes('"type":"done"'))) break;
        }
        await new Promise((r) => setTimeout(r, 900)); // let the TTS gate resolve
        push(`conversation after=${String(conversationId())}`);

        // 5. explicit proof the mock MP3 crosses the bridge, and what Audio did
        // speak() now answers with a SpeakAudio, so a failure names itself right
        // here instead of arriving as an untyped null (contract.ts SpeakAudio).
        const said = await window.eve.voice.speak("receipt probe");
        push(
          `voice.speak  ok=${said.ok} bytes=${said.audio ? said.audio.byteLength : 0}` +
            `${said.failure ? ` failure=${said.failure}` : ""}${said.error ? ` "${said.error}"` : ""}`,
        );
        const played = await playback.speak("receipt probe");
        push(`Audio.play   played=${played.played} reason=${played.reason ?? "none"} "${played.message}"`);
        if (played.receipt) {
          const r = played.receipt;
          push(
            `Audio.recpt  reached=${r.reachedSec.toFixed(2)}s of ${r.durationSec?.toFixed(2) ?? "?"}s ` +
              `ended=${r.endedFired} sink=${r.sink.appliedLabel} events=${r.events.join(",")}`,
          );
        }

        // 6. the TTS gate's other two inputs, exercised for real
        push(`ttsConnected mock=${ttsConnected(mockState().connectors)} empty=${ttsConnected([])}`);
        const before = await window.eve.config.get();
        push(`config       silentAtDesk=${before.silentAtDesk} (restoring after)`);
        try {
          await window.eve.config.set({ silentAtDesk: true });
          push(`config       silentAtDesk -> true; running a SECOND voice turn`);
          await turn.submitBlob(blob);
          const d2 = Date.now() + 6000;
          const seen = lines.current.length;
          while (Date.now() < d2) {
            await new Promise((r) => setTimeout(r, 100));
            if (lines.current.slice(seen).some((l) => l.includes("SPEECH HELD"))) break;
          }
          await new Promise((r) => setTimeout(r, 400));
          const spoke = lines.current.slice(seen).some((l) => l.includes('"mode":"speaking"'));
          push(`GATE         silent turn spoke=${spoke} (must be false)`);
        } finally {
          await window.eve.config.set({ silentAtDesk: before.silentAtDesk });
          const after = await window.eve.config.get();
          push(`config       restored silentAtDesk=${after.silentAtDesk}`);
        }
      } catch (err) {
        push(`THREW        ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        window.removeEventListener("securitypolicyviolation", onCsp);
        unVoice();
        unFrame();
        // Do not leave a MOCK conversationId behind for the real brain to
        // receive on King's next launch.
        try {
          localStorage.removeItem(CONVERSATION_KEY);
          push(`cleanup      conversationId cleared -> ${String(conversationId())}`);
        } catch {
          /* nothing stored */
        }
        push("— end of receipt —");
        requestAnimationFrame(() => {
          window.__RENDER_DONE = true;
        });
      }
    })();
    // The turn object is recreated each render; the effect must run once only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={WRAP}>
      <div style={{ color: "#1CB9C8", letterSpacing: ".2em", marginBottom: 8 }}>
        S4 · VOICE PIPELINE RECEIPT (EVE_MOCK=1)
      </div>
      {log.map((l, i) => (
        <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {l}
        </div>
      ))}
      <div style={{ marginTop: 8, color: "rgba(240,237,232,.45)" }}>
        phase={turn.phase} transcript={turn.transcript ? `"${turn.transcript}"` : "—"} reply=
        {turn.reply ? `"${turn.reply}"` : "—"}
      </div>
    </div>
  );
}
