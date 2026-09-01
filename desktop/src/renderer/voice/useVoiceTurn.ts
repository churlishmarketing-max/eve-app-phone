// owner: stream S4
//
// THE TURN. One state machine, shared by the deck's MicButton and the Summon
// panel, so there is exactly one implementation of "she heard me, she thought,
// she answered, she spoke".
//
//   idle -> listening -> transcribing -> thinking -> streaming -> speaking -> idle
//
// Laws it enforces (handoff §6):
//   * voice out ONLY when the turn came in by voice AND `SILENT AT THE DESK` is
//     off AND ElevenLabs is actually connected. Typed turns never speak.
//   * RED confirms never auto-speak — a confirm_request anywhere in the turn
//     kills TTS for that whole turn.
//   * silenced-but-would-have-spoken shows `SPEECH HELD — DESK IS SILENT` 3s.
//   * barge-in: starting a recording (mic, or the global hotkey) while she is
//     speaking stops the audio first, then listens.
//
// It never fakes an interim transcript. Between "stop" and Deepgram's answer
// the UI has nothing true to show, and says nothing.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatFrameEvent, ConnectorStatus, PendingConfirm, Transcript } from "@shared/contract";
import { voiceEvents } from "./events";
import * as playback from "./playback";
import { startRecording, type Recorder } from "./recorder";

// ---------------------------------------------------------------------------
// The shared conversation. FROZEN integration contract: the deck and the summon
// window are the same origin and read/write this exact key, so a turn started
// in Summon continues the deck's thread instead of opening a second one.
// ---------------------------------------------------------------------------

export const CONVERSATION_KEY = "eve.desktop.conversationId";

export function conversationId(): string | undefined {
  try {
    return localStorage.getItem(CONVERSATION_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function rememberConversation(id: string): void {
  if (!id) return;
  try {
    localStorage.setItem(CONVERSATION_KEY, id);
  } catch {
    /* private mode / storage full — the turn still worked */
  }
}

/** ElevenLabs is key "11" on the wire (fixtures + brain connectors.ts). */
export function ttsConnected(connectors: ConnectorStatus[] | undefined): boolean {
  return (connectors ?? []).some(
    (c) =>
      c.connected &&
      (c.key === "11" || c.key.toLowerCase() === "elevenlabs" || /eleven\s*labs/i.test(c.name ?? "")),
  );
}

export const NOTE_NO_CATCH = "DIDN'T CATCH THAT";
export const NOTE_SPEECH_HELD = "SPEECH HELD — DESK IS SILENT";
export const NOTE_NO_MIC = "MIC UNAVAILABLE — CHECK THE PERMISSION";

export type TurnPhase = "idle" | "listening" | "transcribing" | "thinking" | "streaming" | "speaking";

export interface VoiceTurnState {
  phase: TurnPhase;
  /** The real transcript, only once Deepgram answered. Never interim guesses. */
  transcript: string;
  reply: string;
  tool: string | null;
  confirm: PendingConfirm | null;
  /** Transient chrome line (also emitted on voiceEvents for the deck). */
  note: string | null;
  error: string | null;
}

export interface VoiceTurn extends VoiceTurnState {
  recording: boolean;
  busy: boolean;
  /** Barge-in, then open the mic. */
  start(): Promise<void>;
  /** Close the mic, transcribe, send. */
  stopAndSend(): Promise<void>;
  /** One toggle edge — what a tap and every PTT event mean. */
  toggle(): Promise<void>;
  /** Throw the recording away without sending. */
  cancel(): void;
  /** Type-to-switch: send text down the same conversation. */
  sendText(text: string): Promise<void>;
  /** Test seam: run the post-mic half of a turn against a supplied blob. */
  submitBlob(blob: Blob): Promise<void>;
  clearNote(): void;
  /** Ignore PTT events for `ms` — used when a turn auto-starts on summon-shown
   *  and the hotkey press that caused it is still on its way. */
  suppressPtt(ms?: number): void;
}

export interface VoiceTurnOptions {
  /** Which PTT surface this instance answers to; other surfaces are ignored. */
  surface?: "deck" | "summon";
  /** Subscribe to the global hotkey. Default true. */
  hotkey?: boolean;
}

const EMPTY: VoiceTurnState = {
  phase: "idle",
  transcript: "",
  reply: "",
  tool: null,
  confirm: null,
  note: null,
  error: null,
};

export function useVoiceTurn(opts: VoiceTurnOptions = {}): VoiceTurn {
  const { surface, hotkey = true } = opts;
  const [state, setState] = useState<VoiceTurnState>(EMPTY);

  const recorderRef = useRef<Recorder | null>(null);
  const startingRef = useRef(false);
  const pendingStopRef = useRef(false);
  const chatIdRef = useRef<string | null>(null);
  const replyRef = useRef("");
  const viaVoiceRef = useRef(false);
  const sawConfirmRef = useRef(false);
  const noteTimer = useRef<number | null>(null);
  /** Set when a turn was just auto-started; swallows the PTT echo of the same press. */
  const suppressPttUntil = useRef(0);

  const patch = useCallback((p: Partial<VoiceTurnState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  const clearNote = useCallback(() => {
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = null;
    setState((s) => (s.note === null ? s : { ...s, note: null }));
  }, []);

  /** One note, shown locally AND broadcast so the deck rail can echo it. */
  const note = useCallback(
    (text: string, ttlMs = 3000) => {
      voiceEvents.emit({ type: "transient-note", text, ttlMs });
      if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
      setState((s) => ({ ...s, note: text }));
      noteTimer.current = window.setTimeout(() => {
        noteTimer.current = null;
        setState((s) => (s.note === text ? { ...s, note: null } : s));
      }, ttlMs);
    },
    [],
  );

  const goIdle = useCallback(() => {
    patch({ phase: "idle" });
    voiceEvents.emit({ type: "mode", mode: "idle" });
  }, [patch]);

  // -------------------------------------------------------------------------
  // The end of a turn: the TTS gate.
  // -------------------------------------------------------------------------

  const finishTurn = useCallback(
    async (convId: string, fullText: string) => {
      chatIdRef.current = null;
      if (convId) rememberConversation(convId);

      const viaVoice = viaVoiceRef.current;
      const hadConfirm = sawConfirmRef.current;
      if (!viaVoice || hadConfirm || !fullText.trim()) {
        // RED confirms never auto-speak; typed turns never speak.
        goIdle();
        return;
      }

      let silent = false;
      let connectors: ConnectorStatus[] | undefined;
      try {
        const [cfg, upd] = await Promise.all([window.eve.config.get(), window.eve.state.get()]);
        silent = cfg.silentAtDesk === true;
        connectors = upd.state.connectors;
      } catch {
        // Cannot prove she is allowed to speak -> she does not speak.
        goIdle();
        return;
      }

      if (silent) {
        note(NOTE_SPEECH_HELD);
        goIdle();
        return;
      }
      if (!ttsConnected(connectors)) {
        goIdle();
        return;
      }

      patch({ phase: "speaking" });
      const spoke = await playback.speak(fullText); // emits speaking -> idle itself
      patch({ phase: "idle" });

      // NO MORE SILENT FAILURE (2026-09-01). Her reply is on screen either way
      // — voice-out degrading to text is still the law — but the DESK must not
      // stay quiet about the fact that she TRIED to speak and no sound came
      // out. Before this, playback.speak()'s answer was discarded right here,
      // so the only place in the whole app that could report a voice failure
      // was the settings audition — which he only reaches if he already
      // suspects the voice. That is how a ten-hour outage stays invisible.
      //
      // A barge-in is not a failure: he stopped her on purpose.
      if (!spoke.played && spoke.reason !== "stopped") {
        note(
          `SHE TRIED TO SPEAK AND NOTHING CAME OUT — ${spoke.message.toUpperCase()}${
            spoke.remedy ? ` ${spoke.remedy.toUpperCase()}` : " SETTINGS > VOICE > SPEAKER TEST WILL SAY WHY."
          }`,
          9000,
        );
      } else if (spoke.notices.length > 0) {
        // She played, but not the way he asked — his output device is gone.
        note(spoke.notices[0].toUpperCase(), 7000);
      }
    },
    [goIdle, note, patch],
  );

  // -------------------------------------------------------------------------
  // Frames for OUR chatId only.
  // -------------------------------------------------------------------------

  useEffect(() => {
    const un = window.eve.onChatFrame((e: ChatFrameEvent) => {
      if (!chatIdRef.current || e.chatId !== chatIdRef.current) return;
      const f = e.frame;
      switch (f.type) {
        case "state":
          if (f.state === "thinking") patch({ phase: "thinking" });
          break;
        case "tool":
          patch({ tool: f.name });
          break;
        case "token":
          replyRef.current += f.text;
          patch({ phase: "streaming", reply: replyRef.current });
          break;
        case "confirm_request":
          sawConfirmRef.current = true;
          patch({ confirm: f.confirm });
          break;
        case "done":
          patch({ reply: f.fullText || replyRef.current });
          void finishTurn(f.conversationId, f.fullText || replyRef.current);
          break;
        case "error":
          chatIdRef.current = null;
          patch({ error: f.message });
          goIdle();
          break;
      }
    });
    return un;
  }, [finishTurn, goIdle, patch]);

  // -------------------------------------------------------------------------
  // Send
  // -------------------------------------------------------------------------

  const send = useCallback(
    async (text: string, viaVoice: boolean) => {
      const message = text.trim();
      if (!message) return;
      viaVoiceRef.current = viaVoice;
      sawConfirmRef.current = false;
      replyRef.current = "";
      setState((s) => ({
        ...s,
        phase: "thinking",
        transcript: message,
        reply: "",
        tool: null,
        confirm: null,
        error: null,
      }));

      let chatId = "";
      try {
        const started = await window.eve.chat.start({
          message,
          viaVoice,
          ...(conversationId() ? { conversationId: conversationId() } : {}),
        });
        chatId = started.chatId;
      } catch (err) {
        patch({ error: err instanceof Error ? err.message : String(err) });
        goIdle();
        return;
      }
      chatIdRef.current = chatId;
      // DEVIATION, stated: the spec asks for user-turn "immediately BEFORE
      // chat.start", but chatId only exists once chat.start has answered. This
      // is the earliest instant the event can carry a real chatId, and it still
      // precedes every frame (frames are pushed after the invoke resolves).
      if (viaVoice) voiceEvents.emit({ type: "user-turn", text: message, chatId });
    },
    [goIdle, patch],
  );

  const submitBlob = useCallback(
    async (blob: Blob) => {
      patch({ phase: "transcribing" });
      let r: Transcript;
      try {
        r = await window.eve.voice.transcribe(await blob.arrayBuffer(), blob.type || "audio/webm");
      } catch (err) {
        r = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      const text = r.ok ? (r.transcript ?? "").trim() : "";
      if (!text) {
        note(NOTE_NO_CATCH);
        goIdle();
        return;
      }
      await send(text, true);
    },
    [goIdle, note, patch, send],
  );

  // -------------------------------------------------------------------------
  // Mic
  // -------------------------------------------------------------------------

  const stopAndSend = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) {
      // A release that beat getUserMedia: remember it and stop the moment the
      // mic opens, so a fast hold never leaves the recorder running.
      if (startingRef.current) pendingStopRef.current = true;
      return;
    }
    recorderRef.current = null;
    patch({ phase: "transcribing" });
    const blob = await rec.stop();
    await submitBlob(blob);
  }, [patch, submitBlob]);

  const start = useCallback(async () => {
    if (recorderRef.current || startingRef.current) return;
    playback.stop(); // BARGE-IN before anything else
    startingRef.current = true;
    pendingStopRef.current = false;
    try {
      const rec = await startRecording();
      recorderRef.current = rec;
      setState((s) => ({
        ...s,
        phase: "listening",
        transcript: "",
        reply: "",
        tool: null,
        confirm: null,
        error: null,
        note: null,
      }));
      voiceEvents.emit({ type: "mode", mode: "listening" });
    } catch {
      note(NOTE_NO_MIC);
      goIdle();
    } finally {
      startingRef.current = false;
    }
    if (pendingStopRef.current) {
      pendingStopRef.current = false;
      await stopAndSend();
    }
  }, [goIdle, note, stopAndSend]);

  const toggle = useCallback(async () => {
    if (recorderRef.current || startingRef.current) await stopAndSend();
    else await start();
  }, [start, stopAndSend]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    pendingStopRef.current = false;
    if (rec) {
      rec.cancel();
      goIdle();
    }
  }, [goIdle]);

  const sendText = useCallback(
    async (text: string) => {
      cancel();
      playback.stop();
      await send(text, false);
    },
    [cancel, send],
  );

  // -------------------------------------------------------------------------
  // The global hotkey. main.ts emits down/up ALTERNATELY off one accelerator
  // (there is no keyup in globalShortcut) — so every event is one toggle edge
  // and the phase label is advisory, never a gesture.
  // -------------------------------------------------------------------------

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    if (!hotkey) return;
    return window.eve.onPtt((e) => {
      if (surface && e.surface !== surface) return;
      if (Date.now() < suppressPttUntil.current) return;
      void toggleRef.current();
    });
  }, [hotkey, surface]);

  /** Summon calls this when it auto-starts a turn, to swallow the PTT echo. */
  const suppressPtt = useCallback((ms = 700) => {
    suppressPttUntil.current = Date.now() + ms;
  }, []);

  // Never leave the mic open when the surface unmounts.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      recorderRef.current = null;
      if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    };
  }, []);

  return {
    ...state,
    recording: state.phase === "listening",
    busy: state.phase !== "idle",
    start,
    stopAndSend,
    toggle,
    cancel,
    sendText,
    submitBlob,
    clearNote,
    suppressPtt,
  };
}
