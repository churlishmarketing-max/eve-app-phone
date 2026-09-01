// owner: stream S4
//
// MIC CAPTURE — one blob per turn, nothing clever.
//
// Ported from the shipped phone client (app/src/EveApp.tsx:636-673): the same
// mimeType ladder, the same single-blob recording (NO timeslice — the brain's
// /voice/transcribe wants one complete container, not a pile of fragments), and
// the same hard rule that the stream's tracks are stopped on every exit path so
// Windows drops the "recording" indicator the instant she stops listening.

/** webm/opus first (Chromium's native), mp4 second, then let the UA decide. */
export const MIME_LADDER = ["audio/webm;codecs=opus", "audio/mp4", ""] as const;

/** The first ladder entry this build actually supports. "" = UA default. */
export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of MIME_LADDER) {
    if (!m) return "";
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* isTypeSupported can throw on exotic builds; fall through the ladder */
    }
  }
  return "";
}

/**
 * Availability check: is there a capture API AND at least one input device?
 * Deliberately does NOT call getUserMedia — asking the question must never pop
 * the permission prompt. Before permission is granted `enumerateDevices` still
 * lists an audioinput with a blank label, which is exactly the signal we want.
 */
export async function micAvailable(): Promise<boolean> {
  try {
    if (typeof MediaRecorder === "undefined") return false;
    const md = navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== "function") return false;
    if (typeof md.enumerateDevices !== "function") return true;
    const devices = await md.enumerateDevices();
    return devices.some((d) => d.kind === "audioinput");
  } catch {
    return false;
  }
}

export interface Recorder {
  /** The container actually being written, already resolved off the ladder. */
  readonly mimeType: string;
  /** Stop, release the mic, resolve the single blob. Safe to call twice. */
  stop(): Promise<Blob>;
  /** Stop and release the mic, throwing the audio away. */
  cancel(): void;
}

/**
 * Open the mic and start recording. Throws if permission is refused or there is
 * no device — the caller turns that into the "MIC UNAVAILABLE" note.
 */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const stopTracks = (): void => {
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* already ended */
      }
    }
  };

  const mime = pickMimeType();
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch (err) {
    // A live stream with no recorder is a leaked mic light.
    stopTracks();
    throw err;
  }

  const type = mime || "audio/webm";
  const chunks: Blob[] = [];
  rec.ondataavailable = (e: BlobEvent): void => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.start(); // no timeslice: one dataavailable, one blob

  let settled = false;
  return {
    mimeType: type,
    stop(): Promise<Blob> {
      return new Promise<Blob>((resolve) => {
        const done = (): void => {
          stopTracks();
          resolve(new Blob(chunks, { type }));
        };
        if (settled || rec.state === "inactive") {
          done();
          return;
        }
        settled = true;
        rec.onstop = done;
        rec.onerror = done;
        try {
          rec.stop();
        } catch {
          done();
        }
      });
    },
    cancel(): void {
      settled = true;
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {
        /* nothing to stop */
      }
      stopTracks();
    },
  };
}
