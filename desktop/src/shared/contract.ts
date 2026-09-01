// THE CONTRACT — every type that crosses the main/renderer line, plus the
// brain's own wire shapes.
//
// Ported from the phone (C:\dev\eve\app\src\eveApi.ts) and re-verified against
// the brain source (C:\dev\eve\brain\src\{state,health,connectors,vitals,
// floor,ops,voice,wardrobe}.ts) on 2026-08-30. Where the phone's types were
// looser than the brain's actual return, the brain wins.
//
// Owning stream: S1. Other streams READ this file; additions go through S1.
//
// FILING HANDS (DESK/S1): the desk wire types live in their own file so this
// one does not grow a second contract inside it. One re-export, and one `desk`
// member on EveBridge at the very bottom, added last per the documented order.

export * from "./desk-contract.js";
import type { DeskBridge } from "./desk-contract.js";

// ---------------------------------------------------------------------------
// RED-tier confirms (02 §6) — brain/src/confirm.ts
// ---------------------------------------------------------------------------

export interface PendingConfirm {
  id: string;
  kind: string;
  summary: string;
  payload: Record<string, unknown>;
  hash: string;
  createdAt: string;
  expiresAt: string;
}

// Approve on a client-executed confirm (send_sms) hands back a clientAction —
// the PHONE fires it, never the brain (05 §7). Desktop has no SIM: S3 must
// disable APPROVE on send_sms-kind cards rather than silently no-op.
export interface ConfirmResolution {
  ok: boolean;
  executed?: boolean;
  detail?: string;
  error?: string;
  clientAction?: { type: string; payload: Record<string, unknown> };
  /**
   * FILING HANDS. Set when main handed an approved `apply_file_batch` to the
   * desk executor. Its presence is what tells the card to render RUNNING rather
   * than collapsing `{ok:true, executed:false}` to the word CANCELLED — the
   * brain's `executed:false` stays honest ("nothing has left the brain") and
   * the desk outcome is the honest statement of what happened on the disk.
   */
  deskJobId?: string;
  /** Set when the desk refused the batch outright. Plain English, shown verbatim. */
  deskRefusal?: string;
}

// ---------------------------------------------------------------------------
// /state — brain/src/state.ts buildState()
// ---------------------------------------------------------------------------

export interface ConnectorStatus {
  key: string;
  name: string;
  connected: boolean;
  detail: string;
}

export interface BriefRef {
  text: string;
  at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  detail?: string | null;
  priority: number;
  due_at?: string | null;
}

export interface AttentionItem {
  id: string;
  kind: string;
  message: string;
  nudge_level: number;
  ref?: Record<string, unknown> | null;
  created_at: string;
}

export interface ClientPulse {
  id: string;
  name: string;
  cadence_days: number;
  days_quiet: number | null;
  last_touch_at?: string | null;
  status?: string;
}

export interface JobRow {
  id: string;
  agent?: string | null;
  title: string;
  status: string;
  created_at?: string;
}

export interface RoutineRow {
  id: string;
  name: string;
  streak: number;
  last_done_on?: string | null;
  slot?: "habit" | "checkin";
  active?: boolean;
}

// floor.ts FloorView: count/goal always; source/brain/os only when the OS
// bridge answered. FLOOR_GOAL = 3 is brain law (floor.ts:25).
export interface FloorView {
  count: number;
  goal: number;
  source?: "os" | "brain";
  brain?: number;
  os?: number | null;
}

// The 10 keys. `online` is the ONLY one that is always present: the degraded
// return (spine down, or a Supabase error) is
//   { online:false, pendingConfirms, connectors }
// and the network-failure return from api.ts is bare { online:false }. Every
// consumer must treat all nine other keys as possibly-absent.
export interface EveState {
  online: boolean;
  latestBrief?: BriefRef | null;
  todaysThree?: TaskRow[];
  floor?: FloorView;
  attentionItems?: AttentionItem[];
  clients?: ClientPulse[];
  jobs?: JobRow[];
  routines?: RoutineRow[];
  pendingConfirms?: PendingConfirm[];
  connectors?: ConnectorStatus[];
}

// What the poll cache hands the renderer: the state plus when it was fetched.
export interface StateUpdate {
  state: EveState;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// /vitals family — brain/src/vitals.ts
// ---------------------------------------------------------------------------

export interface VitalsCheckin {
  on_date: string;
  energy: number | null;
  sleep_hours: number | null;
  note: string | null;
}

// One cell of the day strip, oldest -> newest. `trained` is the tick of the
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
  floor?: FloorView;
  floorHistorySource?: string;
  error?: string;
}

export interface WriteResult {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// /health — brain/src/index.ts:86 + health.ts
// ---------------------------------------------------------------------------

export interface HealthStamp {
  at: string;
  detail?: Record<string, unknown>;
}

// lastBrief is POLYMORPHIC: /job stamps a HealthStamp via health.ts, but the
// in-module fallback (index.ts:34 `lastBrief`) is {at, ok, reason?}. The route
// serves `getStamp("brief") ?? lastBrief`, so both shapes reach the wire.
export type LastBrief = HealthStamp | { at: string; ok: boolean; reason?: string } | null;

export interface Health {
  // `online` is OURS, not the brain's — api.ts stamps it so a dead link never
  // reads as ok:false-from-a-live-brain.
  online: boolean;
  ok?: boolean;
  phase?: string;
  pushReady?: boolean;
  // An object, not a boolean (push.ts:101). `why` names a KEY, never a value.
  pushAllowed?: { allowed: boolean; why: string };
  memoryReady?: boolean;
  voiceReady?: { stt: boolean; tts: boolean };
  osBoardWarm?: boolean;
  fleet?: { ready: boolean; live: boolean; count: number };
  connectors?: ConnectorStatus[];
  lastDistillation?: HealthStamp | null;
  lastBrief?: LastBrief;
  error?: string;
}

// ---------------------------------------------------------------------------
// Wardrobe + voice
// ---------------------------------------------------------------------------

export interface WardrobeLook {
  file: string;
  name: string;
  url: string;
}

export interface Wardrobe {
  wearing: string | null;
  looks: WardrobeLook[];
}

export interface Transcript {
  ok: boolean;
  transcript?: string;
  error?: string;
}

/**
 * WHAT POST /voice/speak ACTUALLY DID. (Added by S4, 2026-09-01.)
 *
 * This replaces `ArrayBuffer | null`, and the null was load-bearing in the
 * worst way: a refused token, an unwired ElevenLabs key, a ten-second timeout,
 * a dead socket and an empty 200 were all the SAME value by the time they
 * reached the renderer, so the only sentence the UI could write was "NO AUDIO"
 * — which is not a diagnosis. King spent a day circling it. Voice-out still
 * degrades to text on a real turn (useVoiceTurn's gate is unchanged); what
 * changed is that the REASON survives the trip, so a diagnostic surface can
 * print it and he can act.
 *
 * `audio` is present if and only if `ok` is true and the body carried bytes.
 * `error` is plain English, safe to render, and never contains the token.
 */
export interface SpeakAudio {
  ok: boolean;
  audio?: ArrayBuffer;
  /** The brain's HTTP status, when it answered at all. */
  status?: number;
  failure?: "no-text" | "unauthorized" | "not-wired" | "brain-error" | "timeout" | "network" | "empty-body";
  error?: string;
}

/**
 * WHICH BUILD IS THE PROCESS BEHIND THIS WINDOW? (Added by S4, 2026-09-01.)
 *
 * A main process reads its script once, at launch. A BrowserWindow reads the
 * preload and the HTML from disk when the WINDOW is created. Rebuild without
 * restarting and you get a window from the future talking to a process from
 * the past — every IPC channel added since that process booted rejects with
 * "No handler registered", and any caller that swallows the rejection reports
 * a mystery. That is exactly how her voice went silent on 2026-09-01.
 *
 * `startedAt` and `builtAt` are the fix. Note the second-order property that
 * makes this work on the very first run: a main process OLDER than this change
 * does not send these fields at all, so their ABSENCE in a window that expects
 * them is itself proof of the skew.
 */
export interface PingResult {
  ok: true;
  pong: string;
  version: string;
  mock: boolean;
  smoke: boolean;
  /**
   * THE AUTHORITATIVE HALF OF THE HANDSHAKE — the build stamp compiled INTO
   * this main process (src/shared/build-stamp.ts). The renderer carries its
   * own copy of the same constant, inlined into its own bundle by the same
   * `electron-vite build`. Equal strings mean one build. Different strings
   * mean two, and no clock, threshold or file mtime is consulted to say so.
   *
   * This exists because the two fields under it are NOT sufficient. `stale`
   * is main comparing artifact mtimes to its own start time, which is blind to
   * the case where an OLD main is launched AFTER a NEW renderer was built:
   * every file is older than the process, `stale` is false, and both halves
   * read the same disk and agree while running different code. A value each
   * half CARRIES cannot do that.
   *
   * ABSENT = a main process older than 2026-09-01, which is itself proof of
   * skew when the window asking is new enough to expect it.
   */
  buildStamp?: string;
  /** ISO time this main process started. ABSENT = a main older than this build. */
  startedAt?: string;
  /** ISO mtime of the newest build artifact on disk. Null when unreadable (dev). */
  builtAt?: string | null;
  /** True when an artifact is newer than the process — rebuilt without a restart. */
  stale?: boolean;
}

export interface VoiceList {
  ok: boolean;
  voices?: { id: string; name: string }[];
  /**
   * The voice she is ACTUALLY configured to speak in (brain voice.ts:voiceId()).
   * The array is ElevenLabs' own order, not a ranking, so `voices[0]` is a guess
   * — resolve the name from this id or render nothing.
   *
   * ABSENT means the brain in front of us predates this field: it cannot say
   * which voice is live and it will IGNORE a `voiceId` on POST /voice/speak.
   * That absence is the desktop's capability flag — no override, no preview,
   * and the UI must say so in words instead of pretending a pick took.
   */
  configuredVoiceId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// POST /chat SSE frames (7.2). One union, one envelope.
// ---------------------------------------------------------------------------

export type ChatState = "thinking" | "speaking" | "idle";

export type ChatFrame =
  | { type: "state"; state: ChatState }
  | { type: "token"; text: string }
  | { type: "tool"; name: string }
  | { type: "confirm_request"; confirm: PendingConfirm }
  | { type: "done"; conversationId: string; fullText: string }
  | { type: "error"; message: string };

// Every frame is tagged with the chatId returned by chat.start, so two live
// turns (deck + summon) can never cross-contaminate.
export interface ChatFrameEvent {
  chatId: string;
  frame: ChatFrame;
}

export interface ChatStart {
  chatId: string;
}

// ---------------------------------------------------------------------------
// Config — userData/config.json. brainUrl is NOT a secret; the token never
// leaves main (only the boolean `tokenSet` does).
// ---------------------------------------------------------------------------

export type PttMode = "hold" | "toggle";

export interface EveConfig {
  brainUrl: string;
  silentAtDesk: boolean;
  pttMode: PttMode;
  hotkey: string;
  osUrl?: string;
}

// What config.get hands the renderer.
export interface ConfigView extends EveConfig {
  tokenSet: boolean;
  quietHours: boolean;
  /** A harness (smoke / shots / shot-url / tray-dump) is driving this launch —
   *  the renderer must not count it as one of his sessions. */
  harness: boolean;
}

// config.set accepts a partial patch; `token` is write-only and is peeled off
// in main (it is NEVER stored in config.json in the clear, and never read back).
export interface ConfigPatch extends Partial<EveConfig> {
  token?: string;
}

export interface ConfigWrite {
  ok: boolean;
  error?: string;
  config?: ConfigView;
}

// ---------------------------------------------------------------------------
// Push-to-talk. Electron's globalShortcut has no keyup (see main.ts) — the
// phase is emulated and downstream must treat it as advisory.
// ---------------------------------------------------------------------------

export interface PttEvent {
  phase: "down" | "up";
  /** "hold" = emulated hold (press = down, next press = up); "toggle" = tap-toggle. */
  mode: PttMode;
  /** Which window the hotkey resolved to. */
  surface: "deck" | "summon";
}

export interface SummonShownEvent {
  at: string;
}

// S4's voice-bus event, relayed window -> window through main so a turn spoken
// into Summon reaches the deck's subscribers. The union itself is S4's
// (src/renderer/voice/events.ts) and is deliberately NOT duplicated here — this
// is the structural wire shape every variant of it satisfies. Main never reads
// past `type`: it only forwards the object to the other windows.
export interface VoiceEventWire {
  type: string;
}

export type AttentionAction = "approve" | "hold" | "dismiss";

export type BrainJob =
  | "morning_brief"
  | "distill"
  | "pulse_sweep"
  | "floor_check"
  | "closeout"
  | "week_preview"
  | "routine_risk"
  | "embed_backfill"
  | "wardrobe_rotate";

// ---------------------------------------------------------------------------
// IPC channel names. Strings live HERE and nowhere else.
// ---------------------------------------------------------------------------

export const IPC = {
  // invoke
  ping: "eve:ping",
  configGet: "eve:config:get",
  configSet: "eve:config:set",
  stateGet: "eve:state:get",
  stateRefresh: "eve:state:refresh",
  health: "eve:health",
  chatStart: "eve:chat:start",
  chatAbort: "eve:chat:abort",
  confirm: "eve:confirm",
  attention: "eve:attention",
  vitals: "eve:vitals",
  checkin: "eve:checkin",
  routineTick: "eve:routine:tick",
  routineUntick: "eve:routine:untick",
  routineCreate: "eve:routine:create",
  routineArchive: "eve:routine:archive",
  jobRun: "eve:job:run",
  dispatch: "eve:dispatch",
  capture: "eve:capture",
  wardrobeGet: "eve:wardrobe:get",
  wardrobeWear: "eve:wardrobe:wear",
  voiceTranscribe: "eve:voice:transcribe",
  voiceSpeak: "eve:voice:speak",
  voices: "eve:voice:voices",
  voiceRelay: "eve:voice:relay",
  winMinimize: "eve:win:minimize",
  winMaximize: "eve:win:maximize",
  winClose: "eve:win:close",
  summonHide: "eve:summon:hide",
  deckFocus: "eve:deck:focus",
  openExternal: "eve:open:external",
  flyoutHide: "eve:flyout:hide",
  // FILING HANDS — invoke. There is deliberately no eve:desk:move.
  deskRoots: "eve:desk:roots",
  deskEnroll: "eve:desk:enroll",
  deskSetRoot: "eve:desk:setroot",
  deskPreflight: "eve:desk:preflight",
  deskCancel: "eve:desk:cancel",
  deskUndo: "eve:desk:undo",
  deskUndoPreview: "eve:desk:undopreview",
  deskUndoSince: "eve:desk:undosince",
  deskLog: "eve:desk:log",
  deskStatus: "eve:desk:status",
  deskOutcome: "eve:desk:outcome",
  // DESK/S3 — the master switch and the physical stop. Additive; the eleven
  // channels above are untouched. Neither takes a path: `arm` takes a boolean
  // and `kill` takes nothing at all.
  deskArm: "eve:desk:arm",
  deskKill: "eve:desk:kill",
  // main -> renderer
  chatFrame: "eve:chat:frame",
  stateUpdate: "eve:state:update",
  ptt: "eve:ptt",
  summonShown: "eve:summon:shown",
  voiceEvent: "eve:voice:event",
  deskProgress: "eve:desk:progress",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

// ---------------------------------------------------------------------------
// window.eve — the ONLY surface the renderer gets. No token, no Authorization
// header, no raw fetch. brainUrl is the one URL that crosses (non-secret).
// ---------------------------------------------------------------------------

export type Unsub = () => void;

export interface EveBridge {
  config: {
    get(): Promise<ConfigView>;
    set(patch: ConfigPatch): Promise<ConfigWrite>;
  };
  state: {
    get(): Promise<StateUpdate>;
    refresh(): Promise<StateUpdate>;
  };
  health(): Promise<Health>;
  chat: {
    start(args: { message: string; viaVoice?: boolean; conversationId?: string }): Promise<ChatStart>;
    abort(chatId: string): Promise<{ ok: boolean }>;
  };
  onChatFrame(cb: (e: ChatFrameEvent) => void): Unsub;
  onStateUpdate(cb: (e: StateUpdate) => void): Unsub;
  onPtt(cb: (e: PttEvent) => void): Unsub;
  onSummonShown(cb: (e: SummonShownEvent) => void): Unsub;
  /** Hand a voice-bus event to main, which re-emits it to every OTHER window. */
  voiceRelay(e: VoiceEventWire): Promise<void>;
  /** Voice-bus events relayed from another window. Never echoes the sender. */
  onVoiceEvent(cb: (e: VoiceEventWire) => void): Unsub;
  confirm(id: string, hash: string, approve: boolean): Promise<ConfirmResolution>;
  attention(id: string, action: AttentionAction): Promise<WriteResult>;
  vitals(days?: number): Promise<Vitals>;
  checkin(patch: { energy?: number; sleepHours?: number; note?: string }): Promise<WriteResult>;
  routineTick(id: string, onDate?: string): Promise<WriteResult>;
  routineUntick(id: string, onDate?: string): Promise<WriteResult>;
  routineCreate(name: string, cadence?: string, slot?: "habit" | "checkin"): Promise<WriteResult>;
  routineArchive(id: string): Promise<WriteResult>;
  jobRun(job: BrainJob, force?: boolean): Promise<WriteResult>;
  dispatch(task: string, agent?: string, client?: string): Promise<WriteResult>;
  capture(text: string, sourceLink?: string): Promise<WriteResult>;
  wardrobe: {
    get(): Promise<Wardrobe>;
    wear(file: string): Promise<WriteResult>;
  };
  voice: {
    transcribe(buf: ArrayBuffer, mime?: string): Promise<Transcript>;
    /**
     * `voiceId` overrides the brain's configured voice for THIS utterance only
     * (nothing on the brain is written). Old brains silently ignore it, which is
     * why callers must gate on VoiceList.configuredVoiceId first.
     *
     * Returns a SpeakAudio, never a bare `ArrayBuffer | null` — see SpeakAudio
     * for why that null was the bug and not the design.
     */
    speak(text: string, voiceId?: string): Promise<SpeakAudio>;
  };
  voices(): Promise<VoiceList>;
  win: {
    minimize(): void;
    maximize(): void;
    close(): void;
  };
  summon: {
    hide(): void;
  };
  /** Shows/creates + focuses the deck window (the tray-click behaviour). */
  deckFocus(): Promise<void>;
  /** Main-side allowlist ONLY — the renderer sends a key, never a URL. */
  openExternal(target: "os" | "gmail"): Promise<{ ok: boolean }>;
  /** Hides the flyout window if one exists; no-ops safely before S4 creates it. */
  flyoutHide(): Promise<void>;
  ping(): Promise<PingResult>;
  /**
   * FILING HANDS. Added LAST, per the documented order. Note what is absent:
   * there is no `desk.move`, no `desk.delete`, no `desk.emptyTrash`. The
   * renderer cannot express a file operation. `undo` is the one renderer-
   * triggerable mutation and it can only restore state King already had.
   */
  desk: DeskBridge;
}

declare global {
  interface Window {
    eve: EveBridge;
    /** Set by each renderer entry after first paint. scripts/shots.mjs waits on it. */
    __RENDER_DONE?: boolean;
  }
}
