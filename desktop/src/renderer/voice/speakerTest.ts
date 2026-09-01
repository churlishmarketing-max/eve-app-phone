// owner: stream S4 (her voice)
//
// THE SPEAKER TEST — one button, the whole real path, a receipt.
//
// WHAT IT PLAYS. Her real last spoken line when there is one (voicePref
// remembers only brain-generated text), otherwise a plain chrome label. The
// shell never writes her dialogue, so the fallback is a label, not a sentence
// — and it is NOT remembered as "her last line" afterwards (speakSample).
//
// WHAT IT PROVES. On 2026-09-01 the question that took a day to answer was
// WHICH leg was silent: the bridge (a stale main with no handler), the brain
// (a refused token, an unwired key, an empty 200), or the speakers (a saved
// device that was gone, or Windows routing her to the monitor over HDMI).
// This runs the same speak() path her turns run and reports each leg by
// name: bytes received, the output device actually used, the play outcome
// and how far the clock got.
//
// WHEN THE BRAIN SENDS NO BYTES the speakers are still an open question, so a
// locally generated tone is pushed through the exact same <audio> element,
// the same setSinkId call and the same blob URL. The receipt says, in so many
// words, that the tone was a fallback and what it did — it is never passed
// off as her.

import { errText, listOutputs, playBytes, type PlayReceipt } from "./audioOut";
import { checkBuild, type BuildCheck } from "./buildCheck";
import { auditionLine, speakSample, type SpeakResult } from "./playback";

/** The chrome label spoken when she has not said anything yet. Not a line of hers. */
export const CHROME_LABEL = "Speaker test";


const SAMPLE_RATE = 44_100;

/** Two short notes, so a half-working stereo path is audible as a half-chime. */
const NOTES: { hz: number; seconds: number }[] = [
  { hz: 587.33, seconds: 0.34 }, // D5
  { hz: 880.0, seconds: 0.4 }, // A5
];
const GAP_SECONDS = 0.05;
const PEAK = 0.28; // never startling, always plainly audible

/** Total wall-clock length of the sample, for the receipt's "of Xs". */
export const SAMPLE_SECONDS =
  NOTES.reduce((t, n) => t + n.seconds, 0) + GAP_SECONDS * (NOTES.length - 1);

/**
 * Build the sample. Deterministic: the same bytes every time, so a receipt
 * that says 68,000 bytes always means the same known-good input arrived.
 */
export function buildSampleWav(): ArrayBuffer {
  const frames: number[] = [];
  NOTES.forEach((note, i) => {
    const n = Math.round(note.seconds * SAMPLE_RATE);
    // 8ms attack / 60ms release — a raw square edge on a speaker is a click,
    // and a click is indistinguishable from a fault.
    const attack = Math.round(0.008 * SAMPLE_RATE);
    const release = Math.round(0.06 * SAMPLE_RATE);
    for (let s = 0; s < n; s++) {
      let env = 1;
      if (s < attack) env = s / attack;
      else if (s > n - release) env = Math.max(0, (n - s) / release);
      frames.push(Math.sin((2 * Math.PI * note.hz * s) / SAMPLE_RATE) * PEAK * env);
    }
    if (i < NOTES.length - 1) {
      for (let s = 0; s < Math.round(GAP_SECONDS * SAMPLE_RATE); s++) frames.push(0);
    }
  });

  const dataBytes = frames.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  let o = 44;
  for (const f of frames) {
    const clamped = Math.max(-1, Math.min(1, f));
    view.setInt16(o, Math.round(clamped * 0x7fff), true);
    o += 2;
  }
  return buf;
}

export interface SpeakerTestResult {
  /** True only when the clock actually advanced through HER sample. */
  played: boolean;
  /** What was spoken and where it came from. */
  sample: { text: string; source: "her-last-line" | "chrome-label" };
  /** The full result of the real path — bridge, brain, sink, clock. */
  speak: SpeakResult;
  /** The playback receipt for her sample, when the path got as far as an element. */
  receipt: PlayReceipt | null;
  /** The local-tone fallback, run only when the brain leg sent no bytes. */
  tone: PlayReceipt | null;
  /** The output devices this machine admits to, at the moment of the test. */
  devices: { id: string; label: string }[];
  deviceError: string | null;
  /** Whether the process behind this window is the same build as the window. */
  build: BuildCheck;
  /** Can the renderer even reach her voice endpoint? Checked, never assumed. */
  bridge: { present: boolean; detail: string };
  /** The whole thing in lines he can read or paste to me. */
  lines: string[];
}

let running = false;

function up(s: string): string {
  return s.toUpperCase();
}

/**
 * Run the test. It never throws and it always produces lines — a diagnostic
 * that can itself fail silently is worse than no diagnostic.
 */
export async function runSpeakerTest(): Promise<SpeakerTestResult> {
  const build0 = await checkBuild();
  if (running) {
    // Two overlapping tests would fight over the element and produce a lie.
    const speak: SpeakResult = {
      played: false,
      reason: "stopped",
      message: "A speaker test was already running.",
      detail: null,
      buildSkew: false,
      remedy: null,
      notices: [],
      receipt: null,
    };
    return {
      played: false,
      sample: { text: "", source: "chrome-label" },
      speak,
      receipt: null,
      tone: null,
      devices: [],
      deviceError: null,
      build: build0,
      bridge: { present: false, detail: "a speaker test was already running" },
      lines: ["A SPEAKER TEST IS ALREADY RUNNING — WAIT FOR IT TO FINISH."],
    };
  }
  running = true;
  try {
    const build = build0;
    const list = await listOutputs();

    let bridge: { present: boolean; detail: string };
    try {
      const fn = window.eve?.voice?.speak;
      bridge =
        typeof fn === "function"
          ? { present: true, detail: "window.eve.voice.speak is present" }
          : { present: false, detail: "window.eve.voice.speak is missing from the bridge" };
    } catch (err) {
      bridge = { present: false, detail: errText(err) };
    }

    const last = auditionLine();
    const sample: SpeakerTestResult["sample"] = last
      ? { text: last, source: "her-last-line" }
      : { text: CHROME_LABEL, source: "chrome-label" };

    // ---- the real path -------------------------------------------------------
    const speak = await speakSample(sample.text);
    const receipt = speak.receipt;
    const gotBytes = receipt !== null && receipt.bytes > 0;

    // ---- the fallback, only when the brain sent nothing ----------------------
    let tone: PlayReceipt | null = null;
    if (!gotBytes) tone = await playBytes(buildSampleWav(), "audio/wav").done;

    const lines: string[] = [];
    const quoted = sample.text.length > 72 ? `${sample.text.slice(0, 69)}…` : sample.text;
    lines.push(
      sample.source === "her-last-line"
        ? `SAMPLE: HER LAST LINE — "${up(quoted)}"`
        : `SAMPLE: CHROME LABEL "${up(CHROME_LABEL)}" — NOTHING OF HERS TO REPLAY YET.`,
    );
    lines.push(bridge.present ? "BRIDGE: PRESENT." : `BRIDGE: MISSING — ${up(bridge.detail)}`);

    if (gotBytes && receipt) {
      lines.push(`BYTES RECEIVED: ${receipt.bytes.toLocaleString()} OF ${up(receipt.mime)}.`);
    } else {
      // The verbatim reason, never a paraphrase — this is the sentence that
      // used to be the word "NO AUDIO".
      lines.push(`BYTES RECEIVED: 0 — ${up(speak.message)}${speak.detail ? ` [${up(speak.detail)}]` : ""}`);
    }

    const sink = receipt?.sink ?? tone?.sink ?? null;
    if (sink) {
      const wanted = sink.requestedId
        ? ` (SAVED PICK: ${up(sink.requestedLabel ?? sink.requestedId)})`
        : " (NO SAVED PICK — FOLLOWING WINDOWS)";
      lines.push(`OUTPUT DEVICE USED: ${up(sink.appliedLabel)}${sink.fellBack ? " · FELL BACK" : ""}${wanted}`);
      if (sink.fallbackReason) lines.push(`WHY: ${up(sink.fallbackReason)}`);
    } else {
      lines.push("OUTPUT DEVICE USED: UNKNOWN — THE PATH NEVER REACHED AN AUDIO ELEMENT.");
    }

    if (receipt) {
      lines.push(
        receipt.played
          ? `PLAY: SOUND CAME OUT — ${receipt.reachedSec.toFixed(2)}S OF ${receipt.durationSec === null ? "?" : receipt.durationSec.toFixed(2)}S · ENDED=${receipt.endedFired ? "YES" : "NO"}.`
          : `PLAY: NO SOUND — ${up((receipt.reason ?? "unknown").replace(/-/g, " "))} — ${up(receipt.message)}`,
      );
      lines.push(`EVENTS: ${receipt.events.join(" ") || "NONE"}`);
      for (const n of receipt.notices) lines.push(up(n));
    } else {
      lines.push(`PLAY: NOT ATTEMPTED — ${up((speak.reason ?? "unknown").replace(/-/g, " "))}.`);
    }
    if (speak.remedy) lines.push(`REMEDY: ${up(speak.remedy)}`);

    if (tone) {
      lines.push(
        tone.played
          ? `LOCAL TONE (FALLBACK, NOT HER VOICE): SOUND CAME OUT — ${tone.reachedSec.toFixed(2)}S OF ${SAMPLE_SECONDS.toFixed(2)}S ON ${up(tone.sink.appliedLabel)}. THE SPEAKERS WORK; THE FAULT IS ABOVE THEM.`
          : `LOCAL TONE (FALLBACK, NOT HER VOICE): NO SOUND — ${up(tone.message)}`,
      );
    }

    if (list.error) lines.push(`DEVICE LIST UNREADABLE — ${up(list.error)}`);
    else if (list.blind) lines.push("DEVICE LIST CAME BACK WITHOUT NAMES — MEDIA PERMISSION IS NOT GRANTED.");
    else lines.push(`${list.devices.length} OUTPUT DEVICE${list.devices.length === 1 ? "" : "S"} VISIBLE.`);
    if (build.skewed && build.message) lines.push(up(build.message));

    // The one sentence that turns a receipt into a next step.
    if (speak.played && !build.skewed) {
      lines.push("HER VOICE PLAYED END TO END ON THIS MACHINE. IF SHE IS SILENT IN A TURN, THE FAULT IS THAT TURN, NOT THE PIPE.");
    } else if (build.skewed) {
      lines.push("THE BACKGROUND PROCESS IS A DIFFERENT BUILD FROM THIS WINDOW — FIX THAT FIRST; EVERYTHING BELOW IT IS A GUESS.");
    } else if (!gotBytes && tone?.played) {
      lines.push("THE SPEAKERS ARE FINE. THE BRAIN LEG SENT NO BYTES — THE REASON IS NAMED ABOVE.");
    } else if (!gotBytes && tone && !tone.played) {
      lines.push("NEITHER HER VOICE NOR A LOCAL TONE MADE A SOUND — FIX THE OUTPUT DEVICE BEFORE BLAMING HER VOICE.");
    } else if (gotBytes && !speak.played) {
      lines.push("BYTES ARRIVED AND DID NOT PLAY — THE FAULT IS THE OUTPUT DEVICE OR THE ELEMENT, NAMED ABOVE.");
    }

    return {
      played: speak.played,
      sample,
      speak,
      receipt,
      tone,
      devices: list.devices,
      deviceError: list.error,
      build,
      bridge,
      lines,
    };
  } finally {
    running = false;
  }
}
