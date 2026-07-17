import { registerPlugin, Capacitor } from "@capacitor/core";

// Native bridge to AudioFocusPlugin.java. request() grabs transient audio focus
// (music / YouTube / podcasts pause); abandon() releases it (they resume). Used
// only around EVE's spoken reply so King can actually hear her — the standard
// voice-assistant handshake. Best-effort: focus is a courtesy, never a blocker,
// so failures are swallowed and never break the voice loop.

interface AudioFocusPlugin {
  request(): Promise<{ granted: boolean }>;
  abandon(): Promise<void>;
}

const AudioFocus = registerPlugin<AudioFocusPlugin>("AudioFocus");
const native = Capacitor.isNativePlatform();

export async function requestAudioFocus(): Promise<void> {
  if (!native) return;
  try {
    await AudioFocus.request();
  } catch {
    /* focus is best-effort — never let it stall her voice */
  }
}

export async function abandonAudioFocus(): Promise<void> {
  if (!native) return;
  try {
    await AudioFocus.abandon();
  } catch {
    /* ignore — worst case the OS reclaims focus when our audio stops */
  }
}
