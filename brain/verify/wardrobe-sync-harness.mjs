// AUTOMATIC WARDROBE SYNC — THE BRAIN DOOR, PROVED AGAINST A RUNNING BRAIN.
//
//   cd C:\dev\eve-wardrobe\brain && node verify/wardrobe-sync-harness.mjs
//
// This boots the REAL server (src/index.ts, tsx, on EVE_PORT) against a SCRATCH
// STORE (verify/fake-storage.mjs) and drives the REAL endpoints over HTTP. It
// never touches his Supabase project: SUPABASE_URL is written to a throwaway
// .env pointing at 127.0.0.1, and the scratch store counts every object so
// "nothing was written" is an observation, not an intention.
//
// BLOCKS:
//   A  THE ADD. New uploads. A second run of the same bytes is a no-op. The
//      same name over DIFFERENT bytes is refused and the stored bytes do not
//      move.
//   N  THE NAME. Traversal, both separators, control characters, bidi,
//      zero-width, a 400-char name, a .exe, an empty name — every one refused
//      with ZERO new objects in the store.
//   O  THE SIZE. One byte over the ceiling is an honest JSON 413; a body far
//      over it is stopped by the parser. Neither writes.
//   G  THE GATE. No bearer, wrong bearer — 401, zero writes. (GET /wardrobe is
//      exempt by the brain's own middleware; these routes are POST, so they
//      are not.)
//   B  THE BATCH CAP. The 121st add inside a minute is a 429.
//   D  NOTHING CAN DELETE. Source-level: no delete/remove call anywhere on this
//      path, and the scratch store's delete counter is still zero at the end.
//
// Every assertion is COLLECTED, never thrown — the mutation runner
// (verify/wardrobe-mutation.mjs) needs to see which ones go red when a guard is
// taken out, and a harness that dies on the first failure can't tell it.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeStorage } from "./fake-storage.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const brainDir = path.resolve(here, "..");
const ENV_PATH = path.join(brainDir, ".env");
const PORT = Number(process.env.EVE_PORT || 8799);
const TOKEN = "scratch-token-for-verification-only-not-a-secret";
const BASE = `http://127.0.0.1:${PORT}`;
const BUCKET = "wardrobe";

const sha = (b) => createHash("sha256").update(b).digest("hex");

// A deterministic pseudo-PNG. Real signature, junk payload — the door stores
// bytes and never decodes them, so a decoder is not part of what is under test.
function png(seed, size = 512) {
  const b = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  let x = seed * 2654435761 % 4294967296;
  for (let i = 8; i < size; i++) {
    x = (x * 1103515245 + 12345) % 4294967296;
    b[i] = x % 256;
  }
  return b;
}

// --- results ---------------------------------------------------------------
const results = [];
function check(block, name, pass, detail = "") {
  results.push({ block, name, pass, detail });
  console.log(`${pass ? "  ok  " : "  RED "} ${block} ${name}${detail ? ` — ${detail}` : ""}`);
}

// --- wire ------------------------------------------------------------------
let storage;

async function objects() {
  const r = await fetch(`${storage.url}/__scratch/objects`);
  return r.json();
}

// The batch window is a rolling minute in the LIVE brain, and every earlier
// block that got as far as the upload has already spent slots out of it. They
// are counted here so block B can assert the cap exactly instead of guessing:
// addLook() takes a slot only after the name and the size have passed, so a
// refusal costs nothing and a 200 or a byte-comparison conflict costs one.
let slotsSpent = 0;

async function putLook(name, bytes, { auth = TOKEN } = {}) {
  const headers = { "Content-Type": "image/png" };
  if (auth !== null) headers.Authorization = `Bearer ${auth}`;
  const r = await fetch(`${BASE}/wardrobe/sync/look/${encodeURIComponent(name)}`, {
    method: "POST",
    headers,
    body: bytes,
  });
  const text = await r.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { nonJson: text.slice(0, 60) };
  }
  if (r.status === 200 || body?.status === "conflict") slotsSpent += 1;
  return { status: r.status, body };
}

async function manifest({ auth = TOKEN } = {}) {
  const headers = {};
  if (auth !== null) headers.Authorization = `Bearer ${auth}`;
  const r = await fetch(`${BASE}/wardrobe/sync/manifest`, { method: "POST", headers });
  return { status: r.status, body: await r.json().catch(() => null) };
}

// --- boot ------------------------------------------------------------------
async function bootBrain() {
  // A SCRATCH .env. Bearer + port + the scratch store, and NOTHING ELSE:
  // no Anthropic key, no Firebase, no Slack/Notion/Stripe/Google, no
  // Deepgram/ElevenLabs. CHURLISH_OS_URL is pointed at a dead local port so the
  // boot warmers cannot reach anything on the network either.
  writeFileSync(
    ENV_PATH,
    [
      `EVE_BRAIN_TOKEN=${TOKEN}`,
      `EVE_PORT=${PORT}`,
      `SUPABASE_URL=${storage.url}`,
      `SUPABASE_SERVICE_ROLE_KEY=scratch-service-role-not-a-real-key`,
      `CHURLISH_OS_URL=http://127.0.0.1:1`,
      `EVE_TZ=America/Chicago`,
      "",
    ].join("\n"),
    "utf8",
  );

  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(ANTHROPIC|SUPABASE|FIREBASE|GOOGLE|SLACK|NOTION|STRIPE|DEEPGRAM|ELEVENLABS|VOYAGE|CHURLISH)/.test(k)) {
      delete env[k];
    }
  }
  env.EVE_PORT = String(PORT);

  // node --import tsx, NOT `npx tsx`: on Windows npx is a .cmd, which needs
  // shell:true, and killing a shell leaves the node process behind holding
  // EVE_PORT. (Observed: the first run of this harness orphaned a brain on
  // :8799 and the second run could not bind.) This spawns the real interpreter
  // directly, so child.kill() actually kills the brain.
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: brainDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  child.stdout.on("data", (d) => log.push(String(d)));
  child.stderr.on("data", (d) => log.push(String(d)));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return { child, log };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error(log.join(""));
  throw new Error("brain did not come up on EVE_PORT within 60s");
}

// --- the blocks ------------------------------------------------------------

async function blockA() {
  const a = png(1);
  const before = await objects();
  const r1 = await putLook("SCRATCH LOOK A.png", a);
  const after = await objects();
  check("A1", "a new look uploads", r1.status === 200 && r1.body.status === "added", `HTTP ${r1.status} ${JSON.stringify(r1.body)}`);
  check("A1", "the store gained exactly one object", after.count === before.count + 1, `${before.count} -> ${after.count}`);
  check("A1", "the stored bytes are the bytes sent", after.hashes[`${BUCKET}/SCRATCH LOOK A.png`] === sha(a));

  const r2 = await putLook("SCRATCH LOOK A.png", a);
  const after2 = await objects();
  check("A2", "same name + same bytes is a no-op", r2.status === 200 && r2.body.status === "unchanged", `HTTP ${r2.status} ${JSON.stringify(r2.body)}`);
  check("A2", "the store did not grow", after2.count === after.count, `${after.count} -> ${after2.count}`);

  const b = png(2);
  const r3 = await putLook("SCRATCH LOOK A.png", b);
  const after3 = await objects();
  check("A3", "same name + DIFFERENT bytes is refused", r3.status === 409 && r3.body.status === "conflict", `HTTP ${r3.status} ${JSON.stringify(r3.body)}`);
  check("A3", "the original bytes were NOT overwritten", after3.hashes[`${BUCKET}/SCRATCH LOOK A.png`] === sha(a));
  check("A3", "the store did not grow", after3.count === after2.count, `${after2.count} -> ${after3.count}`);

  const m = await manifest();
  check("A4", "the manifest reports the look with its size", m.status === 200 && (m.body.looks ?? []).some((l) => l.file === "SCRATCH LOOK A.png" && l.size === a.length), JSON.stringify(m.body).slice(0, 120));
}

const HOSTILE = [
  ["traversal", "../../etc/passwd.png"],
  ["traversal, deeper", "..%2f..%2fx.png"],
  ["forward separator", "looks/evil.png"],
  ["back separator", "looks\\evil.png"],
  ["drive letter", "C:evil.png"],
  ["leading dot", ".hidden.png"],
  ["control char", "bad\u0007name.png"],
  ["bidi override", "look\u202Egnp.png"],
  ["zero width", "lo\u200Bok.png"],
  ["tag chars", "look\u{e0041}.png"],
  ["400 characters", `${"A".repeat(396)}.png`],
  ["executable", "payload.exe"],
  ["no extension", "AUTHORITY"],
  ["double extension", "payload.png.exe"],
  ["angle brackets", "<script>.png"],
  ["empty", ""],
];

async function blockN() {
  const before = await objects();
  for (const [label, name] of HOSTILE) {
    const r = await putLook(name, png(9));
    const after = await objects();
    const refused = r.status >= 400 && r.status < 500;
    const noWrite = after.count === before.count;
    check("N", `refused: ${label}`, refused && noWrite, `HTTP ${r.status}, store ${before.count} -> ${after.count}`);
  }
  // The collision twin: a name that WOULD land on a look already in the closet.
  const r = await putLook("SCRATCH LOOK A.png", png(77));
  const after = await objects();
  check("N", "refused: a name that would land on an existing look", r.status === 409 && after.count === before.count, `HTTP ${r.status}`);
}

async function blockO() {
  const before = await objects();
  const CEILING = 10 * 1024 * 1024;
  const over = Buffer.alloc(CEILING + 1, 7);
  const r1 = await putLook("SCRATCH OVERSIZE.png", over);
  const a1 = await objects();
  check("O1", "one byte over the ceiling is refused", r1.status === 413, `HTTP ${r1.status}`);
  check("O1", "and it says so in JSON, not HTML", r1.body?.status === "too_big", JSON.stringify(r1.body).slice(0, 100));
  check("O1", "nothing was written", a1.count === before.count, `${before.count} -> ${a1.count}`);

  const way = Buffer.alloc(CEILING + 2 * 1024 * 1024, 7);
  const r2 = await putLook("SCRATCH WAY OVER.png", way);
  const a2 = await objects();
  check("O2", "a body far over the ceiling is stopped by the parser", r2.status === 413, `HTTP ${r2.status}`);
  check("O2", "nothing was written", a2.count === before.count, `${before.count} -> ${a2.count}`);
}

async function blockG() {
  const before = await objects();
  const r1 = await putLook("SCRATCH NOAUTH.png", png(3), { auth: null });
  const r2 = await putLook("SCRATCH BADAUTH.png", png(4), { auth: "not-the-token-at-all-not-even-close!!" });
  const m1 = await manifest({ auth: null });
  const after = await objects();
  check("G", "no bearer is 401 on the upload", r1.status === 401, `HTTP ${r1.status}`);
  check("G", "wrong bearer is 401 on the upload", r2.status === 401, `HTTP ${r2.status}`);
  check("G", "no bearer is 401 on the manifest", m1.status === 401, `HTTP ${m1.status}`);
  check("G", "nothing was written", after.count === before.count, `${before.count} -> ${after.count}`);
}

async function blockB() {
  await fetch(`${storage.url}/__scratch/reset`, { method: "POST" });
  const already = slotsSpent;
  const room = 120 - already;
  let last = null;
  let ok = 0;
  for (let i = 0; i < room + 1; i++) {
    last = await putLook(`SCRATCH BATCH ${i}.png`, png(1000 + i, 64));
    if (last.status === 200) ok += 1;
    else break;
  }
  const after = await objects();
  check("B", "the add past the cap is throttled", last.status === 429 && last.body.status === "throttled", `HTTP ${last.status} after ${ok} more adds`);
  check("B", "and the cap is the documented 120 per minute", ok + already === 120, `${already} slots already spent + ${ok} here = ${ok + already}`);
  check("B", "the store holds exactly what was accepted", after.count === ok, `${after.count} objects`);
}

function blockD(storeState) {
  const src = readFileSync(path.join(brainDir, "src", "wardrobe-add.ts"), "utf8");
  const index = readFileSync(path.join(brainDir, "src", "index.ts"), "utf8");
  // Comments talk about deletion on purpose; CODE must not.
  const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  check("D", "wardrobe-add.ts calls no storage remove/delete", !/\.remove\s*\(|\.delete\s*\(|"DELETE"/.test(code), "");
  const routes = index.slice(index.indexOf("/wardrobe/sync/manifest") - 400);
  check("D", "no DELETE route was mounted on /wardrobe", !/app\.delete\s*\(/.test(index) && !/wardrobe\/sync\/[^"]*(delete|remove|prune)/i.test(index), "");
  check("D", "the sync routes are POST only", (routes.match(/app\.post\(\s*"\/wardrobe\/sync/g) ?? []).length === 2, "");
  check("D", "the scratch store recorded ZERO delete attempts", storeState.deleteAttempts === 0, `${storeState.deleteAttempts} attempts`);
}

// --- run -------------------------------------------------------------------
async function main() {
  if (existsSync(ENV_PATH)) {
    throw new Error(`${ENV_PATH} already exists — refusing to overwrite an env I did not write`);
  }
  storage = await startFakeStorage();
  console.log(`[harness] scratch store on ${storage.url} (NOT Supabase)`);
  let brain = null;
  try {
    brain = await bootBrain();
    console.log(`[harness] real brain up on ${BASE}`);
    await blockA();
    await blockN();
    await blockO();
    await blockG();
    await blockB();
    blockD(await objects());
  } finally {
    if (brain) brain.child.kill();
    rmSync(ENV_PATH, { force: true });
    if (storage) await storage.close();
  }

  const red = results.filter((r) => !r.pass);
  console.log(`\n[harness] ${results.length - red.length}/${results.length} green`);
  if (red.length) {
    console.log(`[harness] RED: ${red.map((r) => `${r.block} ${r.name}`).join(" | ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[harness] blew up:", e);
  rmSync(ENV_PATH, { force: true });
  process.exit(2);
});
