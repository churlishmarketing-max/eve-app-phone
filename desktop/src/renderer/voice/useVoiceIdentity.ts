// owner: stream V (her voice)
//
// WHICH VOICE IS SHE ACTUALLY IN? One hook, one answer, used by the rail label
// and by the settings picker so those two can never disagree.
//
// THE BUG THIS EXISTS TO KILL: the deck used to render `voices[0].name` off
// GET /voice/voices. That array is ElevenLabs' own order over ~50 voices, not a
// ranking, so the rail read "ADAM" while she was configured as Lara. A name on
// that rail is a claim about her; a claim you cannot resolve is a lie. So:
//
//   * the name comes from the id the brain names as configured, or
//   * from his saved pick IF the brain proved it honours picks AND the voice
//     speaking right now can honour this one (see pickHonoured), or
//   * it is null and the rail prints "—" (or names the missing profile).
//
// There is no third branch, and no guess.
//
// THE ANSWER CAN CHANGE UNDER HER (fix round 3). The provider flips at runtime
// — Voicebox via EVE desktop's relay, ElevenLabs, or none — and this hook used
// to ask once and freeze on the first answer that named a voice. It now asks
// again whenever the brain's "voice" connector changes, and whenever a line
// comes back spoken by a different provider than the list it holds.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectorStatus, VoiceList } from "@shared/contract";
import { VOICE_CONNECTOR_SETTLE_MS, voiceConnectorKey } from "@shared/core/voice";
import {
  lastServedVoice,
  onVoicePrefChange,
  selectedVoiceId,
  setSelectedVoiceId,
  type ServedVoice,
} from "./voicePref";

export interface VoiceOption {
  id: string;
  name: string;
}

export interface VoiceIdentity {
  loading: boolean;
  /** Honest words when the list could not be had (offline, no key, 401). */
  error: string | null;
  voices: VoiceOption[];
  /** What the brain says it is configured with. null = it did not say. */
  configuredVoiceId: string | null;
  /**
   * Does the brain in front of us honour a per-utterance `voiceId`? Detected,
   * never assumed: GET /voice/voices carried configuredVoiceId (only the
   * redeployed brain does), or it named a Voicebox profile it could not find
   * (only the relay brain does — and it still speaks a picked profile).
   */
  overrideSupported: boolean;
  /** His saved pick (may exist while unsupported — then it is NOT in effect). */
  selectedId: string | null;
  /** The voice she will actually speak in from this desktop, right now. */
  effectiveId: string | null;
  /** Its name, resolved from her real list. null when it cannot be resolved. */
  effectiveName: string | null;
  /** True when effectiveId is his pick rather than the brain's default. */
  usingOverride: boolean;
  /** Whose list this is. null = the brain did not say (older than the relay) or no answer. */
  provider: "voicebox" | "elevenlabs" | null;
  /**
   * The Voicebox profile NAME her brain looks for and his Voicebox does not
   * have — {ok:true, configuredVoiceId:null, configuredVoiceName:"X"}. That is
   * a missing profile on this PC, NOT an old brain, and is said as such.
   */
  missingProfile: string | null;
  /** His saved pick is on file, but the voice speaking now cannot (or did not) honour it. */
  pickIgnored: boolean;
  reload(): void;
  /** Persist a pick (null clears it). Caller must respect overrideSupported. */
  select(id: string | null): void;
}

// Two very different "we still don't know" cases, so two cadences:
//   * the call FAILED (offline, stale token) — free to retry, nothing upstream
//     is touched, and a reconnect should light the rail without a restart;
//   * the call SUCCEEDED but the brain never named its voice (old deployment) —
//     only a redeploy changes that answer, and every attempt costs a real
//     ElevenLabs voices.search on the brain's key, so it backs off hard and
//     gives up. The picker's REFRESH is the manual way back.
// A MISSING VOICEBOX PROFILE is neither: the relay answers from memory (free)
// and the answer changes the moment he creates or renames the profile, so it
// is re-asked on the failed-call cadence and never parked for ten minutes.
const RETRY_FAILED_MS = 60_000;
const RETRY_OLD_BRAIN_MS = 600_000;
const RETRY_OLD_BRAIN_MAX = 6;

/**
 * Can the voice speaking now honour his saved pick? KEYED ON THE PROVIDER,
 * because a pick belongs to one: a Voicebox profile id means nothing to
 * ElevenLabs, an ElevenLabs id means nothing to Voicebox, and the brain
 * ignores either across that line (X-EVE-Voice-Override: ignored) and speaks
 * her configured voice — while the rail went on naming the pick.
 *   voicebox   — the pick must be one of the profiles his Voicebox reported;
 *   elevenlabs — the pick must be an ElevenLabs id (20 alphanumerics);
 *   not said   — an older brain: as before, trusted once it proved overrides.
 * Whatever the shape says, a line that came back "ignored" for this very pick
 * from this very provider is the last word, until a later line says otherwise.
 */
export function pickHonoured(
  provider: VoiceIdentity["provider"],
  pick: string,
  voices: VoiceOption[],
  served: ServedVoice | null,
): boolean {
  const p = pick.toLowerCase();
  if (served && served.provider === provider && served.ignored && served.pick?.toLowerCase() === p) return false;
  if (provider === "voicebox") return voices.some((v) => v.id.toLowerCase() === p);
  if (provider === "elevenlabs") return /^[A-Za-z0-9]{20}$/.test(pick);
  return true;
}

/** Everything the rail and the picker print, from one answer. Pure. */
export function resolveIdentity(
  list: VoiceList | null,
  selectedId: string | null,
  served: ServedVoice | null,
): Omit<VoiceIdentity, "loading" | "error" | "selectedId" | "reload" | "select"> {
  const voices = list?.voices ?? [];
  const provider = list?.provider ?? null;
  const configuredVoiceId = list?.configuredVoiceId ?? null;
  const named = typeof list?.configuredVoiceName === "string" ? list.configuredVoiceName.trim() : "";
  const missingProfile = list?.ok && !configuredVoiceId && named ? named : null;
  const overrideSupported = !!configuredVoiceId || !!missingProfile;
  const pickOk = overrideSupported && !!selectedId && pickHonoured(provider, selectedId, voices, served);
  const usingOverride = pickOk && selectedId !== configuredVoiceId;
  const effectiveId = (pickOk ? selectedId : null) ?? configuredVoiceId;
  const match = effectiveId ? voices.find((v) => v.id === effectiveId) : undefined;
  return {
    voices,
    configuredVoiceId,
    overrideSupported,
    effectiveId: effectiveId ?? null,
    effectiveName: match?.name ?? null,
    usingOverride,
    provider,
    missingProfile,
    pickIgnored: overrideSupported && !!selectedId && !pickOk,
  };
}

export function useVoiceIdentity(): VoiceIdentity {
  const [list, setList] = useState<VoiceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [selectedId, setSelected] = useState<string | null>(() => selectedVoiceId());
  const [served, setServed] = useState<ServedVoice | null>(() => lastServedVoice());
  const [tick, setTick] = useState(0);
  const [oldBrainTries, setOldBrainTries] = useState(0);
  const alive = useRef(true);
  const listRef = useRef<VoiceList | null>(null);
  listRef.current = list;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // His pick can change in ANOTHER window (settings lives in the deck, the
  // summon panel speaks) — follow it rather than caching it once. The same
  // event carries "who last actually spoke" (voicePref SERVED_VOICE_KEY).
  useEffect(
    () =>
      onVoicePrefChange(() => {
        setSelected(selectedVoiceId());
        setServed(lastServedVoice());
      }),
    [],
  );

  useEffect(() => {
    let dead = false;
    setLoading(true);
    void (async () => {
      let r: VoiceList;
      try {
        r = await window.eve.voices();
      } catch (err) {
        r = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      if (dead || !alive.current) return;
      setLoading(false);
      if (r.ok) {
        setList(r);
        setFailed(null);
      } else {
        setList(null);
        setFailed(r.error ?? "her voice list is unreachable");
      }
    })();
    return () => {
      dead = true;
    };
  }, [tick]);

  const reload = useCallback(() => {
    setOldBrainTries(0);
    setTick((t) => t + 1);
  }, []);

  // THE CONNECTOR WATCH. Her brain's "voice" connector rides the same /state
  // push the rest of the deck reads; when its connected flag or its detail
  // changes (provider flip, Voicebox up/down, profile found/lost), the list
  // is asked for again — once the change has held VOICE_CONNECTOR_SETTLE_MS, so a
  // flapping connector costs one question, not one per flap. The first
  // reading only records: the mount-time fetch above already answers it.
  useEffect(() => {
    let seenKey: string | null | undefined;
    let settle: number | null = null;
    const seen = (connectors: ConnectorStatus[] | undefined): void => {
      const key = voiceConnectorKey(connectors);
      const prev = seenKey;
      seenKey = key;
      if (prev === undefined || prev === key) return;
      if (settle !== null) window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        settle = null;
        if (!alive.current) return;
        setOldBrainTries(0);
        setTick((n) => n + 1);
      }, VOICE_CONNECTOR_SETTLE_MS);
    };
    void window.eve.state.get().then(
      (u) => seen(u.state.connectors),
      () => undefined, // a dead bridge: the retry cadence below still runs
    );
    const unsub = window.eve.onStateUpdate((u) => seen(u.state.connectors));
    return () => {
      if (settle !== null) window.clearTimeout(settle);
      unsub();
    };
  }, []);

  // A line just came back from a DIFFERENT provider than the list on hand:
  // the voice flipped between /state polls. Ask again now. Keyed on the
  // measurement only (the list is read through a ref), so a list that still
  // disagrees afterwards is asked once, not in a loop.
  useEffect(() => {
    const p = listRef.current?.provider;
    if (!served || !p || served.provider === p) return;
    setOldBrainTries(0);
    setTick((n) => n + 1);
  }, [served]);

  // Keep trying quietly while there is nothing true to show; stop the moment
  // the brain answers with a configured voice (a later change on the voice
  // connector, or a line from another provider, asks again — see above).
  const resolved = !!list?.configuredVoiceId;
  const missing = !!list && !list.configuredVoiceId && !!list.configuredVoiceName?.trim();
  const oldBrain = !!list && !list.configuredVoiceId && !missing;
  useEffect(() => {
    if (resolved) return;
    if (oldBrain && oldBrainTries >= RETRY_OLD_BRAIN_MAX) return;
    const delay = oldBrain ? RETRY_OLD_BRAIN_MS : RETRY_FAILED_MS;
    const t = window.setTimeout(() => {
      if (oldBrain) setOldBrainTries((n) => n + 1);
      setTick((n) => n + 1);
    }, delay);
    return () => window.clearTimeout(t);
  }, [oldBrain, oldBrainTries, resolved, tick]);

  const select = useCallback((id: string | null) => {
    setSelectedVoiceId(id);
    setSelected(id);
  }, []);

  return useMemo<VoiceIdentity>(
    () => ({
      loading,
      error: failed,
      selectedId,
      ...resolveIdentity(list, selectedId, served),
      reload,
      select,
    }),
    [failed, list, loading, reload, select, selectedId, served],
  );
}
