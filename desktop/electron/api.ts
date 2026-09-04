// ALL BRAIN HTTP. Every call in this file runs in the MAIN process; the
// renderer never sees a URL with a token on it, never sees the token, and
// never holds a fetch of its own.
//
// Endpoints verified against brain/src/index.ts on 2026-08-30 (route list at
// :86 /health, :110 /confirm, :160 /state, :169 /capture, :199 /dispatch,
// :212 /voice/transcribe, :228 /voice/speak, :236 /voice/voices, :245
// /wardrobe, :261 /wardrobe/wear, :269 /routine/:id/tick, :278 untick, :289
// /routine, :305 archive, :316 /vitals, :327 /checkin, :359 /attention/:id/
// action, :372 /job, :414 /chat).
//
// Auth: `Authorization: Bearer <token>` — the exact prefix the brain
// timing-safe-compares against (index.ts:65). /health and GET /wardrobe are
// unauthenticated by the brain's own middleware (index.ts:67-68); we still
// omit the header there so a missing token never blocks them.
//
// NOTHING IN HERE THROWS TO THE RENDERER. Every function returns a shape:
// {online:false} for reads, {ok:false, error} for writes. A dead link is a
// state to render, not an exception to catch.
//
// Owning stream: S1.

import { randomUUID } from "node:crypto";
import { brainUrl, isMock } from "./config.js";
import { authHeader } from "./secrets.js";
import type {
  ChatFrame,
  ChatState,
  ConfirmResolution,
  DestinationCheck,
  EveState,
  Health,
  PendingConfirm,
  SpeakAudio,
  Transcript,
  Vitals,
  VoiceList,
  Wardrobe,
  WriteResult,
} from "../src/shared/contract.js";
// The comparison itself is a PURE function in shared/, so the injection harness
// can hammer it directly without booting Electron, config or secrets.
import { attributionSuspect, destinationCheck } from "../src/shared/destination-check.js";
import { filterHandoffNames } from "../src/shared/handoff.js";
import * as fx from "../src/shared/fixtures.js";

// ---------------------------------------------------------------------------
// THE HANDOFF'S ONE DEPENDENCY, INJECTED (main.ts wires it to desk/index-store).
//
// The brain's `handoff` frame carries `{rev, ids}` — INTEGERS AND NOTHING ELSE.
// Turning those into filenames is the whole security property, so it is done
// HERE, on this machine, against this machine's own index, and never by reading
// a string the brain sent. A caption cannot write an integer that means a
// folder, and there is no string on that frame for one to hide in.
//
// It is injected rather than imported so this file stays a plain HTTP client
// with no desk dependency, and so the injection harness can drive the whole
// path with a fake index and no Electron.
//
// THE DEFAULT IS NULL, AND NULL MEANS NOTHING TRAVELS. A build that forgot to
// wire this hands him an empty list, which is visible; the alternative failure —
// passing the brain's own strings through — is the one that is not.
// ---------------------------------------------------------------------------

export interface DeskIndexAccess {
  /** The sanitised filename for this id IN THIS REVISION, or null. */
  nameFor(rev: string, i: number): string | null;
  /** Does the LIVE index still hold a file with this display name? */
  holdsName(name: string): boolean;
}

let deskIndex: DeskIndexAccess | null = null;

/** Wire (or, with null, unwire) the index the handoff resolves against. */
export function setDeskIndex(access: DeskIndexAccess | null): void {
  deskIndex = access;
}

// JSON calls get 10s. The SSE stream gets none — a long agent turn is normal.
const JSON_TIMEOUT_MS = 10_000;

function headers(json: boolean, auth = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (auth) {
    const a = authHeader();
    if (a) h.Authorization = a;
  }
  return h;
}

/** Scrub anything token-shaped out of a message before it can be surfaced. */
function safeMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/Bearer\s+\S+/gi, "Bearer <redacted>");
}

interface JsonOpts {
  method?: "GET" | "POST";
  body?: unknown;
  auth?: boolean;
  raw?: { buf: ArrayBuffer | Uint8Array; contentType: string };
}

/**
 * The single JSON door. Returns null on ANY failure (network, timeout,
 * non-2xx, unparseable body) — callers turn null into their own honest shape.
 */
async function callJson<T>(path: string, opts: JsonOpts = {}): Promise<{ data: T } | { error: string }> {
  const method = opts.method ?? "GET";
  const auth = opts.auth !== false;
  try {
    const init: RequestInit = {
      method,
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    };
    if (opts.raw) {
      init.headers = { ...headers(false, auth), "Content-Type": opts.raw.contentType };
      init.body = opts.raw.buf as BodyInit;
    } else if (opts.body !== undefined) {
      init.headers = headers(true, auth);
      init.body = JSON.stringify(opts.body);
    } else {
      init.headers = headers(false, auth);
    }
    const res = await fetch(`${brainUrl()}${path}`, init);
    if (!res.ok) {
      // 401 is the one status worth naming out loud: it is nearly always a
      // missing or stale token, and King can fix it in settings.
      return { error: res.status === 401 ? "unauthorized — check the brain token" : `HTTP ${res.status}` };
    }
    return { data: (await res.json()) as T };
  } catch (err) {
    return { error: safeMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------


/**
 * The check, remembered by confirm id, so the same card carries the same line
 * whether it is rendered from the live SSE frame or rehydrated from the 30 s
 * `/state` poll. Bounded and in-memory: this is a UI annotation, not a record.
 */
const DEST_CHECK_CAP = 50;
const destChecks = new Map<string, DestinationCheck>();

function rememberDestCheck(id: string, check: DestinationCheck): void {
  destChecks.delete(id);
  destChecks.set(id, check);
  while (destChecks.size > DEST_CHECK_CAP) {
    const oldest = destChecks.keys().next().value;
    if (oldest === undefined) break;
    destChecks.delete(oldest);
  }
}

/** Stamp a confirm frame with the check for the message that produced it. */
function stampConfirm(frame: ChatFrame, typedMessage: string): ChatFrame {
  if (frame.type !== "confirm_request") return frame;
  const c = frame.confirm;
  if (!c || c.kind !== "file_batch" || typeof c.id !== "string") return frame;
  const check = destinationCheck(typedMessage, c.payload);
  if (!check) return frame;
  // H4 — SHE SAYS THIS CAME FROM HIM. Only ever asked once the grade has
  // already caught something he did not name: a possessive in her reason is
  // ordinary prose on an honest turn, and it only becomes evidence when it is
  // wrapped around a destination or a name he demonstrably never chose. Main is
  // the only process holding both halves, and no model is in this loop.
  const dirty = check.ungrounded.length > 0 || (check.renamedUngrounded?.length ?? 0) > 0;
  const intent = (c.payload as { intent?: unknown } | null | undefined)?.intent;
  const graded: DestinationCheck =
    dirty && attributionSuspect(intent) ? { ...check, attributionSuspect: true } : check;
  rememberDestCheck(c.id, graded);
  return { type: "confirm_request", confirm: { ...c, destCheck: graded } };
}

/** Re-apply a remembered check to confirms that came back on `/state`. */
function applyDestChecks(confirms: PendingConfirm[] | undefined): PendingConfirm[] | undefined {
  if (!confirms || destChecks.size === 0) return confirms;
  return confirms.map((c) => {
    const check = destChecks.get(c.id);
    return check && !c.destCheck ? { ...c, destCheck: check } : c;
  });
}

export async function getHealth(): Promise<Health> {
  if (isMock()) return fx.mockHealth();
  // /health is unauthenticated (index.ts:68) — no token needed to prove reach.
  const r = await callJson<Omit<Health, "online">>("/health", { auth: false });
  if ("error" in r) return { online: false, ok: false, error: r.error };
  return { online: true, ...r.data };
}

export async function getState(): Promise<EveState> {
  if (isMock()) return fx.mockState();
  const r = await callJson<EveState>("/state");
  if ("error" in r) return { online: false };
  // A card rehydrated from the poll must carry the SAME provenance line the
  // live frame carried — otherwise the warning quietly disappears the moment
  // the modal re-mounts from /state.
  return { ...r.data, pendingConfirms: applyDestChecks(r.data.pendingConfirms) };
}

export async function getVitals(days = 7): Promise<Vitals> {
  if (isMock()) return fx.mockVitals(days);
  const n = Math.min(31, Math.max(1, Math.round(days)));
  const r = await callJson<Vitals>(`/vitals?days=${n}`);
  if ("error" in r) return { online: false, error: r.error };
  return r.data;
}

export async function getWardrobe(): Promise<Wardrobe> {
  if (isMock()) return fx.mockWardrobe();
  // GET /wardrobe is open by the brain's own rule (index.ts:67) — <img> tags
  // cannot send Authorization, so the portraits stay reachable without it.
  const r = await callJson<Partial<Wardrobe>>("/wardrobe", { auth: false });
  if ("error" in r) return { wearing: null, looks: [] };
  return { wearing: r.data.wearing ?? null, looks: r.data.looks ?? [] };
}

export async function getVoices(): Promise<VoiceList> {
  if (isMock()) return fx.mockVoices();
  const r = await callJson<VoiceList>("/voice/voices");
  if ("error" in r) return { ok: false, error: r.error };
  return r.data;
}

// ---------------------------------------------------------------------------
// Writes — every one returns {ok:false, error} rather than throwing.
// ---------------------------------------------------------------------------

function write(r: { data: WriteResult } | { error: string }): WriteResult {
  return "error" in r ? { ok: false, error: r.error } : r.data;
}

export async function postConfirm(id: string, hash: string, approve: boolean): Promise<ConfirmResolution> {
  if (isMock()) return fx.mockConfirmResolution(approve);
  const r = await callJson<ConfirmResolution>("/confirm", { method: "POST", body: { id, hash, approve } });
  if ("error" in r) return { ok: false, error: r.error };
  return r.data;
}

export async function postAttentionAction(
  id: string,
  action: "approve" | "hold" | "dismiss",
): Promise<WriteResult> {
  if (isMock()) return fx.mockAttentionResolution();
  return write(await callJson<WriteResult>(`/attention/${encodeURIComponent(id)}/action`, {
    method: "POST",
    body: { action },
  }));
}

export async function postCheckin(patch: {
  energy?: number;
  sleepHours?: number;
  note?: string;
}): Promise<WriteResult> {
  if (isMock()) return fx.mockWrite();
  return write(await callJson<WriteResult>("/checkin", { method: "POST", body: patch }));
}

export async function postRoutine(
  name: string,
  cadence = "daily",
  slot: "habit" | "checkin" = "habit",
): Promise<WriteResult> {
  if (isMock()) return fx.mockWrite();
  return write(await callJson<WriteResult>("/routine", { method: "POST", body: { name, cadence, slot } }));
}

export async function postRoutineTick(id: string, onDate?: string): Promise<WriteResult> {
  if (isMock()) return fx.mockWrite();
  return write(await callJson<WriteResult>(`/routine/${encodeURIComponent(id)}/tick`, {
    method: "POST",
    body: onDate ? { onDate } : {},
  }));
}

export async function postRoutineUntick(id: string, onDate?: string): Promise<WriteResult> {
  if (isMock()) return fx.mockWrite();
  return write(await callJson<WriteResult>(`/routine/${encodeURIComponent(id)}/untick`, {
    method: "POST",
    body: onDate ? { onDate } : {},
  }));
}

export async function postRoutineArchive(id: string): Promise<WriteResult> {
  if (isMock()) return fx.mockWrite();
  return write(await callJson<WriteResult>(`/routine/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    body: {},
  }));
}

export async function postJob(job: string, force = true): Promise<WriteResult> {
  if (isMock()) return fx.mockWrite();
  return write(await callJson<WriteResult>("/job", { method: "POST", body: { job, force } }));
}

export async function postDispatch(task: string, agent = "eve", client?: string): Promise<WriteResult> {
  if (isMock()) return fx.mockWrite();
  return write(await callJson<WriteResult>("/dispatch", {
    method: "POST",
    body: { task, agent, ...(client ? { client } : {}) },
  }));
}

export async function postCapture(text: string, sourceLink?: string): Promise<WriteResult> {
  if (isMock()) return fx.mockWrite();
  return write(await callJson<WriteResult>("/capture", {
    method: "POST",
    body: { text, ...(sourceLink ? { sourceLink } : {}) },
  }));
}

export async function postWear(file: string): Promise<WriteResult> {
  if (isMock()) return fx.mockWrite();
  return write(await callJson<WriteResult>("/wardrobe/wear", { method: "POST", body: { file } }));
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // brain's express.raw limit (index.ts:214)

export async function postTranscribe(buf: ArrayBuffer, mime = "audio/webm"): Promise<Transcript> {
  if (isMock()) return fx.mockTranscript();
  if (buf.byteLength === 0) return { ok: false, error: "empty audio" };
  if (buf.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, error: "clip is over the brain's 25MB limit — record a shorter turn" };
  }
  // The brain accepts audio/* or application/octet-stream and nothing else
  // (index.ts:214); anything odd gets normalised rather than 400'd.
  const ct = /^audio\//i.test(mime) || mime === "application/octet-stream" ? mime : "audio/webm";
  const r = await callJson<Transcript>("/voice/transcribe", {
    method: "POST",
    raw: { buf, contentType: ct },
  });
  if ("error" in r) return { ok: false, error: r.error };
  return r.data;
}

/** ElevenLabs voice ids are 20 alphanumeric chars — the brain rejects anything
 *  else with a 400, so a malformed id never costs a round trip. */
const VOICE_ID_RE = /^[A-Za-z0-9]{20}$/;

/**
 * text -> mp3 bytes, OR the honest reason there are none.
 *
 * THIS FUNCTION USED TO RETURN `ArrayBuffer | null` AND THAT WAS THE BUG.
 * A 401, a 503, a ten-second timeout, a dead socket and an empty 200 all
 * collapsed into the same `null`, and the only thing the UI could render from
 * a null was the phrase "NO AUDIO" — a word that names none of them. When her
 * voice went silent on 2026-09-01 the app could not tell King whether his
 * token had expired, whether ElevenLabs was unwired, or whether the wifi was
 * down. Voice-out degrading to text SILENTLY is still the rule for a REAL
 * TURN (the handoff's law, and finishTurn still honours it) — but the reason
 * must survive the trip so a diagnostic surface can show it. Silence toward
 * the speakers, never silence toward the operator.
 *
 * `voiceId` (optional) speaks this ONE utterance in another of her voices. It
 * is sent only when it is well formed; a brain that predates the field ignores
 * it, so the renderer must have already checked VoiceList.configuredVoiceId
 * before it claims that a preview is real — see contract.ts.
 */
export async function postSpeak(text: string, voiceId?: string): Promise<SpeakAudio> {
  if (isMock()) return { ok: true, audio: fx.mockSpeakAudio() };
  if (!text.trim()) return { ok: false, failure: "no-text", error: "there was nothing to say" };
  const override = voiceId && VOICE_ID_RE.test(voiceId) ? voiceId : undefined;
  let res: Response;
  try {
    res = await fetch(`${brainUrl()}/voice/speak`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ text: text.slice(0, 4000), ...(override ? { voiceId: override } : {}) }),
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    });
  } catch (err) {
    // TimeoutError is what AbortSignal.timeout throws; anything else is the
    // socket. Two different problems, two different sentences.
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return {
        ok: false,
        failure: "timeout",
        error: `her brain did not answer within ${Math.round(JSON_TIMEOUT_MS / 1000)}s`,
      };
    }
    return {
      ok: false,
      failure: "network",
      error: `could not reach her brain — ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!res.ok) {
    // The brain's own words are small, useful, and not a secret. A header is
    // never read here and the token is never echoed.
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300).replace(/\s+/g, " ").trim();
    } catch {
      detail = "";
    }
    const tail = detail ? ` — ${detail}` : "";
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        failure: "unauthorized",
        error: `her brain refused this desktop's token (HTTP ${res.status})${tail}`,
      };
    }
    if (res.status === 503) {
      return {
        ok: false,
        status: res.status,
        failure: "not-wired",
        error: `voice-out is not wired on her brain (HTTP 503 — ELEVENLABS_API_KEY is unset)${tail}`,
      };
    }
    return {
      ok: false,
      status: res.status,
      failure: "brain-error",
      error: `her brain answered HTTP ${res.status}${tail}`,
    };
  }

  const audio = await res.arrayBuffer();
  if (audio.byteLength === 0) {
    return {
      ok: false,
      status: res.status,
      failure: "empty-body",
      error: "her brain answered HTTP 200 with an empty body — no audio was generated",
    };
  }
  return { ok: true, status: res.status, audio };
}

// ---------------------------------------------------------------------------
// POST /chat — SSE. The one call with no timeout.
// ---------------------------------------------------------------------------

const inflight = new Map<string, AbortController>();

/** Parse one `event: <name>\ndata: <json>` frame into a typed ChatFrame. */
export function parseFrame(raw: string): ChatFrame | null {
  let event = "";
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) data = line.slice(6);
  }
  if (!event) return null;
  let p: Record<string, unknown> = {};
  if (data) {
    try {
      p = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return null; // a torn frame is dropped, never guessed at
    }
  }
  switch (event) {
    case "state": {
      const s = p.state;
      const state: ChatState = s === "thinking" || s === "speaking" || s === "idle" ? s : "idle";
      return { type: "state", state };
    }
    case "token":
      return { type: "token", text: typeof p.text === "string" ? p.text : "" };
    case "tool":
      return { type: "tool", name: typeof p.name === "string" ? p.name : "" };
    case "confirm_request":
      return { type: "confirm_request", confirm: p as unknown as PendingConfirm };
    case "done":
      return {
        type: "done",
        conversationId: typeof p.conversationId === "string" ? p.conversationId : "",
        fullText: typeof p.fullText === "string" ? p.fullText : "",
      };
    case "error":
      return { type: "error", message: typeof p.message === "string" ? p.message : "unknown error" };
    case "job":
      // DISPATCH v0.1 — the brain emits `event: job` at every transition of a
      // job this turn dispatched. Passed through whole; the renderer drops any
      // frame without a string id rather than guessing (useChat.ts).
      return { type: "job", job: p as unknown as Extract<ChatFrame, { type: "job" }>["job"] };
    case "handoff":
      // THE ONE FRAME THAT IS RESOLVED RATHER THAN PASSED THROUGH.
      //
      // Every other case above takes what the brain said and shapes it. This
      // one CANNOT, because the whole point of the handoff is that no string
      // from the brain — and therefore no string from a picture — reaches his
      // composer. The wire carries integers; `resolveHandoff` below turns them
      // into names using this machine's own index, and only names this machine
      // still holds survive.
      //
      // Torn or empty frames become null and are dropped, exactly like a job
      // frame with no id: a handoff with nothing in it is not an empty button,
      // it is no button.
      return resolveHandoffFrame(p);
    case "picture":
      // WHETHER FILING IS REFUSED IN THIS CONVERSATION, AND WHY.
      //
      // The brain emits this once per turn, before the model runs, off the
      // DURABLE bit on the conversation row (brain/src/taint.ts). Audit 5: the
      // fresh-thread exit used to appear only when she remembered to call
      // desk_handoff — and on a natural picture turn she asked a question
      // instead, and with filing off the refusal pointed him at a button that
      // cannot exist. The deck renders the exit off this frame now, so the way
      // out never depends on the model.
      //
      // Read as strictly as everything else here: believe nothing, narrow hard.
      // Every field is a constant chosen by brain/src/picture.ts or a status
      // read off his own store, but this side does not get to assume that.
      return readPictureFrame(p);
    default:
      return null;
  }
}

/** `{blocked, code, where, witness}` -> a frame, or null if it is not one. */
function readPictureFrame(p: Record<string, unknown>): ChatFrame | null {
  const code = p.code;
  const known = code === "P-TURN" || code === "P-SESSION" || code === "P-UNKNOWN" || code === "";
  if (!known) return null;
  const w = (p.witness ?? {}) as Record<string, unknown>;
  const st = w.status;
  const status: "clean" | "tainted" | "unknown" =
    st === "clean" || st === "tainted" || st === "unknown" ? st : "unknown";
  return {
    type: "picture",
    picture: {
      blocked: p.blocked === true,
      code,
      // Clamped: it prints on the panel, and it arrived over a wire.
      where: typeof p.where === "string" ? p.where.slice(0, 400) : "",
      witness: { status, source: typeof w.source === "string" ? w.source.slice(0, 40) : "" },
    },
  };
}

/**
 * `{rev, ids}` -> `{names, dropped}`, ENTIRELY FROM THIS MACHINE'S INDEX.
 *
 * Two lookups, on purpose, and they are not the same lookup twice:
 *   · `nameFor(rev, i)` is the id -> name resolution, through the revision the
 *     brain was actually looking at. This is the same door a filing plan comes
 *     home through (index-store.resolve, G-P1), so an id she was never shown
 *     resolves to nothing.
 *   · `holdsName(name)` asks the LIVE index whether that file is still there.
 *     A revision can be old; his disk is now. A name that has since gone is a
 *     name he would type into a message about a file that no longer exists.
 *
 * Everything that fails either one is DROPPED AND COUNTED. The count goes on
 * his screen, because a list that silently shortened itself is worse than a
 * short list.
 */
function resolveHandoffFrame(p: Record<string, unknown>): ChatFrame | null {
  const rev = typeof p.rev === "string" ? p.rev : "";
  const rawIds = Array.isArray(p.ids) ? p.ids : [];
  const ids: number[] = [];
  for (const n of rawIds) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) continue;
    ids.push(Math.floor(n));
  }
  if (ids.length === 0 || !rev) return null;
  // No index wired (a harness, a mock run, a build that forgot): NOTHING
  // travels. Fail closed and loudly — he sees the dropped count, not silence.
  const access = deskIndex;
  const resolved: (string | null)[] = access ? ids.map((i) => access.nameFor(rev, i)) : ids.map(() => null);
  const offer = filterHandoffNames(resolved, (name) => (access ? access.holdsName(name) : false));
  if (offer.names.length === 0) return null;
  return { type: "handoff", handoff: offer };
}

export interface ChatArgs {
  message: string;
  conversationId?: string | null;
  /** Purely informational for now — the brain has one /chat. S4 uses it to
   *  decide whether the reply is spoken (the editor rule, handoff §6). */
  viaVoice?: boolean;
  /**
   * NAMES HE CARRIED INTO THIS THREAD OFF THE HANDOFF (audit 5, B2).
   *
   * A STRUCTURED FIELD BESIDE `message`, never inside it. It used to be seeded
   * into his composer as text, which made it part of `message` — the one string
   * the brain appends to the turn as HIS OWN WORDS, outside every envelope. A
   * filename is attacker-chosen data and belongs in `<untrusted_filenames>`,
   * which is where the brain renders these.
   *
   * Every entry here was already resolved twice against THIS machine's index
   * (`resolveHandoffFrame` above) and filtered by `cleanHandoffName`. The brain
   * validates them again at its own door.
   */
  names?: string[];
  /**
   * FILING HANDS — the desk briefing (FILE-MARSHAL-SPEC hop 2).
   *
   * Carries ONE of two shapes, and main.ts decides which:
   *   · the DeskPack — he turned filing on and the desk built a briefing this
   *     instant. The brain gates both filing tools on this pack's PRESENCE,
   *     not on a flag.
   *   · a PackRefusal (`{ pack: null, code, why, roots? }`) — there was no
   *     briefing to build, and this says WHY. The brain's pack validator
   *     rejects it exactly as it rejects any non-pack, so filing stays off for
   *     the turn; a second validator reads the reason so `desk_scan` can answer
   *     "filing is switched off" instead of guessing which surface he is on.
   * Absent only when the desk was never initialised at all. (§3.8)
   *
   * It lives for exactly ONE turn — no cache on the brain, no endpoint to fetch
   * it from, no push channel a forged one could arrive through. (INJ-3)
   *
   * Typed `unknown` on purpose: this file is the wire, and the pack's shape is
   * owned by `desk/digest.ts` on one shore and re-validated hard by
   * `brain/src/desk.ts` on the other. api.ts does not get a vote.
   */
  desk?: unknown;
  /**
   * ONE PICTURE, THIS TURN. Raw base64 and a mime the BYTES agreed with, both
   * already checked in main. Absent — not null — when there is none, exactly
   * like `desk`: the brain reads a missing field as "no picture" and a turn
   * without one is byte-for-byte the turn it has always been.
   *
   * It is not stored anywhere. No temp file, no cache, and Supabase gets the
   * sentence "[he attached a PNG screenshot — the picture itself is not
   * stored]", never the bytes.
   */
  image?: { mime: string; data: string };
}

/**
 * Starts a turn and pumps frames to `emit`. Returns the chatId immediately;
 * the stream runs on its own. `abortChat(chatId)` cancels the fetch via
 * AbortController — closing the socket also halts the brain's agent loop
 * server-side (index.ts:447), so interruption is free.
 */
export function startChat(args: ChatArgs, emit: (frame: ChatFrame) => void): string {
  const chatId = randomUUID();
  const controller = new AbortController();
  inflight.set(chatId, controller);

  // EVERY frame out of this turn goes through here, so a file_batch confirm
  // cannot reach a card without being graded against the words he actually
  // typed. Main is the only place that holds both, and it is the only place
  // that is not downstream of the picture. (a3 / a5 / a9)
  const out = (frame: ChatFrame): void => emit(stampConfirm(frame, args.message));

  const finish = (): void => {
    inflight.delete(chatId);
  };

  if (isMock()) {
    const convId = args.conversationId || randomUUID();
    const timers: NodeJS.Timeout[] = [];
    for (const step of fx.mockChatFrames(args.message, convId)) {
      timers.push(setTimeout(() => {
        if (controller.signal.aborted) return;
        out(step.frame);
        if (step.frame.type === "done") finish();
      }, step.delayMs));
    }
    controller.signal.addEventListener("abort", () => {
      for (const t of timers) clearTimeout(t);
      finish();
    });
    return chatId;
  }

  void (async () => {
    let res: Response;
    try {
      res = await fetch(`${brainUrl()}/chat`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
          message: args.message,
          conversationId: args.conversationId ?? null,
          surface: "desktop",
          // ABSENT, not null, when filing hands are off or the pack was
          // withheld. `deskFromBody` returns null for a missing field and for
          // an odd one alike, and the feature is simply not there that turn.
          ...(args.desk ? { desk: args.desk } : {}),
          // Same discipline for the picture. `/chat` is the only route whose
          // body ceiling was raised for this (8 MB brain-side); every other
          // route still holds the 100 KB default.
          ...(args.image ? { image: args.image } : {}),
          // AND THE CARRIED NAMES, AS THEIR OWN FIELD. Absent when he carried
          // nothing, so an ordinary turn puts a byte-identical body on the wire.
          // They are NOT concatenated into `message` and never will be: that
          // string is the trusted half of the turn, and a filename is not his.
          ...(args.names && args.names.length > 0 ? { names: args.names } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (!controller.signal.aborted) emit({ type: "error", message: safeMessage(err) });
      finish();
      return;
    }

    if (!res.ok || !res.body) {
      emit({
        type: "error",
        message: res.status === 401 ? "unauthorized — check the brain token" : `HTTP ${res.status}`,
      });
      finish();
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
        // An abort lands here as an AbortError — that is a deliberate stop,
        // not a failure to report.
        if (!controller.signal.aborted) emit({ type: "error", message: safeMessage(err) });
        break;
      }
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const f of frames) {
        const parsed = parseFrame(f);
        if (parsed) out(parsed);
      }
    }
    finish();
  })();

  return chatId;
}

export function abortChat(chatId: string): boolean {
  const c = inflight.get(chatId);
  if (!c) return false;
  c.abort();
  inflight.delete(chatId);
  return true;
}

export function abortAllChats(): void {
  for (const [, c] of inflight) c.abort();
  inflight.clear();
}
