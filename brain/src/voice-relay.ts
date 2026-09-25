import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { randomUUID } from "node:crypto";
import {
  speakToResponse,
  listVoices,
  configuredVoiceId,
  isVoiceId,
  isElevenLabsVoiceId,
  isVoiceboxProfileId,
  elevenLabsAvailable,
} from "./voice.js";

// ---------------------------------------------------------------------------
// THE VOICE RELAY (Voice Relay Contract v1).
//
// Her voice is "Lara Eve", a cloned profile in Voicebox (Qwen3-TTS) running on
// Brandon's PC at 127.0.0.1:17493. This brain runs on Railway and cannot reach
// his loopback — and his loopback must never be opened to the internet to let
// it. So the arrow points the other way: EVE desktop's main process (which
// already holds his bearer) is a VOICE WORKER. It long-polls THIS module for a
// line to say, renders it on his local Voicebox, and posts the WAV back. The
// only traffic is outbound from his PC; no port is opened and Voicebox is never
// exposed. Clients (desktop renderer, phone) still just call POST /voice/speak.
//
// Everything here is in-memory and bounded: one status record, at most
// MAX_PENDING jobs, at most MAX_WAITERS held polls, and no audio kept a moment
// after it is handed to the client that asked for it. A brain restart forgets
// all of it, which is correct — the worker re-polls within seconds and a line
// that was mid-render when the brain died was going to fail anyway.
//
// HONESTY LAW, APPLIED: every way this can fail — PC off, Voicebox closed, no
// such voice, render error, render too slow, too many lines queued — is a
// DIFFERENT sentence with a machine-readable `reason`, because "voice
// unavailable" for all six would send him to fix the wrong thing.
//
// OPT-IN, SO NO OLD CLIENT IS BROKEN BY THIS DEPLOY: a client gets the relay
// only if it sends `X-EVE-Voice-Accept: voicebox` (the builds that know a WAV
// can take a minute on his CPU build and say why when it doesn't come). A
// client that doesn't — the phone APK already in his pocket — keeps the
// ElevenLabs path it had before this module existed, byte for byte, whenever
// ElevenLabs is there to serve it. Only when there is NO ElevenLabs does a
// non-opted-in caller get the relay, because the alternative is a 503.
// ---------------------------------------------------------------------------

export type VoiceReason =
  | "voice-offline"
  | "voicebox-down"
  | "no-profile"
  | "voicebox-failed"
  | "timeout"
  | "busy"
  | "bad-request";

/** Voicebox engines the brain may ask for. The worker checks the same list. */
export const VOICE_ENGINES = [
  "qwen",
  "qwen_custom_voice",
  "luxtts",
  "chatterbox",
  "chatterbox_turbo",
  "tada",
  "kokoro",
] as const;

const MAX_PENDING = 8; // jobs waiting for audio, queued or claimed
const MAX_WAITERS = 8; // held long-polls; the oldest is released past this
const MAX_WAIT_S = 25; // a poll is held at most this long
const MAX_PROFILES = 50;
const MAX_TEXT = 4000; // same ceiling /voice/speak has always applied
const DEFAULT_TIMEOUT_MS = 90_000;
const MIN_TTL_MS = 1000; // the least deadline a job is ever handed out with
const DEFAULT_FRESH_MS = 40_000;
const DEFAULT_PROFILE = "Lara Eve";
const DROPPED_KEEP_MS = 30_000; // a dropped job stays answerable this long past its deadline
const MAX_DROPPED = 32; // …and at most this many are remembered at once

export interface VoiceProfile {
  id: string;
  name: string;
}

interface VoiceboxReport {
  ok: boolean;
  error?: string;
  profiles: VoiceProfile[];
  gpu: boolean | null;
}

interface WorkerReport {
  worker: string;
  at: number;
  voicebox: VoiceboxReport;
}

type Outcome =
  | { kind: "audio"; wav: Buffer }
  // `say` is the WHOLE sentence he reads, written where the failure is known —
  // only there is it known whose it was (Voicebox's, EVE desktop's, or the
  // brain refusing what came back). "Voicebox failed…" on a failure that
  // wasn't Voicebox's sends him to fix a thing that isn't broken.
  | { kind: "fail"; say: string }
  // `claimed` travels with the timeout because the sentence depends on it: a
  // line the worker never picked up did not "take too long to render". So does
  // `voiceboxDown`: see Job.downReport.
  | { kind: "timeout"; claimed: boolean; voiceboxDown: VoiceboxReport | null }
  | { kind: "dropped" };

interface Job {
  id: string;
  text: string;
  profileId: string;
  engine: string;
  /** Relay clock (cfg.now) when it was queued, and the relay timeout it was
   *  queued under — together they are the deadline the worker is handed. */
  queuedAt: number;
  timeoutMs: number;
  claimed: boolean;
  /** Relay clock: the moment the ttlMs the worker was handed runs out. Set at
   *  claim; 0 while queued. */
  deadline: number;
  /** What the polls that came in WHILE IT SAT QUEUED said. A line nobody
   *  picked up because every poll said Voicebox wasn't answering was not
   *  "missed by EVE desktop" — the desktop was there, asking, every time. So
   *  the timeout names Voicebox, with the last error it was reported down with
   *  (downReport), but only if NO poll in that time could have taken work
   *  (sawOkPoll): a line left waiting behind another one is not Voicebox's
   *  fault. */
  sawOkPoll: boolean;
  downReport: VoiceboxReport | null;
  settle: (o: Outcome) => void;
}

/** A job the worker HOLDS whose requester is gone — hung up, or answered 504
 *  by the relay timeout. Only the deadline is kept: never the text, never
 *  audio. See the `dropped` map below. */
interface DroppedJob {
  deadline: number;
}

interface Waiter {
  res: Response;
  /** Its own poll said Voicebox answered. Only such a poll is handed a job. */
  canTake: boolean;
  timer: NodeJS.Timeout;
}

// The clock and the freshness window are injectable ONLY so the harness can
// age a worker past 40s without sleeping 40s. index.ts passes nothing.
const cfg = { now: () => Date.now(), freshMs: DEFAULT_FRESH_MS };

let last: WorkerReport | null = null;
// A worker has polled (bearer and all) at least once since boot. Never set
// back while the process lives — see voiceOutReady for why that is the point.
let everSeen = false;
const jobs = new Map<string, Job>(); // every job still owed an answer
const queue: Job[] = []; // unclaimed jobs, FIFO
const waiters: Waiter[] = []; // held polls, FIFO
// CLAIMED jobs whose requester is gone (hung up, or timed out by the relay).
// The worker is still rendering them — it has no way to know — so they are
// remembered for two things: GET /voice/relay/job/:id can say "dropped" (the
// worker stops the render instead of holding his CPU for a line nobody will
// hear), and the worker keeps its "working" credit until it answers or its
// deadline passes (see relayStatus). Bounded twice: DROPPED_KEEP_MS past the
// deadline, and MAX_DROPPED records, oldest forgotten first. An unclaimed job
// is never kept here — its id never left the brain, so nobody can ask for it.
const dropped = new Map<string, DroppedJob>();

function pruneDropped() {
  const now = cfg.now();
  for (const [id, d] of dropped) if (now > d.deadline + DROPPED_KEEP_MS) dropped.delete(id);
}

function rememberDropped(job: Job) {
  dropped.set(job.id, { deadline: job.deadline });
  while (dropped.size > MAX_DROPPED) dropped.delete(dropped.keys().next().value!);
}

// ---- config (read at call time, so a redeploy's env is the env) -----------

function relayTimeoutMs(): number {
  const n = Number(process.env.EVE_VOICE_RELAY_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/** The profile she speaks in: a Voicebox profile NAME or id. */
function profileSetting(): string {
  return (process.env.EVE_VOICE_PROFILE ?? "").trim() || DEFAULT_PROFILE;
}

// ONE ENGINE, AND IT IS chatterbox_turbo. Measured 2026-09-24 on Brandon's RTX
// 5070 (Voicebox CUDA build) with ONLY chatterbox_turbo loaded: a 6.5s Lara Eve
// line rendered in 2.6s and a 12s line in 4.6s. qwen took 18.3s and 35.4s for
// the same two lines. With BOTH engines loaded, VRAM sat at 11.4 of 12.2 GB,
// Windows spilled into system memory, and BOTH ran ~2.8x slower than real
// time. So the default is not only the faster engine — every line asks for
// the SAME engine, because a second one in VRAM is what slows all of them.
// An explicit EVE_VOICE_ENGINE still wins.
const DEFAULT_ENGINE = "chatterbox_turbo";

let warnedEngine = "";
function voiceEngine(): string {
  const raw = (process.env.EVE_VOICE_ENGINE ?? "").trim();
  if (!raw) return DEFAULT_ENGINE;
  if ((VOICE_ENGINES as readonly string[]).includes(raw)) return raw;
  // A typo in the env must not reach the worker as an engine it refuses on
  // every line. Say it once in the log and speak on the default.
  if (warnedEngine !== raw) {
    warnedEngine = raw;
    console.warn(`[voice] EVE_VOICE_ENGINE="${raw}" is not a Voicebox engine (${VOICE_ENGINES.join(", ")}); using ${DEFAULT_ENGINE}`);
  }
  return DEFAULT_ENGINE;
}

// ---- status ---------------------------------------------------------------

export interface RelayStatus {
  /** The worker made contact within the freshness window (a poll, a job
   *  handed to it, a result or fail it posted) — or it holds a job it hasn't
   *  answered yet. */
  seen: boolean;
  /** Seen AND its last poll said Voicebox answered. The only state that relays. */
  online: boolean;
  /** Since the worker's last contact. */
  ageMs: number | null;
  worker: string | null;
  voicebox: VoiceboxReport | null;
}

export function relayStatus(): RelayStatus {
  if (!last) return { seen: false, online: false, ageMs: null, worker: null, voicebox: null };
  const ageMs = Math.max(0, cfg.now() - last.at);
  // The worker does NOT poll while it renders, and on his CPU build a
  // one-second line takes ~30s. A job it has claimed and not yet answered is
  // proof it is there and working — so it counts as seen until that job
  // settles (audio, fail) or hits the relay timeout, which settles it too.
  // Without this, every long render read as "your PC isn't
  // connected" and the next line was refused or silently switched voice.
  // A job whose requester is GONE (hung up, or answered 504) is still being
  // rendered — the worker can't know until its next status check — so it keeps
  // the credit too, until the worker answers it (/result, /fail) or the
  // deadline it was handed passes.
  // Without this, hanging up at 20s of a 60s render read the PC as offline at
  // 41s and the next line was refused while Voicebox was plainly busy.
  pruneDropped();
  const now = cfg.now();
  const working = [...jobs.values()].some((j) => j.claimed) || [...dropped.values()].some((d) => now < d.deadline);
  const seen = ageMs <= cfg.freshMs || working;
  return { seen, online: seen && last.voicebox.ok === true, ageMs, worker: last.worker, voicebox: last.voicebox };
}

/** The worker proved it is there without a poll. Its last Voicebox report
 *  stands; only the clock moves. */
function touch() {
  if (last) last.at = cfg.now();
}

/** /health voiceReady.tts — does this brain HAVE a voice out at all? A
 *  CAPABILITY, not a live signal. /health is exempt from the bearer, so if tts
 *  followed the relay's live state, anyone who can reach the brain could watch
 *  it flip and read off when Brandon's PC is on and when EVE desktop is closed.
 *  So it says only: ElevenLabs is available, or a relay worker has reached this
 *  brain at least once since boot. The honest cost: tts can be true while a
 *  /voice/speak comes back 503 voice-offline — that answer carries its own
 *  reason. Whether his PC is there RIGHT NOW is said only behind the bearer
 *  (relayStatus: the "voice" connector, /voice/voices). */
export function voiceOutReady(): boolean {
  return elevenLabsAvailable() || everSeen;
}

/** Did this client say it takes Voicebox's WAV? (`X-EVE-Voice-Accept: voicebox`,
 *  a comma list, case-insensitive.) */
function acceptsVoicebox(req: Request): boolean {
  const h = req.get("X-EVE-Voice-Accept") ?? "";
  return h.split(",").some((t) => t.trim().toLowerCase() === "voicebox");
}

/** Does the relay speak for THIS client right now? Online, and either the
 *  client opted in or there is no ElevenLabs to give it instead. /voice/speak
 *  and /voice/voices both ask this, so the voice a client is SHOWN is the voice
 *  it will HEAR. */
function relayServes(st: RelayStatus, optedIn: boolean): boolean {
  return st.online && (optedIn || !elevenLabsAvailable());
}

// ---- the sentences he reads -------------------------------------------------

const trimStop = (s: string) => s.replace(/[\s.]+$/, "");

const SAY = {
  offline:
    "Her voice lives on your PC in Voicebox, and your PC isn't connected right now — EVE desktop is closed or offline.",
  down: (err?: string) =>
    `EVE desktop is on, but Voicebox isn't answering (${trimStop(err || "it gave no reason")}). Open Voicebox.`,
  noProfile: (name: string) => `Voicebox is running but has no voice named "${name}".`,
  failed: (err: string) => `Voicebox failed to render that line: ${trimStop(err)}.`,
  // EVE desktop's OWN failure (/fail with source "desktop": it closed
  // mid-render, its upload broke). The worker wrote it as a whole sentence
  // that names what broke; it goes out as it is, never under Voicebox's name.
  desktopFailed: (err: string) => `${trimStop(err)}.`,
  // The brain refusing what EVE desktop posted back. Voicebox may have
  // rendered the line perfectly; what failed is the trip up to the brain.
  notWav: "What came back from EVE desktop was not a WAV file.",
  tooBig: "The audio EVE desktop sent back was over 25MB — more than the brain takes.",
  brokeOff: "The audio upload from EVE desktop broke off.",
  // Split by what the brain actually KNOWS when the clock runs out. Telling him
  // "switch to the GPU" when the line was never picked up — or when his last
  // report said GPU — sends him to fix a thing that isn't broken.
  timeout: (ms: number, claimed: boolean, gpu: boolean | null) => {
    if (!claimed) return "EVE desktop didn't pick the line up in time — it may have just closed.";
    const s = ms / 1000;
    const n = s >= 10 ? Math.round(s) : Math.round(s * 10) / 10;
    if (gpu === false) return `Her voice took longer than ${n}s to render. Voicebox may be on its CPU build — switch it to the GPU.`;
    return `Voicebox took longer than ${n}s to render that line.`;
  },
  busy: "Her voice is backed up — too many lines waiting.",
};

/** Why the relay can't speak right now: seen-but-Voicebox-down, or not seen. */
function offlineSay(st: RelayStatus): { reason: VoiceReason; error: string } {
  if (st.seen && st.voicebox && !st.voicebox.ok) return { reason: "voicebox-down", error: SAY.down(st.voicebox.error) };
  return { reason: "voice-offline", error: SAY.offline };
}

function refuse(res: Response, status: number, reason: VoiceReason, error: string) {
  return res.status(status).json({ error, reason });
}

// ---- profile resolution -----------------------------------------------------

/** EVE_VOICE_PROFILE against what the worker last reported: exact id first,
 *  then case-insensitive trimmed name. null = no such voice in his Voicebox. */
function configuredProfile(profiles: VoiceProfile[]): VoiceProfile | null {
  const want = profileSetting();
  const byId = profiles.find((p) => p.id === want);
  if (byId) return byId;
  const w = want.toLowerCase();
  return profiles.find((p) => p.name.trim().toLowerCase() === w) ?? null;
}

/** A UUID override wins only if his Voicebox actually has that profile. */
function resolveProfile(
  profiles: VoiceProfile[],
  override: string | undefined,
): { profile: VoiceProfile | null; honoured: boolean } {
  if (isVoiceboxProfileId(override)) {
    const o = override.toLowerCase();
    const hit = profiles.find((p) => p.id.toLowerCase() === o);
    if (hit) return { profile: hit, honoured: true };
  }
  return { profile: configuredProfile(profiles), honoured: false };
}

// ---- the queue --------------------------------------------------------------

/** The worker's deadline for this line: the relay timeout minus the time it
 *  already sat in the queue, on the relay's clock. Without it the worker rendered
 *  on its own (longer) clock and could post audio for a line the brain had
 *  already answered 504 — a render nobody hears, holding his CPU from the next
 *  line. Never below MIN_TTL_MS: a job handed out in its last milliseconds must
 *  still carry a positive, usable number (0 or negative could read as "no
 *  deadline" or abort before the request is even sent); the brain's own timer
 *  still answers the requester on time either way. */
function ttlFor(job: Job): number {
  const queued = Math.max(0, cfg.now() - job.queuedAt); // a clock set back never adds time
  return Math.max(MIN_TTL_MS, Math.floor(job.timeoutMs - queued));
}

function claim(job: Job, res: Response) {
  job.claimed = true;
  // Handing out a job is contact: a poll held 20s before this line arrived
  // must not start its render already 20s stale.
  touch();
  const ttlMs = ttlFor(job);
  // The same number the worker renders against, on the relay's clock — so a
  // dropped job's "working" credit ends exactly when the worker's own abort does.
  job.deadline = cfg.now() + ttlMs;
  res.status(200).json({
    job: { id: job.id, text: job.text, profileId: job.profileId, engine: job.engine, ttlMs },
  });
}

/** Hand queued jobs to held polls, oldest to oldest. A poll whose connection
 *  already died is skipped, never handed a job it can't deliver — and so is a
 *  poll whose own report said Voicebox wasn't answering: it stays held (its
 *  worker keeps its cadence) and the job waits for a poll that can render it. */
function dispatch() {
  while (queue.length) {
    const i = waiters.findIndex((w) => w.canTake);
    if (i < 0) return;
    const [w] = waiters.splice(i, 1);
    clearTimeout(w.timer);
    if (w.res.destroyed || w.res.writableEnded) continue;
    claim(queue.shift()!, w.res);
  }
}

function dropWaiter(w: Waiter) {
  const i = waiters.indexOf(w);
  if (i >= 0) waiters.splice(i, 1);
  clearTimeout(w.timer);
}

// ---- request parsing --------------------------------------------------------

const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

function parseReport(b: unknown): { worker: string; voicebox: VoiceboxReport } | { error: string } {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { error: "poll body must be a JSON object {worker, voicebox}" };
  const { worker, voicebox } = b as Record<string, unknown>;
  if (typeof worker !== "string" || !worker.trim()) return { error: "worker (a non-empty string) is required" };
  if (!voicebox || typeof voicebox !== "object" || Array.isArray(voicebox)) return { error: "voicebox (an object) is required" };
  const v = voicebox as Record<string, unknown>;
  if (typeof v.ok !== "boolean") return { error: "voicebox.ok must be true or false" };
  if (v.error !== undefined && typeof v.error !== "string") return { error: "voicebox.error must be a string" };
  if (v.gpu !== undefined && v.gpu !== null && typeof v.gpu !== "boolean") return { error: "voicebox.gpu must be true, false or null" };
  const profiles: VoiceProfile[] = [];
  if (v.profiles !== undefined) {
    if (!Array.isArray(v.profiles)) return { error: "voicebox.profiles must be an array" };
    for (const p of v.profiles.slice(0, MAX_PROFILES)) {
      const r = p as Record<string, unknown> | null;
      // An id is refused rather than truncated: a clipped id names a different
      // (or no) voice, and the brain would then hand the worker a lie.
      if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id || r.id.length > 64 || typeof r.name !== "string") {
        return { error: "each voicebox profile needs a string id (≤64 chars) and a string name" };
      }
      profiles.push({ id: r.id, name: clamp(r.name, 100) });
    }
  }
  return {
    worker: clamp(worker.trim(), 40),
    voicebox: {
      ok: v.ok,
      ...(typeof v.error === "string" && v.error ? { error: clamp(v.error, 300) } : {}),
      profiles,
      gpu: (v.gpu as boolean | null | undefined) ?? null,
    },
  };
}

function parseWait(q: unknown): number {
  const n = typeof q === "string" && q.trim() !== "" ? Number(q) : NaN;
  if (!Number.isFinite(n)) return MAX_WAIT_S;
  return Math.min(Math.max(n, 0), MAX_WAIT_S);
}

const isWav = (b: unknown): b is Buffer =>
  Buffer.isBuffer(b) && b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WAVE";

// The WAV body parser, wrapped so a body that can't be read still ANSWERS the
// person waiting on it. A bare express.raw would throw past this route's error
// handling to Express's HTML 413 and leave the requester hanging until timeout.
const readWav = express.raw({ type: () => true, limit: "25mb" });
function rawWav(req: Request, res: Response, next: NextFunction) {
  readWav(req, res, (err?: unknown) => {
    if (!err) return next();
    const tooBig = (err as { type?: string }).type === "entity.too.large";
    const why = tooBig ? "the audio was over 25MB" : "the audio upload broke off";
    const job = jobs.get(String(req.params.id));
    // Not a Voicebox failure, so not worded as one (SAY.tooBig / brokeOff).
    // The worker's own answer below is unchanged.
    if (job?.claimed) job.settle({ kind: "fail", say: tooBig ? SAY.tooBig : SAY.brokeOff });
    if (!res.headersSent) res.status(tooBig ? 413 : 400).json({ error: why });
  });
}

// ---- the relay speak --------------------------------------------------------

async function relaySpeak(res: Response, text: string, override: string | undefined, st: RelayStatus) {
  const profiles = st.voicebox?.profiles ?? [];
  const { profile, honoured } = resolveProfile(profiles, override);
  // Nothing is queued for a voice that isn't there — the worker would only
  // refuse it 25 seconds later with a vaguer sentence.
  if (!profile) return refuse(res, 503, "no-profile", SAY.noProfile(profileSetting()));
  if (jobs.size >= MAX_PENDING) return refuse(res, 503, "busy", SAY.busy);
  if (res.destroyed) return; // he left while the body was being read

  const timeoutMs = relayTimeoutMs();
  const outcome = await new Promise<Outcome>((resolve) => {
    let done = false;
    const job: Job = {
      id: randomUUID(), // unguessable: the id is the only key to post audio for it
      text,
      profileId: profile.id,
      engine: voiceEngine(),
      queuedAt: cfg.now(),
      timeoutMs,
      claimed: false,
      deadline: 0,
      sawOkPoll: false,
      downReport: null,
      settle: (o) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        jobs.delete(job.id);
        const qi = queue.indexOf(job);
        if (qi >= 0) queue.splice(qi, 1);
        // Gone from under a worker that is still rendering it: remember it so
        // the worker's status check reads "dropped" and its answer is taken
        // (and thrown away) instead of refused.
        if (job.claimed && (o.kind === "dropped" || o.kind === "timeout")) rememberDropped(job);
        resolve(o);
      },
    };
    const timer = setTimeout(
      () =>
        job.settle({
          kind: "timeout",
          claimed: job.claimed,
          voiceboxDown: !job.claimed && !job.sawOkPoll ? job.downReport : null,
        }),
      timeoutMs,
    );
    jobs.set(job.id, job);
    queue.push(job);
    // The CLIENT hanging up drops the job: unclaimed, it leaves the queue so
    // the worker never renders a line nobody will hear; claimed, the worker's
    // next status check reads "dropped" and it stops, and audio that arrives
    // anyway is taken and thrown away. `close` without `finish` is a
    // disconnect; `close` after a delivered response is a no-op (done).
    res.on("close", () => {
      if (!res.writableFinished) job.settle({ kind: "dropped" });
    });
    dispatch();
  });

  if (outcome.kind === "dropped") return;
  if (outcome.kind === "timeout") {
    // Never handed out because every poll while it waited said Voicebox was
    // down: THAT is the sentence, not "EVE desktop didn't pick the line up".
    // Only while the desktop is still seen, though — SAY.down opens with "EVE
    // desktop is on", which the brain can't say of a desktop gone quiet past
    // the freshness window (the same rule offlineSay applies). The reason
    // stays "timeout": the relay's clock did run out.
    if (outcome.voiceboxDown && relayStatus().seen) {
      return refuse(res, 504, "timeout", SAY.down(outcome.voiceboxDown.error));
    }
    return refuse(res, 504, "timeout", SAY.timeout(timeoutMs, outcome.claimed, last?.voicebox.gpu ?? null));
  }
  // Every fail keeps "voicebox-failed": the desktop's RELAY_REASONS set is
  // closed, and an unknown reason there would lose the sentence. The sentence
  // itself says whose failure it was.
  if (outcome.kind === "fail") return refuse(res, 502, "voicebox-failed", outcome.say);
  res.status(200);
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-EVE-Voice", "voicebox");
  // An override that was asked for and not honoured is SAID, never swallowed:
  // an ElevenLabs id Voicebox can't speak in, or a UUID his Voicebox doesn't have.
  if (override !== undefined && !honoured) res.setHeader("X-EVE-Voice-Override", "ignored");
  res.setHeader("Content-Length", String(outcome.wav.length));
  res.end(outcome.wav);
}

// ---- /voice/voices and the connector ---------------------------------------

/** The GET /voice/voices payload, for whichever provider would speak for this
 *  client right now (see relayServes). */
export async function voicesPayload(optedIn: boolean): Promise<Record<string, unknown>> {
  const st = relayStatus();
  if (relayServes(st, optedIn)) {
    const profiles = st.voicebox?.profiles ?? [];
    const p = configuredProfile(profiles);
    return {
      ok: true,
      provider: "voicebox",
      voices: profiles,
      configuredVoiceId: p?.id ?? null,
      configuredVoiceName: p?.name ?? profileSetting(),
    };
  }
  if (elevenLabsAvailable()) {
    // The pre-relay payload, unchanged, plus which provider it came from.
    return { ...(await listVoices()), configuredVoiceId: configuredVoiceId(), provider: "elevenlabs" };
  }
  return { ok: false, provider: null, error: offlineSay(st).error, configuredVoiceId: null };
}

/** The "voice" connector. The old "elevenlabs" one stays beside it — old phone
 *  builds read that key (connectors.ts). */
export function voiceConnector(): { key: string; name: string; connected: boolean; detail: string } {
  const st = relayStatus();
  const el = elevenLabsAvailable();
  let detail: string;
  if (st.online) {
    const p = configuredProfile(st.voicebox?.profiles ?? []);
    const who = p ? p.name : `NO voice named "${profileSetting()}"`;
    const build = st.voicebox?.gpu === false ? " · CPU build (slow)" : st.voicebox?.gpu === true ? " · GPU" : "";
    detail = `Voicebox · ${who} · via EVE desktop · seen ${Math.round((st.ageMs ?? 0) / 1000)}s ago${build}`;
  } else if (el) {
    const why = st.seen ? `Voicebox not answering (${trimStop(st.voicebox?.error || "no reason given")})` : "EVE desktop not connected";
    detail = `ElevenLabs (fallback) — key set · ${why}`;
  } else {
    detail = offlineSay(st).error;
  }
  return { key: "voice", name: "Voice out", connected: st.online || el, detail };
}

/** The "voice" connector as /health shows it. /health is exempt from the
 *  bearer, and the live connector above says "seen 0s ago · CPU build" — read
 *  off an open route, that is "is Brandon's PC on right now" for anyone who
 *  asks. So /health gets the same CAPABILITY voiceReady.tts reports
 *  (voiceOutReady), and a detail that never moves. The live row stays on the
 *  bearer-gated /state, which is where both clients' speak gates read it. */
export const VOICE_HEALTH_DETAIL = "Voicebox relay (live status is behind sign-in)";
export function voiceCapabilityConnector(): { key: string; name: string; connected: boolean; detail: string } {
  return { key: "voice", name: "Voice out", connected: voiceOutReady(), detail: VOICE_HEALTH_DETAIL };
}

// ---- the routes -------------------------------------------------------------

export interface VoiceRelayOptions {
  /** Test clock. Default Date.now. */
  now?: () => number;
  /** How recent a poll must be to count as seen. Default 40s. */
  freshMs?: number;
}

/**
 * Mounts the relay endpoints plus POST /voice/speak and GET /voice/voices.
 * MUST be mounted AFTER the bearer middleware — nothing here is exempt, the
 * worker's endpoints least of all (a stranger who could poll would be handed
 * every line she says).
 */
export function mountVoiceRoutes(app: Router, opts: VoiceRelayOptions = {}): void {
  if (opts.now) cfg.now = opts.now;
  if (opts.freshMs !== undefined) cfg.freshMs = opts.freshMs;

  // THE WORKER'S DOOR. Every poll is also a status report — that is how the
  // brain knows his PC is there and whether Voicebox answered it.
  app.post("/voice/relay/poll", express.json({ limit: "64kb" }), (req, res) => {
    const r = parseReport(req.body);
    if ("error" in r) return refuse(res, 400, "bad-request", r.error);
    const was = relayStatus();
    last = { worker: r.worker, at: cfg.now(), voicebox: r.voicebox };
    everSeen = true;
    // One line per state change, never per poll — and never a job's text.
    if (!was.seen || was.voicebox?.ok !== r.voicebox.ok) {
      console.log(
        r.voicebox.ok
          ? `[voice] relay online — ${r.worker}, Voicebox ok, ${r.voicebox.profiles.length} profile(s)`
          : `[voice] relay seen — ${r.worker}, Voicebox down: ${r.voicebox.error ?? "no reason given"}`,
      );
    }
    // Every line still waiting learns what this poll said — so if none of them
    // is ever handed out, its timeout can say WHY (Job.downReport). At most
    // MAX_PENDING jobs; nothing is kept but the report itself.
    for (const j of queue) {
      if (r.voicebox.ok) j.sawOkPoll = true;
      else j.downReport = r.voicebox;
    }
    // A worker whose own report says Voicebox isn't answering is handed
    // nothing: it could only fail the line. The job stays queued for a poll
    // that can render it; if none comes, its requester gets the relay timeout,
    // told that Voicebox is the reason.
    if (r.voicebox.ok) {
      const next = queue.shift();
      if (next) return claim(next, res);
    }
    const wait = parseWait(req.query.wait);
    if (wait <= 0) return res.status(204).end();
    const w: Waiter = {
      res,
      canTake: r.voicebox.ok,
      timer: setTimeout(() => {
        dropWaiter(w);
        if (!res.writableEnded) res.status(204).end();
      }, wait * 1000),
    };
    waiters.push(w);
    // Bounded: a runaway worker can't pile up held sockets here.
    while (waiters.length > MAX_WAITERS) {
      const old = waiters.shift()!;
      clearTimeout(old.timer);
      if (!old.res.writableEnded) old.res.status(204).end();
    }
    res.on("close", () => dropWaiter(w));
  });

  // Is anyone still waiting for this line? The worker asks while it renders
  // and stops the render on "dropped" (or 404), so his CPU isn't held for a
  // line nobody will hear. "dropped" = the requester hung up or the relay
  // timed it out; it stays answerable until DROPPED_KEEP_MS past the deadline
  // the worker was handed, then reads 404 like any id the brain doesn't know.
  // Deliberately NOT contact (no touch): liveness while rendering is the
  // claimed job's to prove (relayStatus), not a side effect of asking.
  app.get("/voice/relay/job/:id", (req, res) => {
    pruneDropped();
    const id = String(req.params.id);
    if (jobs.has(id)) return res.json({ state: "pending" });
    if (dropped.has(id)) return res.json({ state: "dropped" });
    return res.status(404).json({ error: "no such voice job — unknown, delivered, or long gone" });
  });

  app.post("/voice/relay/result/:id", rawWav, (req, res) => {
    touch(); // it just finished a render — it is plainly there
    pruneDropped();
    const id = String(req.params.id);
    // Its requester left mid-render. The worker did its job; it is told so
    // (200, not a 404 that reads as its own fault), the audio is dropped on
    // the floor right here, and its "working" credit ends with the answer.
    if (dropped.delete(id)) return res.json({ ok: true, discarded: true });
    const job = jobs.get(id);
    if (!job || !job.claimed) {
      return res.status(404).json({ error: "no such voice job — unknown, expired, or its listener already left" });
    }
    if (!isWav(req.body)) {
      job.settle({ kind: "fail", say: SAY.notWav });
      return res.status(400).json({ error: "body must be a WAV file (RIFF…WAVE)" });
    }
    job.settle({ kind: "audio", wav: req.body });
    res.json({ ok: true });
  });

  app.post("/voice/relay/fail/:id", express.json({ limit: "16kb" }), (req, res) => {
    touch();
    pruneDropped();
    const id = String(req.params.id);
    // Nobody is left to tell. Taken, so the worker's credit ends here (and its
    // quit-time /fail for a line he already hung up on isn't answered 404).
    if (dropped.delete(id)) return res.json({ ok: true, discarded: true });
    const job = jobs.get(id);
    if (!job || !job.claimed) {
      return res.status(404).json({ error: "no such voice job — unknown, expired, or its listener already left" });
    }
    const { error: e, source } = (req.body ?? {}) as { error?: unknown; source?: unknown };
    // A failure is passed on even without a reason — making him wait out the
    // timeout for a render the worker already knows is dead helps nobody. The
    // missing reason is itself said.
    const why = typeof e === "string" && e.trim() ? clamp(e.trim(), 300) : "EVE desktop reported a failure without a reason";
    // `source` says whose failure it is. Only "desktop" drops Voicebox's name:
    // the worker's own failures ("EVE desktop closed before the line
    // finished.") were never Voicebox's. Absent — every worker older than the
    // field — means "voicebox", and so does a value this brain doesn't know:
    // an unrecognised tag changes nothing, so such a /fail reads exactly as it
    // did before the field existed. Still never a 400 — the line fails fast.
    const say = source === "desktop" ? SAY.desktopFailed(why) : SAY.failed(why);
    job.settle({ kind: "fail", say });
    res.json({ ok: true });
  });

  // Voice out: text → her voice. Voicebox on his PC when the relay is online
  // and this client opted in (WAV, whole), else the ElevenLabs fallback exactly
  // as before (streamed mp3).
  app.post("/voice/speak", express.json(), async (req, res) => {
    // Browser clients can only read these headers if they are exposed.
    res.setHeader("Access-Control-Expose-Headers", "X-EVE-Voice, X-EVE-Voice-Override");
    // `voiceId` is OPTIONAL and additive: absent => the configured voice.
    // Validated strictly (either provider's id shape) so a malformed id is a
    // 400 here instead of a round trip, and is never quietly swapped for the
    // default — a caller that asks for a voice and gets a different one back
    // is the kind of lie this whole surface exists to avoid.
    const { text, voiceId } = (req.body ?? {}) as { text?: unknown; voiceId?: unknown };
    if (typeof text !== "string" || !text.trim()) {
      return refuse(res, 400, "bad-request", "text (string) is required");
    }
    if (voiceId !== undefined && !isVoiceId(voiceId)) {
      return refuse(
        res,
        400,
        "bad-request",
        "voiceId must be an ElevenLabs voice id (20 alphanumeric characters) or a Voicebox profile id (a UUID)",
      );
    }
    const line = text.slice(0, MAX_TEXT);
    const st = relayStatus();
    // An old client (no X-EVE-Voice-Accept) can't be told why a WAV is a
    // minute late or never came; while ElevenLabs can serve it, it gets
    // ElevenLabs, as it did before the relay existed.
    if (relayServes(st, acceptsVoicebox(req))) return relaySpeak(res, line, voiceId, st);
    if (elevenLabsAvailable()) {
      res.setHeader("X-EVE-Voice", "elevenlabs");
      // A Voicebox UUID can't be spoken by ElevenLabs; speakToResponse falls
      // back to the configured voice for it, and that is said here.
      if (voiceId !== undefined && !isElevenLabsVoiceId(voiceId)) res.setHeader("X-EVE-Voice-Override", "ignored");
      return speakToResponse(line, res, voiceId);
    }
    const why = offlineSay(st);
    return refuse(res, 503, why.reason, why.error);
  });

  // `configuredVoiceId` is what the desktop rail reads to print her REAL voice
  // name instead of guessing at voices[0]; `provider` says whose list it is.
  app.get("/voice/voices", async (req, res) => {
    res.json(await voicesPayload(acceptsVoicebox(req)));
  });
}

// ---- test hooks (verify/voice-relay-harness.ts only) ------------------------

export function _voiceRelayStateForTests(): {
  queued: number;
  pending: number;
  waiting: number;
  worker: string | null;
  dropped: number;
} {
  return { queued: queue.length, pending: jobs.size, waiting: waiters.length, worker: last?.worker ?? null, dropped: dropped.size };
}

export function _resetVoiceRelayForTests(): void {
  for (const j of [...jobs.values()]) j.settle({ kind: "dropped" });
  dropped.clear(); // after the settles above, which would otherwise record them
  for (const w of waiters.splice(0)) {
    clearTimeout(w.timer);
    if (!w.res.writableEnded) w.res.status(204).end();
  }
  last = null;
  everSeen = false; // a reset stands in for a fresh boot
}
