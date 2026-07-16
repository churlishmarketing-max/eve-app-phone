import { DeepgramClient } from "@deepgram/sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Readable } from "node:stream";
import type { Response } from "express";

// Voice pipeline (05 §3): phone mic → /voice/transcribe (Deepgram) → /chat →
// /voice/speak (ElevenLabs) → phone audio. Keys live server-side ONLY (02 §7).
// v1 is per-utterance prerecorded STT — ⚑VERIFIED 2026-07-16: streaming WS
// buys ~1-2s on short utterances at the cost of a relay + keepalive +
// container-header gotchas; revisit with Deepgram Flux when she goes
// full-duplex conversational.
//
// ⚑VERIFIED SDK surfaces (July 2026 — both had breaking rewrites):
//   @deepgram/sdk v5: new DeepgramClient({apiKey}) + listen.v1.media.transcribeFile
//   @elevenlabs/elevenlabs-js v2: textToSpeech.stream() returns a WEB stream

let dg: DeepgramClient | null = null;
let el: ElevenLabsClient | null = null;

export function sttReady(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}

export function ttsReady(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

// EVE's imprinted voice (Character Bible §9). Until Brandon locks one, the
// default is "Rachel" — a premade voice every ElevenLabs account has.
function voiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
}

export async function transcribe(audio: Buffer, contentType: string): Promise<{ ok: boolean; transcript?: string; error?: string }> {
  if (!sttReady()) return { ok: false, error: "Deepgram not connected (DEEPGRAM_API_KEY not set)" };
  if (!dg) dg = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
  try {
    const data = await dg.listen.v1.media.transcribeFile(
      { data: audio, contentType: contentType || "audio/webm" },
      { model: "nova-3", smart_format: true, language: "en" },
    );
    // The response type is a union with the async-accepted variant; sync
    // transcription carries `results`.
    if (!("results" in data)) return { ok: false, error: "unexpected async response from Deepgram" };
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return { ok: true, transcript };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Streams mp3 straight through to the client as ElevenLabs generates it —
// playback can start on the first chunk (quality bar: audio ≤ ~2.5s).
export async function speakToResponse(text: string, res: Response): Promise<void> {
  if (!ttsReady()) {
    res.status(503).json({ error: "ElevenLabs not connected (ELEVENLABS_API_KEY not set)" });
    return;
  }
  if (!el) el = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  try {
    const stream = await el.textToSpeech.stream(voiceId(), {
      text,
      modelId: "eleven_flash_v2_5",
      outputFormat: "mp3_44100_128",
    });
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    const nodeStream = Readable.fromWeb(stream as import("node:stream/web").ReadableStream<Uint8Array>);
    nodeStream.on("error", (err) => {
      console.error("[voice] tts stream error", err);
      if (!res.headersSent) res.status(500).json({ error: "tts stream failed" });
      else res.end();
    });
    nodeStream.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
}

export async function listVoices(): Promise<{ ok: boolean; voices?: { id: string; name: string }[]; error?: string }> {
  if (!ttsReady()) return { ok: false, error: "ElevenLabs not connected" };
  if (!el) el = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  try {
    const r = await el.voices.search({ pageSize: 50 });
    return { ok: true, voices: (r.voices ?? []).map((v) => ({ id: v.voiceId ?? "", name: v.name ?? "(unnamed)" })) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
