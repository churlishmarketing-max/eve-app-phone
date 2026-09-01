// owner: stream S4
//
// HER VOICE OUT — one Audio element at a time, a finish() that can only ever
// run once, and (since 2026-09-01) A REASON FOR EVERY FAILURE.
//
// Ported from the phone (app/src/EveApp.tsx:450-469). The three ways a browser
// can end an <audio> — `ended`, `error`, and a rejected play() promise — all
// land on the same idempotent finish(), because the phone's bug class here was
// "she never stops speaking" (mode stuck on speaking) or "the blob URL leaks".
//
// stop() is the BARGE-IN primitive: handoff §6 — "hotkey press or mic click
// while she speaks stops audio instantly and flips to LISTENING".
//
// WHAT CHANGED, AND WHY IT HAD TO.
//
// This file used to open with:
//
//     try { buf = await window.eve.voice.speak(body, voiceId); }
//     catch { buf = null; }
//     if (!buf || buf.byteLength === 0) return { played:false, reason:"no-audio" };
//
// That catch was the whole outage. On 2026-09-01 King's main process was ten
// hours older than the renderer bundle it was serving, so `eve:voice:speak` had
// no handler and the invoke rejected with "No handler registered for
// 'eve:voice:speak'" — a sentence that names the fault exactly. We threw it
// away and printed "NO AUDIO", and he spent a day unable to tell a stale
// process from a dead brain from a dead speaker.
//
// Every failure below now carries the real reason, a sentence written for a
// human, and — when the fault is the stale process — the remedy. The mechanics
// of playback itself (element, sink, blob) live in audioOut.ts, so an audition,
// a real turn and the speaker test cannot disagree about the path.

import { playBytes, type PlayHandle, type PlayReceipt } from "./audioOut";
import { bridgeFailureExplanation } from "./buildCheck";
import { voiceEvents } from "./events";
import { lastSpokenLine, rememberSpokenLine, selectedVoiceId } from "./voicePref";

export { OUTPUT_DEVICE_KEY } from "./audioOut";

export type SpeakFailure =
  /** Nothing to say. */
  | "empty"
  /** window.eve.voice.speak is not on the bridge at all. */
  | "bridge-missing"
  /** The invoke rejected. THE STALE-MAIN CASE lands here. */
  | "bridge-error"
  /** The brain answered, but with no usable audio. The message says which way. */
  | "no-bytes"
  /** Bytes arrived and the element refused them. */
  | "decode"
  /** play() was refused by the browser. */
  | "play-blocked"
  /** play() resolved and the clock never moved — routed into the void. */
  | "stalled"
  /** Barge-in. Not a fault. */
  | "stopped";

export interface SpeakResult {
  /** True only if the clock actually advanced. Not "play() resolved". */
  played: boolean;
  reason: SpeakFailure | null;
  /**
   * ONE HONEST SENTENCE, already fit to show a human. Always present.
   * This is the field that replaces the word "NO AUDIO".
   */
  message: string;
  /** The machine detail behind it (HTTP status, DOMException, media events). */
  detail: string | null;
  /** True when the fault is that main is an older build than this window. */
  buildSkew: boolean;
  /** What to do about it, when there is a known answer. */
  remedy: string | null;
  /** True things that did not stop playback but he still deserves to know. */
  notices: string[];
  /** The full playback receipt, when we got as far as an <audio> element. */
  receipt: PlayReceipt | null;
}

function fail(reason: SpeakFailure, message: string, extra?: Partial<SpeakResult>): SpeakResult {
  return {
    played: false,
    reason,
    message,
    detail: null,
    buildSkew: false,
    remedy: null,
    notices: [],
    receipt: null,
    ...extra,
  };
}

let current: PlayHandle | null = null;

export function isSpeaking(): boolean {
  return current !== null;
}

/** BARGE-IN. Ends whatever is playing right now; its promise settles at once. */
export function stop(): void {
  const h = current;
  current = null;
  h?.stop();
}

/**
 * HER TURN. Speaks brain-generated text in the voice she is set to — his saved
 * pick when there is one (voicePref), otherwise the brain's configured voice.
 *
 * Resolves when playback has FINISHED (ended, errored, was barged in on, or was
 * refused) — not when it starts — so the caller can hold its "speaking" phase
 * for the real duration. Emits mode:"speaking" on start, mode:"idle" on finish.
 */
export async function speak(text: string): Promise<SpeakResult> {
  const body = text.trim();
  if (!body) return fail("empty", "There was nothing for her to say.");
  // Kept so the picker can audition candidates on her OWN last sentence instead
  // of a line written for her. Only ever brain-generated text reaches here.
  rememberSpokenLine(body);
  return await play(body, selectedVoiceId() ?? undefined);
}

/**
 * AUDITION. One utterance in a candidate voice, nothing saved, nothing changed
 * on the brain. Callers MUST have proved the brain honours an override first
 * (VoiceList.configuredVoiceId) — an older brain ignores the id and would hand
 * back her current voice while the UI claimed it was the candidate's.
 */
export async function preview(text: string, voiceId: string): Promise<SpeakResult> {
  const body = text.trim();
  if (!body) return fail("empty", "There was nothing to audition.");
  if (!voiceId) return fail("empty", "No voice was named to audition.");
  return await play(body, voiceId);
}

/**
 * THE SPEAKER TEST'S UTTERANCE. The whole real path end to end — bridge,
 * brain, bytes, sink, clock — on her real last line when there is one, else a
 * plain chrome label. Unlike speak() it does NOT remember the line: a chrome
 * label must never become "her last sentence" and get auditioned back later
 * as though she had said it.
 */
export async function speakSample(text: string): Promise<SpeakResult> {
  const body = text.trim();
  if (!body) return fail("empty", "There was nothing to play.");
  return await play(body, selectedVoiceId() ?? undefined);
}

/** The line the picker auditions with — her last real one, when there is one. */
export function auditionLine(): string | null {
  return lastSpokenLine();
}

async function play(body: string, voiceId?: string): Promise<SpeakResult> {
  stop(); // never two of her talking at once

  // ---- leg 1: the bridge ---------------------------------------------------
  const speakFn = window.eve?.voice?.speak;
  if (typeof speakFn !== "function") {
    return fail(
      "bridge-missing",
      "This window has no connection to her voice — window.eve.voice.speak is missing from the bridge, which means the background process and this window are not the same build.",
      { remedy: "Quit EVE from the tray icon and start it again." },
    );
  }

  let answer: Awaited<ReturnType<typeof speakFn>>;
  try {
    answer = await speakFn.call(window.eve.voice, body, voiceId);
  } catch (err) {
    // THE ONE THAT BIT HIM. Do not swallow this; it names the fault outright.
    const detail = err instanceof Error ? err.message : String(err);
    const x = bridgeFailureExplanation(detail);
    return fail("bridge-error", x.message, { detail, buildSkew: x.skew, remedy: x.remedy });
  }

  // ---- leg 2: the brain ----------------------------------------------------
  if (!answer?.ok || !answer.audio || answer.audio.byteLength === 0) {
    const why = answer?.error ?? "her brain returned no audio and gave no reason";
    return fail("no-bytes", `Her brain sent back no audio — ${why}.`, {
      detail: answer?.status ? `HTTP ${answer.status} · ${answer.failure ?? "unknown"}` : (answer?.failure ?? null),
      remedy:
        answer?.failure === "unauthorized"
          ? "Replace this desktop's brain token in Settings → CONNECTION."
          : answer?.failure === "not-wired"
            ? "Set ELEVENLABS_API_KEY on the brain and redeploy — voice-out is off at the source."
            : null,
    });
  }

  // ---- leg 3: the speakers -------------------------------------------------
  const handle = playBytes(answer.audio, "audio/mpeg", () => {
    voiceEvents.emit({ type: "mode", mode: "speaking" });
  });
  current = handle;
  const receipt = await handle.done;
  if (current === handle) current = null;
  voiceEvents.emit({ type: "mode", mode: "idle" });

  return {
    played: receipt.played,
    reason: receipt.reason,
    message: receipt.message,
    detail: receipt.events.join(" ") || null,
    buildSkew: false,
    remedy:
      receipt.reason === "stalled" || receipt.sink.fellBack
        ? "Open Settings → VOICE and run the SPEAKER TEST, then pick a different OUTPUT DEVICE."
        : null,
    notices: receipt.notices,
    receipt,
  };
}
