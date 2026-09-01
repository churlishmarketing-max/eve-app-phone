// owner: stream V (her voice)
//
// HIS PICK, AND THE LAST THING SHE ACTUALLY SAID.
//
// Two small pieces of renderer-local state, kept in localStorage for the same
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

/** Same shape the brain validates against (voice.ts VOICE_ID_RE). */
export const VOICE_ID_RE = /^[A-Za-z0-9]{20}$/;

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
