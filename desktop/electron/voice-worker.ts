// HER VOICE, RENDERED ON HIS PC — the Voicebox relay worker. Main process only.
//
// WHY THIS EXISTS. Her voice is a cloned profile ("Lara Eve") inside Voicebox,
// a Qwen3-TTS app that runs on King's PC at 127.0.0.1:17493. Her brain runs on
// Railway and cannot reach a loopback address on somebody else's machine — and
// it must not be able to: Voicebox has no auth, so a port forward or a tunnel
// would hand anyone who found it a free clone of her voice. The one process
// that can already see both sides does the carrying instead. EVE desktop's main
// process holds his brain bearer; it long-polls the brain for lines to speak,
// renders each one on local Voicebox, and posts the WAV back. EVERY connection
// goes OUT from his PC. No port is opened and Voicebox is never exposed.
//
// Contract: VOICE RELAY CONTRACT v1 — brain POST /voice/relay/poll,
// /voice/relay/result/:id, /voice/relay/fail/:id — plus GET
// /voice/relay/job/:id (fix round 3, delta J), which a render asks every 5s so
// a line nobody is waiting for any more stops costing his CPU. Clients keep
// calling POST /voice/speak exactly as before; the brain decides whether a line
// comes through here or goes to ElevenLabs.
//
// NO BRAIN-BOUND FETCH FOLLOWS A REDIRECT. Every call to brainUrl() passes
// redirect:"error", the same rule the Voicebox calls already had: a 3xx from
// the brain's address is a fault, never a new address — followed, it would
// carry her WAV, or the poll body and the bearer, wherever it pointed.
//
// NO ELECTRON IMPORT. Everything this file needs from the app — the brain URL,
// the token, a logger, fetch — is handed in, so verify/voice-worker-harness.mjs
// can drive the real loop against a fake brain and a fake Voicebox from plain
// node. main.ts is the only place that wires it to config.ts and secrets.ts.
//
// WHAT IT MAY SAY TO VOICEBOX: GET /health, GET /profiles, POST
// /generate/stream. Nothing else — not /speak (that writes to his history),
// not /models, not /settings, no PUT, no DELETE. It never touches a profile.
//
// WHAT IT NEVER LOGS: the line she is about to say, the token, and Voicebox's
// own error detail (it can quote the line — see whyLog). One log line
// per state change (online / Voicebox down / offline / parked) plus one per
// rendered line with its timing — never one per poll. A refused or failed line
// is noted once per reason per minute (sayJob), never once per job.
//
// THE HONESTY LAW APPLIES TO THE WORKER TOO. A line that cannot be rendered is
// never dropped on the floor: the brain is told WHY on /fail, so the person
// waiting on POST /voice/speak gets a sentence instead of a 90-second silence
// and a timeout.
//
// Owning stream: S2 (voice relay, desktop side), 2026-09-24.

export const DEFAULT_VOICEBOX_URL = "http://127.0.0.1:17493";

/** The engines Voicebox's /generate/stream accepts (contract v1). */
export const VOICEBOX_ENGINES = [
  "qwen",
  "qwen_custom_voice",
  "luxtts",
  "chatterbox",
  "chatterbox_turbo",
  "tada",
  "kokoro",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 4000;
const MAX_ERROR = 300;
const MAX_PROFILES = 50;
const MAX_WORKER = 40;

/** Voicebox's health + profile list is re-read at most this often. */
const STATUS_CACHE_MS = 30_000;
/**
 * ...but a reading that says Voicebox is DOWN is kept only this long. King
 * opens Voicebox a moment after EVE desktop; a failed probe held for the full
 * 30s rode on every poll in that window, so the brain kept saying "Open
 * Voicebox" for up to ~50s after he had. A good reading is stable and keeps
 * the 30s; a bad one is the reading most likely to change next.
 */
const FAILED_STATUS_CACHE_MS = 3_000;
const POLL_WAIT_S = 25;
/** The brain holds a poll up to 25s; 10s of margin for a slow home uplink. */
const POLL_TIMEOUT_MS = 35_000;
const PROBE_TIMEOUT_MS = 3_000;
/**
 * On the CPU build one six-second line took 81s. 180s is not generous, it is honest.
 * Exported because it is the ceiling of the whole chain: a brain relay timeout
 * (EVE_VOICE_RELAY_TIMEOUT_MS) above it never waits longer — the worker gives
 * up here and says so on /fail — and api.ts's speak backstop sits above it.
 */
export const GENERATE_TIMEOUT_MS = 180_000;
/** A WAV is a few MB at most; a home uplink can still be slow. */
const REPORT_TIMEOUT_MS = 60_000;
const BACKOFF_FIRST_MS = 2_000;
const BACKOFF_CAP_MS = 60_000;
/** A 404 (brain predates the relay) or a refused token will not fix itself in seconds. */
const PARKED_MS = 5 * 60_000;
const NO_TOKEN_MS = 30_000;
/**
 * A 204 is supposed to come back after the brain HELD the poll. One that comes
 * back faster than this means something is not holding (a second worker being
 * kicked, a proxy) — re-polling "immediately" then would hammer Railway in a
 * tight loop, so an empty poll never repeats faster than once a second. loop()
 * holds EVERY iteration to the same floor (a refused or failed job too).
 */
const FAST_EMPTY_FLOOR_MS = 1_000;
/** A refusal / failure reason already logged is not logged again for this long. */
const JOB_NOTE_QUIET_MS = 60_000;
const MAX_JOB_NOTE_KEYS = 32;
/**
 * (J) WHILE A LINE RENDERS, IS ANYONE STILL WAITING FOR IT? The brain is asked
 * this often. A CPU render runs 30-90s, and a requester who hung up at second
 * three used to cost the rest of it — his CPU spent on audio nobody would hear,
 * ahead of the line he asked for next.
 */
const JOB_STATUS_EVERY_MS = 5_000;
/** One status check's own clock. A slow one is skipped, never waited on. */
const JOB_STATUS_TIMEOUT_MS = 4_000;
/**
 * (Q) The quit-time /fail's own clock. The app is closing: two seconds to tell
 * the brain the line is not coming, then it is let go.
 */
const QUIT_FAIL_TIMEOUT_MS = 2_000;
/** What the person waiting on POST /voice/speak is told when the desktop closes mid-line. */
export const QUIT_REASON = "EVE desktop closed before the line finished";

/**
 * WHO BROKE THE LINE, on every /fail (`source`). The brain puts "Voicebox
 * failed to render that line:" in front of a "voicebox" reason only; a
 * "desktop" reason is shown as the worker wrote it. Before this, every /fail
 * got that prefix — so an app quitting mid-line, a line past the brain's own
 * deadline, or a job this worker refused before Voicebox ever saw it all told
 * King that Voicebox had failed, and sent him to fix the wrong program.
 * A brain older than the field ignores it; a worker older than it sends none,
 * and the brain reads that as "voicebox" (what every /fail used to mean).
 */
export type FailSource = "voicebox" | "desktop";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface VoiceboxProfile {
  id: string;
  name: string;
}

/** What the poll body reports as `voicebox`. */
export interface VoiceboxStatus {
  ok: boolean;
  /** Plain words, fit to drop into "Voicebox isn't answering (<error>)". */
  error?: string;
  profiles: VoiceboxProfile[];
  /** health.gpu_available — false means the CPU build, which is SLOW. */
  gpu: boolean | null;
}

export interface VoiceWorkerTimeouts {
  probeMs: number;
  pollMs: number;
  generateMs: number;
  reportMs: number;
  /** How often a render asks GET /voice/relay/job/:id (J). */
  jobStatusEveryMs: number;
  /** One status check's own clock (J). */
  jobStatusMs: number;
  /** The quit-time /fail's own clock (Q). */
  quitFailMs: number;
}

export interface VoiceWorkerOptions {
  /** Same source api.ts uses (config.ts brainUrl()). No trailing slash. */
  brainUrl: () => string;
  /** Same source api.ts's authHeader() uses (secrets.ts getToken()). */
  token: () => string | null;
  /** One line, no prefix needed. Never handed the text or the token. */
  log: (line: string) => void;
  fetch?: typeof fetch;
  /** Raw EVE_VOICEBOX_URL. Honoured ONLY when it names this machine. */
  voiceboxUrl?: string;
  /** Reported to the brain as `worker` (clamped to 40 chars). */
  worker?: string;
  /** Clock seam for the status cache and the once-per-reason job notes. */
  now?: () => number;
  /** Test seam: shorter timeouts so a hang is proven in a second, not three minutes. */
  timeouts?: Partial<VoiceWorkerTimeouts>;
}

export type StepOutcome =
  | "no-token"
  | "empty"
  | "job-done"
  | "job-orphaned"
  | "job-refused"
  | "job-failed"
  | "old-brain"
  | "unauthorized"
  | "offline"
  | "stopped";

/** One iteration: what happened, and how long the loop should wait before the next. */
export interface StepResult {
  outcome: StepOutcome;
  delayMs: number;
  /** The reason, when there is one. Never contains the text or the token. */
  detail?: string;
}

export type WorkerState =
  | "idle"
  | "online"
  | "voicebox-down"
  | "offline"
  | "unauthorized"
  | "old-brain"
  | "no-token";

export interface VoiceWorker {
  /** One poll (and at most one job). Never throws. */
  runOnce(): Promise<StepResult>;
  /** Begin looping. Already running = cut any backoff short and poll now. */
  start(): void;
  /**
   * Stop looping and abort whatever is in flight. Idempotent. A line caught
   * mid-render is reported to the brain as not coming (/fail, QUIT_REASON).
   */
  stop(): void;
  readonly state: WorkerState;
  /** The Voicebox base actually in use (after the loopback check). */
  readonly voiceboxUrl: string;
}

// ---------------------------------------------------------------------------
// Voicebox address — this machine or nothing
// ---------------------------------------------------------------------------

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * EVE_VOICEBOX_URL may move Voicebox to another PORT on this machine. It may
 * not move it off this machine: the worker posts her unsaid lines to whatever
 * this names, and a LAN address is somebody else's box. Refused values fall
 * back to the default and say so.
 */
export function resolveVoiceboxUrl(raw: string | undefined): { url: string; refused: string | null } {
  const v = raw?.trim();
  if (!v) return { url: DEFAULT_VOICEBOX_URL, refused: null };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return {
      url: DEFAULT_VOICEBOX_URL,
      refused: `EVE_VOICEBOX_URL is not a URL — ignoring it and using ${DEFAULT_VOICEBOX_URL}`,
    };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return {
      url: DEFAULT_VOICEBOX_URL,
      refused: `EVE_VOICEBOX_URL uses ${u.protocol} — only http(s) on this PC is allowed; using ${DEFAULT_VOICEBOX_URL}`,
    };
  }
  if (!LOOPBACK_HOSTS.has(u.hostname.toLowerCase())) {
    return {
      url: DEFAULT_VOICEBOX_URL,
      refused:
        `EVE_VOICEBOX_URL points at ${u.hostname}, which is not this PC — refusing it ` +
        `(her lines never leave this machine for Voicebox) and using ${DEFAULT_VOICEBOX_URL}`,
    };
  }
  return { url: u.origin, refused: null };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`;
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

/** A fetch failure as a few plain words. Timeout and a dead socket read differently. */
function describe(err: unknown, timeoutMs: number): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") return `no answer within ${fmtMs(timeoutMs)}`;
    const cause = (err as { cause?: { code?: unknown } }).cause;
    const code = typeof cause?.code === "string" ? cause.code : null;
    if (code === "ECONNREFUSED") return "connection refused";
    if (code) return code;
    return clip(err.message.replace(/Bearer\s+\S+/gi, "Bearer <redacted>"), 200);
  }
  return clip(String(err).replace(/Bearer\s+\S+/gi, "Bearer <redacted>"), 200);
}

/** Let the socket go back to the pool; the body is never read. */
function drain(res: Response): void {
  void res.body?.cancel().catch(() => undefined);
}

/**
 * A 3xx from Voicebox or the brain. Every fetch here passes redirect:"error",
 * and Node's fetch then rejects with "fetch failed" whose cause reads
 * "unexpected redirect" — describe() alone would print only "fetch failed",
 * which names nothing, so this is checked first and said in plain words.
 */
function isRedirect(err: unknown): boolean {
  const cause = (err as { cause?: { message?: unknown } } | null)?.cause;
  return typeof cause?.message === "string" && /redirect/i.test(cause.message);
}

interface RawJob {
  id: string;
  text: unknown;
  profileId: unknown;
  engine: unknown;
  /**
   * The brain's deadline for this line: ms left before it gives up waiting
   * (contract delta: relay timeout minus time already queued, min 1000). Null
   * = an older brain that never sent one — today's GENERATE_TIMEOUT_MS alone.
   */
  ttlMs: number | null;
}

function readJob(body: unknown): RawJob | null {
  const j = (body as { job?: unknown } | null)?.job;
  if (!j || typeof j !== "object") return null;
  const { id, text, profileId, engine, ttlMs } = j as Record<string, unknown>;
  if (typeof id !== "string" || !id || id.length > 200) return null;
  // Anything but a positive finite number is treated as absent: a garbled
  // deadline must not become a zero-ms render that fails every line.
  const ttl = typeof ttlMs === "number" && Number.isFinite(ttlMs) && ttlMs > 0 ? Math.floor(ttlMs) : null;
  return { id, text, profileId, engine, ttlMs: ttl };
}

/**
 * Why this job must NOT reach Voicebox, or null when it may. The reason goes
 * to the brain and into a log line, so it never quotes the text.
 */
function refuseJob(job: RawJob, profiles: VoiceboxProfile[]): string | null {
  if (typeof job.text !== "string") return "the line is not text";
  if (!job.text.trim()) return "the line is empty";
  if (job.text.length > MAX_TEXT) return `the line is ${job.text.length} characters — over the ${MAX_TEXT} limit`;
  if (typeof job.profileId !== "string" || !UUID_RE.test(job.profileId)) return "the voice profile id is not a UUID";
  const pid = job.profileId;
  if (!profiles.some((p) => p.id === pid)) return `Voicebox has no voice profile ${pid}`;
  if (typeof job.engine !== "string" || !(VOICEBOX_ENGINES as readonly string[]).includes(job.engine)) {
    const shown = typeof job.engine === "string" ? `"${clip(job.engine, 24)}"` : "(none)";
    return `engine ${shown} is not one Voicebox offers`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The worker
// ---------------------------------------------------------------------------

export function createVoiceWorker(opts: VoiceWorkerOptions): VoiceWorker {
  const doFetch: typeof fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const now = opts.now ?? Date.now;
  const t: VoiceWorkerTimeouts = {
    probeMs: opts.timeouts?.probeMs ?? PROBE_TIMEOUT_MS,
    pollMs: opts.timeouts?.pollMs ?? POLL_TIMEOUT_MS,
    generateMs: opts.timeouts?.generateMs ?? GENERATE_TIMEOUT_MS,
    reportMs: opts.timeouts?.reportMs ?? REPORT_TIMEOUT_MS,
    jobStatusEveryMs: opts.timeouts?.jobStatusEveryMs ?? JOB_STATUS_EVERY_MS,
    jobStatusMs: opts.timeouts?.jobStatusMs ?? JOB_STATUS_TIMEOUT_MS,
    quitFailMs: opts.timeouts?.quitFailMs ?? QUIT_FAIL_TIMEOUT_MS,
  };
  const worker = clip((opts.worker ?? "eve-desktop").trim() || "eve-desktop", MAX_WORKER);
  const vbAddr = resolveVoiceboxUrl(opts.voiceboxUrl);
  const vbUrl = vbAddr.url;
  const vbHost = vbUrl.replace(/^https?:\/\//, "");

  let state: WorkerState = "idle";
  let failures = 0;
  let cached: { at: number; status: VoiceboxStatus } | null = null;
  let ac = new AbortController();
  let running = false;
  let inFlight: Promise<StepResult> | null = null;
  let wake: (() => void) | null = null;
  /** The line being rendered right now — held ONLY so say() can strip it. */
  let activeText: string | null = null;
  /**
   * (Q) THE JOB THIS WORKER HOLDS: claimed off a poll and handed to Voicebox,
   * not yet answered with a /result or /fail. stop() reads it to tell the
   * brain the line is not coming. It carries its own token and brain address
   * because a stop that IS a cleared token has no token() left to read.
   */
  let held: { id: string; token: string; base: string } | null = null;

  /**
   * THE ONLY WAY OUT TO THE LOG. Belt and braces over every call site's own
   * care: the token and the line in hand are cut out of whatever is said.
   */
  function say(line: string): void {
    let out = line;
    try {
      const tok = opts.token();
      if (tok && out.includes(tok)) out = out.split(tok).join("<redacted>");
    } catch {
      /* a token read that throws must not take the log line with it */
    }
    if (activeText && activeText.length >= 4 && out.includes(activeText)) {
      out = out.split(activeText).join("<line>");
    }
    opts.log(out);
  }

  /** One line per state CHANGE — an offline brain must not print 1,440 times a day. */
  function enter(next: WorkerState, line: string): void {
    if (state === next) return;
    state = next;
    say(line);
  }

  /**
   * A LINE THAT WENT WRONG, SAID ONCE PER REASON. A refused or failed line
   * deserves a log line — but the same reason over and over (a brain replaying
   * a job this worker must refuse, Voicebox 500-ing every line) used to write
   * one line PER JOB: 4,338 of them in two seconds when reproduced. The first
   * time a reason turns up it is said at once; repeats inside JOB_NOTE_QUIET_MS
   * are only counted, and the count rides on the next time it is said.
   * Numbers are folded out of the key so "4001 characters" and "4002
   * characters" are one reason, and the table is bounded: past
   * MAX_JOB_NOTE_KEYS distinct reasons, the rest share one key.
   */
  const jobNotes = new Map<string, { at: number; held: number }>();
  function sayJob(reason: string, line: string): void {
    let key = reason.replace(/\d+/g, "#");
    if (!jobNotes.has(key) && jobNotes.size >= MAX_JOB_NOTE_KEYS) key = "(other reasons)";
    const at = now();
    const seen = jobNotes.get(key);
    if (seen && at - seen.at < JOB_NOTE_QUIET_MS) {
      seen.held += 1;
      return;
    }
    const held = seen?.held ?? 0;
    jobNotes.set(key, { at, held: 0 });
    say(held > 0 ? `${line} (and ${held} more like it, unlogged, before this)` : line);
  }

  if (vbAddr.refused) say(vbAddr.refused);

  /**
   * THE STOP SIGNAL THE ITERATION IN FLIGHT BEGAN UNDER (runOnce sets it). It
   * used to read `ac` live — and stop() then start() swaps `ac` in the same
   * tick, so the iteration the stop had just cut short saw a fresh, unaborted
   * signal, took its own abort for a Voicebox fault and posted that to the
   * brain as the first poll after the restart. Observed in the harness (P1)
   * after the cache fix alone. Bound per iteration, a stopped one stays stopped.
   */
  let iterSignal: AbortSignal = ac.signal;
  const signalFor = (ms: number): AbortSignal => AbortSignal.any([iterSignal, AbortSignal.timeout(ms)]);
  const stopped = (): boolean => iterSignal.aborted;
  const STOPPED: StepResult = { outcome: "stopped", delayMs: 0 };

  // ---- Voicebox status (GET /health + GET /profiles, cached ≤30s; down ≤3s)

  async function getJson(path: string): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
    try {
      // redirect:"error" — a 3xx from the Voicebox port is a Voicebox failure,
      // never an address to follow (the line would go wherever it pointed).
      const res = await doFetch(`${vbUrl}${path}`, {
        method: "GET",
        redirect: "error",
        signal: signalFor(t.probeMs),
      });
      if (res.status !== 200) {
        drain(res);
        return { ok: false, error: `${path} answered HTTP ${res.status}` };
      }
      try {
        return { ok: true, body: await res.json() };
      } catch {
        return { ok: false, error: `${path} answered with something that is not JSON` };
      }
    } catch (err) {
      if (isRedirect(err)) return { ok: false, error: `${path} answered with a redirect — not followed` };
      const why = describe(err, t.probeMs);
      return {
        ok: false,
        error:
          why === "connection refused"
            ? `nothing is listening on ${vbHost}`
            : `${why} from ${vbHost}${path}`,
      };
    }
  }

  async function probeVoicebox(): Promise<VoiceboxStatus> {
    const [health, list] = await Promise.all([getJson("/health"), getJson("/profiles")]);
    let error: string | undefined;
    let gpu: boolean | null = null;
    const profiles: VoiceboxProfile[] = [];
    if (health.ok) {
      const g = (health.body as { gpu_available?: unknown } | null)?.gpu_available;
      gpu = typeof g === "boolean" ? g : null;
    } else {
      error = health.error;
    }
    if (list.ok) {
      if (Array.isArray(list.body)) {
        for (const p of list.body as unknown[]) {
          if (profiles.length >= MAX_PROFILES) break;
          const { id, name } = (p ?? {}) as { id?: unknown; name?: unknown };
          // ≤64: the brain refuses the WHOLE poll over one longer id (it will
          // not truncate an id into a different voice), so one odd profile
          // would otherwise keep every poll bouncing. Skipped here, not clipped.
          if (typeof id === "string" && id && id.length <= 64 && typeof name === "string") {
            profiles.push({ id, name: clip(name, 100) });
          }
        }
      } else {
        error ??= "/profiles did not answer with a list";
      }
    } else {
      // Both failing for one reason (Voicebox closed) is one sentence, not two.
      error ??= list.error;
    }
    return { ok: !error, ...(error ? { error: clip(error, MAX_ERROR) } : {}), profiles, gpu };
  }

  /**
   * A PROBE THAT stop() CUT SHORT IS NOT A READING OF VOICEBOX. It used to be
   * cached like one: stop() during a slow /health, start() again inside 30s,
   * and every poll for the rest of the window told the brain "Voicebox isn't
   * answering (This operation was aborted …)" — about a Voicebox that was fine.
   * Reproduced by the real e2e. The stop signal the probe ran under is held
   * here, so a later start() swapping in a fresh one cannot hide the abort.
   */
  async function voiceboxStatus(): Promise<VoiceboxStatus> {
    const at = now();
    if (cached && at - cached.at < (cached.status.ok ? STATUS_CACHE_MS : FAILED_STATUS_CACHE_MS)) return cached.status;
    const ranUnder = iterSignal;
    const status = await probeVoicebox();
    if (!ranUnder.aborted) cached = { at: now(), status };
    return status;
  }

  // ---- state transitions ------------------------------------------------

  function reachable(vb: VoiceboxStatus): void {
    failures = 0;
    if (vb.ok) {
      const build = vb.gpu === true ? "GPU" : vb.gpu === false ? "CPU build (slow)" : "GPU unknown";
      enter(
        "online",
        `online — rendering her voice on Voicebox at ${vbHost} · ${vb.profiles.length} profile(s) · ${build}`,
      );
    } else {
      enter("voicebox-down", `her brain is reachable but Voicebox is not: ${vb.error ?? "no reason given"}`);
    }
  }

  function offline(reason: string): StepResult {
    failures += 1;
    const delayMs = Math.min(BACKOFF_FIRST_MS * 2 ** (failures - 1), BACKOFF_CAP_MS);
    enter(
      "offline",
      `cannot reach her brain (${reason}) — backing off ${fmtMs(delayMs)}, doubling to ${fmtMs(BACKOFF_CAP_MS)}`,
    );
    return { outcome: "offline", delayMs, detail: reason };
  }

  // ---- talking back to the brain about one job -------------------------

  /**
   * ok · gone (404: the requester left or the job expired; or a 200 that says
   * `discarded` — see below) · refused (another 4xx: the brain heard us and
   * settled the job as a failure, e.g. "not a WAV") · {error} (5xx, a 3xx, or
   * no answer — the brain itself is the problem; back off).
   */
  type Delivered = "ok" | "gone" | { refused: number } | { error: string };

  async function report(
    token: string,
    id: string,
    kind: "result" | "fail",
    payload: ArrayBuffer | string,
    // Required, not defaulted: every /fail call site has to say who broke the
    // line (FailSource). A default would let a new one quietly blame Voicebox.
    // A /result passes null.
    source: FailSource | null,
  ): Promise<Delivered> {
    const isAudio = kind === "result";
    try {
      const res = await doFetch(`${opts.brainUrl()}/voice/relay/${kind}/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": isAudio ? "audio/wav" : "application/json",
        },
        body: isAudio
          ? (new Uint8Array(payload as ArrayBuffer) as BodyInit)
          : JSON.stringify({ error: clip(payload as string, MAX_ERROR), ...(source ? { source } : {}) }),
        // Never followed: this body is her WAV, or the reason she is silent.
        redirect: "error",
        signal: signalFor(t.reportMs),
      });
      if (res.status === 200 && isAudio) {
        // (L) Audio for a line whose requester already hung up is answered
        // 200 {ok:true, discarded:true} — taken and thrown away. That is not
        // "delivered", and the log must not say it was.
        const b = (await res.json().catch(() => null)) as { discarded?: unknown } | null;
        return b?.discarded === true ? "gone" : "ok";
      }
      drain(res);
      if (res.status === 200) return "ok";
      // The requester hung up, or the job timed out: the brain has dropped it.
      if (res.status === 404) return "gone";
      // Reached and answered — a refusal about THIS job, not an outage.
      if (res.status >= 400 && res.status < 500) return { refused: res.status };
      return { error: `the brain answered HTTP ${res.status} to ${kind}` };
    } catch (err) {
      if (isRedirect(err)) return { error: `her brain answered the ${kind} with a redirect — not followed` };
      return { error: `could not hand the line back — ${describe(err, t.reportMs)}` };
    }
  }

  /**
   * (J) DOES THE BRAIN STILL WANT THIS LINE? "wanted" · "gone" (the requester
   * hung up, the brain timed the line out, or it has never heard of the id) ·
   * null = the CHECK failed — a timeout, a 5xx, a 3xx, a body it could not
   * read. That says nothing about the line and is ignored: a render is never
   * thrown away because a status read went wrong.
   *
   * A 404 counts as "gone" only when it is JSON — the relay's own answer (every
   * relay 404 is `res.status(404).json(...)`). A brain older than this route
   * answers Express's HTML "Cannot GET" 404 instead. Taken at its word, that
   * would cut every render on an un-redeployed brain off at five seconds and
   * post NOTHING, and the person waiting would sit out the whole relay timeout
   * in silence. Read as a failed check, the render carries on as it always did.
   */
  async function jobState(token: string, base: string, id: string, until: AbortSignal): Promise<"wanted" | "gone" | null> {
    try {
      const res = await doFetch(`${base}/voice/relay/job/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.any([until, AbortSignal.timeout(t.jobStatusMs)]),
      });
      if (res.status === 404) {
        const json = /^application\/json\b/i.test(res.headers.get("content-type") ?? "");
        drain(res);
        return json ? "gone" : null;
      }
      if (res.status !== 200) {
        drain(res);
        return null;
      }
      const s = ((await res.json()) as { state?: unknown } | null)?.state;
      return s === "dropped" ? "gone" : s === "pending" ? "wanted" : null;
    } catch {
      return null;
    }
  }

  /**
   * (J) Ask jobState() every jobStatusEveryMs until stop() is called. `gone`
   * fires — and stays fired — the first time the brain says nobody wants the
   * line. One check at a time: a slow brain skips a beat, it never stacks reads.
   */
  function watchJob(token: string, base: string, id: string): { gone: AbortSignal; stop(): void } {
    const gone = new AbortController();
    const done = new AbortController();
    const until = AbortSignal.any([iterSignal, done.signal]);
    let busy = false;
    const timer = setInterval(() => {
      if (busy || until.aborted || gone.signal.aborted) return;
      busy = true;
      void jobState(token, base, id, until).then((s) => {
        busy = false;
        if (s === "gone" && !until.aborted) gone.abort();
      });
    }, t.jobStatusEveryMs);
    return {
      gone: gone.signal,
      stop(): void {
        clearInterval(timer);
        done.abort();
      },
    };
  }

  /**
   * (Q) STOPPED MID-LINE — the app is quitting, or his token was cleared. The
   * person waiting on POST /voice/speak is told now, not after the brain's
   * whole relay timeout. On its OWN short request, never the iteration's
   * signal: stop() has just aborted that, and a fetch born under an aborted
   * signal is never sent at all. Best effort — the app may be gone before the
   * answer is, and nothing waits on it.
   */
  function quitFail(job: { id: string; token: string; base: string }): void {
    try {
      void doFetch(`${job.base}/voice/relay/fail/${encodeURIComponent(job.id)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${job.token}`, "Content-Type": "application/json" },
        // "desktop": the app closing is not Voicebox failing (FailSource).
        body: JSON.stringify({ error: QUIT_REASON, source: "desktop" satisfies FailSource }),
        redirect: "error",
        signal: AbortSignal.timeout(t.quitFailMs),
      }).then(drain, () => undefined);
    } catch {
      /* best effort — a fetch that throws outright changes nothing he hears */
    }
    say("stopped mid-line — told her brain that line is not coming (best effort)");
  }

  async function handleJob(token: string, job: RawJob, vb: VoiceboxStatus): Promise<StepResult> {
    // THE BRAIN'S DEADLINE, counted from the moment the job arrived (this
    // call is the first thing step() does with it). Past it the brain has
    // already told the listener "timeout" and dropped the line: rendering on
    // is minutes of his CPU for audio nobody will hear, and a late /result is
    // a WAV for a job that no longer exists. Real clock on purpose, as in
    // loop(): `now` is the status cache's seam and this abort is real.
    const deadlineAt = job.ttlMs === null ? null : Date.now() + job.ttlMs;
    const refusal = refuseJob(job, vb.profiles);
    if (refusal) {
      // "desktop": this worker refused the line; Voicebox never saw it.
      const r = await report(token, job.id, "fail", refusal, "desktop");
      if (stopped()) return STOPPED;
      if (typeof r === "object" && "error" in r) return offline(r.error);
      sayJob(`refused: ${refusal}`, `refused a line before Voicebox saw it: ${refusal}`);
      return { outcome: "job-refused", delayMs: 0, detail: refusal };
    }

    const text = job.text as string;
    const base = opts.brainUrl();
    const mine = { id: job.id, token, base };
    held = mine;
    activeText = text;
    const watch = watchJob(token, base, job.id);
    try {
      const began = now();
      let audio: ArrayBuffer | null = null;
      let why: string | null = null;
      /**
       * (3) What the LOG may say about a failed render, when that must differ
       * from `why`. Voicebox's own detail goes to her brain on /fail (clipped;
       * it lands on Brandon's own screen) but never into a log line: a
       * validation error can quote the line she was about to say, and the
       * 24-char probe in voiceboxDetail misses it once Voicebox has collapsed
       * the whitespace. The log gets the HTTP status and a fixed phrase only.
       */
      let whyLog: string | null = null;
      /**
       * Who the /fail blames (FailSource). Voicebox, unless the line was cut on
       * the BRAIN's deadline: that is this worker ending the render on the
       * brain's clock, not Voicebox breaking, and "Voicebox failed to render
       * that line" in front of it would be the wrong program named.
       */
      let failSource: FailSource = "voicebox";
      // min(render cap, what is left of the brain's deadline). Which of the
      // two is the tighter one decides the sentence the brain is sent.
      const left = deadlineAt === null ? null : Math.max(0, deadlineAt - Date.now());
      const byDeadline = left !== null && left < t.generateMs;
      const limitMs = byDeadline ? (left as number) : t.generateMs;
      try {
        const res = await doFetch(`${vbUrl}/generate/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: job.profileId,
            text,
            language: "en",
            engine: job.engine,
            personality: false,
          }),
          // Never follow a 3xx off the Voicebox port — see getJson.
          redirect: "error",
          // (J) The brain saying nobody wants the line ends the render too.
          signal: AbortSignal.any([signalFor(limitMs), watch.gone]),
        });
        if (res.status === 200) {
          audio = await res.arrayBuffer();
          if (audio.byteLength === 0) why = "Voicebox answered 200 with no audio in it";
        } else {
          why = `Voicebox answered HTTP ${res.status}${await voiceboxDetail(res, text)}`;
          whyLog = `Voicebox answered HTTP ${res.status} (its own words went to her brain, not to this log)`;
        }
      } catch (err) {
        if (stopped()) return STOPPED;
        if (byDeadline && err instanceof Error && err.name === "TimeoutError") failSource = "desktop";
        why =
          err instanceof Error && err.name === "TimeoutError"
            ? byDeadline
              ? `Voicebox had not finished when her brain's ${fmtMs(job.ttlMs as number)} deadline for this line ran out`
              : `Voicebox did not finish within ${fmtMs(t.generateMs)}`
            : isRedirect(err)
              ? "Voicebox answered with a redirect — not followed"
              : `Voicebox stopped answering (${describe(err, limitMs)})`;
      }
      watch.stop();
      const secs = ((now() - began) / 1000).toFixed(1);
      // (J) NOBODY IS WAITING FOR THIS LINE ANY MORE (the brain said
      // "dropped", or a JSON 404). Nothing is posted — no /result, no /fail:
      // there is no one left to tell, and the render has already been cut.
      // Whatever Voicebox did or did not finish is let go with it.
      if (watch.gone.aborted) {
        if (held === mine) held = null;
        const reason = "her brain let the line go mid-render (the request ended first)";
        say(`stopped rendering a line after ${secs}s — ${reason}; nothing posted`);
        return { outcome: "job-orphaned", delayMs: 0, detail: reason };
      }
      // Belt and braces over the abort: audio in hand after the deadline is
      // still never posted as a /result — the brain has let the line go.
      if (!why && deadlineAt !== null && Date.now() >= deadlineAt) {
        why = `Voicebox finished after her brain's ${fmtMs(job.ttlMs as number)} deadline for this line — not delivered`;
        failSource = "desktop"; // Voicebox DID render it; the deadline is what refused it
      }

      if (why || !audio) {
        // Whatever broke, the next poll should report Voicebox as it is NOW.
        cached = null;
        const reason = why ?? "Voicebox returned nothing";
        const logged = whyLog ?? reason;
        const r = await report(token, job.id, "fail", reason, failSource);
        if (stopped()) return STOPPED;
        if (typeof r === "object" && "error" in r) return offline(r.error);
        sayJob(`failed: ${logged}`, `a line failed to render after ${secs}s: ${logged}`);
        return { outcome: "job-failed", delayMs: 0, detail: logged };
      }

      const r = await report(token, job.id, "result", audio, null);
      if (stopped()) return STOPPED;
      if (typeof r === "object" && "error" in r) return offline(r.error);
      if (typeof r === "object") {
        // The brain took the bytes and refused them (a body that is not
        // RIFF…WAVE is its 400) — it has already told the listener. Not an
        // outage, so no backoff; the reason still reaches the log.
        const reason = `her brain refused the audio Voicebox made (HTTP ${r.refused})`;
        sayJob(reason, `rendered a line in ${secs}s, but ${reason}`);
        return { outcome: "job-failed", delayMs: 0, detail: reason };
      }
      if (r === "gone") {
        say(`rendered a line in ${secs}s, but her brain had already let it go (the request ended first)`);
        return { outcome: "job-orphaned", delayMs: 0 };
      }
      say(`rendered a line in ${secs}s (${Math.round(audio.byteLength / 1024)} KB) — delivered`);
      return { outcome: "job-done", delayMs: 0 };
    } finally {
      watch.stop();
      // Answered (or let go, or stop() took it): no longer this worker's to report.
      if (held === mine) held = null;
      activeText = null;
    }
  }

  /**
   * Voicebox's own reason, when it gave a plain string one (FastAPI `detail`).
   * A validation error echoes the request back — the line included — so a
   * detail that carries any of the text is dropped, not trimmed.
   */
  async function voiceboxDetail(res: Response, text: string): Promise<string> {
    try {
      const body = (await res.json()) as { detail?: unknown };
      const d = typeof body?.detail === "string" ? body.detail.replace(/\s+/g, " ").trim() : "";
      if (!d) return "";
      const probe = text.trim().slice(0, 24);
      if (probe && d.includes(probe)) return "";
      return ` — ${clip(d, 160)}`;
    } catch {
      return "";
    }
  }

  // ---- one iteration ----------------------------------------------------

  async function step(): Promise<StepResult> {
    const token = opts.token();
    if (!token) {
      enter("no-token", "no brain token is linked — her voice waits until one is");
      return { outcome: "no-token", delayMs: NO_TOKEN_MS };
    }
    const vb = await voiceboxStatus();
    if (stopped()) return STOPPED;

    const began = now();
    let res: Response;
    try {
      res = await doFetch(`${opts.brainUrl()}/voice/relay/poll?wait=${POLL_WAIT_S}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          worker,
          voicebox: {
            ok: vb.ok,
            ...(vb.error ? { error: clip(vb.error, MAX_ERROR) } : {}),
            profiles: vb.profiles.slice(0, MAX_PROFILES),
            gpu: vb.gpu,
          },
        }),
        // Never followed: the bearer and this body would go wherever it pointed,
        // and whatever answered there would be handing out her lines.
        redirect: "error",
        signal: signalFor(t.pollMs),
      });
    } catch (err) {
      if (stopped()) return STOPPED;
      if (isRedirect(err)) return offline("the poll was answered with a redirect — not followed");
      return offline(describe(err, t.pollMs));
    }

    if (res.status === 204) {
      drain(res);
      reachable(vb);
      const took = now() - began;
      return { outcome: "empty", delayMs: took < FAST_EMPTY_FLOOR_MS ? FAST_EMPTY_FLOOR_MS - took : 0 };
    }
    if (res.status === 404) {
      // A brain that predates the relay. Nothing to do but wait for a deploy.
      drain(res);
      failures = 0;
      enter("old-brain", "her brain has no voice relay yet (HTTP 404) — checking again every 5 min");
      return { outcome: "old-brain", delayMs: PARKED_MS };
    }
    if (res.status === 401 || res.status === 403) {
      drain(res);
      failures = 0;
      enter(
        "unauthorized",
        `her brain refused this desktop's token (HTTP ${res.status}) — voice relay parked, retrying every 5 min`,
      );
      return { outcome: "unauthorized", delayMs: PARKED_MS, detail: `HTTP ${res.status}` };
    }
    if (res.status !== 200) {
      drain(res);
      return offline(`poll answered HTTP ${res.status}`);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      if (stopped()) return STOPPED;
      return offline(`poll answered 200 with no readable job (${describe(err, t.pollMs)})`);
    }
    const job = readJob(body);
    if (!job) return offline("poll answered 200 without a job id");
    reachable(vb);
    return await handleJob(token, job, vb);
  }

  function runOnce(): Promise<StepResult> {
    // One job at a time, ever: a second caller shares the iteration in flight.
    if (inFlight) return inFlight;
    iterSignal = ac.signal;
    inFlight = (async () => {
      try {
        return await step();
      } catch (err) {
        // step() is written not to throw; if it does, it backs off, not dies.
        if (stopped()) return STOPPED;
        return offline(`worker fault: ${describe(err, 0)}`);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        if (wake === done) wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
      wake = done;
    });
  }

  /**
   * THE ANTI-HAMMER FLOOR IS ON THE ITERATION, not on one outcome. It used to
   * guard only the fast 204; a brain (or anything in front of it) that answered
   * every poll at once with a job this worker must refuse got polled as fast as
   * the network allowed — 4,337 polls and 4,336 /fail posts in two seconds when
   * reproduced. Whatever an iteration's outcome, the next poll starts no sooner
   * than FAST_EMPTY_FLOOR_MS after this one began. A held poll or a real render
   * is far longer than that, so the ordinary path still re-polls at once.
   * Real clock on purpose: `now` is the status cache's seam, and this sleep is real.
   */
  async function loop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const began = Date.now();
      const r = await runOnce();
      if (signal.aborted) break;
      // Shared the tail of an iteration a stop() ended (stop → start); ours is fresh.
      if (r.outcome === "stopped") continue;
      const wait = Math.max(r.delayMs, FAST_EMPTY_FLOOR_MS - (Date.now() - began));
      if (wait > 0) await sleep(wait, signal);
    }
  }

  return {
    runOnce,
    start(): void {
      if (running) {
        // A fresh token (or a nudge) should not sit out a five-minute park.
        wake?.();
        return;
      }
      if (ac.signal.aborted) ac = new AbortController();
      // A fresh start reads Voicebox fresh: whatever was cached was measured
      // before the stop, and may be the stop's own abort (voiceboxStatus).
      cached = null;
      running = true;
      say(`started — Voicebox at ${vbHost}, brain relay at ${opts.brainUrl()}/voice/relay`);
      const signal = ac.signal;
      void loop(signal).finally(() => {
        if (ac.signal === signal) running = false;
      });
    },
    stop(): void {
      if (!running && ac.signal.aborted) return;
      running = false;
      // Taken BEFORE the abort: the iteration it cuts short clears `held` on
      // its way out, and the brain must still hear that the line is not coming.
      const job = held;
      held = null;
      ac.abort();
      state = "idle";
      if (job) quitFail(job);
    },
    get state() {
      return state;
    },
    voiceboxUrl: vbUrl,
  };
}

// ---------------------------------------------------------------------------
// The app's one instance (main.ts)
// ---------------------------------------------------------------------------

let instance: VoiceWorker | null = null;

/**
 * Start (or nudge) the app's worker. The options are read on the FIRST call
 * only — brainUrl() and token() are getters, so a changed URL or a re-linked
 * token is seen on the next poll without rebuilding anything.
 */
export function startVoiceWorker(opts: VoiceWorkerOptions): VoiceWorker {
  if (!instance) instance = createVoiceWorker(opts);
  instance.start();
  return instance;
}

export function stopVoiceWorker(): void {
  instance?.stop();
}
