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
//   * from his saved override IF the brain proved it honours overrides, or
//   * it is null and the rail prints "—".
//
// There is no third branch, and no guess.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VoiceList } from "@shared/contract";
import { onVoicePrefChange, selectedVoiceId, setSelectedVoiceId } from "./voicePref";

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
   * never assumed: it is exactly "did GET /voice/voices carry configuredVoiceId",
   * which only the redeployed brain does.
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
const RETRY_FAILED_MS = 60_000;
const RETRY_OLD_BRAIN_MS = 600_000;
const RETRY_OLD_BRAIN_MAX = 6;

export function useVoiceIdentity(): VoiceIdentity {
  const [list, setList] = useState<VoiceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [selectedId, setSelected] = useState<string | null>(() => selectedVoiceId());
  const [tick, setTick] = useState(0);
  const [oldBrainTries, setOldBrainTries] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // His pick can change in ANOTHER window (settings lives in the deck, the
  // summon panel speaks) — follow it rather than caching it once.
  useEffect(() => onVoicePrefChange(() => setSelected(selectedVoiceId())), []);

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

  // Keep trying quietly while there is nothing true to show; stop the moment
  // the brain answers with a configured voice.
  const resolved = !!list?.configuredVoiceId;
  const oldBrain = !!list && !list.configuredVoiceId;
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

  return useMemo<VoiceIdentity>(() => {
    const voices = list?.voices ?? [];
    const configuredVoiceId = list?.configuredVoiceId ?? null;
    const overrideSupported = !!configuredVoiceId;
    const usingOverride = overrideSupported && !!selectedId && selectedId !== configuredVoiceId;
    const effectiveId = (overrideSupported && selectedId) || configuredVoiceId;
    const match = effectiveId ? voices.find((v) => v.id === effectiveId) : undefined;
    return {
      loading,
      error: failed,
      voices,
      configuredVoiceId,
      overrideSupported,
      selectedId,
      effectiveId: effectiveId ?? null,
      effectiveName: match?.name ?? null,
      usingOverride,
      reload,
      select,
    };
  }, [failed, list, loading, reload, select, selectedId]);
}
