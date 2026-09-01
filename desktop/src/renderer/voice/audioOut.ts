// owner: stream S4 (her voice)
//
// THE ONE AUDIO PATH — and the receipt it always hands back.
//
// WHY THIS FILE EXISTS. On 2026-09-01 her voice made no sound and the only
// thing the app could say about it was "NO AUDIO". That string was produced by
// a single `catch { buf = null }` in playback.ts, which flattened four
// completely different failures — the bridge missing, the main process being
// older than this window, the brain returning nothing, and a thrown parse —
// into one word that named none of them. He could not tell a stale process from
// a dead socket, so he could not act. That is the worst thing this shell can
// do: she is the one product whose voice IS the point, and a silent failure is
// a lie of omission.
//
// So every path through this file ends in a PlayReceipt: what was asked for,
// which device it actually went to, whether the clock moved, how far it got,
// and one honest sentence a human can act on. Nothing here returns a bare
// boolean and nothing here swallows an error.
//
// It is also the ONLY place that touches setSinkId, so the audition, a real
// turn, and the speaker test can never disagree about which speaker she is
// coming out of.

/** Settings writes this (SettingsPane, OUTPUT DEVICE row). We read it here. */
export const OUTPUT_DEVICE_KEY = "eve.outputDevice";

/**
 * The label that id had WHEN HE PICKED IT. Kept beside the id for exactly one
 * reason: when the device is gone, enumerateDevices can no longer tell us its
 * name, and "the device you picked is not connected" is a much weaker sentence
 * than "SPEAKERS (HIDOCK H1E) IS NOT CONNECTED". A remembered label is the
 * difference between a diagnosis and a shrug.
 */
export const OUTPUT_DEVICE_LABEL_KEY = "eve.outputDevice.label";

/** setSinkId is not in TypeScript's lib.dom yet; it is in Chromium. */
type Sinkable = HTMLAudioElement & {
  setSinkId?: (id: string) => Promise<void>;
  sinkId?: string;
};

export interface OutputDevice {
  id: string;
  label: string;
}

export interface DeviceList {
  devices: OutputDevice[];
  /** Null when the enumeration itself worked (even if it returned nothing). */
  error: string | null;
  /**
   * True when the browser handed back entries with no ids/labels — that is
   * Chromium's "you have no media permission" shape, NOT proof of no devices.
   * We must never call a device "gone" on the strength of an unusable list.
   */
  blind: boolean;
}

export interface SinkOutcome {
  /** The id he saved, or null when he is on the system default by choice. */
  requestedId: string | null;
  /** Its remembered name, when we have one. */
  requestedLabel: string | null;
  /** Where the audio is actually going. "default" = whatever Windows says. */
  appliedId: string;
  appliedLabel: string;
  /** True when we could not honour the saved pick and used the default. */
  fellBack: boolean;
  /** One sentence naming why, already fit to show a human. Null when fine. */
  fallbackReason: string | null;
}

export type PlayFailure =
  | "empty"
  | "no-bytes"
  | "decode"
  | "play-blocked"
  | "stalled"
  | "stopped";

export interface PlayReceipt {
  /** True only if the clock actually moved — not merely that play() resolved. */
  played: boolean;
  reason: PlayFailure | null;
  /** One honest sentence. Always present, success or failure. */
  message: string;
  bytes: number;
  mime: string;
  /** Seconds, once metadata arrived. Null when it never did. */
  durationSec: number | null;
  /** How far the clock actually got. This is the proof of audibility-in-code. */
  reachedSec: number;
  endedFired: boolean;
  sink: SinkOutcome;
  /** True things that did not stop playback but he still deserves to know. */
  notices: string[];
  /** The media events in the order they fired — the tail of any diagnosis. */
  events: string[];
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

function readLS(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

/** The saved output-device pick, or null for "follow the system default". */
export function savedOutputId(): string | null {
  return readLS(OUTPUT_DEVICE_KEY);
}

export function savedOutputLabel(): string | null {
  return readLS(OUTPUT_DEVICE_LABEL_KEY);
}

/** Settings calls this so the id and the name it had are stored together. */
export function saveOutputDevice(id: string | null, label: string | null): void {
  try {
    if (!id) {
      localStorage.removeItem(OUTPUT_DEVICE_KEY);
      localStorage.removeItem(OUTPUT_DEVICE_LABEL_KEY);
    } else {
      localStorage.setItem(OUTPUT_DEVICE_KEY, id);
      if (label) localStorage.setItem(OUTPUT_DEVICE_LABEL_KEY, label);
      else localStorage.removeItem(OUTPUT_DEVICE_LABEL_KEY);
    }
  } catch {
    /* storage blocked — the pick lives for this session only, never throws */
  }
}

/** Every audio output Chromium will admit to. Errors are reported, not eaten. */
export async function listOutputs(): Promise<DeviceList> {
  const md = navigator.mediaDevices;
  if (!md?.enumerateDevices) {
    return { devices: [], error: "this build has no navigator.mediaDevices", blind: true };
  }
  let all: MediaDeviceInfo[];
  try {
    all = await md.enumerateDevices();
  } catch (err) {
    return { devices: [], error: errText(err), blind: true };
  }
  const outs = all.filter((d) => d.kind === "audiooutput");
  const usable = outs.filter((d) => d.deviceId);
  // Chromium's no-permission shape: entries exist but carry empty ids/labels.
  const blind = outs.length > 0 && usable.length === 0;
  return {
    devices: usable.map((d) => ({ id: d.deviceId, label: d.label || d.deviceId })),
    error: null,
    blind,
  };
}

export function errText(err: unknown): string {
  if (err instanceof Error) return err.name && err.name !== "Error" ? `${err.name}: ${err.message}` : err.message;
  return String(err);
}

/**
 * Put the element on his chosen speaker, or say why it is on the default.
 *
 * THE LAW HERE: a stale device id must never cost her a reply and must never
 * route her into the void. setSinkId rejecting leaves the element on the
 * default sink, so the fallback is automatic; what was missing before was the
 * sentence. We keep his saved pick (a headset unplugged for an hour should
 * still be his pick when it comes back) and we say, out loud, that we are not
 * using it right now.
 */
export async function applyOutputDevice(audio: Sinkable): Promise<SinkOutcome> {
  const requestedId = savedOutputId();
  const requestedLabel = savedOutputLabel();
  const list = await listOutputs();
  const nameOf = (id: string): string | null => list.devices.find((d) => d.id === id)?.label ?? null;

  const defaultLabel = nameOf("default") ?? "the system default output";
  const onDefault = (fallbackReason: string | null): SinkOutcome => ({
    requestedId,
    requestedLabel,
    appliedId: "default",
    appliedLabel: defaultLabel,
    fellBack: fallbackReason !== null,
    fallbackReason,
  });

  if (!requestedId) return onDefault(null);

  const known = requestedLabel ?? nameOf(requestedId) ?? requestedId;

  if (typeof audio.setSinkId !== "function") {
    return onDefault(`This build cannot route audio to a chosen speaker (setSinkId is missing), so ${known} was ignored and the system default is being used.`);
  }

  // Only call a device gone when the list was actually readable.
  if (!list.error && !list.blind && list.devices.length > 0 && !list.devices.some((d) => d.id === requestedId)) {
    return onDefault(`${known} is not connected any more — playing on ${defaultLabel} instead. Your pick is still saved and will be used again when that device comes back.`);
  }

  try {
    await audio.setSinkId(requestedId);
  } catch (err) {
    return onDefault(`Windows refused to send audio to ${known} (${errText(err)}) — playing on ${defaultLabel} instead.`);
  }

  // Trust the element over our own bookkeeping.
  const actual = audio.sinkId;
  if (typeof actual === "string" && actual !== requestedId && actual !== "") {
    return onDefault(`Asked for ${known} but the audio element reports sink "${actual}" — playing on ${defaultLabel}.`);
  }
  return {
    requestedId,
    requestedLabel,
    appliedId: requestedId,
    appliedLabel: nameOf(requestedId) ?? requestedLabel ?? requestedId,
    fellBack: false,
    fallbackReason: null,
  };
}

/**
 * WHICH SPEAKER IS SHE ACTUALLY COMING OUT OF, RIGHT NOW?
 *
 * Settings used to answer this with the id in localStorage, which is the WISH,
 * not the fact. King's Windows default output is a SAMSUNG monitor over HDMI;
 * his desk speakers are a separate device. So "she is talking to my monitor"
 * was true, invisible, and indistinguishable from "she is not talking at all"
 * — the row showed a saved pick (or nothing) and the audio went somewhere
 * else entirely.
 *
 * This does not ask. It builds the same element her voice uses, runs the same
 * applyOutputDevice against it, and reports what came back — including the
 * fallback and the reason, when the saved device is gone. No src is ever set
 * and nothing is played, so it is silent and free; it is a dry run of leg 3.
 */
export async function probeOutputRoute(): Promise<SinkOutcome> {
  try {
    return await applyOutputDevice(new Audio() as Sinkable);
  } catch (err) {
    // A probe that throws must not be reported as "on the default" — that
    // would be inventing a fact to fill a row.
    return {
      requestedId: savedOutputId(),
      requestedLabel: savedOutputLabel(),
      appliedId: "unknown",
      appliedLabel: "unknown",
      fellBack: false,
      fallbackReason: `Could not work out where audio is going: ${errText(err)}.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

/** play() resolved but the clock never moved — a real, silent way to fail. */
const STALL_MS = 4000;

const MEDIA_EVENTS = [
  "loadstart",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "stalled",
  "suspend",
  "waiting",
  "pause",
  "ended",
  "error",
] as const;

export interface PlayHandle {
  /** BARGE-IN. Ends the utterance now; the receipt says "stopped". */
  stop(): void;
  /** Resolves when playback has FINISHED — ended, errored, refused or barged. */
  done: Promise<PlayReceipt>;
}

function mediaErrorText(audio: HTMLAudioElement): string | null {
  const e = audio.error;
  if (!e) return null;
  const names: Record<number, string> = {
    1: "playback was aborted",
    2: "the audio download failed",
    3: "the audio could not be decoded",
    4: "this audio format is not supported",
  };
  const what = names[e.code] ?? `media error ${e.code}`;
  return e.message ? `${what} (${e.message})` : what;
}

/**
 * Play bytes through the one path, and hand back everything that happened.
 *
 * Resolves on FINISH, not on start, so a caller can hold its "speaking" phase
 * for the real duration — that is the phone's law and it is unchanged.
 */
export function playBytes(bytes: ArrayBuffer, mime: string, onStart?: () => void): PlayHandle {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const audio = new Audio() as Sinkable;
  audio.preload = "auto";

  const events: string[] = [];
  const notices: string[] = [];
  let settle: ((r: PlayReceipt) => void) | null = null;
  let finished = false;
  let sink: SinkOutcome = {
    requestedId: null,
    requestedLabel: null,
    appliedId: "default",
    appliedLabel: "the system default output",
    fellBack: false,
    fallbackReason: null,
  };
  let stallTimer: number | null = null;

  const listeners: (() => void)[] = [];
  for (const name of MEDIA_EVENTS) {
    const h = (): void => {
      events.push(name);
      if (name === "ended") finish(null);
      if (name === "error") finish("decode");
    };
    audio.addEventListener(name, h);
    listeners.push(() => audio.removeEventListener(name, h));
  }

  const done = new Promise<PlayReceipt>((resolve) => {
    settle = resolve;
  });

  function finish(reason: PlayFailure | null, overrideMessage?: string): void {
    if (finished) return;
    finished = true;
    if (stallTimer !== null) window.clearTimeout(stallTimer);
    for (const off of listeners) off();
    const reached = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    const endedFired = events.includes("ended");
    try {
      audio.pause();
    } catch {
      /* already torn down */
    }
    URL.revokeObjectURL(url);

    const mediaErr = mediaErrorText(audio);
    if (mediaErr && reason === "decode") notices.push(mediaErr);

    // "Played" means the clock moved. play() resolving is not the same claim,
    // and it is precisely the claim that hid this bug class before.
    const moved = reached > 0.01;
    const played = moved;
    const finalReason: PlayFailure | null = reason ?? (moved ? null : "stalled");

    let message = overrideMessage ?? "";
    if (!message) {
      if (reason === null && moved) {
        message = `Played ${reached.toFixed(2)}s${dur ? ` of ${dur.toFixed(2)}s` : ""} on ${sink.appliedLabel}.`;
      } else if (reason === null && !moved) {
        message = `The audio element reported it finished without the clock ever moving — nothing came out of ${sink.appliedLabel}.`;
      } else if (reason === "stopped") {
        message = moved
          ? `Stopped after ${reached.toFixed(2)}s — you interrupted her.`
          : "Stopped before any sound came out — you interrupted her.";
      } else if (reason === "decode") {
        message = `${mediaErr ?? "The audio element rejected the bytes"} — ${bytes.byteLength} bytes of ${mime} arrived but could not be played.`;
      }
    }
    if (sink.fallbackReason) notices.push(sink.fallbackReason);

    settle?.({
      played,
      reason: finalReason,
      message,
      bytes: bytes.byteLength,
      mime,
      durationSec: dur,
      reachedSec: reached,
      endedFired,
      sink,
      notices,
      events,
    });
  }

  void (async () => {
    if (bytes.byteLength === 0) {
      finish("no-bytes", "Zero bytes of audio arrived — there was nothing to play.");
      return;
    }
    sink = await applyOutputDevice(audio);
    if (finished) return; // barged in on during enumeration
    audio.src = url;
    try {
      await audio.play();
    } catch (err) {
      finish(
        "play-blocked",
        `The browser refused to start playback: ${errText(err)}. Nothing was sent to ${sink.appliedLabel}.`,
      );
      return;
    }
    if (finished) return;
    onStart?.();
    // play() resolving proves the element accepted the command, NOT that the
    // device accepted the audio. A sink that swallows everything leaves the
    // clock at zero forever and `ended` never fires — which is exactly how a
    // "no sound and no error" bug hides. Give it a deadline.
    stallTimer = window.setTimeout(() => {
      if (finished) return;
      if (audio.currentTime > 0.01) return; // moving fine, just long
      finish(
        "stalled",
        `Playback started but the clock never moved past 0.00s in ${STALL_MS / 1000}s — ${sink.appliedLabel} accepted the stream and produced nothing. Try a different output device.`,
      );
    }, STALL_MS);
  })();

  return {
    // Safe at ANY point in the lifecycle — before the sink resolves, mid-play,
    // or after the fact. It always settles `done`, so a barge-in can never
    // leave a caller's "speaking" phase hanging.
    stop(): void {
      finish("stopped");
    },
    done,
  };
}
