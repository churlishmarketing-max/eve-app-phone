import { BRAIN_URL } from "./config";
import { brainToken } from "./tokenStore";

// ---- THE WIRE TYPES COME FROM THE SHARED CONTRACT (S1, 2026-09-06) ----
//
// This file used to declare its own EveState/PendingConfirm/job row. That copy
// predated the dispatcher: its `jobs[]` was `{id, agent?, title, status}` with
// no unit, no tier, no result and no confirm linkage, so the phone could not
// have rendered a dispatched job even if it had been handed one. The types now
// come from desktop/src/shared/contract.ts — the same file the desktop reads —
// and are re-exported here so every existing importer of "./eveApi" is
// unchanged. The BODY (/vitals) types below stay local: the contract's copy of
// them is measurably looser than this screen needs.
import type {
  ConnectorStatus,
  EveState,
  FleetBlock,
  FleetUnitRow,
  JobFrame,
  JobRow,
  PendingConfirm,
  VoiceList,
} from "@shared/contract";

export type { ConnectorStatus, EveState, FleetBlock, FleetUnitRow, JobFrame, JobRow, PendingConfirm, VoiceList };

// ---- live state for Today/Ops (Phase 2–3; 05 §4) ----

/**
 * WHAT THE POLL ACTUALLY LEARNED. Three facts, not one:
 *   state      — the body, or the offline shell
 *   fetchedAt  — when it landed (the jobs merge needs it: a `job` frame older
 *                than the poll is history the poll already knows about)
 *   error      — WHY it is a shell, in words. `{online:false}` alone cannot
 *                tell a dead brain from a refused token from a 500 on /state,
 *                and those are three different things for him to do about.
 */
export interface StateRead {
  state: EveState;
  fetchedAt: string;
  error: string | null;
}

function linkFailure(status: number): string {
  if (status === 401) return "unauthorized — her brain refused this token";
  if (status === 404) return "her brain has no /state route — it is older than this app";
  if (status >= 500) return `her brain answered ${status} on /state — the route failed, not the link`;
  return `her brain answered ${status} on /state`;
}

export async function fetchState(): Promise<StateRead> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(`${BRAIN_URL}/state`, {
      headers: { Authorization: `Bearer ${brainToken()}` },
    });
    if (!res.ok) return { state: { online: false }, fetchedAt, error: linkFailure(res.status) };
    const state = (await res.json()) as EveState;
    // THE THIRD FAILURE, and the one that reads most like the first. A brain
    // whose Supabase is gone ANSWERS — 200, with the degraded three-key return
    // {online:false, pendingConfirms, connectors}. Saying "unreachable" there
    // would be false: she is reachable and her memory is not. Measured against
    // the real brain on a scratch .env, 2026-09-06.
    return {
      state,
      fetchedAt,
      error: state.online
        ? null
        : "her brain answered, but its memory spine is down — nothing below was measured",
    };
  } catch (err) {
    return {
      state: { online: false },
      fetchedAt,
      error: `no answer from her brain — ${err instanceof Error ? err.message : "network error"}`,
    };
  }
}

// ---- PAIRING (P1, 2026-09-06): prove the token before keeping it ----
//
// A token is only stored if HER BRAIN ANSWERS 200 TO IT. Not a shape check,
// not a length check, not a guess — one real GET /state carrying the candidate
// in an Authorization header, exactly the way every other call in this file
// carries it. If /state accepts it, every route in this file will.
//
// THE CANDIDATE IS PASSED IN, never read from the store. Nothing is written
// until this returns ok, so a failed paste leaves the device untouched.
//
// THREE OUTCOMES, THREE DIFFERENT WORDS — this is the whole point of the
// check. Measured against the production brain, 2026-09-06: a wrong token
// answers 401 {"error":"unauthorized"}; an unreachable brain throws in fetch
// before any status exists. Collapsing those into "pairing failed" would tell
// him to re-copy a token that was fine, or to check his signal when the token
// was wrong.
export type PairFailure = "unauthorized" | "unreachable" | "brain_error";

export type PairCheck =
  | { ok: true }
  | { ok: false; kind: PairFailure; say: string; detail: string };

export async function verifyBrainToken(candidate: string): Promise<PairCheck> {
  const token = candidate.trim();
  if (!token) {
    return {
      ok: false,
      kind: "unauthorized",
      say: "Nothing pasted yet.",
      detail: "the field is empty",
    };
  }
  let res: Response;
  try {
    res = await fetch(`${BRAIN_URL}/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    // No status. The socket never got an answer: DNS, no signal, the brain
    // asleep. Says nothing about whether the token is right.
    return {
      ok: false,
      kind: "unreachable",
      say: "Couldn't reach her brain. Nothing was checked — this says nothing about the token.",
      detail: err instanceof Error ? err.message : "network error",
    };
  }
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      kind: "unauthorized",
      say: "That token isn't hers. Her brain answered and refused it.",
      detail: `she reached her brain — it replied ${res.status}`,
    };
  }
  // Reached her, authenticated or not, and something else broke: a 500, a 404
  // from a brain older than this app. Not his token's fault either way.
  return {
    ok: false,
    kind: "brain_error",
    say: `Her brain answered ${res.status}. That's her end, not your token.`,
    detail: linkFailure(res.status),
  };
}

// ---- THE DISPATCHER (CONTRACT-v0.1 §4) — send a unit from his pocket ----
//
// POST /dispatch answers 200 with an acceptance or **422 with a full refusal
// body**. A client that treats non-2xx as an error string throws away `say`
// and `runnable` — the two fields the refusal exists to deliver — so this
// reads the body on both paths and only invents a shape when the socket itself
// failed. There is no default unit and no substitution: an unknown unit is a
// spoken refusal naming alternatives, and it is HER sentence that is shown.

export interface DispatchAccepted {
  ok: true;
  jobId: string;
  unit: string;
  name: string;
  status: string;
  tier?: "green" | "red";
  confirmId?: string;
  say: string;
}

export interface DispatchRefusal {
  ok: false;
  code: "unit_unknown" | "unit_not_runnable" | "missing_input" | "spine_offline" | "run_failed" | "no_answer";
  unit: string;
  name?: string;
  badge?: string;
  say: string;
  runnable: { key: string; name: string; does: string }[];
}

export type DispatchOutcome = DispatchAccepted | DispatchRefusal;

export async function dispatchUnit(input: {
  task: string;
  unit: string;
  why?: string;
  client?: string;
}): Promise<DispatchOutcome> {
  try {
    const res = await fetch(`${BRAIN_URL}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify({
        task: input.task,
        unit: input.unit,
        ...(input.why ? { why: input.why } : {}),
        ...(input.client ? { client: input.client } : {}),
      }),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body.ok === "boolean") return body as unknown as DispatchOutcome;
    // 400 (empty task / no unit) and 500 answer {error}, not the refusal shape.
    return {
      ok: false,
      code: "run_failed",
      unit: input.unit,
      say:
        typeof body?.error === "string"
          ? body.error
          : res.status === 401
            ? "unauthorized — her brain refused this token."
            : `her brain answered ${res.status} on /dispatch.`,
      runnable: [],
    };
  } catch (err) {
    return {
      ok: false,
      code: "no_answer",
      unit: input.unit,
      say: `no answer from her brain — ${err instanceof Error ? err.message : "network error"}`,
      runnable: [],
    };
  }
}

// The full card by id. /state WITHHOLDS payload.moves on file_batch cards
// (replacing it with a literal sentence), so this is the only way to read one
// whole — and the phone still must never claim to know a move list it was
// handed a placeholder for.
export async function fetchConfirm(id: string): Promise<PendingConfirm | null> {
  try {
    const res = await fetch(`${BRAIN_URL}/confirm/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${brainToken()}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as PendingConfirm;
  } catch {
    return null;
  }
}

// Streaming client for POST /chat. Reads the brain's SSE frames
// (event: <name>\ndata: <json>\n\n) and dispatches typed callbacks.
// Uses fetch + ReadableStream (works in modern browsers and Android WebView).

export interface StreamHandlers {
  onState?: (state: "thinking" | "speaking" | "idle") => void;
  onToken?: (text: string) => void;
  onTool?: (name: string) => void;
  onConfirm?: (confirm: PendingConfirm) => void; // RED-tier confirm cards (02 §6)
  // `event: job` — the dispatcher's fast path (CONTRACT-v0.1 §3). Best effort:
  // a transition the brain makes after the stream closes reaches this client
  // through the next /state poll, never through a frame. The frame arrives
  // BARE at the top level, not wrapped — the desktop's {type:"job", job}
  // envelope is its own IPC shape and is not what comes off this socket.
  onJob?: (job: JobFrame) => void;
  onDone?: (info: { conversationId: string; fullText: string }) => void;
  onError?: (message: string) => void;
}

// ---- RED-tier confirm resolution (02 §6): echo id + payload hash ----

// Approve on a client-executed confirm (send_sms) hands back a clientAction —
// the PHONE fires it, never the brain (05 §7).
export interface ConfirmResolution {
  ok: boolean;
  executed?: boolean;
  detail?: string;
  error?: string;
  clientAction?: { type: string; payload: Record<string, unknown> };
}

export async function resolveConfirm(
  id: string,
  hash: string,
  approve: boolean,
): Promise<ConfirmResolution> {
  try {
    const res = await fetch(`${BRAIN_URL}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify({ id, hash, approve }),
    });
    return (await res.json()) as ConfirmResolution;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

// ---- her senses (Phase 4, 05 §7): forward while the app is open ----
// Fire-and-forget: a missed forward is a transient loss by design (02 §7).

export async function forwardSms(msg: { address: string; body: string; dateMs: number }): Promise<void> {
  try {
    await fetch(`${BRAIN_URL}/senses/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify(msg),
    });
  } catch {
    /* offline — the buffer is transient anyway */
  }
}

export async function forwardNotification(n: {
  package: string;
  title: string | null;
  text: string | null;
  postTimeMs: number;
}): Promise<void> {
  try {
    await fetch(`${BRAIN_URL}/senses/notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify(n),
    });
  } catch {
    /* offline — the buffer is transient anyway */
  }
}

// The phone reports a confirmed SMS actually left the SIM.
export async function reportSmsSent(to: string, body: string): Promise<void> {
  try {
    await fetch(`${BRAIN_URL}/senses/sms-sent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify({ to, body }),
    });
  } catch {
    /* log-only endpoint — nothing depends on it */
  }
}

// ---- Ops actions route through the brain so tier rules apply (05 §4) ----

export async function actOnAttention(
  id: string,
  action: "approve" | "hold" | "dismiss",
): Promise<{ ok: boolean; outcome?: string; error?: string }> {
  try {
    const res = await fetch(`${BRAIN_URL}/attention/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify({ action }),
    });
    return (await res.json()) as { ok: boolean; outcome?: string; error?: string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

// ---- BODY tab (Phase 6): the vitals ledger ----
// The brain owns the calendar: every date here arrives pre-resolved as a
// string (today, on_date, dow) and the app only renders them. Nothing in
// this file computes a day — a phone in another timezone must not be able
// to desync a streak.

export interface VitalsCheckin {
  on_date: string;
  energy: number | null;
  sleep_hours: number | null;
  note: string | null;
}

// One cell of the 7-day strip, oldest → newest. `trained` is the tick of the
// slot:"checkin" habit named Trained; `calls_ok` is the floor's own answer.
export interface VitalsDay {
  on_date: string;
  dow: string;
  energy: number | null;
  trained: boolean;
  calls_ok: boolean;
}

// slot is presentation only: "checkin" rows draw as the check-in card's
// checkboxes, "habit" rows draw in NON-NEGOTIABLE HABITS with a streak.
export interface VitalsHabit {
  id: string;
  name: string;
  cadence: string;
  slot: "habit" | "checkin";
  sort_order: number;
  done_today: boolean;
  streak: number;
  days: string[];
}

// Every field but `online` is optional: a brain without the /vitals route
// yields an empty screen, never a crash.
export interface Vitals {
  online: boolean;
  today?: string;
  checkin?: VitalsCheckin | null;
  week?: VitalsDay[];
  habits?: VitalsHabit[];
  floor?: { count: number; goal: number };
  floorHistorySource?: string;
}

export type VitalsWrite = { ok: boolean; error?: string };

export async function fetchVitals(days = 7): Promise<Vitals> {
  try {
    const res = await fetch(`${BRAIN_URL}/vitals?days=${days}`, {
      headers: { Authorization: `Bearer ${brainToken()}` },
    });
    if (!res.ok) return { online: false };
    return (await res.json()) as Vitals;
  } catch {
    return { online: false };
  }
}

// Partial patch — omitted fields are left alone, so a tap and a line she
// captured in chat compose into one row instead of clobbering each other.
export async function logCheckin(patch: {
  energy?: number;
  sleepHours?: number;
  note?: string;
}): Promise<VitalsWrite> {
  try {
    const res = await fetch(`${BRAIN_URL}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify(patch),
    });
    return (await res.json()) as VitalsWrite;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

export async function tickRoutine(id: string, onDate?: string): Promise<VitalsWrite> {
  try {
    const res = await fetch(`${BRAIN_URL}/routine/${id}/tick`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify(onDate ? { onDate } : {}),
    });
    return (await res.json()) as VitalsWrite;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

export async function untickRoutine(id: string, onDate?: string): Promise<VitalsWrite> {
  try {
    const res = await fetch(`${BRAIN_URL}/routine/${id}/untick`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify(onDate ? { onDate } : {}),
    });
    return (await res.json()) as VitalsWrite;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

export async function createRoutine(name: string): Promise<VitalsWrite> {
  try {
    const res = await fetch(`${BRAIN_URL}/routine`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify({ name }),
    });
    return (await res.json()) as VitalsWrite;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

// ---- manual job kick (Today § RUN HER DAY) ----
// The brain owns the cadence (04 §1) — this only fires one of her real jobs
// NOW, on demand. force bypasses the once-a-day guard so a manual tap always
// does something visible. No scripted pings: whatever comes back is the truth.
export async function runJob(
  job: "morning_brief" | "closeout" | "pulse_sweep" | "floor_check" | "week_preview",
  force = true,
): Promise<{ ok: boolean; reason?: string; error?: string }> {
  try {
    const res = await fetch(`${BRAIN_URL}/job`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify({ job, force }),
    });
    return (await res.json()) as { ok: boolean; reason?: string; error?: string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

// ---- voice loop (05 §3): mic blob → transcript; text → spoken audio ----

export async function transcribeAudio(
  blob: Blob,
): Promise<{ ok: boolean; transcript?: string; error?: string }> {
  try {
    const res = await fetch(`${BRAIN_URL}/voice/transcribe`, {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm", Authorization: `Bearer ${brainToken()}` },
      body: blob,
    });
    return (await res.json()) as { ok: boolean; transcript?: string; error?: string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

// ---- wardrobe (05 §5): renders live on the brain, served over LAN ----

export interface WardrobeLook {
  file: string;
  name: string;
  url: string;
}

export async function fetchWardrobe(): Promise<{ wearing: string | null; looks: WardrobeLook[] }> {
  try {
    const res = await fetch(`${BRAIN_URL}/wardrobe`);
    if (!res.ok) return { wearing: null, looks: [] };
    const j = (await res.json()) as { wearing?: string | null; looks: WardrobeLook[] };
    return { wearing: j.wearing ?? null, looks: j.looks ?? [] };
  } catch {
    return { wearing: null, looks: [] };
  }
}

// King's manual pick — writes the same brain-side truth her wear_look uses.
export async function postWear(file: string): Promise<void> {
  try {
    await fetch(`${BRAIN_URL}/wardrobe/wear`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}` },
      body: JSON.stringify({ file }),
    });
  } catch {
    /* offline — localStorage still holds his pick */
  }
}

// Her looks come off the Supabase CDN as absolute URLs; older brains served
// them brain-relative. Handle both so a stale brain doesn't blank her closet.
export function wardrobeImgUrl(look: WardrobeLook): string {
  return /^https?:\/\//i.test(look.url) ? look.url : `${BRAIN_URL}${look.url}`;
}

// THE VOICE RELAY OPT-IN. The brain serves her Voicebox voice (a WAV, relayed
// from EVE desktop) on /voice/speak and /voice/voices only to a client that
// sends this; any other client keeps ElevenLabs' mp3 while ELEVENLABS_API_KEY
// is set on Railway (brain voice-relay.ts acceptsVoicebox/relayServes). The
// reply reaches new Audio() as a blob URL whatever its type, so the phone opts
// in on BOTH calls — the voice the label NAMES must be the voice she SPEAKS in. The
// brain's CORS allow-list carries this header, or the preflight would refuse it.
const VOICE_ACCEPT = { "X-EVE-Voice-Accept": "voicebox" } as const;

// WHICH VOICE SHE IS ACTUALLY IN. The array is ElevenLabs' own order, not a
// ranking — voices[0] is a guess — so the name is resolved from
// `configuredVoiceId` or not printed at all. An ABSENT configuredVoiceId means
// the brain in front of us predates the field: it cannot say which voice is
// live and it will IGNORE a voiceId on /voice/speak. That absence is the
// capability flag, and this screen says so in words instead of naming a voice
// it did not measure. (The phone shipped the literal "VOICE: LARA".)
export async function fetchVoices(): Promise<VoiceList> {
  try {
    const res = await fetch(`${BRAIN_URL}/voice/voices`, {
      headers: { Authorization: `Bearer ${brainToken()}`, ...VOICE_ACCEPT },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return (await res.json()) as VoiceList;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

// WHAT POST /voice/speak ACTUALLY DID (voice relay contract v1, 2026-09-24).
// This used to return `string | null`, and the null was load-bearing in the
// worst way: relay-offline, Voicebox-down, no-profile, a render failure, a
// timeout and a busy queue were all the SAME value by the time they reached
// the caller — a silent text-only fallback with no honest word said. The
// brain's error body is {error, reason} on every non-2xx; this carries both
// through instead of collapsing them.
export type SpeakOutcome =
  | { ok: true; url: string }
  | { ok: false; error: string; reason?: string };

// `voiceId` overrides the brain's configured voice for THIS utterance only;
// the brain accepts either a 20-alnum ElevenLabs id or a UUID and rejects
// anything else with 400, so it is only ever sent when the brain itself named
// one (via fetchVoices' configuredVoiceId).
export async function speakText(
  text: string,
  voiceId?: string,
  signal?: AbortSignal,
): Promise<SpeakOutcome> {
  try {
    const res = await fetch(`${BRAIN_URL}/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${brainToken()}`, ...VOICE_ACCEPT },
      body: JSON.stringify(voiceId ? { text, voiceId } : { text }),
      signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string; reason?: string } | null;
      return {
        ok: false,
        error: typeof body?.error === "string" ? body.error : `HTTP ${res.status}`,
        reason: body?.reason,
      };
    }
    const blob = await res.blob();
    return { ok: true, url: URL.createObjectURL(blob) };
  } catch (err) {
    return {
      ok: false,
      error: `no answer from her brain — ${err instanceof Error ? err.message : "network error"}`,
    };
  }
}

export async function streamChat(
  message: string,
  conversationId: string | null,
  surface: string,
  h: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BRAIN_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${brainToken()}`,
      },
      body: JSON.stringify({ message, conversationId, surface }),
      signal,
    });
  } catch (err) {
    h.onError?.(err instanceof Error ? err.message : "network error");
    return;
  }

  if (!res.ok || !res.body) {
    h.onError?.(
      res.status === 401 ? "unauthorized — check the brain token" : `HTTP ${res.status}`,
    );
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (err) {
      h.onError?.(err instanceof Error ? err.message : "stream error");
      return;
    }
    if (chunk.done) break;
    buf += decoder.decode(chunk.value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) dispatchFrame(frame, h);
  }
}

function dispatchFrame(frame: string, h: StreamHandlers): void {
  let event = "";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) data = line.slice(6);
  }
  if (!event) return;
  let payload: any = {};
  if (data) {
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
  }
  switch (event) {
    case "state":
      h.onState?.(payload.state);
      break;
    case "token":
      h.onToken?.(payload.text ?? "");
      break;
    case "tool":
      h.onTool?.(payload.name);
      break;
    case "confirm_request":
      h.onConfirm?.(payload);
      break;
    case "job":
      if (payload && typeof payload.id === "string") h.onJob?.(payload as JobFrame);
      break;
    case "done":
      h.onDone?.(payload);
      break;
    case "error":
      h.onError?.(payload.message ?? "unknown error");
      break;
  }
}
