// CORE VOICE — when to ask GET /voice/voices again. One copy, read by the
// desk's rail (renderer/voice/useVoiceIdentity.ts) and the phone (app EveApp),
// so the two can never disagree about whether her voice just changed.
//
// WHY IT EXISTS (fix round 3). Her provider flips at runtime — Voicebox via
// EVE desktop's relay, ElevenLabs, or none — and both surfaces used to ask
// which voice she is in once and then hold that answer: the desk froze on the
// first configured id, the phone asked once per session. The brain's "voice"
// connector (voice-relay.ts voiceConnector) already changes when any of that
// does, so a change in it is the cue to ask again.
//
// Nothing here reads a clock, a store, a window or a network. Pure in, pure out.

import type { ConnectorStatus } from "../contract";

/** A change on the "voice" connector is re-asked only once it has held this long (≥2s). */
export const VOICE_CONNECTOR_SETTLE_MS = 2_000;

/**
 * The brain's "voice" connector as a comparable key: connected flag + detail,
 * with the "seen Ns ago" age counter folded out. That counter moves on every
 * /state poll; left in, it would re-ask /voice/voices on every poll while
 * nothing about her voice had changed. null = no "voice" connector at all (a
 * brain older than the relay) — a constant, so such a brain is asked once.
 */
export function voiceConnectorKey(connectors: ConnectorStatus[] | undefined): string | null {
  const c = (connectors ?? []).find((x) => x.key.toLowerCase() === "voice");
  if (!c) return null;
  return `${c.connected ? 1 : 0}|${(c.detail ?? "").replace(/\bseen \d+s ago\b/g, "seen")}`;
}
