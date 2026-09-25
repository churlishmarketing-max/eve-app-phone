// END-TO-END proof of HER VOICE RELAY against the REAL Voicebox — opt-in.
//
//   cd C:\dev\eve\brain && npx tsx verify/voice-e2e.ts
//
// NEEDS Brandon's Voicebox running at 127.0.0.1:17493 with the "Lara Eve"
// profile. Not part of any regular harness run: it makes two REAL renders on
// his Voicebox. On his GPU build with only chatterbox_turbo loaded, a 6.5s
// line rendered in 2.6s (measured 2026-09-24) and "Voice check." is shorter
// still; a render that first has to load the engine takes longer by however
// long that load is (not measured).
//
// What is real and what is stand-in:
//   REAL   — the brain's relay routes (src/voice-relay.ts, mountVoiceRoutes), the
//            "voice" connector (src/connectors.ts), the desktop worker core
//            (desktop/electron/voice-worker.ts, imported straight across the
//            repo and run by tsx), and Voicebox itself.
//   STAND-IN — the brain process: a throwaway express app on 127.0.0.1:8798
//            with the same middleware order as index.ts (global json, bearer,
//            then the voice routes) and a stand-in bearer "scratch". index.ts
//            is NEVER imported (it would load his real .env) and no .env is
//            read. ElevenLabs is forced OFF in this process only, so every
//            line either comes through Voicebox or fails in words.
//            Every client call ALSO sends `X-EVE-Voice-Accept: voicebox`, as
//            the new desktop and phone builds do — the relay is reached the
//            way a real client reaches it, not only because nothing else is
//            left to answer.
//
// The deadline (ttlMs) on each job the worker is handed is read off a clone of
// the poll's answer and printed beside that render — an INFO line, not a check.
//
// THE FENCE. Every fetch in this process — the worker's and the test client's
// — goes through one gate. Our brain's port passes. Voicebox passes ONLY for
// GET /health, GET /profiles and POST /generate/stream (it does not write his
// history), and /generate/stream at most TWICE in the whole run — a third is
// refused here before it reaches him. Anything else is recorded and refused.
//
// Staleness is forced with a clock skew on the relay (no 40s sleep).

import express from "express";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  mountVoiceRoutes,
  relayStatus,
  voiceOutReady,
  _voiceRelayStateForTests as relayState,
  _resetVoiceRelayForTests as resetRelay,
} from "../src/voice-relay.js";
import { getConnectorStatus } from "../src/connectors.js";
import { createVoiceWorker, DEFAULT_VOICEBOX_URL } from "../../desktop/electron/voice-worker.js";

// ---- env: this process only -------------------------------------------------
delete process.env.ELEVENLABS_API_KEY;
delete process.env.ELEVENLABS_VOICE_ID;
delete process.env.EVE_VOICE_PROFILE;
delete process.env.EVE_VOICE_ENGINE;
process.env.EVE_TTS_ELEVENLABS = "off";
// On his GPU build a line this short renders in seconds (see the top), far
// inside the contract's 90s default — 170s is headroom, not need. It is kept
// loose on purpose: a render slowed by an engine load, or by a Voicebox that
// has fallen back to its CPU build, then shows as a slow line in the LATENCY
// table instead of a timeout that hides how slow it was.
process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "170000";

const PORT = 8798;
const TOKEN = "scratch"; // stand-in bearer for the throwaway brain, never his
const BRAIN = `http://127.0.0.1:${PORT}`;
const VOICEBOX_PORT = "17493";
const LARA = "f311cab2-3768-4a3e-8750-ece9902c9657"; // his real "Lara Eve" profile id
const LINE = "Voice check.";
const MAX_GENERATIONS = 2;
const SPEAK_TIMEOUT_MS = 200_000; // relay 170s + margin
const OUT_DIR =
  "C:\\Users\\mrkin\\AppData\\Local\\Temp\\claude\\C--Users-mrkin-OneDrive-Desktop-EVE-Design\\07d5bd53-f29e-46bc-9d75-55f86be2c582\\scratchpad\\voice";
const WAV_B = path.join(OUT_DIR, "e2e-voicecheck.wav");
const WAV_C = path.join(OUT_DIR, "e2e-voicecheck-uuid.wav");

const SAY_OFFLINE =
  "Her voice lives on your PC in Voicebox, and your PC isn't connected right now — EVE desktop is closed or offline.";
const SAY_NO_PROFILE = 'Voicebox is running but has no voice named "Nobody Here".';

// ---- the fence --------------------------------------------------------------
const REAL_FETCH = globalThis.fetch;
const T0 = Date.now();
const stamp = () => `[+${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s]`;

let generations = 0;
const vbCalls: { key: string; at: number }[] = [];
const genCalls: { at: number; body: Record<string, unknown> | null }[] = [];
const resultPosts: number[] = [];
const jobsSeen: { at: number; ttlMs: unknown }[] = [];
const stray: string[] = [];

const fenced = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (u.hostname === "127.0.0.1" && u.port === String(PORT)) {
    if (u.pathname.startsWith("/voice/relay/result/")) resultPosts.push(Date.now());
    const r = await REAL_FETCH(input, init);
    if (u.pathname === "/voice/relay/poll" && r.status === 200) {
      // Read from a CLONE: the worker still gets the poll's body untouched.
      let ttlMs: unknown = "(unreadable)";
      try {
        ttlMs = ((await r.clone().json()) as { job?: { ttlMs?: unknown } } | null)?.job?.ttlMs;
      } catch {
        /* left "(unreadable)" — the INFO line prints it as such */
      }
      jobsSeen.push({ at: Date.now(), ttlMs });
    }
    return r;
  }
  if ((u.hostname === "127.0.0.1" || u.hostname === "localhost") && u.port === VOICEBOX_PORT) {
    const key = `${method} ${u.pathname}`;
    if (key !== "GET /health" && key !== "GET /profiles" && key !== "POST /generate/stream") {
      stray.push(`${key} (Voicebox endpoint NOT on the allow-list)`);
      return new Response(JSON.stringify({ detail: "refused by voice-e2e fence" }), { status: 500 });
    }
    if (key === "POST /generate/stream") {
      if (generations >= MAX_GENERATIONS) {
        stray.push(`${key} #${generations + 1} (over the ${MAX_GENERATIONS}-render cap)`);
        return new Response(JSON.stringify({ detail: "refused by voice-e2e: render cap reached" }), { status: 500 });
      }
      generations++;
      let body: Record<string, unknown> | null = null;
      try {
        body = JSON.parse(String(init?.body ?? "null"));
      } catch {
        /* recorded as null — the check below will say so */
      }
      genCalls.push({ at: Date.now(), body });
    }
    vbCalls.push({ key, at: Date.now() });
    return REAL_FETCH(input, init);
  }
  stray.push(`${method} ${url}`);
  return new Response("refused by voice-e2e fence", { status: 500 });
}) as typeof fetch;
globalThis.fetch = fenced;

// ---- the throwaway brain (index.ts's order: json, bearer, voice routes) -----
let skewMs = 0; // pushes the relay's clock forward; timers stay real
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).json({ error: "unauthorized" });
  next();
});
mountVoiceRoutes(app, { now: () => Date.now() + skewMs });

// ---- the REAL worker core ---------------------------------------------------
const workerLog: string[] = [];
const worker = createVoiceWorker({
  brainUrl: () => BRAIN,
  token: () => TOKEN,
  log: (l) => {
    workerLog.push(l);
    console.log(`${stamp()} [voice-worker] ${l}`);
  },
  fetch: fenced,
  // voiceboxUrl deliberately omitted: his shell's EVE_VOICEBOX_URL (if any) is
  // not read here — the default loopback address is what is under test.
  worker: "voice-e2e harness",
});

// ---- checks -----------------------------------------------------------------
let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  const line = `  ${id.padEnd(5)} ${cond ? "PASS" : "****FAIL****"}  ${what}`;
  show.push(line);
  console.log(`${stamp()} ${line.trim()}`);
}
function info(what: string) {
  const line = `  INFO  ${what}`;
  show.push(line);
  console.log(`${stamp()} ${line.trim()}`);
}
function section(t: string) {
  show.push(t);
  console.log(`${stamp()} ${t}`);
}

const latency: { step: string; ms: number | null; note: string }[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(25);
  }
  return cond();
}
const voiceConn = () => getConnectorStatus().find((c) => c.key === "voice");

async function speak(body: Record<string, unknown>) {
  const began = Date.now();
  const r = await fetch(`${BRAIN}/voice/speak`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "X-EVE-Voice-Accept": "voicebox", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SPEAK_TIMEOUT_MS),
  });
  const bytes = Buffer.from(await r.arrayBuffer());
  const ms = Date.now() - began;
  let json: { error?: string; reason?: string } | null = null;
  if ((r.headers.get("content-type") ?? "").includes("json")) {
    try {
      json = JSON.parse(bytes.toString("utf8"));
    } catch {
      /* left null; the check prints the status */
    }
  }
  return { status: r.status, headers: r.headers, bytes, json, ms, began, ended: began + ms };
}

interface WavInfo {
  ok: boolean;
  why?: string;
  chunks: string[];
  format?: number;
  channels?: number;
  sampleRate?: number;
  bits?: number;
  byteRate?: number;
  dataBytes?: number;
  declaredData?: number;
  durationS?: number;
}

/** RIFF…WAVE, walk the chunks, read fmt and data. A streamed WAV may declare a
 *  data size of 0 or 0xFFFFFFFF; then the bytes actually present are used and
 *  the mismatch is reported, not hidden. */
function parseWav(b: Buffer): WavInfo {
  const chunks: string[] = [];
  if (b.length < 12 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WAVE") {
    return { ok: false, why: `first 12 bytes are ${JSON.stringify(b.subarray(0, 12).toString("latin1"))}, not RIFF…WAVE`, chunks };
  }
  let off = 12;
  const w: WavInfo = { ok: false, chunks };
  while (off + 8 <= b.length) {
    const id = b.toString("latin1", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    chunks.push(`${id.trim()}(${size})`);
    if (id === "fmt " && off + 24 <= b.length) {
      w.format = b.readUInt16LE(off + 8);
      w.channels = b.readUInt16LE(off + 10);
      w.sampleRate = b.readUInt32LE(off + 12);
      w.byteRate = b.readUInt32LE(off + 16);
      w.bits = b.readUInt16LE(off + 22);
    }
    if (id === "data") {
      const avail = b.length - (off + 8);
      w.declaredData = size;
      w.dataBytes = size === 0 || size === 0xffffffff || size > avail ? avail : size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!w.sampleRate || !w.byteRate) return { ...w, why: "no readable fmt chunk" };
  if (!w.dataBytes) return { ...w, why: "no audio in the data chunk" };
  w.durationS = w.dataBytes / w.byteRate;
  w.ok = true;
  return w;
}

function describeWav(w: WavInfo, bytes: number): string {
  if (!w.ok) return `NOT a usable WAV: ${w.why}; chunks ${w.chunks.join(" ") || "(none)"}`;
  const declared =
    w.declaredData === w.dataBytes ? "data size as declared" : `data chunk DECLARES ${w.declaredData} B, ${w.dataBytes} B present`;
  return (
    `${bytes} B, fmt ${w.format === 1 ? "PCM" : w.format === 3 ? "float" : `tag ${w.format}`} ` +
    `${w.channels}ch ${w.bits}-bit @ ${w.sampleRate} Hz, ${w.durationS!.toFixed(2)}s of audio (${declared}); chunks ${w.chunks.join(" ")}`
  );
}

/** Samples the relay every 500ms while a render is in flight — how long did
 *  the brain believe his PC was there? Read-only: no request is made. */
function renderWindowSampler() {
  const began = Date.now();
  let offlineAt: number | null = null;
  let onlineAgainAt: number | null = null;
  const timer = setInterval(() => {
    const on = relayStatus().online;
    if (!on && offlineAt === null) offlineAt = Date.now();
    if (on && offlineAt !== null && onlineAgainAt === null) onlineAgainAt = Date.now();
  }, 500);
  return {
    stop(): string {
      clearInterval(timer);
      if (offlineAt === null) return "relay read ONLINE for the whole render";
      const from = ((offlineAt - began) / 1000).toFixed(1);
      const to = onlineAgainAt === null ? "the end of the render" : `+${((onlineAgainAt - began) / 1000).toFixed(1)}s`;
      return `relay read OFFLINE from +${from}s after the request until ${to} (no worker poll while it renders; the 40s freshness window ran out). A second /voice/speak in that gap would have been told voice-offline.`;
    },
  };
}

/** One Voicebox render through the whole relay. Returns the pieces the table needs. */
async function renderCheck(id: string, body: Record<string, unknown>, saveTo: string, wantOverrideHeader: boolean) {
  const genBefore = generations;
  const resBefore = resultPosts.length;
  const jobBefore = jobsSeen.length;
  const sampler = renderWindowSampler();
  const r = await speak(body);
  const window = sampler.stop();
  const seenJob = jobsSeen[jobBefore];
  info(
    seenJob
      ? `the job handed to the worker carried ttlMs=${String(seenJob.ttlMs)} (relay timeout ${process.env.EVE_VOICE_RELAY_TIMEOUT_MS}ms)`
      : "no job was seen handed to the worker for this line — no ttlMs to show",
  );
  const ct = r.headers.get("content-type") ?? "";
  const hdr = `${r.status} ${ct} · X-EVE-Voice=${r.headers.get("x-eve-voice")} · Cache-Control=${r.headers.get("cache-control")} · X-EVE-Voice-Override=${r.headers.get("x-eve-voice-override") ?? "(absent)"}`;
  ok(
    `${id}.1`,
    r.status === 200 && ct.startsWith("audio/wav") && r.headers.get("x-eve-voice") === "voicebox" && r.headers.get("cache-control") === "no-store",
    r.status === 200 ? hdr : `${hdr} · body ${JSON.stringify(r.json ?? r.bytes.subarray(0, 200).toString("utf8"))}`,
  );
  const override = r.headers.get("x-eve-voice-override");
  ok(
    `${id}.2`,
    wantOverrideHeader ? override === "ignored" : override === null,
    `X-EVE-Voice-Override is ${override === null ? "absent" : `"${override}"`} (${body.voiceId ? "a UUID in his profiles must be honoured" : "no override was asked for"})`,
  );
  const w = parseWav(r.bytes);
  ok(`${id}.3`, r.status === 200 && w.ok, `WAV: ${describeWav(w, r.bytes.length)}`);
  if (r.status === 200 && r.bytes.length) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(saveTo, r.bytes);
    const saved = existsSync(saveTo) ? statSync(saveTo).size : -1;
    ok(`${id}.4`, saved === r.bytes.length, `saved ${saved} B to ${saveTo}`);
  } else {
    ok(`${id}.4`, false, "nothing to save — no audio came back");
  }
  const gen = genCalls[genBefore];
  const gb = gen?.body ?? null;
  ok(
    `${id}.5`,
    generations === genBefore + 1 &&
      !!gb &&
      gb.profile_id === LARA &&
      gb.engine === "chatterbox_turbo" && // the relay's default since round 4 (one engine — voice-relay.ts voiceEngine)
      gb.language === "en" &&
      gb.personality === false &&
      gb.text === LINE,
    `Voicebox rendered exactly once (${generations - genBefore}); /generate/stream got profile_id=${gb?.profile_id}, engine=${gb?.engine}, language=${gb?.language}, personality=${gb?.personality}, text matched=${gb?.text === LINE}`,
  );
  const resultAt = resultPosts[resBefore];
  const dispatchMs = gen ? gen.at - r.began : null;
  const renderMs = gen && resultAt ? resultAt - gen.at : null;
  const deliverMs = resultAt ? r.ended - resultAt : null;
  info(`wall-clock ${(r.ms / 1000).toFixed(1)}s = queue→Voicebox ${dispatchMs ?? "?"}ms + render+read ${renderMs ?? "?"}ms + hand-back ${deliverMs ?? "?"}ms`);
  info(window);
  latency.push({ step: `(${id}) speak${body.voiceId ? " + UUID voiceId" : ""}`, ms: r.ms, note: `HTTP ${r.status}${w.ok ? `, ${w.durationS!.toFixed(2)}s audio` : ""}` });
  latency.push({ step: `    ${id}: speak → Voicebox call`, ms: dispatchMs, note: "brain queue + worker claim" });
  latency.push({ step: `    ${id}: Voicebox render + read`, ms: renderMs, note: "POST /generate/stream → WAV posted back" });
  latency.push({ step: `    ${id}: result → client`, ms: deliverMs, note: "brain hands the WAV to the requester" });
  return r;
}

/** The worker re-polls right after it delivers; wait for that poll to land. */
async function awaitOnline(label: string, ms: number): Promise<boolean> {
  const began = Date.now();
  // Already online on entry = an OLD poll is still inside the 40s window (a
  // render that finished quickly); nothing was waited for, and the row says so
  // rather than claiming a fresh poll landed.
  const at0 = relayStatus();
  const on = await waitFor(() => relayStatus().online, ms);
  const st = relayStatus();
  const note = !on
    ? "never came online"
    : at0.online
      ? `already online — last poll ${at0.ageMs}ms old, no wait`
      : "first poll landed";
  latency.push({ step: label, ms: on ? Date.now() - began : null, note });
  if (!on) {
    info(
      `relay not online after ${ms}ms: seen=${st.seen}, voicebox=${JSON.stringify(st.voicebox)}, worker state=${worker.state}`,
    );
  }
  return on;
}

// ---- the run ----------------------------------------------------------------
async function main() {
  const server = app.listen(PORT, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const stopAll = () => {
    worker.stop();
    resetRelay();
    server.closeAllConnections();
    server.close();
  };
  process.once("SIGINT", () => {
    console.log("\nSIGINT — stopping the worker and the server");
    stopAll();
    globalThis.fetch = REAL_FETCH;
    process.exit(130);
  });

  console.log(`${stamp()} throwaway brain on ${BRAIN} (port ${(server.address() as AddressInfo).port}); real Voicebox at ${DEFAULT_VOICEBOX_URL}`);
  try {
    // =====================================================================
    section("=== P — THE REAL WORKER COMES ONLINE AGAINST THE REAL VOICEBOX ===");
    ok("P.1", worker.voiceboxUrl === "http://127.0.0.1:17493", `worker's Voicebox base: ${worker.voiceboxUrl}`);
    worker.start();
    const up = await awaitOnline("worker start → relay ONLINE", 20_000);
    const st0 = relayStatus();
    ok(
      "P.2",
      up && st0.voicebox?.ok === true,
      `relay online=${st0.online}, worker="${st0.worker}", voicebox.ok=${st0.voicebox?.ok}, gpu=${st0.voicebox?.gpu}, profiles=${JSON.stringify(st0.voicebox?.profiles)}`,
    );
    if (!up) throw new Error("the worker never brought the relay online — is Voicebox running? Nothing further can be checked.");

    // =====================================================================
    section("=== (a) GET /voice/voices AND THE \"voice\" CONNECTOR ===");
    const va0 = Date.now();
    const vr = await fetch(`${BRAIN}/voice/voices`, {
      headers: { Authorization: `Bearer ${TOKEN}`, "X-EVE-Voice-Accept": "voicebox" },
    });
    const vb = (await vr.json()) as {
      ok?: boolean;
      provider?: string;
      voices?: { id: string; name: string }[];
      configuredVoiceId?: string | null;
      configuredVoiceName?: string;
    };
    latency.push({ step: "(a) GET /voice/voices", ms: Date.now() - va0, note: `HTTP ${vr.status}` });
    ok("a.1", vr.status === 200 && vb.ok === true && vb.provider === "voicebox", `HTTP ${vr.status}, ok=${vb.ok}, provider=${vb.provider}`);
    ok(
      "a.2",
      !!vb.voices?.some((v) => v.name === "Lara Eve" && v.id === LARA),
      `voices=${JSON.stringify(vb.voices)}`,
    );
    ok(
      "a.3",
      vb.configuredVoiceId === LARA && vb.configuredVoiceName === "Lara Eve",
      `configuredVoiceId=${vb.configuredVoiceId}, configuredVoiceName=${vb.configuredVoiceName}`,
    );
    const vc = voiceConn();
    ok(
      "a.4",
      vc?.connected === true && /Lara Eve/.test(vc.detail) && voiceOutReady() === true,
      `connector "voice": connected=${vc?.connected}, detail="${vc?.detail}"; /health tts (voiceOutReady)=${voiceOutReady()}`,
    );

    // =====================================================================
    section(`=== (b) POST /voice/speak {text:"${LINE}"} — REAL RENDER #1 (engine chatterbox_turbo) ===`);
    await renderCheck("b", { text: LINE }, WAV_B, false);

    // =====================================================================
    section("=== (c) THE SAME, WITH voiceId = HIS LARA EVE UUID — REAL RENDER #2 ===");
    ok("c.0", await awaitOnline("after (b): worker re-poll → ONLINE", 15_000), `relay back online before (c): online=${relayStatus().online}, ageMs=${relayStatus().ageMs}`);
    await renderCheck("c", { text: LINE, voiceId: LARA }, WAV_C, false);

    // =====================================================================
    section("=== (d) WORKER STOPPED + STALE → voice-offline, IN WORDS, FAST ===");
    worker.stop();
    await sleep(200); // let the aborted held poll close on the brain side
    skewMs += 41_000;
    const stD = relayStatus();
    const genD = generations;
    const d = await speak({ text: LINE });
    latency.push({ step: "(d) speak, worker stopped + stale", ms: d.ms, note: `HTTP ${d.status} ${d.json?.reason}` });
    ok(
      "d.1",
      d.status === 503 && d.json?.reason === "voice-offline" && d.json?.error === SAY_OFFLINE,
      `seen=${stD.seen} (age ${stD.ageMs}ms) → ${d.status} ${JSON.stringify(d.json)}`,
    );
    ok("d.2", d.ms < 1000, `answered in ${d.ms}ms (< 1000ms)`);
    const vcD = voiceConn();
    ok(
      "d.3",
      generations === genD && relayState().pending === 0,
      `no render, nothing pending (renders ${generations}, pending ${relayState().pending}); connector "voice": connected=${vcD?.connected}, detail="${vcD?.detail}"`,
    );

    // =====================================================================
    section('=== (e) EVE_VOICE_PROFILE="Nobody Here", WORKER RUNNING → no-profile, VOICEBOX NOT CALLED ===');
    worker.start();
    ok("e.0", await awaitOnline("worker restart → ONLINE", 20_000), `worker restarted, relay online=${relayStatus().online}`);
    process.env.EVE_VOICE_PROFILE = "Nobody Here";
    const genE = generations;
    const vbE = vbCalls.length;
    const e = await speak({ text: LINE });
    latency.push({ step: "(e) speak, no such profile", ms: e.ms, note: `HTTP ${e.status} ${e.json?.reason}` });
    ok(
      "e.1",
      e.status === 503 && e.json?.reason === "no-profile" && e.json?.error === SAY_NO_PROFILE,
      `${e.status} ${JSON.stringify(e.json)} in ${e.ms}ms`,
    );
    const q = relayState();
    ok("e.2", q.queued === 0 && q.pending === 0, `no job queued: queued=${q.queued}, pending=${q.pending}`);
    await sleep(1500); // a queued job would have reached /generate/stream within ms
    const since = vbCalls.slice(vbE).map((c) => c.key);
    ok(
      "e.3",
      generations === genE && !since.includes("POST /generate/stream"),
      `Voicebox /generate/stream calls in the 1.5s after: ${generations - genE}; all Voicebox calls in that window: ${since.length ? since.join(", ") + " (the worker's own status probe)" : "none"}`,
    );
    delete process.env.EVE_VOICE_PROFILE;
  } catch (err) {
    ok("RUN", false, `the run stopped early: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    stopAll();
    globalThis.fetch = REAL_FETCH;
  }

  // =====================================================================
  section("=== F — THE FENCE AND THE WORKER'S LOG ===");
  const byKey = new Map<string, number>();
  for (const c of vbCalls) byKey.set(c.key, (byKey.get(c.key) ?? 0) + 1);
  ok("F.1", stray.length === 0, `stray / refused calls: ${stray.join("; ") || "none"}`);
  ok(
    "F.2",
    [...byKey.keys()].every((k) => k === "GET /health" || k === "GET /profiles" || k === "POST /generate/stream"),
    `Voicebox saw: ${[...byKey].map(([k, n]) => `${k} ×${n}`).join(", ")}`,
  );
  ok("F.3", generations <= MAX_GENERATIONS, `real renders this run: ${generations} (cap ${MAX_GENERATIONS})`);
  ok(
    "F.4",
    !workerLog.some((l) => l.includes(LINE) || l.includes(TOKEN)),
    `${workerLog.length} worker log lines; none carries the line or the token`,
  );

  console.log("\n" + show.join("\n"));
  console.log("\n=== LATENCY ===");
  console.log(`  ${"step".padEnd(40)} ${"ms".padStart(8)}  note`);
  for (const l of latency) {
    console.log(`  ${l.step.padEnd(40)} ${(l.ms === null ? "—" : String(l.ms)).padStart(8)}  ${l.note}`);
  }
  console.log(`\n${pass} passed, ${fail} failed  (total run ${((Date.now() - T0) / 1000).toFixed(1)}s)\n`);
  process.exit(Math.min(fail, 255));
}

main().catch((e) => {
  worker.stop();
  globalThis.fetch = REAL_FETCH;
  console.error(e);
  process.exit(255);
});
