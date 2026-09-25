// owner: stream V (her voice)
//
// HIS PICK, THE LAST THING SHE ACTUALLY SAID, AND WHO ACTUALLY SAID IT.
//
// Small pieces of renderer-local state, kept in localStorage for the same
// reason playback.ts keeps the output device there (OUTPUT_DEVICE_KEY): the
// deck, summon and flyout windows are one origin, so a pick made in settings is
// already true in the other windows, and electron/config.ts belongs to another
// stream. Nothing here is a secret and nothing here is her intelligence.
//
// WHAT THIS IS NOT: it is not "the configured voice". The brain owns that
// (ELEVENLABS_VOICE_ID). This is a per-utterance override the desktop sends on
// POST /voice/speak, and it is only ever WRITTEN while the brain in front of us
// proves it honours the override (VoiceList.configuredVoiceId is present).

/** His chosen voice id. Absent = "use whatever the brain is configured with". */
export const SELECTED_VOICE_KEY = "eve.voiceId";

/** The last line the brain actually generated and she actually spoke. */
export const LAST_SPOKEN_KEY = "eve.voice.lastSpoken";

/** Same shape the brain validates against (voice.ts VOICE_ID_RE): an ElevenLabs
 *  id (20 alphanumerics) OR a Voicebox profile id (a UUID). */
export const VOICE_ID_RE = /^(?:[A-Za-z0-9]{20}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const CHANGED = "eve:voicepref";
const MAX_REMEMBERED = 240;

function read(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v : null;
  } catch {
    return null; // private mode / storage blocked — behave as "nothing saved"
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* the pick simply does not survive the session; never throw at the UI */
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGED));
  } catch {
    /* non-DOM context (tests) */
  }
}

/** His saved pick, or null. A malformed value is treated as no pick at all. */
export function selectedVoiceId(): string | null {
  const id = read(SELECTED_VOICE_KEY);
  return id && VOICE_ID_RE.test(id) ? id : null;
}

/** Save (or clear, with null) his pick. Fires a change so every rail updates. */
export function setSelectedVoiceId(id: string | null): void {
  write(SELECTED_VOICE_KEY, id && VOICE_ID_RE.test(id) ? id : null);
}

/**
 * Remember the sentence she just spoke — brain-generated text, never authored
 * here. The voice picker replays it as its audition sample so an audition is a
 * real A/B of her own words instead of a line someone put in her mouth.
 */
export function rememberSpokenLine(text: string): void {
  const line = text.trim().replace(/\s+/g, " ");
  if (!line) return;
  write(LAST_SPOKEN_KEY, line.slice(0, MAX_REMEMBERED));
}

export function lastSpokenLine(): string | null {
  return read(LAST_SPOKEN_KEY);
}

/**
 * WHO LAST ACTUALLY SPOKE, and whether the pick sent with that line was
 * honoured — off the brain's X-EVE-Voice / X-EVE-Voice-Override headers
 * (SpeakAudio.voice / overrideIgnored). Kept here beside his pick for the same
 * reason the pick is: the deck, Summon and flyout are one origin, so a line
 * spoken in Summon corrects the deck's rail through the storage event. A
 * measurement, not a setting: nothing is ever sent to the brain from it.
 */
export const SERVED_VOICE_KEY = "eve.voice.served";

export interface ServedVoice {
  provider: "voicebox" | "elevenlabs";
  /** The voiceId the line went out with; null = none (her configured voice). */
  pick: string | null;
  /** The brain said that pick was NOT honoured and spoke her configured voice. */
  ignored: boolean;
}

export function rememberServedVoice(s: ServedVoice): void {
  const next = JSON.stringify({ provider: s.provider, pick: s.pick, ignored: s.ignored });
  // Unchanged = no write, no change event: this runs on every line she speaks.
  if (read(SERVED_VOICE_KEY) === next) return;
  write(SERVED_VOICE_KEY, next);
}

export function lastServedVoice(): ServedVoice | null {
  const raw = read(SERVED_VOICE_KEY);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { provider?: unknown; pick?: unknown; ignored?: unknown };
    if (j.provider !== "voicebox" && j.provider !== "elevenlabs") return null;
    const pick = typeof j.pick === "string" && VOICE_ID_RE.test(j.pick) ? j.pick : null;
    return { provider: j.provider, pick, ignored: j.ignored === true };
  } catch {
    return null; // a torn value is no measurement at all
  }
}

/** Subscribe to pick changes — this window's writes AND the other windows'. */
export function onVoicePrefChange(cb: () => void): () => void {
  const handler = (): void => cb();
  window.addEventListener(CHANGED, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGED, handler);
    window.removeEventListener("storage", handler);
  };
}
