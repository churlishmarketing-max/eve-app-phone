// Brain-side proof for THE VOICE RELAY (src/voice-relay.ts, the isVoiceId
// widening in src/voice.ts, and the "voice" connector in src/connectors.ts).
//
//   cd C:\dev\eve\brain && npx tsx verify/voice-relay-harness.ts
//
// Offline and self-contained. index.ts is NEVER imported (it would load his
// real .env), so no key, no transport, no DB. The relay routes are mounted on a
// throwaway express app on 127.0.0.1 behind a stand-in bearer check, and the
// "worker" is this file making plain fetch calls — there is no Voicebox here.
// ElevenLabs is forced OFF for the offline states (key deleted from THIS
// process's env + EVE_TTS_ELEVENLABS=off; no .env is read or written), and for
// the fallback states a FAKE key is set and every request to api.elevenlabs.io
// is answered by a stub in this process — nothing leaves the machine.
//
// Staleness is proved without waiting 40s: the relay is mounted with a clock
// this file can push forward.
//
// Every client call here sends `X-EVE-Voice-Accept: voicebox`, as the new
// desktop and phone builds do, unless the check says otherwise. V22 is the
// view from an OLD client that doesn't send it.
//
// Where a check reads SOURCE TEXT rather than driving behaviour it says SOURCE.

import express from "express";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  mountVoiceRoutes,
  voiceOutReady,
  relayStatus,
  VOICE_HEALTH_DETAIL,
  _voiceRelayStateForTests as relayState,
  _resetVoiceRelayForTests as resetRelay,
} from "../src/voice-relay.js";
import { isVoiceId, isElevenLabsVoiceId, isVoiceboxProfileId } from "../src/voice.js";
import { getConnectorStatus, getHealthConnectorStatus } from "../src/connectors.js";

// ---- env: this process only -------------------------------------------------
delete process.env.ELEVENLABS_API_KEY;
delete process.env.ELEVENLABS_VOICE_ID;
delete process.env.EVE_VOICE_PROFILE;
delete process.env.EVE_VOICE_ENGINE;
delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;
process.env.EVE_TTS_ELEVENLABS = "off";

const FAKE_EL_KEY = "harness-fake-elevenlabs-key";
function elevenLabs(on: boolean) {
  if (on) {
    process.env.ELEVENLABS_API_KEY = FAKE_EL_KEY;
    delete process.env.EVE_TTS_ELEVENLABS;
  } else {
    delete process.env.ELEVENLABS_API_KEY;
    process.env.EVE_TTS_ELEVENLABS = "off";
  }
}

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_SRC = readFileSync(path.join(brainDir, "src", "index.ts"), "utf8");
const STATE_SRC = readFileSync(path.join(brainDir, "src", "state.ts"), "utf8");

const LARA = "f311cab2-3768-4a3e-8750-ece9902c9657"; // his real "Lara Eve" profile id
const OTHER = "0b7e4c1a-9d2f-4e35-8a61-3c5d7f9e1b24"; // a second, made-up profile
const RACHEL = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs default (voice.ts)
const SARAH = "EXAVITQu4vr4xnSDxMaL"; // an ElevenLabs-shaped override
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAY_OFFLINE =
  "Her voice lives on your PC in Voicebox, and your PC isn't connected right now — EVE desktop is closed or offline.";
const SAY_BUSY = "Her voice is backed up — too many lines waiting.";

// ---- outbound fetch fence ---------------------------------------------------
// Loopback to OUR test server passes through. api.elevenlabs.io is stubbed.
// Anything else — Voicebox's port included — is recorded and refused.
const REAL_FETCH = globalThis.fetch;
const FAKE_MP3 = Buffer.from("ID3\u0003fake-mp3-bytes-from-the-harness-stub");
let serverPort = 0;
const elCalls: string[] = [];
const strayCalls: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url);
  if (u.hostname === "127.0.0.1" && Number(u.port) === serverPort) return REAL_FETCH(input, init);
  if (u.hostname.endsWith("elevenlabs.io")) {
    elCalls.push(`${init?.method ?? "GET"} ${u.pathname}`);
    if (u.pathname.startsWith("/v1/text-to-speech/")) {
      return new Response(FAKE_MP3, { status: 200, headers: { "content-type": "audio/mpeg" } });
    }
    if (u.pathname === "/v2/voices") {
      return new Response(
        JSON.stringify({ voices: [{ voice_id: SARAH, name: "Sarah" }], has_more: false, total_count: 1 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
  }
  strayCalls.push(url);
  return new Response("refused by voice-relay-harness", { status: 500 });
}) as typeof fetch;

// ---- the throwaway app ------------------------------------------------------
const BEARER = `Bearer harness-${randomUUID()}`;
let skewMs = 0; // pushes the relay's clock forward; timers stay real
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.headers.authorization !== BEARER) return res.status(401).json({ error: "unauthorized" });
  next();
});
mountVoiceRoutes(app, { now: () => Date.now() + skewMs });

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  show.push(`  ${id.padEnd(7)} ${cond ? "PASS" : "****FAIL****"}  ${what}`);
}

// ---- the fake worker and the fake client ------------------------------------
let base = "";
const H = () => ({ Authorization: BEARER });

type Report = { worker?: unknown; voicebox?: unknown };
const GOOD: Report = {
  worker: "harness-desktop",
  voicebox: {
    ok: true,
    profiles: [
      { id: LARA, name: "Lara Eve" },
      { id: OTHER, name: "Studio Guy" },
    ],
    gpu: false,
  },
};
const DOWN: Report = {
  worker: "harness-desktop",
  voicebox: { ok: false, error: "connect ECONNREFUSED 127.0.0.1:17493", profiles: [], gpu: null },
};

async function poll(report: unknown, wait: number | string = 0, auth = true) {
  const r = await fetch(`${base}/voice/relay/poll?wait=${wait}`, {
    method: "POST",
    headers: { ...(auth ? H() : {}), "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  const raw = await r.text();
  let body: { job?: { id: string; text: string; profileId: string; engine: string; ttlMs?: unknown }; error?: string; reason?: string } | null = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* 204 */
  }
  return { status: r.status, raw, body };
}

/** `accept` = the X-EVE-Voice-Accept header value; null = don't send it (an old client). */
const acceptH = (accept: string | null): Record<string, string> => (accept === null ? {} : { "X-EVE-Voice-Accept": accept });

async function speak(body: Record<string, unknown>, signal?: AbortSignal, auth = true, accept: string | null = "voicebox") {
  const r = await fetch(`${base}/voice/speak`, {
    method: "POST",
    headers: { ...(auth ? H() : {}), ...acceptH(accept), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const bytes = Buffer.from(await r.arrayBuffer());
  let json: { error?: string; reason?: string } | null = null;
  if ((r.headers.get("content-type") ?? "").includes("json")) json = JSON.parse(bytes.toString("utf8"));
  return { status: r.status, headers: r.headers, bytes, json };
}

async function result(id: string, bytes: Buffer, ct = "audio/wav") {
  const r = await fetch(`${base}/voice/relay/result/${id}`, {
    method: "POST",
    headers: { ...H(), "Content-Type": ct },
    body: new Uint8Array(bytes),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

/** A /result upload that BREAKS OFF: declares `declared` bytes, sends `sent`,
 *  then cuts the connection. fetch can't send a body short of its length, so
 *  this is node:http — to our own test server only (the fence is for
 *  everything else). Resolves once the socket is gone. */
function cutUpload(id: string, declared: number, sent: number): Promise<void> {
  return new Promise((resolve) => {
    const req = http.request({
      host: "127.0.0.1",
      port: serverPort,
      method: "POST",
      path: `/voice/relay/result/${id}`,
      headers: { ...H(), "Content-Type": "audio/wav", "Content-Length": String(declared) },
    });
    req.on("error", () => resolve()); // the cut itself surfaces here
    req.on("close", () => resolve());
    req.write(Buffer.alloc(sent));
    setTimeout(() => req.destroy(), 150); // long enough for the brain to be mid-read
  });
}

async function failJob(id: string, body: unknown) {
  const r = await fetch(`${base}/voice/relay/fail/${id}`, {
    method: "POST",
    headers: { ...H(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function voices(accept: string | null = "voicebox") {
  const r = await fetch(`${base}/voice/voices`, { headers: { ...H(), ...acceptH(accept) } });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
}

function wav(tag: string): Buffer {
  const data = Buffer.from(`pcm-${tag}-${randomUUID()}`);
  const h = Buffer.alloc(12);
  h.write("RIFF", 0, "latin1");
  h.writeUInt32LE(4 + data.length, 4);
  h.write("WAVE", 8, "latin1");
  return Buffer.concat([h, data]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(10);
  }
  return cond();
}
const voiceConn = () => getConnectorStatus().find((c) => c.key === "voice");
const elConn = () => getConnectorStatus().find((c) => c.key === "elevenlabs");
/** The "voice" row as the UNAUTHENTICATED /health serves it. */
const healthVoiceConn = () => getHealthConnectorStatus().find((c) => c.key === "voice");

/** GET /voice/relay/job/:id — what the worker asks every 5s while it renders. */
async function jobState(id: string, auth = true) {
  const r = await fetch(`${base}/voice/relay/job/${id}`, { headers: auth ? H() : {} });
  return { status: r.status, body: (await r.json().catch(() => null)) as { state?: string; error?: string } | null };
}

/** Speak, have the fake worker claim it, then HANG UP the requester. Returns
 *  the job the worker is still holding. Assumes nothing else is pending. */
async function claimThenHangUp(tag: string, report: Report = GOOD) {
  const ac = new AbortController();
  const pending = speak({ text: tag }, ac.signal).catch((e: Error) => e);
  const p = await poll(report, 3);
  ac.abort();
  await pending;
  await waitFor(() => relayState().pending === 0);
  return p.body!.job!;
}

/** Speak, have the fake worker claim it, and return both halves. */
async function speakAndClaim(body: Record<string, unknown>, report: Report = GOOD, accept: string | null = "voicebox") {
  const pending = speak(body, undefined, true, accept);
  const p = await poll(report, 3);
  return { pending, job: p.body?.job, pollStatus: p.status };
}

/** Queue a line with NO poll held, age it `ageMs` on the relay's clock, then
 *  let one poll take it (the immediate handoff). Always settles the line. */
async function queuedThenPolled(tag: string, ageMs = 0) {
  const ac = new AbortController();
  const pending = speak({ text: tag }, ac.signal).catch((e: Error) => e);
  await waitFor(() => relayState().queued === 1);
  skewMs += ageMs;
  const p = await poll(GOOD, 0);
  if (p.body?.job) await result(p.body.job.id, wav(tag));
  else ac.abort();
  await pending;
  return p;
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

async function main() {
  // Capture the relay's own log lines: they are checked, not just printed.
  const logs: string[] = [];
  const realLog = console.log;
  const realWarn = console.warn;
  console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => void logs.push(a.map(String).join(" "));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  serverPort = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${serverPort}`;

  try {
    // =====================================================================
    show.push("=== V0 — isVoiceId: 20 alphanumerics OR a UUID, nothing else ===");
    const table: Array<[unknown, boolean, string]> = [
      [RACHEL, true, "ElevenLabs id (20 alnum)"],
      [LARA, true, "Voicebox UUID"],
      [LARA.toUpperCase(), true, "UUID, upper-case"],
      ["", false, "empty"],
      ["21m00Tcm4TlvDq8ikWA", false, "19 alnum"],
      ["21m00Tcm4TlvDq8ikWAMx", false, "21 alnum"],
      ["21m00Tcm4TlvDq8ikWA!", false, "20 chars with punctuation"],
      ["f311cab2-3768-4a3e-8750-ece9902c965", false, "UUID one short"],
      ["g311cab2-3768-4a3e-8750-ece9902c9657", false, "UUID with non-hex"],
      ["f311cab237684a3e8750ece9902c9657", false, "UUID without dashes"],
      [` ${LARA}`, false, "UUID with a leading space"],
      [123, false, "a number"],
      [null, false, "null"],
    ];
    const wrong = table.filter(([v, want]) => isVoiceId(v) !== want);
    ok("V0.1", wrong.length === 0, `isVoiceId table (${table.length} rows) — wrong: ${wrong.map((w) => w[2]).join(", ") || "none"}`);
    ok("V0.2", !isElevenLabsVoiceId(LARA) && isElevenLabsVoiceId(RACHEL), "a UUID is NOT an ElevenLabs id (so ElevenLabs is never handed one)");
    ok("V0.3", !isVoiceboxProfileId(RACHEL) && isVoiceboxProfileId(LARA), "a 20-alnum id is NOT a Voicebox profile id");

    // =====================================================================
    show.push("=== V1 — NOTHING IS EXEMPT FROM THE BEARER ===");
    const noAuthPoll = await poll(GOOD, 0, false);
    const noAuthSpeak = await speak({ text: "hi" }, undefined, false);
    ok("V1.1", noAuthPoll.status === 401 && relayState().worker === null, `poll without the bearer → ${noAuthPoll.status}, and no status was recorded`);
    ok("V1.2", noAuthSpeak.status === 401, `speak without the bearer → ${noAuthSpeak.status}`);
    const bearerAt = INDEX_SRC.indexOf("timingSafeEqual(auth, TOKEN_BUF)");
    const mountAt = INDEX_SRC.indexOf("mountVoiceRoutes(app)");
    ok("V1.3", bearerAt > 0 && mountAt > bearerAt, `SOURCE: index.ts mounts the voice routes AFTER the global bearer middleware (bearer @${bearerAt}, mount @${mountAt})`);
    ok(
      "V1.4",
      !/app\.(post|get)\("\/voice\/(speak|voices)"/.test(INDEX_SRC) && /voiceReady: \{ stt: sttReady\(\), tts: voiceOutReady\(\) \}/.test(INDEX_SRC),
      "SOURCE: the inline /voice/speak and /voice/voices handlers are gone from index.ts, and /health voiceReady.tts = voiceOutReady()",
    );

    // =====================================================================
    show.push("=== V2 — NO WORKER, NO ELEVENLABS: voice-offline, said in words ===");
    resetRelay();
    elevenLabs(false);
    const off = await speak({ text: "are you there" });
    ok("V2.1", off.status === 503 && off.json?.reason === "voice-offline" && off.json?.error === SAY_OFFLINE, `speak → ${off.status} ${off.json?.reason}: "${off.json?.error}"`);
    const offV = await voices();
    ok(
      "V2.2",
      offV.body.ok === false && offV.body.provider === null && offV.body.error === SAY_OFFLINE && offV.body.configuredVoiceId === null,
      `/voice/voices → ${JSON.stringify(offV.body).slice(0, 160)}`,
    );
    const vc0 = voiceConn();
    ok("V2.3", !!vc0 && vc0.connected === false && vc0.detail === SAY_OFFLINE && vc0.name === "Voice out", `connector "voice": connected=${vc0?.connected}, detail="${vc0?.detail}"`);
    const el0 = elConn();
    ok("V2.4", !!el0 && el0.connected === false && el0.detail === "ELEVENLABS_API_KEY not set" && el0.name === "ElevenLabs (voice out)", "the old \"elevenlabs\" connector is still there, unchanged in shape");
    ok("V2.5", voiceOutReady() === false, "/health voiceReady.tts (voiceOutReady) = false");
    ok("V2.6", relayState().pending === 0, "nothing was queued for a worker that isn't there");

    // =====================================================================
    show.push("=== V3 — A MALFORMED POLL IS A 400 AND RECORDS NOTHING ===");
    const bad: Array<[unknown, string]> = [
      [{}, "empty object"],
      [[], "an array"],
      [{ worker: "x" }, "no voicebox"],
      [{ worker: "x", voicebox: {} }, "voicebox without ok"],
      [{ worker: "x", voicebox: { ok: "yes" } }, "ok as a string"],
      [{ worker: 12, voicebox: { ok: true } }, "worker as a number"],
      [{ worker: "", voicebox: { ok: true } }, "empty worker"],
      [{ worker: "x", voicebox: { ok: true, profiles: "Lara" } }, "profiles not an array"],
      [{ worker: "x", voicebox: { ok: true, profiles: [{ name: "Lara Eve" }] } }, "profile without id"],
      [{ worker: "x", voicebox: { ok: true, profiles: [{ id: "a".repeat(65), name: "L" }] } }, "profile id over 64 chars"],
      [{ worker: "x", voicebox: { ok: true, gpu: "fast" } }, "gpu as a string"],
      [{ worker: "x", voicebox: { ok: false, error: 42 } }, "error as a number"],
    ];
    const badRes = await Promise.all(bad.map(([b]) => poll(b, 0)));
    const not400 = badRes.map((r, i) => (r.status === 400 && r.body?.reason === "bad-request" ? null : `${bad[i][1]}→${r.status}`)).filter(Boolean);
    ok("V3.1", not400.length === 0, `${bad.length} malformed bodies → 400 {reason:"bad-request"} — wrong: ${not400.join(", ") || "none"}`);
    ok("V3.2", relayState().worker === null, "no malformed poll recorded a status");
    const stillOff = await speak({ text: "x" });
    ok("V3.3", stillOff.status === 503 && stillOff.json?.reason === "voice-offline", "…so speak still says voice-offline");

    // clamps
    const longErr = "e".repeat(500);
    const clampRes = await poll({ worker: "w".repeat(60), voicebox: { ok: false, error: longErr } }, 0);
    const clampSpeak = await speak({ text: "x" });
    const m = /\((e+)\)/.exec(clampSpeak.json?.error ?? "");
    ok("V3.4", clampRes.status === 204 && relayState().worker === "w".repeat(40), `a 60-char worker name is clamped to 40 (got ${relayState().worker?.length})`);
    ok("V3.5", !!m && m[1].length === 300, `a 500-char voicebox.error is clamped to 300 in what he reads (got ${m?.[1].length})`);
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, name: `P${i}` }));
    await poll({ worker: "harness-desktop", voicebox: { ok: true, profiles: [...many, { id: LARA, name: "Lara Eve" }] } }, 0);
    const manyV = await voices();
    ok("V3.6", Array.isArray(manyV.body.voices) && (manyV.body.voices as unknown[]).length === 50, `60 reported profiles are clamped to 50 (got ${(manyV.body.voices as unknown[] | undefined)?.length})`);

    // =====================================================================
    show.push("=== V4 — AN EMPTY LONG-POLL ENDS IN 204 ===");
    resetRelay();
    const t0 = Date.now();
    const empty = await poll(GOOD, 0.3);
    const took = Date.now() - t0;
    ok("V4.1", empty.status === 204 && empty.raw === "" && took >= 250 && took < 3000, `wait=0.3 with nothing queued → ${empty.status}, empty body, held ${took}ms`);
    const t1 = Date.now();
    const empty0 = await poll(GOOD, 0);
    ok("V4.2", empty0.status === 204 && Date.now() - t1 < 1000, "wait=0 → 204 at once");
    const t2 = Date.now();
    const big = poll(GOOD, 999);
    await sleep(150);
    ok("V4.3", relayState().waiting === 1, "wait=999 is held (and clamped — it is released by the next check, not by 999s)");
    // Release it by giving it a job: prove the held poll is what receives one.
    const heldSpeak = speak({ text: "held-poll handoff" });
    const bigRes = await big;
    ok("V4.4", bigRes.status === 200 && bigRes.body?.job?.text === "held-poll handoff" && Date.now() - t2 < 3000, `a HELD poll is handed the job the moment it is queued (${Date.now() - t2}ms)`);
    await result(bigRes.body!.job!.id, wav("held"));
    const heldOut = await heldSpeak;
    ok("V4.5", heldOut.status === 200, "…and that line is delivered");

    // =====================================================================
    show.push("=== V5 — THE ROUND TRIP: poll → job → result → audio/wav ===");
    resetRelay();
    logs.length = 0;
    await poll(GOOD, 0);
    const SECRET = `the quiet line ${randomUUID()}`;
    const rt = await speakAndClaim({ text: SECRET });
    const job = rt.job;
    // EVE_VOICE_ENGINE unset → the ONE engine, chatterbox_turbo (round 4; was qwen — see voiceEngine).
    ok("V5.1", rt.pollStatus === 200 && !!job && job.text === SECRET && job.profileId === LARA && job.engine === "chatterbox_turbo", `job {text, profileId=${job?.profileId}, engine=${job?.engine}}`);
    ok("V5.2", !!job && UUID_RE.test(job.id), `job id is a random UUID (${job?.id})`);
    const audio = wav("roundtrip");
    const posted = await result(job!.id, audio);
    const got = await rt.pending;
    ok("V5.3", posted.status === 200 && (posted.body as { ok?: boolean })?.ok === true, `worker's /result → ${posted.status} ${JSON.stringify(posted.body)}`);
    ok(
      "V5.4",
      got.status === 200 && got.headers.get("content-type") === "audio/wav" && got.headers.get("x-eve-voice") === "voicebox" && got.headers.get("cache-control") === "no-store",
      `client gets ${got.status}, ${got.headers.get("content-type")}, X-EVE-Voice: ${got.headers.get("x-eve-voice")}, Cache-Control: ${got.headers.get("cache-control")}`,
    );
    ok("V5.5", got.bytes.equals(audio), `the exact WAV bytes came through (${got.bytes.length} bytes)`);
    ok("V5.6", got.headers.get("x-eve-voice-override") === null, "no override asked → no X-EVE-Voice-Override header");
    ok("V5.7", relayState().pending === 0 && relayState().queued === 0, "nothing retained after delivery");
    const late = await result(job!.id, audio);
    ok("V5.8", late.status === 404, `a second /result for the same job → ${late.status} (one claim, one answer)`);
    ok("V5.9", !logs.some((l) => l.includes(SECRET)), "the job's text never reached the log");
    const r2 = await speakAndClaim({ text: "x".repeat(5000) });
    ok("V5.10", r2.job?.text.length === 4000, `text is capped at 4000 chars on the way to the worker (got ${r2.job?.text.length})`);
    await result(r2.job!.id, wav("cap"));
    await r2.pending;
    const ids = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const r = await speakAndClaim({ text: `id ${i}` });
      ids.add(r.job!.id);
      await result(r.job!.id, wav(`id${i}`));
      await r.pending;
    }
    ok("V5.11", ids.size === 3, "three jobs, three distinct ids");

    // =====================================================================
    show.push("=== V6 — A UUID OVERRIDE IS HONOURED IF HIS VOICEBOX HAS IT ===");
    const ov = await speakAndClaim({ text: "other voice", voiceId: OTHER });
    ok("V6.1", ov.job?.profileId === OTHER, `voiceId=${OTHER.slice(0, 8)}… → job.profileId=${ov.job?.profileId?.slice(0, 8)}…`);
    await result(ov.job!.id, wav("other"));
    const ovOut = await ov.pending;
    ok("V6.2", ovOut.status === 200 && ovOut.headers.get("x-eve-voice-override") === null, "honoured → 200 and no \"ignored\" header");
    const ovU = await speakAndClaim({ text: "upper", voiceId: OTHER.toUpperCase() });
    ok("V6.3", ovU.job?.profileId === OTHER, "an upper-case UUID resolves to the same profile (sent on as Voicebox reported it)");
    await result(ovU.job!.id, wav("upper"));
    await ovU.pending;
    const ovX = await speakAndClaim({ text: "unknown uuid", voiceId: "11111111-2222-4333-8444-555555555555" });
    ok("V6.4", ovX.job?.profileId === LARA, "a UUID his Voicebox doesn't have → the configured voice speaks");
    await result(ovX.job!.id, wav("x"));
    const ovXOut = await ovX.pending;
    ok("V6.5", ovXOut.status === 200 && ovXOut.headers.get("x-eve-voice-override") === "ignored", `…and that is SAID: X-EVE-Voice-Override: ${ovXOut.headers.get("x-eve-voice-override")}`);

    // =====================================================================
    show.push("=== V7 — AN ELEVENLABS-FORM OVERRIDE CAN'T BE HONOURED BY VOICEBOX ===");
    const el = await speakAndClaim({ text: "el override", voiceId: SARAH });
    ok("V7.1", el.job?.profileId === LARA, `voiceId=${SARAH} (20 alnum) → the configured profile (${el.job?.profileId?.slice(0, 8)}…) speaks`);
    await result(el.job!.id, wav("el"));
    const elOut = await el.pending;
    ok("V7.2", elOut.status === 200 && elOut.headers.get("x-eve-voice") === "voicebox" && elOut.headers.get("x-eve-voice-override") === "ignored", `200 with X-EVE-Voice-Override: ${elOut.headers.get("x-eve-voice-override")}`);
    const cors = elOut.headers.get("access-control-expose-headers") ?? "";
    ok("V7.3", /X-EVE-Voice-Override/.test(cors) && /X-EVE-Voice\b/.test(cors), `both headers are exposed to browser clients (Access-Control-Expose-Headers: ${cors})`);

    // =====================================================================
    show.push("=== V8 — /fail → 502 voicebox-failed, with the worker's reason ===");
    const f = await speakAndClaim({ text: "will fail" });
    const fr = await failJob(f.job!.id, { error: "CUDA out of memory." });
    const fOut = await f.pending;
    ok("V8.1", fr.status === 200 && (fr.body as { ok?: boolean })?.ok === true, `worker's /fail → ${fr.status}`);
    ok(
      "V8.2",
      fOut.status === 502 && fOut.json?.reason === "voicebox-failed" && fOut.json?.error === "Voicebox failed to render that line: CUDA out of memory.",
      `client → ${fOut.status} ${fOut.json?.reason}: "${fOut.json?.error}"`,
    );
    ok("V8.3", (await result(f.job!.id, wav("late"))).status === 404, "audio posted after a /fail → 404");
    ok("V8.4", (await failJob(randomUUID(), { error: "x" })).status === 404, "/fail on an unknown id → 404");
    const f2 = await speakAndClaim({ text: "fail no reason" });
    await failJob(f2.job!.id, {});
    const f2Out = await f2.pending;
    ok("V8.5", f2Out.status === 502 && /without a reason/.test(f2Out.json?.error ?? ""), `a /fail with no reason still fails fast, and says the reason is missing: "${f2Out.json?.error}"`);
    const f3 = await speakAndClaim({ text: "long reason" });
    await failJob(f3.job!.id, { error: "r".repeat(400) });
    const f3Out = await f3.pending;
    const rr = /: (r+)\.$/.exec(f3Out.json?.error ?? "");
    ok("V8.6", rr?.[1].length === 300, `a 400-char /fail reason is clamped to 300 (got ${rr?.[1].length})`);

    // =====================================================================
    show.push("=== V9 — A RESULT THAT ISN'T A WAV IS A FAILURE ===");
    const nw = await speakAndClaim({ text: "not wav" });
    const nwPost = await result(nw.job!.id, Buffer.from("<html>502 Bad Gateway</html>"));
    const nwOut = await nw.pending;
    ok("V9.1", nwOut.status === 502 && nwOut.json?.reason === "voicebox-failed" && /not a WAV/.test(nwOut.json?.error ?? ""), `client → ${nwOut.status} ${nwOut.json?.reason}: "${nwOut.json?.error}"`);
    ok("V9.2", nwPost.status === 400, `the worker is told its body was refused (${nwPost.status})`);
    const riffOnly = await speakAndClaim({ text: "riff not wave" });
    const riffBody = Buffer.from("RIFF\u0000\u0000\u0000\u0000AVI LIST");
    await result(riffOnly.job!.id, riffBody);
    const riffOut = await riffOnly.pending;
    ok("V9.3", riffOut.status === 502, "RIFF without WAVE (an AVI header) → 502 too");
    ok("V9.4", (await result(randomUUID(), wav("nobody"))).status === 404, "/result on an unknown id → 404");
    const unclaimed = speak({ text: "unclaimed" });
    await waitFor(() => relayState().queued === 1);
    // An id the worker was never handed can't be answered — even with a real WAV.
    ok("V9.5", (await result(randomUUID(), wav("guess"))).status === 404 && relayState().queued === 1, "a guessed id can't answer a queued job");
    const uc = await poll(GOOD, 1);
    await result(uc.body!.job!.id, wav("uc"));
    await unclaimed;

    // =====================================================================
    show.push("=== V10 — NO RESULT IN TIME → 504 timeout ===");
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "400";
    await poll(GOOD, 0);
    const tStart = Date.now();
    const to = await speak({ text: "nobody claims this" });
    const tTook = Date.now() - tStart;
    ok(
      "V10.1",
      to.status === 504 && to.json?.reason === "timeout" &&
        to.json?.error === "EVE desktop didn't pick the line up in time — it may have just closed.",
      `unclaimed, EVE_VOICE_RELAY_TIMEOUT_MS=400 → ${to.status} after ${tTook}ms: "${to.json?.error}" (never picked up — not "switch to the GPU"; V30)`,
    );
    ok("V10.2", relayState().queued === 0 && relayState().pending === 0, "the timed-out job left the queue");
    ok("V10.3", (await poll(GOOD, 0)).status === 204, "…so the worker is not handed it afterwards");
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "1000";
    const tc = await speakAndClaim({ text: "claimed then slow" });
    const tcOut = await tc.pending;
    ok("V10.4", tcOut.status === 504 && /longer than 1s/.test(tcOut.json?.error ?? ""), `claimed but never answered → ${tcOut.status}: "${tcOut.json?.error}"`);
    const tooLate = await result(tc.job!.id, wav("too-late"));
    ok(
      "V10.5",
      tooLate.status === 200 && tooLate.body?.discarded === true && relayState().dropped === 0,
      `audio that lands after the timeout → ${tooLate.status} ${JSON.stringify(tooLate.body)}, thrown away (contract L: a timed-out job is "dropped")`,
    );
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;

    // =====================================================================
    show.push("=== V11 — WORKER SEEN, VOICEBOX DOWN → 503 voicebox-down ===");
    resetRelay();
    await poll(DOWN, 0);
    const dn = await speak({ text: "x" });
    const SAY_DOWN = "EVE desktop is on, but Voicebox isn't answering (connect ECONNREFUSED 127.0.0.1:17493). Open Voicebox.";
    ok("V11.1", dn.status === 503 && dn.json?.reason === "voicebox-down" && dn.json?.error === SAY_DOWN, `speak → ${dn.status} ${dn.json?.reason}: "${dn.json?.error}"`);
    ok("V11.2", relayState().pending === 0, "nothing queued while Voicebox is down");
    const dnV = await voices();
    ok("V11.3", dnV.body.ok === false && dnV.body.provider === null && dnV.body.error === SAY_DOWN, "/voice/voices carries the same sentence");
    const vcD = voiceConn();
    ok("V11.4", vcD?.connected === false && vcD?.detail === SAY_DOWN, `connector: connected=${vcD?.connected}, detail="${vcD?.detail}"`);

    // =====================================================================
    show.push("=== V12 — STALENESS (clock pushed, not slept) ===");
    resetRelay();
    await poll(GOOD, 0);
    skewMs = 39_000;
    ok("V12.1", voiceConn()?.connected === true && voiceOutReady() === true, "39s after the last poll → still online");
    ok("V12.2", /seen 39s ago/.test(voiceConn()?.detail ?? ""), `…and the detail says how long ago: "${voiceConn()?.detail}"`);
    skewMs = 41_000;
    const st = await speak({ text: "x" });
    ok("V12.3", st.status === 503 && st.json?.reason === "voice-offline", `41s after the last poll → ${st.status} ${st.json?.reason} (not seen any more)`);
    ok(
      "V12.4",
      voiceConn()?.connected === false && voiceOutReady() === true,
      "the bearer-gated connector says offline; /health tts stays true — a capability, not a live signal (V24)",
    );
    skewMs = 0;
    await poll(DOWN, 0);
    skewMs = 41_000;
    const stD = await speak({ text: "x" });
    ok("V12.5", stD.json?.reason === "voice-offline", `a STALE voicebox-down report reads voice-offline, not voicebox-down (${stD.json?.reason})`);
    skewMs = 0;

    // =====================================================================
    show.push("=== V13 — PROFILE RESOLUTION, and no-profile queues NOTHING ===");
    resetRelay();
    await poll(GOOD, 0);
    process.env.EVE_VOICE_PROFILE = "Nobody Here";
    const np = await speak({ text: "x" });
    ok("V13.1", np.status === 503 && np.json?.reason === "no-profile" && np.json?.error === 'Voicebox is running but has no voice named "Nobody Here".', `→ ${np.status} ${np.json?.reason}: '${np.json?.error}'`);
    ok("V13.2", relayState().queued === 0 && relayState().pending === 0 && (await poll(GOOD, 0)).status === 204, "nothing was queued, and the worker's next poll is empty");
    const npV = await voices();
    ok("V13.3", npV.body.configuredVoiceId === null && npV.body.configuredVoiceName === "Nobody Here", `/voice/voices: configuredVoiceId=${npV.body.configuredVoiceId}, configuredVoiceName=${npV.body.configuredVoiceName}`);
    ok("V13.4", /NO voice named "Nobody Here"/.test(voiceConn()?.detail ?? ""), `connector says so: "${voiceConn()?.detail}"`);
    const npO = await speakAndClaim({ text: "x", voiceId: OTHER });
    ok("V13.5", npO.job?.profileId === OTHER, "…but a UUID override his Voicebox HAS still speaks (the override wins over a missing configured voice)");
    await result(npO.job!.id, wav("npo"));
    await npO.pending;
    process.env.EVE_VOICE_PROFILE = OTHER;
    const byId = await speakAndClaim({ text: "by id" });
    ok("V13.6", byId.job?.profileId === OTHER, "EVE_VOICE_PROFILE = an exact id → that profile");
    await result(byId.job!.id, wav("byid"));
    await byId.pending;
    process.env.EVE_VOICE_PROFILE = "  lara EVE ";
    const byName = await speakAndClaim({ text: "by name" });
    ok("V13.7", byName.job?.profileId === LARA, "EVE_VOICE_PROFILE = '  lara EVE ' → Lara Eve (case-insensitive, trimmed)");
    await result(byName.job!.id, wav("byname"));
    await byName.pending;
    delete process.env.EVE_VOICE_PROFILE;
    process.env.EVE_VOICE_ENGINE = "kokoro";
    const eng = await speakAndClaim({ text: "engine" });
    ok("V13.8", eng.job?.engine === "kokoro", `EVE_VOICE_ENGINE=kokoro → job.engine=${eng.job?.engine}`);
    await result(eng.job!.id, wav("eng"));
    await eng.pending;
    process.env.EVE_VOICE_ENGINE = "banana";
    const engBad = await speakAndClaim({ text: "engine bad" });
    const bananaWarn = /EVE_VOICE_ENGINE="banana" is not a Voicebox engine .*; using chatterbox_turbo$/;
    ok(
      "V13.9",
      engBad.job?.engine === "chatterbox_turbo" && logs.some((l) => bananaWarn.test(l)),
      `an engine not on the list → ${engBad.job?.engine} (the default, now chatterbox_turbo), and the log says why and what it used instead`,
    );
    await result(engBad.job!.id, wav("engbad"));
    await engBad.pending;
    const engBad2 = await speakAndClaim({ text: "engine bad again" });
    const bananaWarns = logs.filter((l) => /EVE_VOICE_ENGINE="banana"/.test(l)).length;
    ok("V13.10", engBad2.job?.engine === "chatterbox_turbo" && bananaWarns === 1, `a second line on the same bad value → ${engBad2.job?.engine}, and the warning is NOT repeated (${bananaWarns} warning line)`);
    await result(engBad2.job!.id, wav("engbad2"));
    await engBad2.pending;
    process.env.EVE_VOICE_ENGINE = "qwen";
    const engQwen = await speakAndClaim({ text: "engine qwen, asked for" });
    ok("V13.11", engQwen.job?.engine === "qwen", `an EXPLICIT EVE_VOICE_ENGINE=qwen still wins over the default → job.engine=${engQwen.job?.engine}`);
    await result(engQwen.job!.id, wav("engqwen"));
    await engQwen.pending;
    process.env.EVE_VOICE_ENGINE = "   ";
    const warnsBefore = logs.filter((l) => l.includes("EVE_VOICE_ENGINE=")).length;
    const engBlank = await speakAndClaim({ text: "engine blank" });
    ok(
      "V13.12",
      engBlank.job?.engine === "chatterbox_turbo" && logs.filter((l) => l.includes("EVE_VOICE_ENGINE=")).length === warnsBefore,
      `EVE_VOICE_ENGINE="   " (blank) → ${engBlank.job?.engine}, the default, with no warning — blank is unset, not a typo`,
    );
    await result(engBlank.job!.id, wav("engblank"));
    await engBlank.pending;
    delete process.env.EVE_VOICE_ENGINE;

    // =====================================================================
    show.push("=== V14 — THE QUEUE CAP: 8 waiting, the 9th is busy ===");
    resetRelay();
    await poll(GOOD, 0);
    const aborts = Array.from({ length: 8 }, () => new AbortController());
    const eight = aborts.map((a, i) => speak({ text: `queued ${i}` }, a.signal).catch((e: Error) => e));
    await waitFor(() => relayState().pending === 8);
    ok("V14.1", relayState().pending === 8 && relayState().queued === 8, `8 lines waiting (pending=${relayState().pending})`);
    const ninth = await speak({ text: "one too many" });
    ok("V14.2", ninth.status === 503 && ninth.json?.reason === "busy" && ninth.json?.error === SAY_BUSY, `the 9th → ${ninth.status} ${ninth.json?.reason}: "${ninth.json?.error}"`);
    ok("V14.3", relayState().pending === 8, "…and was not queued");

    // =====================================================================
    show.push("=== V15 — THE CLIENT HANGING UP DROPS THE JOB ===");
    aborts.forEach((a) => a.abort());
    await Promise.all(eight);
    const drained = await waitFor(() => relayState().pending === 0 && relayState().queued === 0);
    ok("V15.1", drained, `8 clients hung up → queue ${relayState().queued}, pending ${relayState().pending}`);
    ok("V15.2", (await poll(GOOD, 0)).status === 204, "the worker is handed none of them");
    const ac = new AbortController();
    const gone = speak({ text: "claimed then abandoned" }, ac.signal).catch((e: Error) => e);
    const gp = await poll(GOOD, 3);
    ok("V15.3", gp.status === 200 && relayState().pending === 1, "a claimed job is pending");
    ac.abort();
    await gone;
    ok("V15.4", await waitFor(() => relayState().pending === 0), "the client hangs up mid-render → the job is dropped");
    const abandoned = await result(gp.body!.job!.id, wav("abandoned"));
    ok(
      "V15.5",
      abandoned.status === 200 && abandoned.body?.discarded === true && relayState().pending === 0,
      `…and the audio that arrives later is taken and thrown away (${abandoned.status} ${JSON.stringify(abandoned.body)}; contract L)`,
    );

    // =====================================================================
    show.push("=== V16 — /voice/voices IN EACH PROVIDER STATE ===");
    resetRelay();
    await poll(GOOD, 0);
    const onV = await voices();
    ok(
      "V16.1",
      onV.body.ok === true && onV.body.provider === "voicebox" && onV.body.configuredVoiceId === LARA && onV.body.configuredVoiceName === "Lara Eve" &&
        JSON.stringify(onV.body.voices) === JSON.stringify([{ id: LARA, name: "Lara Eve" }, { id: OTHER, name: "Studio Guy" }]),
      `relay online → provider=voicebox, configured=${onV.body.configuredVoiceName} (${String(onV.body.configuredVoiceId).slice(0, 8)}…), ${(onV.body.voices as unknown[]).length} voices`,
    );
    elevenLabs(true);
    const onBoth = await voices();
    ok("V16.2", onBoth.body.provider === "voicebox" && elCalls.length === 0, "relay online AND ElevenLabs available, opted-in client → Voicebox's list; ElevenLabs is not even asked");
    resetRelay();
    const elV = await voices();
    ok(
      "V16.3",
      elV.body.ok === true && elV.body.provider === "elevenlabs" && elV.body.configuredVoiceId === RACHEL &&
        JSON.stringify(elV.body.voices) === JSON.stringify([{ id: SARAH, name: "Sarah" }]),
      `relay offline, ElevenLabs key set → provider=elevenlabs, configuredVoiceId=${elV.body.configuredVoiceId} (stubbed list)`,
    );
    elevenLabs(false);
    const noneV = await voices();
    ok("V16.4", noneV.body.ok === false && noneV.body.provider === null && noneV.body.error === SAY_OFFLINE, "neither → ok:false, provider:null, the offline sentence");

    // =====================================================================
    show.push("=== V17 — THE ELEVENLABS FALLBACK (stubbed, byte-identical path) ===");
    resetRelay();
    elevenLabs(true);
    elCalls.length = 0;
    const fb = await speak({ text: "fallback" });
    ok(
      "V17.1",
      fb.status === 200 && fb.headers.get("content-type") === "audio/mpeg" && fb.headers.get("x-eve-voice") === "elevenlabs" && fb.bytes.equals(FAKE_MP3),
      `relay offline + key → ${fb.status} ${fb.headers.get("content-type")}, X-EVE-Voice: ${fb.headers.get("x-eve-voice")}, stub bytes through`,
    );
    ok("V17.2", elCalls.some((c) => c.includes(`/v1/text-to-speech/${RACHEL}/stream`)), `ElevenLabs was asked for the configured voice (${elCalls.join(" | ")})`);
    elCalls.length = 0;
    const fbU = await speak({ text: "fallback uuid", voiceId: LARA });
    ok(
      "V17.3",
      fbU.status === 200 && fbU.headers.get("x-eve-voice-override") === "ignored" && elCalls.some((c) => c.includes(RACHEL)) && !elCalls.some((c) => c.includes(LARA)),
      "a Voicebox UUID on the ElevenLabs path: never sent to ElevenLabs, configured voice speaks, X-EVE-Voice-Override: ignored",
    );
    elCalls.length = 0;
    const fbE = await speak({ text: "fallback sarah", voiceId: SARAH });
    ok("V17.4", fbE.status === 200 && fbE.headers.get("x-eve-voice-override") === null && elCalls.some((c) => c.includes(SARAH)), "an ElevenLabs id on the ElevenLabs path is honoured, as before");
    await poll(DOWN, 0);
    elCalls.length = 0;
    const fbD = await speak({ text: "fallback while down" });
    ok("V17.5", fbD.status === 200 && fbD.headers.get("x-eve-voice") === "elevenlabs", "worker seen but Voicebox down + key → ElevenLabs speaks");
    ok("V17.6", /^ElevenLabs \(fallback\) — key set · Voicebox not answering \(connect ECONNREFUSED/.test(voiceConn()?.detail ?? "") && voiceConn()?.connected === true, `connector: "${voiceConn()?.detail}"`);
    resetRelay();
    await poll(GOOD, 0);
    const both = await speakAndClaim({ text: "both available" });
    await result(both.job!.id, wav("both"));
    const bothOut = await both.pending;
    ok("V17.7", bothOut.headers.get("x-eve-voice") === "voicebox", "relay online AND key set, opted-in client → Voicebox wins");
    resetRelay();
    process.env.EVE_TTS_ELEVENLABS = "OFF ";
    elCalls.length = 0;
    const sw = await speak({ text: "switch off" });
    ok("V17.8", sw.status === 503 && sw.json?.reason === "voice-offline" && elCalls.length === 0, `key set but EVE_TTS_ELEVENLABS=off → ${sw.status} ${sw.json?.reason}, ElevenLabs never called`);
    const elKeep = elConn();
    ok(
      "V17.9",
      elKeep?.connected === false && elKeep?.detail === "key set, but switched off (EVE_TTS_ELEVENLABS=off)",
      `…and the old "elevenlabs" connector says so — not connected, and why: "${elKeep?.detail}" (the old APK must not try; V29)`,
    );
    elevenLabs(false);

    // =====================================================================
    show.push("=== V18 — THE \"voice\" CONNECTOR, ONLINE ===");
    resetRelay();
    await poll(GOOD, 0);
    const vOn = voiceConn();
    ok("V18.1", vOn?.connected === true && vOn?.detail === "Voicebox · Lara Eve · via EVE desktop · seen 0s ago · CPU build (slow)", `online, gpu:false → "${vOn?.detail}"`);
    await poll({ worker: "harness-desktop", voicebox: { ...(GOOD.voicebox as object), gpu: true } }, 0);
    ok("V18.2", voiceConn()?.detail === "Voicebox · Lara Eve · via EVE desktop · seen 0s ago · GPU", `gpu:true → "${voiceConn()?.detail}"`);
    resetRelay();
    elevenLabs(true);
    ok("V18.3", voiceConn()?.connected === true && voiceConn()?.detail === "ElevenLabs (fallback) — key set · EVE desktop not connected", `fallback only → "${voiceConn()?.detail}"`);
    ok("V18.4", voiceOutReady() === true, "/health voiceReady.tts = true on the fallback");
    elevenLabs(false);
    const keys = getConnectorStatus().map((c) => c.key);
    ok("V18.5", keys.filter((k) => k === "voice").length === 1 && keys.includes("elevenlabs"), `connector keys: ${keys.join(", ")}`);

    // =====================================================================
    show.push("=== V19 — BAD REQUESTS ON /voice/speak ===");
    resetRelay();
    await poll(GOOD, 0);
    const noText = await speak({});
    const blank = await speak({ text: "   " });
    const junk = await speak({ text: "x", voiceId: "not-a-voice" });
    ok("V19.1", noText.status === 400 && noText.json?.reason === "bad-request" && typeof noText.json?.error === "string", `no text → ${noText.status} ${JSON.stringify(noText.json)}`);
    ok("V19.2", blank.status === 400 && blank.json?.reason === "bad-request", "blank text → 400 bad-request");
    ok("V19.3", junk.status === 400 && junk.json?.reason === "bad-request" && /UUID/.test(junk.json?.error ?? ""), `junk voiceId → 400: "${junk.json?.error}"`);
    ok("V19.4", relayState().pending === 0, "none of them queued anything");

    // =====================================================================
    show.push("=== V20 — LOGGING AND THE FENCE ===");
    resetRelay();
    logs.length = 0;
    for (let i = 0; i < 5; i++) await poll(GOOD, 0);
    await poll(DOWN, 0);
    await poll(DOWN, 0);
    await poll(GOOD, 0);
    const relayLines = logs.filter((l) => l.startsWith("[voice] relay"));
    ok("V20.1", relayLines.length === 3, `8 polls across 3 states → ${relayLines.length} log lines (one per state change, not per poll)`);
    ok("V20.2", strayCalls.length === 0, `no request left this process except the stubbed ElevenLabs host (stray: ${strayCalls.join(", ") || "none"})`);
    ok("V20.3", !strayCalls.some((u) => u.includes(":17493")), "Voicebox's port was never called");

    // =====================================================================
    // The worker sends no polls while it renders (~30s for a one-second line on
    // his CPU build). The reported repro: a poll held 20s, a job handed to it,
    // the clock pushed 21s → the relay read OFFLINE mid-render.
    show.push("=== V21 — A WORKER MID-RENDER IS STILL THERE ===");
    resetRelay();
    elevenLabs(false);
    logs.length = 0;
    skewMs = 0;
    const held21 = poll(GOOD, 5); // the poll arrives at t=0 and is held…
    await waitFor(() => relayState().waiting === 1);
    skewMs = 20_000; // …20s later a line arrives and is handed to it
    const long21 = speak({ text: "a long render" });
    const h21 = await held21;
    ok("V21.1", h21.status === 200 && !!h21.body?.job && relayState().pending === 1, `a poll held 20s is handed the job (status ${h21.status}, pending=${relayState().pending})`);
    skewMs = 41_000; // 21s into the render, 41s after the poll arrived
    const s21a = relayStatus();
    ok(
      "V21.2",
      s21a.online && voiceOutReady() && voiceConn()?.connected === true,
      `41s after the poll, 21s into the render → online=${s21a.online}, /health tts=${voiceOutReady()}, connector connected=${voiceConn()?.connected}`,
    );
    ok("V21.3", (s21a.ageMs ?? 0) >= 21_000 && (s21a.ageMs ?? 0) < 23_000, `handing out the job counted as contact: age is from the handoff, not the poll (ageMs=${s21a.ageMs})`);
    skewMs = 100_000; // 80s into the render: past the 40s window, inside the (real-timer) 90s relay timeout
    const s21b = relayStatus();
    ok("V21.4", s21b.online && (s21b.ageMs ?? 0) > 40_000, `80s into the render (ageMs=${s21b.ageMs}) → still online: a claimed, unanswered job is proof it is working`);
    const next21 = speak({ text: "the next line" });
    await waitFor(() => relayState().queued === 1);
    ok("V21.5", relayState().queued === 1 && relayState().pending === 2, `a second line mid-render is QUEUED behind it (queued=${relayState().queued}, pending=${relayState().pending}), not refused voice-offline`);
    const v21 = await voices();
    ok("V21.6", v21.body.ok === true && v21.body.provider === "voicebox", `/voice/voices mid-render → provider=${v21.body.provider}`);
    ok("V21.7", /^Voicebox · Lara Eve · via EVE desktop/.test(voiceConn()?.detail ?? ""), `connector mid-render: "${voiceConn()?.detail}"`);
    await result(h21.body!.job!.id, wav("long"));
    const long21Out = await long21;
    ok("V21.8", long21Out.status === 200 && long21Out.headers.get("content-type") === "audio/wav", `the long render is delivered (${long21Out.status} ${long21Out.headers.get("content-type")})`);
    const s21c = relayStatus();
    ok("V21.9", s21c.online && (s21c.ageMs ?? 1e9) < 2000, `its /result counted as contact (ageMs=${s21c.ageMs})`);
    const p21 = await poll(GOOD, 0);
    if (p21.body?.job) await result(p21.body.job.id, wav("next"));
    const next21Out = await next21;
    ok("V21.10", p21.status === 200 && next21Out.status === 200, `the queued line is then claimed and delivered (poll ${p21.status}, speak ${next21Out.status})`);
    const onlineLogs = logs.filter((l) => l.startsWith("[voice] relay online")).length;
    ok("V21.11", onlineLogs === 1, `"relay online" logged once for the whole sequence, not again after the render (${onlineLogs})`);
    skewMs += 41_000; // nothing in hand now: the window rules again
    ok(
      "V21.12",
      !relayStatus().online && voiceConn()?.connected === false && voiceOutReady() === true,
      `41s after the last contact with no job in hand → offline again (ageMs=${relayStatus().ageMs}); /health tts stays true (a capability, V24)`,
    );
    // A claimed job counts only until it settles — the relay timeout settles it.
    skewMs = 0;
    await poll(GOOD, 0);
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "500";
    const orphan = await speakAndClaim({ text: "never answered" });
    skewMs = 60_000;
    ok("V21.13", relayStatus().online, "a claimed job keeps the worker seen 60s past contact while its relay timeout hasn't fired…");
    const orphanOut = await orphan.pending;
    ok("V21.14", orphanOut.status === 504 && !relayStatus().online, `…and not past it: the job timed out (${orphanOut.status}), nothing is in hand, 60s since contact → offline`);
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;
    skewMs = 0;
    await poll(GOOD, 0);
    const late21 = await speakAndClaim({ text: "fails late" });
    skewMs = 60_000;
    await failJob(late21.job!.id, { error: "render died" });
    await late21.pending;
    const s21d = relayStatus();
    ok("V21.15", s21d.online && (s21d.ageMs ?? 1e9) < 2000, `a /fail counts as contact too (ageMs=${s21d.ageMs} after it, clock 60s on)`);
    skewMs = 0;

    // =====================================================================
    show.push("=== V22 — OPT-IN: A CLIENT WITHOUT X-EVE-Voice-Accept KEEPS ELEVENLABS ===");
    resetRelay();
    elevenLabs(true);
    await poll(GOOD, 0);
    // A relay bug here would otherwise hang a check for 90s; make it fail fast.
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "2000";
    elCalls.length = 0;
    const oldPhone = await speak({ text: "old phone" }, undefined, true, null);
    ok(
      "V22.1",
      oldPhone.status === 200 && oldPhone.headers.get("content-type") === "audio/mpeg" && oldPhone.headers.get("x-eve-voice") === "elevenlabs" &&
        oldPhone.bytes.equals(FAKE_MP3) && elCalls.some((c) => c.includes(`/v1/text-to-speech/${RACHEL}/stream`)),
      `relay ONLINE + key, no header → ${oldPhone.status} ${oldPhone.headers.get("content-type")}, X-EVE-Voice: ${oldPhone.headers.get("x-eve-voice")} (the path it had before the relay)`,
    );
    ok("V22.2", relayState().pending === 0 && relayState().queued === 0, "…and nothing was queued for the worker");
    const oldPhoneV = await voices(null);
    ok("V22.3", oldPhoneV.body.provider === "elevenlabs" && oldPhoneV.body.configuredVoiceId === RACHEL, `…and its /voice/voices describes the voice it will hear (provider=${oldPhoneV.body.provider}, configuredVoiceId=${oldPhoneV.body.configuredVoiceId})`);
    const newPhoneV = await voices("voicebox");
    ok("V22.4", newPhoneV.body.provider === "voicebox" && newPhoneV.body.configuredVoiceId === LARA, `an opted-in client's /voice/voices → provider=${newPhoneV.body.provider}`);
    elCalls.length = 0;
    const oldUuid = await speak({ text: "old phone uuid", voiceId: LARA }, undefined, true, null);
    ok(
      "V22.5",
      oldUuid.headers.get("x-eve-voice") === "elevenlabs" && oldUuid.headers.get("x-eve-voice-override") === "ignored" && !elCalls.some((c) => c.includes(LARA)) && relayState().pending === 0,
      "no header + a Voicebox UUID → ElevenLabs, the UUID never sent to it, X-EVE-Voice-Override: ignored",
    );
    const forms: Array<[string, boolean]> = [
      ["voicebox", true],
      ["VoiceBox", true],
      ["audio/mpeg, voicebox", true],
      ["  voicebox  ", true],
      ["voiceboxx", false],
      ["elevenlabs", false],
      ["", false],
    ];
    const wrongForms: string[] = [];
    for (const [h, want] of forms) {
      const pending = speak({ text: `form ${h}` }, undefined, true, h);
      if (want) {
        const p = await poll(GOOD, 3);
        if (p.body?.job) await result(p.body.job.id, wav("form"));
      }
      const got = await pending;
      if ((got.status === 200 && got.headers.get("x-eve-voice") === "voicebox") !== want || got.status !== 200) wrongForms.push(JSON.stringify(h));
    }
    ok("V22.6", wrongForms.length === 0, `header forms (${forms.length}: case, comma list, whitespace; near-misses refused) — wrong: ${wrongForms.join(", ") || "none"}`);
    elevenLabs(false);
    const noEl = await speakAndClaim({ text: "no elevenlabs" }, GOOD, null);
    if (noEl.job) await result(noEl.job.id, wav("noel"));
    const noElOut = await noEl.pending;
    ok("V22.7", !!noEl.job && noElOut.status === 200 && noElOut.headers.get("x-eve-voice") === "voicebox", `relay online, NO ElevenLabs, no header → the relay (the only voice there is, instead of a 503): ${noElOut.status} ${noElOut.headers.get("x-eve-voice")}`);
    ok("V22.8", (await voices(null)).body.provider === "voicebox", "…and /voice/voices agrees");
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;
    ok(
      "V22.9",
      /"Access-Control-Allow-Headers", "Authorization, Content-Type, X-EVE-Voice-Accept"/.test(INDEX_SRC),
      "SOURCE: index.ts CORS allows the X-EVE-Voice-Accept header (the phone WebView's preflight would refuse it otherwise)",
    );
    ok("V22.10", strayCalls.length === 0, `the fence held through V21–V22 (stray: ${strayCalls.join(", ") || "none"})`);

    // =====================================================================
    // The worker aborts its render at this deadline instead of its own 180s,
    // so audio is never made for a line the brain already answered 504.
    show.push("=== V23 — EVERY JOB CARRIES ITS DEADLINE (ttlMs), QUEUE TIME TAKEN OFF ===");
    resetRelay();
    elevenLabs(false);
    skewMs = 0;
    await poll(GOOD, 0);
    const d23 = await queuedThenPolled("deadline default");
    const ttlD = d23.body?.job?.ttlMs;
    ok(
      "V23.1",
      d23.status === 200 && isInt(ttlD) && ttlD <= 90_000 && ttlD >= 89_000,
      `default relay timeout (90s), immediate handoff → job.ttlMs=${ttlD} (integer, ≤ 90000)`,
    );
    ok(
      "V23.2",
      JSON.stringify(Object.keys(d23.body?.job ?? {})) === JSON.stringify(["id", "text", "profileId", "engine", "ttlMs"]),
      `the job is exactly {${Object.keys(d23.body?.job ?? {}).join(", ")}}`,
    );
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "60000";
    const f23 = await queuedThenPolled("deadline fresh");
    const ttlF = f23.body?.job?.ttlMs;
    const a23 = await queuedThenPolled("deadline aged 20s", 20_000); // relay clock +20s while it sits queued
    const ttlA = a23.body?.job?.ttlMs;
    ok("V23.3", isInt(ttlF) && ttlF <= 60_000 && ttlF >= 59_000, `EVE_VOICE_RELAY_TIMEOUT_MS=60000, handed out at once → ttlMs=${ttlF} (≤ 60000)`);
    ok(
      "V23.4",
      isInt(ttlA) && isInt(ttlF) && ttlA >= 39_000 && ttlA <= 40_000 && ttlF - ttlA >= 19_000 && ttlF - ttlA <= 21_000,
      `the same line after 20s in the queue → ttlMs=${ttlA} (shrank by ${isInt(ttlA) && isInt(ttlF) ? ttlF - ttlA : "?"}ms: the queue time is taken off)`,
    );
    skewMs = 0;
    await poll(GOOD, 0);
    const held23 = poll(GOOD, 3);
    await waitFor(() => relayState().waiting === 1);
    const h23speak = speak({ text: "deadline via a held poll" });
    const h23 = await held23;
    const ttlH = h23.body?.job?.ttlMs;
    if (h23.body?.job) await result(h23.body.job.id, wav("h23"));
    await h23speak;
    ok(
      "V23.5",
      h23.status === 200 && h23.body?.job?.text === "deadline via a held poll" && isInt(ttlH) && ttlH <= 60_000 && ttlH >= 59_000,
      `dispatch to a HELD poll carries it too → ttlMs=${ttlH}`,
    );
    const late23 = await queuedThenPolled("deadline already past", 65_000); // relay clock past the 60s timeout, real timer not yet fired
    ok("V23.6", late23.body?.job?.ttlMs === 1000, `a line handed out past its deadline on the relay clock → ttlMs=${late23.body?.job?.ttlMs} (the 1000ms floor, never 0 or negative)`);
    skewMs = 0;
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "1500.7";
    await poll(GOOD, 0);
    const frac23 = await queuedThenPolled("deadline fractional timeout");
    const ttlFr = frac23.body?.job?.ttlMs;
    ok("V23.7", isInt(ttlFr) && ttlFr <= 1500 && ttlFr >= 1000, `EVE_VOICE_RELAY_TIMEOUT_MS=1500.7 → ttlMs=${ttlFr} (still an integer, ≤ the timeout, ≥ 1000)`);
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;

    // =====================================================================
    // /health is exempt from the bearer. A tts that tracked the live relay
    // would tell anyone who can reach the brain when his PC is on.
    show.push("=== V24 — /health tts IS A CAPABILITY, NOT \"IS HIS PC ON\" ===");
    resetRelay();
    elevenLabs(false);
    skewMs = 0;
    ok("V24.1", voiceOutReady() === false, "fresh boot, no worker ever, no ElevenLabs → tts=false");
    const s24 = await poll(GOOD, 0, false);
    const m24 = await poll({ worker: "x" }, 0);
    ok("V24.2", s24.status === 401 && m24.status === 400 && voiceOutReady() === false, `a poll refused ${s24.status} (no bearer) or ${m24.status} (malformed) does not flip it`);
    await poll(GOOD, 0);
    ok("V24.3", voiceOutReady() === true && relayStatus().online, "the worker's first real poll → tts=true");
    skewMs = 41_000;
    const v24 = await voices();
    ok(
      "V24.4",
      voiceOutReady() === true && !relayStatus().online && voiceConn()?.connected === false && v24.body.provider === null && v24.body.error === SAY_OFFLINE,
      `relay STALE (41s) → tts STAYS true, while the voice connector (connected=${voiceConn()?.connected}) and /voice/voices (provider=${v24.body.provider}) say offline`,
    );
    skewMs = 10 * 3_600_000;
    ok("V24.5", voiceOutReady() === true, "10 hours after the last poll → still true: there is no flip to watch");
    skewMs = 0;
    await poll(DOWN, 0);
    ok("V24.6", voiceOutReady() === true && !relayStatus().online, "the worker then reports Voicebox down → tts still true (the live state is the connector's to say)");
    resetRelay();
    ok("V24.7", voiceOutReady() === false, "a brain restart (the reset) forgets it: no worker since boot, no ElevenLabs → false");
    elevenLabs(true);
    ok("V24.8", voiceOutReady() === true, "ElevenLabs available, no worker ever → true");
    elevenLabs(false);

    // =====================================================================
    show.push("=== V25 — A POLL WHOSE OWN REPORT SAYS VOICEBOX IS DOWN IS HANDED NOTHING ===");
    resetRelay();
    elevenLabs(false);
    skewMs = 0;
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "5000";
    await poll(GOOD, 0);
    const c25 = speak({ text: "queued while up" });
    await waitFor(() => relayState().queued === 1);
    const pDown = await poll(DOWN, 0);
    ok(
      "V25.1",
      pDown.status === 204 && !pDown.body?.job && relayState().queued === 1 && relayState().pending === 1,
      `a queued line + a poll reporting Voicebox down → ${pDown.status}, no job; the line stays queued (queued=${relayState().queued})`,
    );
    const pUp = await poll(GOOD, 0);
    if (pUp.body?.job) await result(pUp.body.job.id, wav("c25"));
    const c25Out = await c25;
    ok("V25.2", pUp.status === 200 && pUp.body?.job?.text === "queued while up" && c25Out.status === 200, `the next healthy poll is handed it and it is delivered (poll ${pUp.status}, speak ${c25Out.status})`);
    const heldDown = poll(DOWN, 2); // held all the same: its worker keeps its cadence
    await waitFor(() => relayState().waiting === 1);
    await poll(GOOD, 0); // relay online again; nothing queued → 204
    const c25b = speak({ text: "arrives while a down poll is held" });
    await waitFor(() => relayState().queued === 1, 500);
    ok(
      "V25.3",
      relayState().queued === 1 && relayState().waiting === 1,
      `a line arriving while only a Voicebox-down poll is held is NOT dispatched to it (queued=${relayState().queued}, held=${relayState().waiting})`,
    );
    const hd = await heldDown;
    ok("V25.4", hd.status === 204 && !hd.body?.job, `the held down-poll ends empty (${hd.status})`);
    const pUp2 = await poll(GOOD, 0);
    if (pUp2.body?.job) await result(pUp2.body.job.id, wav("c25b"));
    const c25bOut = await c25b;
    ok("V25.5", pUp2.body?.job?.text === "arrives while a down poll is held" && c25bOut.status === 200, `a healthy poll then takes it and it is delivered (speak ${c25bOut.status})`);
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "1000";
    await poll(GOOD, 0);
    const c25c = speak({ text: "only down polls come" });
    await waitFor(() => relayState().queued === 1);
    const pDown3 = await poll(DOWN, 0);
    const c25cOut = await c25c;
    ok(
      "V25.6",
      pDown3.status === 204 && c25cOut.status === 504 && c25cOut.json?.reason === "timeout",
      `only down-polls arrive → never handed out; the requester gets the normal relay timeout (${c25cOut.status} ${c25cOut.json?.reason})`,
    );
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;
    ok("V25.7", strayCalls.length === 0, `the fence held through V23–V25 (stray: ${strayCalls.join(", ") || "none"})`);

    // =====================================================================
    // Contract J. The worker asks this every 5s while it renders and stops on
    // "dropped" or 404, so his CPU isn't held for a line nobody will hear.
    show.push("=== V26 — JOB STATUS: pending → dropped (hang-up, timeout), 404 unknown, bounded ===");
    resetRelay();
    elevenLabs(false);
    skewMs = 0;
    await poll(GOOD, 0);
    const u26 = await jobState(randomUUID());
    ok("V26.1", u26.status === 404, `an id the brain never issued → ${u26.status}`);
    ok("V26.2", (await jobState(randomUUID(), false)).status === 401, "without the bearer → 401 (the status route is not exempt)");
    const ac26 = new AbortController();
    const req26 = speak({ text: "status, then he hangs up" }, ac26.signal).catch((e: Error) => e);
    const p26 = await poll(GOOD, 3);
    const id26 = p26.body!.job!.id;
    const s26a = await jobState(id26);
    ok("V26.3", s26a.status === 200 && JSON.stringify(s26a.body) === '{"state":"pending"}', `claimed, requester still waiting → ${s26a.status} ${JSON.stringify(s26a.body)}`);
    ac26.abort();
    await req26;
    await waitFor(() => relayState().pending === 0);
    const s26b = await jobState(id26);
    ok("V26.4", s26b.status === 200 && JSON.stringify(s26b.body) === '{"state":"dropped"}', `the requester hangs up → ${s26b.status} ${JSON.stringify(s26b.body)}`);
    // Nothing delivered: a line queued behind it must not be answered with the
    // dropped line's audio, and the record ends with the answer.
    const next26 = speak({ text: "the next line, with its own audio" });
    await waitFor(() => relayState().queued === 1);
    const wavA = wav("dropped-A");
    const r26 = await result(id26, wavA);
    ok("V26.5", r26.status === 200 && JSON.stringify(r26.body) === '{"ok":true,"discarded":true}', `/result for the dropped job → ${r26.status} ${JSON.stringify(r26.body)} (not 404)`);
    ok(
      "V26.6",
      relayState().queued === 1 && relayState().pending === 1 && relayState().dropped === 0,
      `…and its audio went nowhere: the line queued behind it is still waiting (queued=${relayState().queued}), the dropped record is gone (dropped=${relayState().dropped})`,
    );
    const p26b = await poll(GOOD, 0);
    const wavB = wav("own-B");
    if (p26b.body?.job) await result(p26b.body.job.id, wavB);
    const out26 = await next26;
    ok("V26.7", out26.status === 200 && out26.bytes.equals(wavB) && !out26.bytes.equals(wavA), "…and that next line is answered with ITS OWN audio");
    ok("V26.8", (await jobState(id26)).status === 404, "once answered, the dropped id reads 404");
    ok("V26.9", (await jobState(p26b.body!.job!.id)).status === 404, "a delivered job's id reads 404");
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "600";
    const t26 = await speakAndClaim({ text: "claimed, then the relay times it out" });
    const s26e = await jobState(t26.job!.id);
    const t26out = await t26.pending;
    const s26f = await jobState(t26.job!.id);
    ok(
      "V26.10",
      s26e.body?.state === "pending" && t26out.status === 504 && s26f.status === 200 && s26f.body?.state === "dropped",
      `claimed, then the relay timeout → "${s26e.body?.state}" before, ${t26out.status} to the requester, "${s26f.body?.state}" after`,
    );
    const f26 = await failJob(t26.job!.id, { error: "EVE desktop closed before the line finished" });
    ok(
      "V26.11",
      f26.status === 200 && JSON.stringify(f26.body) === '{"ok":true,"discarded":true}' && (await jobState(t26.job!.id)).status === 404,
      `the quit-time /fail for a dropped job → ${f26.status} ${JSON.stringify(f26.body)}, and the id then reads 404`,
    );
    const nc26 = await speak({ text: "never claimed, times out" });
    ok("V26.12", nc26.status === 504 && relayState().dropped === 0, "an UNCLAIMED job that times out leaves no record (its id never left the brain)");
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;
    // Retention by time: deadline (≈ 90s, the default timeout) + 30s.
    skewMs = 0;
    const k26 = await claimThenHangUp("kept a while");
    skewMs = 90_000 + 28_000;
    const s26g = await jobState(k26.id);
    skewMs = 90_000 + 32_000;
    const s26h = await jobState(k26.id);
    ok(
      "V26.13",
      s26g.body?.state === "dropped" && s26h.status === 404 && relayState().dropped === 0,
      `retention: 28s past its deadline → "${s26g.body?.state}"; 32s past → ${s26h.status}, and the record is gone (dropped=${relayState().dropped})`,
    );
    // Retention by count.
    skewMs = 0;
    const ids26: string[] = [];
    for (let i = 0; i < 33; i++) ids26.push((await claimThenHangUp(`cap ${i}`)).id);
    const first26 = await jobState(ids26[0]);
    const second26 = await jobState(ids26[1]);
    const last26 = await jobState(ids26[32]);
    ok(
      "V26.14",
      relayState().dropped === 32 && first26.status === 404 && second26.body?.state === "dropped" && last26.body?.state === "dropped",
      `33 hang-ups → ${relayState().dropped} remembered (cap 32): the oldest forgotten (${first26.status}), the next and the newest still "dropped"`,
    );

    // =====================================================================
    // Contract L. He hangs up; the worker can't know until its next status
    // check, and it sends no polls while it renders. The credit it earned by
    // claiming the job must not vanish with the requester.
    show.push("=== V27 — A HUNG-UP LINE STILL MID-RENDER KEEPS THE WORKER ONLINE ===");
    resetRelay();
    elevenLabs(false);
    skewMs = 0;
    await poll(GOOD, 0);
    const ac27 = new AbortController();
    const req27 = speak({ text: "hung up at 20s" }, ac27.signal).catch((e: Error) => e);
    const p27 = await poll(GOOD, 3); // claimed at t=0
    skewMs = 20_000;
    ac27.abort(); // he hangs up at t=20s
    await req27;
    await waitFor(() => relayState().pending === 0);
    ok("V27.1", p27.status === 200 && relayState().pending === 0 && relayState().dropped === 1, "claimed at 0s, requester hangs up at 20s → the job is dropped but remembered");
    skewMs = 50_000;
    const s27 = relayStatus();
    ok(
      "V27.2",
      s27.online && (s27.ageMs ?? 0) >= 50_000 && voiceConn()?.connected === true,
      `sampled at 50s (ageMs=${s27.ageMs}, past the 40s window) → online=${s27.online}, connector connected=${voiceConn()?.connected}`,
    );
    const ac27b = new AbortController();
    const next27 = speak({ text: "the next line at 50s" }, ac27b.signal).catch((e: Error) => e);
    const queued27 = await waitFor(() => relayState().queued === 1, 1000);
    ok("V27.3", queued27, `a new line at 50s is QUEUED for the worker (queued=${relayState().queued}), not refused voice-offline`);
    ac27b.abort();
    await next27;
    await waitFor(() => relayState().pending === 0);
    // A long deadline, so "credit ended with the answer" can't be confused
    // with "credit ended at the deadline".
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "200000";
    resetRelay(); // V27.1's dropped job (90s deadline) must not lend its credit below
    skewMs = 0;
    await poll(GOOD, 0);
    const a27 = await claimThenHangUp("answered by /result");
    skewMs = 50_000;
    const ra27 = await result(a27.id, wav("a27")); // contact at 50s; the credit ends here
    skewMs = 95_000;
    ok(
      "V27.4",
      ra27.body?.discarded === true && !relayStatus().online && relayState().dropped === 0,
      `…until the worker answers it: /result (discarded) at 50s, sampled at 95s → online=${relayStatus().online} (45s since contact, deadline still 105s off)`,
    );
    skewMs = 0;
    const b27 = await claimThenHangUp("answered by /fail");
    skewMs = 50_000;
    const fb27 = await failJob(b27.id, { error: "render died" });
    skewMs = 95_000;
    ok("V27.5", fb27.body?.discarded === true && !relayStatus().online && relayState().dropped === 0, `…or /fails it: /fail at 50s, sampled at 95s → online=${relayStatus().online}`);
    skewMs = 0;
    const c27 = await claimThenHangUp("never answered");
    skewMs = 95_000;
    const c95 = relayStatus().online;
    skewMs = 199_000;
    const c199 = relayStatus().online;
    skewMs = 201_000;
    const c201 = relayStatus().online;
    ok("V27.6", c95 && c199 && !c201, `never answered: online at 95s (${c95}) and 199s (${c199}); offline at 201s, past the 200s deadline it was handed (${c201})`);
    ok("V27.7", (await jobState(c27.id)).body?.state === "dropped", "…while its id is still answerable as \"dropped\" (deadline + 30s)");
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;
    skewMs = 0;

    // =====================================================================
    // /health is exempt from the bearer. Its "voice" row used to be the live
    // one — "seen 0s ago · CPU build" — i.e. when his PC is on, for anyone.
    show.push("=== V28 — /health's \"voice\" ROW IS A CAPABILITY; /state KEEPS THE LIVE ONE ===");
    resetRelay();
    elevenLabs(false);
    skewMs = 0;
    const h28a = healthVoiceConn();
    ok(
      "V28.1",
      h28a?.connected === false && h28a?.detail === VOICE_HEALTH_DETAIL && h28a?.name === "Voice out",
      `fresh boot, no worker, no ElevenLabs → /health voice: connected=${h28a?.connected}, "${h28a?.detail}"`,
    );
    await poll(GOOD, 0);
    const h28on = JSON.stringify(healthVoiceConn());
    ok("V28.2", healthVoiceConn()?.connected === true && !/seen|ago|CPU|GPU|Lara/.test(h28on), `relay online → /health voice = ${h28on} (no age, no build, no profile)`);
    ok("V28.3", /seen 0s ago · CPU build/.test(voiceConn()?.detail ?? "") && voiceConn()?.connected === true, `…while /state's live row still says "${voiceConn()?.detail}"`);
    skewMs = 41_000;
    const h28stale = JSON.stringify(healthVoiceConn());
    ok(
      "V28.4",
      h28stale === h28on && voiceConn()?.connected === false,
      `his PC goes away (stale 41s): /health voice byte-identical (${h28stale === h28on}); /state's row flips to connected=${voiceConn()?.connected}`,
    );
    skewMs = 0;
    await poll(DOWN, 0);
    ok("V28.5", JSON.stringify(healthVoiceConn()) === h28on, "Voicebox down: /health voice still byte-identical — nothing on the open route moves with his PC");
    const live28 = getConnectorStatus();
    const pub28 = getHealthConnectorStatus();
    ok(
      "V28.6",
      JSON.stringify(live28.map((c) => c.key)) === JSON.stringify(pub28.map((c) => c.key)) &&
        live28.every((c, i) => c.key === "voice" || JSON.stringify(c) === JSON.stringify(pub28[i])),
      `same rows in the same order on both surfaces (${pub28.map((c) => c.key).join(", ")}); only "voice" differs`,
    );
    resetRelay();
    elevenLabs(true);
    ok("V28.7", healthVoiceConn()?.connected === true && healthVoiceConn()?.detail === VOICE_HEALTH_DETAIL, "ElevenLabs available, no worker ever → /health voice connected (voiceOutReady), same fixed detail");
    elevenLabs(false);
    ok(
      "V28.8",
      /connectors: getHealthConnectorStatus\(\)/.test(INDEX_SRC) && !/\bgetConnectorStatus\(/.test(INDEX_SRC),
      "SOURCE: index.ts /health serves getHealthConnectorStatus(); the live getConnectorStatus() is called nowhere in index.ts",
    );
    ok(
      "V28.9",
      (STATE_SRC.match(/connectors: getConnectorStatus\(\)/g) ?? []).length === 3 && !/getHealthConnectorStatus/.test(STATE_SRC),
      "SOURCE: state.ts (/state, bearer-gated — what both clients' speak gates read) serves the live getConnectorStatus() on all three of its returns",
    );

    // =====================================================================
    show.push("=== V29 — THE \"elevenlabs\" ROW IS CONNECTED ONLY WHEN ELEVENLABS WILL SPEAK ===");
    resetRelay();
    elevenLabs(true);
    const e29on = elConn();
    process.env.EVE_TTS_ELEVENLABS = "off";
    const e29off = elConn();
    const e29offH = getHealthConnectorStatus().find((c) => c.key === "elevenlabs");
    process.env.EVE_TTS_ELEVENLABS = " Off ";
    const e29case = elConn();
    process.env.EVE_TTS_ELEVENLABS = "on";
    const e29other = elConn();
    elevenLabs(false);
    const e29none = elConn();
    ok("V29.1", e29on?.connected === true && e29on?.detail === "key set", `key set, switch not thrown → connected, "${e29on?.detail}"`);
    ok(
      "V29.2",
      e29off?.connected === false && e29off?.detail === "key set, but switched off (EVE_TTS_ELEVENLABS=off)" && JSON.stringify(e29offH) === JSON.stringify(e29off),
      `key set, EVE_TTS_ELEVENLABS=off → connected=${e29off?.connected}, "${e29off?.detail}" (same on /health)`,
    );
    ok("V29.3", e29case?.connected === false, "' Off ' reads as off — trimmed, any case, the same test elevenLabsAvailable applies");
    ok("V29.4", e29other?.connected === true, "any other value (\"on\") → connected");
    ok("V29.5", e29none?.connected === false && e29none?.detail === "ELEVENLABS_API_KEY not set", "no key (switch also off) → the missing key is the reason given");

    // =====================================================================
    show.push("=== V30 — THE TIMEOUT SENTENCE SAYS WHAT THE BRAIN KNOWS ===");
    resetRelay();
    elevenLabs(false);
    skewMs = 0;
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "1000";
    const GPU: Report = { worker: "harness-desktop", voicebox: { ...(GOOD.voicebox as object), gpu: true } };
    const NO_GPU_WORD: Report = { worker: "harness-desktop", voicebox: { ok: true, profiles: (GOOD.voicebox as { profiles: unknown }).profiles } };
    await poll(GOOD, 0);
    const n30 = await speak({ text: "never picked up" });
    ok(
      "V30.1",
      n30.status === 504 && n30.json?.reason === "timeout" && n30.json?.error === "EVE desktop didn't pick the line up in time — it may have just closed.",
      `never claimed → ${n30.status} ${n30.json?.reason}: "${n30.json?.error}"`,
    );
    const cpu30 = await speakAndClaim({ text: "claimed, last report gpu:false" });
    const cpu30o = await cpu30.pending;
    ok(
      "V30.2",
      cpu30o.status === 504 && cpu30o.json?.reason === "timeout" &&
        cpu30o.json?.error === "Her voice took longer than 1s to render. Voicebox may be on its CPU build — switch it to the GPU.",
      `claimed, last report gpu:false → "${cpu30o.json?.error}"`,
    );
    const gpu30 = await speakAndClaim({ text: "claimed, last report gpu:true" }, GPU);
    const gpu30o = await gpu30.pending;
    ok(
      "V30.3",
      gpu30o.status === 504 && gpu30o.json?.reason === "timeout" && gpu30o.json?.error === "Voicebox took longer than 1s to render that line.",
      `claimed, last report gpu:true → "${gpu30o.json?.error}"`,
    );
    const unk30 = await speakAndClaim({ text: "claimed, gpu unknown" }, NO_GPU_WORD);
    const unk30o = await unk30.pending;
    ok(
      "V30.4",
      unk30o.status === 504 && unk30o.json?.reason === "timeout" && unk30o.json?.error === "Voicebox took longer than 1s to render that line.",
      `claimed, last report said nothing about the GPU (null) → "${unk30o.json?.error}"`,
    );
    const lr30 = await speakAndClaim({ text: "claimed on gpu:false, then a gpu:true report" });
    await poll(GPU, 0); // a later report lands before the clock runs out
    const lr30o = await lr30.pending;
    ok("V30.5", lr30o.json?.error === "Voicebox took longer than 1s to render that line.", `the LAST report is the one that speaks: "${lr30o.json?.error}"`);
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;
    ok("V30.6", strayCalls.length === 0, `the fence held through V26–V30 (stray: ${strayCalls.join(", ") || "none"})`);

    // =====================================================================
    // Round 4. A line queued while Voicebox answered, then EVERY poll says it
    // doesn't: the desktop was there asking the whole time, so "EVE desktop
    // didn't pick the line up" would send him to the wrong thing.
    show.push("=== V31 — NEVER HANDED OUT BECAUSE VOICEBOX WAS DOWN → THE TIMEOUT SAYS VOICEBOX ===");
    resetRelay();
    elevenLabs(false);
    skewMs = 0;
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "800";
    const SAY_NEVER = "EVE desktop didn't pick the line up in time — it may have just closed.";
    const downWith = (error?: string): Report => ({
      worker: "harness-desktop",
      voicebox: { ok: false, ...(error !== undefined ? { error } : {}), profiles: [], gpu: null },
    });
    await poll(GOOD, 0);
    const a31 = speak({ text: "queued, then Voicebox went down" });
    await waitFor(() => relayState().queued === 1);
    await poll(DOWN, 0);
    const a31o = await a31;
    ok(
      "V31.1",
      a31o.status === 504 && a31o.json?.reason === "timeout" && a31o.json?.error === SAY_DOWN,
      `queued, then only a Voicebox-down poll → ${a31o.status} ${a31o.json?.reason}: "${a31o.json?.error}"`,
    );
    await poll(GOOD, 0);
    const b31 = speak({ text: "two down reports" });
    await waitFor(() => relayState().queued === 1);
    await poll(downWith("first error"), 0);
    await poll(downWith("Voicebox answered HTTP 500."), 0);
    const b31o = await b31;
    ok(
      "V31.2",
      b31o.json?.error === "EVE desktop is on, but Voicebox isn't answering (Voicebox answered HTTP 500). Open Voicebox.",
      `two down reports while it waited → the LAST one's error is the one said: "${b31o.json?.error}"`,
    );
    await poll(GOOD, 0);
    const c31 = speak({ text: "down, no reason" });
    await waitFor(() => relayState().queued === 1);
    await poll(downWith(), 0);
    const c31o = await c31;
    ok(
      "V31.3",
      c31o.json?.error === "EVE desktop is on, but Voicebox isn't answering (it gave no reason). Open Voicebox.",
      `a down report with no error → the missing reason is itself said: "${c31o.json?.error}"`,
    );
    // The worker long-polls: its down-poll is HELD (it can't take the line)
    // when the clock runs out.
    await poll(GOOD, 0);
    const d31 = speak({ text: "down-poll held at the timeout" });
    await waitFor(() => relayState().queued === 1);
    const heldDown31 = poll(DOWN, 1.5);
    await waitFor(() => relayState().waiting === 1);
    const d31o = await d31;
    const hd31 = await heldDown31;
    ok(
      "V31.4",
      d31o.status === 504 && d31o.json?.error === SAY_DOWN && hd31.status === 204 && !hd31.body?.job,
      `a HELD down-poll when the clock runs out → "${d31o.json?.error}"; the held poll still ends empty (${hd31.status})`,
    );
    await poll(GOOD, 0);
    const e31 = await speak({ text: "no poll at all" });
    ok("V31.5", e31.status === 504 && e31.json?.error === SAY_NEVER, `no poll came while it waited → unchanged: "${e31.json?.error}"`);
    // An OK poll came while it waited — it went to the line ahead of it. Then
    // down-polls. This line was left waiting behind another, not refused by
    // Voicebox: it is NOT pinned on Voicebox.
    await poll(GOOD, 0);
    const first31 = speak({ text: "the line ahead" });
    await waitFor(() => relayState().queued === 1);
    const behind31 = speak({ text: "the line behind it" });
    await waitFor(() => relayState().queued === 2);
    const took31 = await poll(GOOD, 0);
    await poll(DOWN, 0);
    const [first31o, behind31o] = await Promise.all([first31, behind31]);
    ok(
      "V31.6",
      took31.body?.job?.text === "the line ahead" && first31o.status === 504 && behind31o.status === 504 && behind31o.json?.error === SAY_NEVER,
      `an OK poll came while it waited (it took the line ahead), then a down-poll → the line behind says "${behind31o.json?.error}", not Voicebox`,
    );
    // Down-polls, then the desktop goes quiet past the 40s window before the
    // clock runs out: "EVE desktop is on" would be a claim the brain can't make.
    skewMs = 0;
    await poll(GOOD, 0);
    const f31 = speak({ text: "down, then the desktop went quiet" });
    await waitFor(() => relayState().queued === 1);
    await poll(DOWN, 0);
    skewMs = 41_000;
    const f31o = await f31;
    ok(
      "V31.7",
      f31o.status === 504 && f31o.json?.error === SAY_NEVER,
      `a down-poll, then 41s of silence before the timeout → "${f31o.json?.error}" (not "EVE desktop is on")`,
    );
    skewMs = 0;
    // A down-poll does not poison a line an OK poll then takes.
    await poll(GOOD, 0);
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "3000";
    const g31 = speak({ text: "down, then back up" });
    await waitFor(() => relayState().queued === 1);
    await poll(DOWN, 0);
    const up31 = await poll(GOOD, 0);
    if (up31.body?.job) await result(up31.body.job.id, wav("g31"));
    const g31o = await g31;
    ok("V31.8", up31.body?.job?.text === "down, then back up" && g31o.status === 200, `a down-poll, then Voicebox is back → the line is handed out and delivered (${g31o.status})`);
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;

    // =====================================================================
    // Round 4, the shared delta. /fail carries `source`: only a failure the
    // worker says was Voicebox's is worded as Voicebox's. The brain's own
    // refusals of the upload are nobody's but the upload's.
    show.push("=== V32 — /fail SAYS WHOSE FAILURE IT WAS; AN UPLOAD THE BRAIN REFUSES ISN'T VOICEBOX'S ===");
    resetRelay();
    elevenLabs(false);
    skewMs = 0;
    process.env.EVE_VOICE_RELAY_TIMEOUT_MS = "5000"; // a bug here fails fast, not in 90s
    await poll(GOOD, 0);
    const failWith = async (body: unknown) => {
      const s = await speakAndClaim({ text: `fail ${JSON.stringify(body)}` });
      const f = await failJob(s.job!.id, body);
      const o = await s.pending;
      return { f, o };
    };
    const quit = await failWith({ error: "EVE desktop closed before the line finished", source: "desktop" });
    ok(
      "V32.1",
      quit.f.status === 200 && quit.o.status === 502 && quit.o.json?.reason === "voicebox-failed" && quit.o.json?.error === "EVE desktop closed before the line finished.",
      `source "desktop" → ${quit.o.status} ${quit.o.json?.reason}: "${quit.o.json?.error}" (the worker's sentence as it is, no Voicebox prefix)`,
    );
    const lower = await failWith({ error: "the audio upload broke off", source: "desktop" });
    ok("V32.2", lower.o.json?.error === "the audio upload broke off.", `source "desktop", a lower-case sentence → as it is: "${lower.o.json?.error}"`);
    const vb = await failWith({ error: "CUDA out of memory.", source: "voicebox" });
    ok("V32.3", vb.o.status === 502 && vb.o.json?.error === "Voicebox failed to render that line: CUDA out of memory.", `source "voicebox" → "${vb.o.json?.error}"`);
    const old = await failWith({ error: "CUDA out of memory." });
    ok("V32.4", old.o.json?.error === "Voicebox failed to render that line: CUDA out of memory.", `no source (a worker older than the field) → "voicebox", as before: "${old.o.json?.error}"`);
    const bare = await failWith({ source: "desktop" });
    ok("V32.5", bare.o.status === 502 && bare.o.json?.error === "EVE desktop reported a failure without a reason.", `source "desktop", no error → "${bare.o.json?.error}"`);
    const odd = await failWith({ error: "render died", source: "gpu-fairy" });
    const oddNum = await failWith({ error: "render died", source: 42 });
    ok(
      "V32.6",
      odd.f.status === 200 && odd.o.json?.error === "Voicebox failed to render that line: render died." && oddNum.o.json?.error === odd.o.json?.error,
      `a source this brain doesn't know ("gpu-fairy", 42) → the default wording, and the line still fails fast (worker got ${odd.f.status}): "${odd.o.json?.error}"`,
    );
    const nw32 = await speakAndClaim({ text: "not a wav" });
    const nw32r = await result(nw32.job!.id, Buffer.from("<html>502 Bad Gateway</html>"));
    const nw32o = await nw32.pending;
    ok(
      "V32.7",
      nw32r.status === 400 && nw32o.status === 502 && nw32o.json?.error === "What came back from EVE desktop was not a WAV file.",
      `a /result that isn't a WAV → "${nw32o.json?.error}" (not "Voicebox failed…")`,
    );
    // 25MB + 1 byte, uploaded whole over loopback: the brain reads it off
    // before it answers, as it would for the worker.
    const big32 = await speakAndClaim({ text: "over 25MB" });
    const big32r = await result(big32.job!.id, Buffer.alloc(25 * 1024 * 1024 + 1));
    const big32o = await big32.pending;
    ok(
      "V32.8",
      big32r.status === 413 && big32o.status === 502 && big32o.json?.error === "The audio EVE desktop sent back was over 25MB — more than the brain takes.",
      `a /result over 25MB → the worker gets ${big32r.status} ${JSON.stringify(big32r.body)}; the listener: "${big32o.json?.error}"`,
    );
    const cut32 = await speakAndClaim({ text: "upload cut" });
    const cut32t = Date.now();
    await cutUpload(cut32.job!.id, 1000, 100);
    const cut32o = await cut32.pending;
    ok(
      "V32.9",
      cut32o.status === 502 && cut32o.json?.error === "The audio upload from EVE desktop broke off." && Date.now() - cut32t < 4000,
      `an upload cut after 100 of 1000 bytes → ${cut32o.status} in ${Date.now() - cut32t}ms: "${cut32o.json?.error}"`,
    );
    const brainSide = [nw32o, big32o, cut32o].map((o) => o.json?.error ?? "");
    ok("V32.10", brainSide.every((s) => s && !/Voicebox/.test(s)), "none of the brain's own refusals of an upload names Voicebox");
    delete process.env.EVE_VOICE_RELAY_TIMEOUT_MS;
    ok("V32.11", strayCalls.length === 0, `the fence held through V31–V32 (stray: ${strayCalls.join(", ") || "none"})`);
  } finally {
    resetRelay();
    server.closeAllConnections();
    server.close();
    globalThis.fetch = REAL_FETCH;
    console.log = realLog;
    console.warn = realWarn;
  }

  console.log(show.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(Math.min(fail, 255));
}

main().catch((e) => {
  globalThis.fetch = REAL_FETCH;
  console.error(e);
  process.exit(255);
});
