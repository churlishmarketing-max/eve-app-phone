// EVE_MOCK=1 fixtures — the canonical mock data from the design handoff
// (C:\Users\mrkin\OneDrive\Desktop\EVE\Design\EVE_DESKTOP_handoff.md, §4
// Artboards A/C/D/F), copied verbatim. Mock date everywhere: SAT 29 AUG · WK 35.
//
// These are served by electron/api.ts INSTEAD of HTTP when EVE_MOCK=1. They
// are the only reason `npm run shots` can produce receipts without a live
// brain and a live token. Do not "improve" the copy — the strings are the
// design contract, and S2/S3/S4 screenshots are judged against them.
//
// Owning stream: S1. New fixtures for new panes: add, never edit in place.

import type {
  AttentionItem,
  ChatFrame,
  ConfirmResolution,
  EveState,
  FleetBlock,
  FleetUnitRow,
  Health,
  JobRow,
  PendingConfirm,
  Transcript,
  Vitals,
  VoiceList,
  Wardrobe,
  WriteResult,
} from "./contract.js";

// The mock clock. Everything time-shaped hangs off ONE instant so the confirm
// card's "expires" is always ~35 minutes out from "now", not from Aug 2026.
function nowIso(): string {
  return new Date().toISOString();
}
function minutesOut(n: number): string {
  return new Date(Date.now() + n * 60_000).toISOString();
}
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

export function mockState(): EveState {
  return {
    online: true,
    latestBrief: {
      text: "Floor sits at 2 of 3. Zach's renewal call is the day; everything else is drafts waiting on your thumb.",
      at: minutesAgo(37),
    },
    todaysThree: [
      {
        id: "t-01",
        title: "CALL ZACH — RLS RENEWAL",
        detail: "DUE 15:00",
        priority: 1,
        due_at: "2026-08-29T20:00:00.000Z",
      },
      { id: "t-02", title: "SHIP THE VSL CUT", detail: "CHURLISH FUNNEL", priority: 2, due_at: null },
      { id: "t-03", title: "INVOICE FOLLOW-UP", detail: "DRAFT READY", priority: 3, due_at: null },
    ],
    floor: { count: 2, goal: 3, source: "os", brain: 2, os: 2 },
    attentionItems: [
      {
        id: "a-01",
        kind: "silent_client",
        message: "Rustic Lumber has gone quiet — update drafted.",
        nudge_level: 2,
        ref: { client: "Rustic Lumber Store", state: "DRAFT READY" },
        created_at: minutesAgo(190),
      },
      {
        id: "a-02",
        kind: "approval",
        message: "Perry White email to Zach ready for review.",
        nudge_level: 1,
        ref: { agent: "perry-white" },
        created_at: minutesAgo(64),
      },
    ],
    clients: [
      { id: "c-01", name: "RUSTIC LUMBER STORE", cadence_days: 7, days_quiet: 12 },
      { id: "c-02", name: "CREATIVE IMPACT", cadence_days: 7, days_quiet: 3 },
    ],
    jobs: [
      { id: "j-01", agent: "research", title: "RESEARCH — COMPETITOR TEARDOWN", status: "running" },
      { id: "j-02", agent: "jsa", title: "JSA — THUMBNAIL TRIBUNAL", status: "in_approvals" },
    ],
    routines: [
      { id: "r-01", name: "MORNING PAGES", streak: 23, slot: "habit" },
      { id: "r-02", name: "MOVE MY BODY", streak: 6, slot: "habit" },
      { id: "r-03", name: "CAMERA ON SOMETHING", streak: 2, slot: "habit" },
    ],
    pendingConfirms: [
      {
        id: "confirm-mock-1",
        kind: "gmail_send",
        summary: "Renewal email to Zach — the numbers you approved on the call.",
        payload: {
          to: "zach@rusticlumberstore.com",
          subject: "Renewal — the numbers we talked about",
          body: "Zach — here's the renewal exactly as we scoped it: same retainer, the Chisel launch folded in, first invoice lands Sept 1. Say the word and it goes.",
        },
        hash: "mock-hash",
        createdAt: minutesAgo(5),
        expiresAt: minutesOut(35),
      },
    ],
    // The 10 wire nodes, Artboard F verbatim. CL and G2 are the two dark ones.
    connectors: [
      { key: "EV", name: "EVE Brain", connected: true, detail: "reasoning core" },
      { key: "SB", name: "Supabase", connected: true, detail: "memory · ledgers" },
      { key: "GM", name: "Gmail", connected: true, detail: "read · draft · send" },
      { key: "CL", name: "Calendar", connected: false, detail: "KEY NEEDED" },
      { key: "OS", name: "Churlish OS", connected: true, detail: "board · pennyworth" },
      { key: "DG", name: "Deepgram", connected: true, detail: "her ears" },
      { key: "11", name: "ElevenLabs", connected: true, detail: "her voice" },
      { key: "FL", name: "EVE Fleet", connected: true, detail: "research · tribunals" },
      { key: "WB", name: "Live Web", connected: true, detail: "search · sources" },
      { key: "G2", name: "G2 Glasses", connected: false, detail: "PHASE 5" },
    ],
  };
}

export function mockHealth(): Health {
  return {
    online: true,
    ok: true,
    phase: "5-her-reach",
    pushReady: true,
    pushAllowed: { allowed: true, why: "hosted (RAILWAY_ENVIRONMENT set)" },
    memoryReady: true,
    voiceReady: { stt: true, tts: true },
    osBoardWarm: true,
    fleet: { ready: true, live: true, count: 24 },
    connectors: mockState().connectors,
    lastDistillation: { at: minutesAgo(760) },
    lastBrief: { at: minutesAgo(437), ok: true },
  };
}

// /vitals: energy 4, sleep 7, a 14-day week strip, habits including the three
// check-in slots (TRAINED / DEEP-WORK BLOCK / ATE RIGHT — sql/003_body.sql:70-74).
export function mockVitals(days = 14): Vitals {
  const span = Math.min(31, Math.max(1, Math.round(days)));
  const dows = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const energies = [3, 4, 4, 2, 5, 4, 3, 4, 4, 3, 5, 4, 4, 4];
  const week = Array.from({ length: span }, (_, i) => {
    const back = span - 1 - i;
    const d = new Date(Date.UTC(2026, 7, 29) - back * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    return {
      on_date: iso,
      dow: dows[d.getUTCDay()],
      energy: energies[(energies.length - 1 - back + energies.length * 2) % energies.length] ?? null,
      trained: back % 3 !== 1,
      calls_ok: back % 4 !== 2,
    };
  });
  return {
    online: true,
    today: "2026-08-29",
    checkin: { on_date: "2026-08-29", energy: 4, sleep_hours: 7, note: null },
    week,
    habits: [
      { id: "r-01", name: "MORNING PAGES", cadence: "daily", slot: "habit", sort_order: 1, done_today: true, streak: 23, days: [] },
      { id: "r-02", name: "MOVE MY BODY", cadence: "daily", slot: "habit", sort_order: 2, done_today: true, streak: 6, days: [] },
      { id: "r-03", name: "CAMERA ON SOMETHING", cadence: "daily", slot: "habit", sort_order: 3, done_today: false, streak: 2, days: [] },
      { id: "k-01", name: "TRAINED", cadence: "daily", slot: "checkin", sort_order: 10, done_today: true, streak: 4, days: [] },
      { id: "k-02", name: "DEEP-WORK BLOCK", cadence: "daily", slot: "checkin", sort_order: 11, done_today: true, streak: 9, days: [] },
      { id: "k-03", name: "ATE RIGHT", cadence: "daily", slot: "checkin", sort_order: 12, done_today: false, streak: 0, days: [] },
    ],
    floor: { count: 2, goal: 3, source: "os", brain: 2, os: 2 },
    floorHistorySource: "os",
  };
}

export function mockWardrobe(): Wardrobe {
  return {
    wearing: "authority.png",
    looks: [
      { file: "authority.png", name: "AUTHORITY", url: "" },
      { file: "velvet-lounge.png", name: "VELVET LOUNGE", url: "" },
      { file: "night-shift.png", name: "NIGHT SHIFT", url: "" },
    ],
  };
}

export function mockVoices(): VoiceList {
  return { ok: true, voices: [{ id: "mock-rachel", name: "Rachel" }] };
}

export function mockTranscript(): Transcript {
  return { ok: true, transcript: "eve, log a call with the rustic lumber guys" };
}

// A minimal, self-contained MPEG-1 Layer III mono frame (32kbps/44100Hz),
// repeated 10x (~0.26s, 1040 bytes raw / ~1.4KB as base64) — hand-built for
// this fixture, not extracted from any recording. Every granule's side info
// is zeroed with part2_3_length=0, which per the Layer III bitstream spec
// means "no scalefactor/Huffman bits for this granule": the decoder renders
// that granule's spectrum as all-zero, i.e. true digital silence.
const SILENT_MP3_BASE64 =
  "//sQwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+xDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7EMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+xDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7EMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+xDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7EMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/**
 * Decodes {@link SILENT_MP3_BASE64} into the bytes electron/api.ts hands back
 * for voice.speak under EVE_MOCK=1. Pure atob/Uint8Array — no Buffer — so
 * this stays valid if a renderer file ever imports it too (this module lives
 * in src/shared and is typechecked on both sides).
 */
export function mockSpeakAudio(): ArrayBuffer {
  const bin = atob(SILENT_MP3_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// The card prints `SENT — ${detail}`, so the detail is the tail of that
// sentence and nothing else — a detail that starts with "SENT" reads as
// "SENT — SENT — …" on screen.
export function mockConfirmResolution(approve: boolean): ConfirmResolution {
  return approve
    ? { ok: true, executed: true, detail: "logged to the thread" }
    : { ok: true, executed: false, detail: "CANCELLED (mock)" };
}

export function mockWrite(): WriteResult {
  return { ok: true, mock: true };
}

/** An attention row's approve/hold/dismiss under mock — resolved, not merely
 *  written, so OpsPane's row can show the deed instead of a bare ok. */
export function mockAttentionResolution(): WriteResult {
  return { ok: true, outcome: "done" };
}

// Mock /chat: state:thinking -> three token frames -> done. Small delays so the
// renderer actually exercises its streaming path instead of getting one blob.
// `_message` is ignored on purpose: she says the same line every time, so
// screenshots are byte-stable across runs.
export function mockChatFrames(
  _message: string,
  conversationId: string,
): { frame: ChatFrame; delayMs: number }[] {
  const tokens = ["Copy. ", "This is the mock brain — ", "wire the real one in settings."];
  const frames: { frame: ChatFrame; delayMs: number }[] = [
    { frame: { type: "state", state: "thinking" }, delayMs: 40 },
  ];
  tokens.forEach((text, i) => frames.push({ frame: { type: "token", text }, delayMs: 90 * (i + 1) + 60 }));
  frames.push({
    frame: { type: "done", conversationId, fullText: tokens.join("") },
    delayMs: 90 * tokens.length + 160,
  });
  return frames;
}

export const MOCK_STAMP = { at: nowIso() };

// ---------------------------------------------------------------------------
// DISPATCH v0.1 fixtures — added 2026-09-01 for THE CORE's hub half. Shapes
// are CONTRACT-v0.1.md §1 / §2 / §4 / §5 verbatim. New exports only:
// mockState() is untouched, so the EVE_MOCK brain still answers the way every
// earlier receipt was judged against (no fleet block = the strip's honest
// no-answer state, which is exactly what an older brain produces).
// ---------------------------------------------------------------------------

/** §2 — a fleet block shaped like the real one: 5 RUNNABLE, 0 DESK, the rest
 *  WORKSPACE_ONLY. `registered` and `dispatchable` are computed from the
 *  array, never typed. */
export function mockFleet(): FleetBlock {
  const runnable: FleetUnitRow[] = [
    { key: "research", name: "Research", role: "deep web research → document", badge: "RUNNABLE", live: true, roster: false, division: "brain-workers", loc: "BRAIN", lastRunAt: minutesAgo(41) },
    { key: "justice-league", name: "Justice League", role: "Portfolio & sequencing verdict → document.", badge: "RUNNABLE", live: true, roster: true, division: "councils", loc: "CC", lastRunAt: minutesAgo(340) },
    { key: "jsa", name: "JSA", role: "Single-decision tribunal → verdict.", badge: "RUNNABLE", live: true, roster: true, division: "councils", loc: "CC", lastRunAt: minutesAgo(120) },
    { key: "suicide-squad", name: "Suicide Squad", role: "Adversarial teardown → document.", badge: "RUNNABLE", live: true, roster: true, division: "councils", loc: "CC", lastRunAt: minutesAgo(9) },
    { key: "pennyworth", name: "Pennyworth", role: "Daily money brief + proposal agent inside Churlish OS.", badge: "RUNNABLE", live: false, roster: true, division: "fleet", loc: "OS", lastRunAt: minutesAgo(4) },
  ];
  const workspace: [string, string, string, string][] = [
    ["perry-white", "Perry White", "Client email + proposal writer.", "comms"],
    ["jimmy-olsen", "Jimmy Olsen", "Minutes desk — meetings to filed records.", "comms"],
    ["mister-miracle", "Mister Miracle", "Code review desk — read-only findings.", "engineering"],
    ["big-barda", "Big Barda", "Usage warden — pre-flights build days.", "engineering"],
    ["brainiac", "Brainiac", "Research synthesis + citation ledger.", "research"],
    ["martian-manhunter", "Martian Manhunter", "Competitive intelligence sweep.", "research"],
    ["iris-west", "Iris West", "Content calendar engine.", "content"],
    ["kid-flash", "Kid Flash", "Short-form clip finder.", "content"],
    ["starfire", "Starfire", "Thumbnail + title packaging.", "content"],
    ["cyborg", "Cyborg", "Automation + n8n wiring.", "engineering"],
    ["guardian", "Guardian", "Security review + injection audit.", "engineering"],
    ["cassandra-cain", "Cassandra Cain", "Silent-client detection.", "ops"],
    ["red-robin", "Red Robin", "Invoice scoping + chase.", "ops"],
    ["doctor-mid-nite", "Doctor Mid-Nite", "Vitals + habits coach.", "ops"],
    ["alfred", "Alfred", "Editor brief generator.", "content"],
    ["watchtower", "Watchtower", "Grades finished builds.", "engineering"],
  ];
  const units: FleetUnitRow[] = [
    ...runnable,
    ...workspace.map(([key, name, role, division]) => ({
      key,
      name,
      role,
      badge: "WORKSPACE_ONLY" as const,
      live: false,
      roster: true,
      division,
      loc: "CC",
    })),
  ];
  return {
    registered: units.length,
    dispatchable: units.filter((u) => u.badge === "RUNNABLE").length,
    source: "bundled",
    at: minutesAgo(2),
    units,
  };
}

/** §5 — the RED send card a pennyworth job raised. `jobId` links it to
 *  mockDispatchJobs()[0]; that job's `confirm_id` links back. */
export function mockJobConfirm(): PendingConfirm {
  return {
    id: "confirm-mock-job",
    kind: "os_send_email",
    summary: "Email Acacia Wellness — moving the shoot to the 12th, as you said it.",
    payload: { client_name: "Acacia Wellness", jobId: "job-pw-1" },
    hash: "mock-hash-job",
    createdAt: minutesAgo(3),
    expiresAt: minutesOut(27),
    jobId: "job-pw-1",
  };
}

/** §1 — one job per status, newest first, every one inside the 24 h window. */
export function mockDispatchJobs(): JobRow[] {
  return [
    {
      id: "job-pw-1",
      unit: "pennyworth",
      agent: "pennyworth",
      title: "email Acacia about moving the shoot to the 12th",
      status: "in_approvals",
      host: "brain",
      why: "client email desk",
      tier: "red",
      confirm_id: "confirm-mock-job",
      result: {
        kind: "draft",
        client: "Acacia Wellness",
        draft:
          "Hi Acacia — quick one. We would like to move the shoot from the 9th to the 12th: same crew, same run-of-show, and it gives us the extra light in the afternoon slot. If the 12th works on your side I will lock it in and send the updated call sheet today.",
        confirmId: "confirm-mock-job",
        at: minutesAgo(3),
      },
      result_ref: null,
      cost_usd: null,
      conversation_id: "conv-mock",
      spec: {
        said: "email Acacia about moving the shoot to the 12th",
        unit: "pennyworth",
        routedBy: "model",
        routedWhy: "client email desk",
        inputs: { client: "Acacia Wellness" },
      },
      created_at: minutesAgo(4),
      finished_at: minutesAgo(3),
      updated_at: null,
    },
    {
      id: "job-sq-3",
      unit: "suicide-squad",
      agent: "suicide-squad",
      title: "tear down the Chisel launch plan",
      status: "queued",
      host: "brain",
      why: "adversarial teardown → document",
      tier: "green",
      confirm_id: null,
      result: null,
      result_ref: null,
      cost_usd: null,
      conversation_id: "conv-mock",
      spec: null,
      created_at: minutesAgo(9),
      finished_at: null,
      updated_at: null,
    },
    {
      id: "job-rs-2",
      unit: "research",
      agent: "research",
      title: "sweep the market for a Rubio Monocoat alternative under $40",
      status: "running",
      host: "brain",
      why: "deep web research → document",
      tier: "green",
      confirm_id: null,
      result: null,
      result_ref: null,
      cost_usd: null,
      conversation_id: "conv-mock",
      spec: {
        said: "sweep the market for a Rubio Monocoat alternative under $40",
        unit: "research",
        routedBy: "model",
        routedWhy: "deep web research → document",
      },
      created_at: minutesAgo(41),
      finished_at: null,
      updated_at: null,
    },
    {
      id: "job-jsa-4",
      unit: "jsa",
      agent: "jsa",
      title: "rule on the thumbnail — A or B",
      status: "done",
      host: "brain",
      why: "single-decision tribunal → verdict",
      tier: "green",
      confirm_id: null,
      result: { kind: "deliverable", chars: 8123, path: "data/deliverables/job-jsa-4.md", at: minutesAgo(96) },
      result_ref: "data/deliverables/job-jsa-4.md",
      cost_usd: 0.4172,
      conversation_id: "conv-mock",
      spec: null,
      created_at: minutesAgo(120),
      finished_at: minutesAgo(96),
      updated_at: null,
    },
    {
      id: "job-jl-5",
      unit: "justice-league",
      agent: "justice-league",
      title: "sequence Q4 — what ships first",
      status: "failed",
      host: "brain",
      why: "portfolio & sequencing verdict → document",
      tier: "green",
      confirm_id: null,
      result: { kind: "failure", reason: "worker ended: error_max_turns — no deliverable landed", at: minutesAgo(300) },
      result_ref: null,
      cost_usd: 1.0311,
      conversation_id: "conv-mock",
      spec: null,
      created_at: minutesAgo(340),
      finished_at: minutesAgo(300),
      updated_at: null,
    },
  ];
}

/** §4 — the attention item the failed job above raised. */
export function mockJobFailedItem(): AttentionItem {
  return {
    id: "a-job-5",
    kind: "job_failed",
    message:
      "justice-league — sequence Q4 — what ships first: worker ended: error_max_turns — no deliverable landed",
    nudge_level: 1,
    ref: {
      jobId: "job-jl-5",
      job_id: "job-jl-5",
      unit: "justice-league",
      reason: "worker ended: error_max_turns — no deliverable landed",
    },
    created_at: minutesAgo(300),
  };
}
