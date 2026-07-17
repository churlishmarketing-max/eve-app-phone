import "./env.js";
import express from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { runChat } from "./chat.js";
import { initFirebase, isPushReady } from "./firebase.js";
import { initDb, isDbReady } from "./db.js";
import { saveToken } from "./push.js";
import { runMorningBrief } from "./brief.js";
import { runDistill } from "./distill.js";
import { runPulseSweep } from "./pulse.js";
import { runCapture } from "./capture.js";
import { buildState } from "./state.js";
import { backfillEmbeddings } from "./memory.js";
import { startSchedulers } from "./schedule.js";
import { resolveConfirm } from "./confirm.js";
import { addText, addNotification } from "./senses.js";
import { getConnectorStatus } from "./connectors.js";
import { runDispatch } from "./dispatch.js";
import { runFloorCheck, runCloseout, runWeekPreview, fireTripwire, runRoutineRiskCheck } from "./proactive.js";
import { tickRoutine, actOnAttention, type AttentionAction } from "./ops.js";
import { transcribe, speakToResponse, listVoices, sttReady, ttsReady } from "./voice.js";
import { getWearing, setWearing, listLooksAsync, lookUrl, initWardrobe } from "./wardrobe.js";
import { warmBoard } from "./os.js";
import { stamp, getStamp } from "./health.js";

const here = path.dirname(fileURLToPath(import.meta.url));

let lastBrief: { at: string; ok: boolean; reason?: string } | null = null;

// A stray rejection/exception must never take the brain down mid-request.
process.on("unhandledRejection", (r) => console.error("[unhandledRejection]", r));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

const app = express();
app.use(express.json());

// CORS — the app (Vite dev :5173, or the Capacitor WebView) calls this from a
// different origin. The bearer token is the real gate; origin is permissive.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.EVE_BRAIN_TOKEN;
if (!TOKEN) {
  console.error("EVE_BRAIN_TOKEN is not set. Copy .env.example to .env first.");
  process.exit(1);
}

// Single bearer token on every route except /health, the dev console page,
// and wardrobe images (<img> tags can't send Authorization; portraits are
// low-sensitivity on a single-user LAN) — 02_ARCHITECTURE §3, §7.
// timing-safe comparison per review C32.
const TOKEN_BUF = Buffer.from(`Bearer ${TOKEN}`);
app.use((req, res, next) => {
  const openWardrobe = req.method === "GET" && req.path.startsWith("/wardrobe");
  if (req.path === "/health" || req.path === "/console" || openWardrobe) return next();
  const auth = Buffer.from(req.headers.authorization || "");
  if (auth.length !== TOKEN_BUF.length || !timingSafeEqual(auth, TOKEN_BUF)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// Throwaway dev console for testing her voice in a browser. Not the app —
// the real shell is the eve-app-demo.jsx port. The token is NEVER embedded
// (review C29: any website could fetch this page cross-origin via the
// permissive CORS and read the token out of it) — paste it once; the page
// keeps it in localStorage.
app.get("/console", (_req, res) => {
  const html = readFileSync(path.join(here, "..", "public", "console.html"), "utf8");
  res.type("html").send(html.replace("__DEV_TOKEN__", ""));
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    phase: "5-her-reach",
    pushReady: isPushReady(),
    memoryReady: isDbReady(),
    voiceReady: { stt: sttReady(), tts: ttsReady() },
    connectors: getConnectorStatus(),
    // Stamped by BOTH the /job route and the in-process crons (review C9/C24).
    lastDistillation: getStamp("distill"),
    lastBrief: getStamp("brief") ?? lastBrief,
  });
});

// RED-tier resolution (02 §6): the app echoes back id + payload hash from the
// confirm card. Only a matching hash executes the send. Single-use.
app.post("/confirm", async (req, res) => {
  try {
    const { id, hash, approve } = req.body ?? {};
    if (typeof id !== "string" || typeof hash !== "string" || typeof approve !== "boolean") {
      return res.status(400).json({ error: "id (string), hash (string), approve (boolean) required" });
    }
    res.json(await resolveConfirm(id, hash, approve));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// HER SENSES (Phase 4, 05 §7): the app forwards texts + notifications while
// it's open. Transient ring buffers only (senses.ts) — no database writes;
// raw SMS bodies stay OUT of long-term memory (02 §7).
app.post("/senses/sms", (req, res) => {
  const { address, body, dateMs } = req.body ?? {};
  if (typeof address !== "string" || typeof body !== "string" || typeof dateMs !== "number") {
    return res.status(400).json({ error: "address (string), body (string), dateMs (number) required" });
  }
  addText({ address, body, dateMs });
  res.json({ ok: true });
});

app.post("/senses/notification", (req, res) => {
  const { package: pkg, title, text, postTimeMs } = req.body ?? {};
  if (typeof pkg !== "string" || typeof postTimeMs !== "number") {
    return res.status(400).json({ error: "package (string), postTimeMs (number) required" });
  }
  addNotification({
    package: pkg,
    title: typeof title === "string" ? title : null,
    text: typeof text === "string" ? text : null,
    postTimeMs,
  });
  res.json({ ok: true });
});

// The phone reports a client-executed SMS actually left the SIM. Log only —
// clients table has no phone column yet, so there's nothing to match against.
app.post("/senses/sms-sent", (req, res) => {
  const { to, body } = req.body ?? {};
  if (typeof to !== "string" || typeof body !== "string") {
    return res.status(400).json({ error: "to (string), body (string) required" });
  }
  console.log(`[senses] SMS sent from the phone to ${to} (${body.length} chars)`);
  res.json({ ok: true });
});

// Live data for the Today/Ops screens — the app never holds a Supabase key (05 §4).
app.get("/state", async (_req, res) => {
  try {
    res.json(await buildState());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Any door in (01 §5): app text / voice-note transcript; email webhook in Phase 3.
app.post("/capture", async (req, res) => {
  try {
    const { text, sourceLink } = req.body ?? {};
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text (string) is required" });
    }
    res.json(await runCapture(text, sourceLink));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// The app posts its FCM token here after registering.
app.post("/register-push", async (req, res) => {
  try {
    const { token, platform = "android" } = req.body ?? {};
    if (typeof token !== "string" || !token) {
      return res.status(400).json({ error: "token (string) is required" });
    }
    await saveToken(token, platform);
    res.json({ ok: true });
  } catch (err) {
    // Was the one async route with no try/catch — a saveToken rejection
    // left the request hanging forever (review C22).
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Fleet dispatch (02 §3): returns immediately; worker reports via jobs row,
// approval item, and done-ping.
app.post("/dispatch", async (req, res) => {
  try {
    const { task, agent, client } = req.body ?? {};
    if (typeof task !== "string" || !task.trim()) {
      return res.status(400).json({ error: "task (string) is required" });
    }
    res.json(await runDispatch(task, typeof agent === "string" && agent ? agent : "eve", client));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Voice in: raw audio body (webm/opus from MediaRecorder) → transcript.
app.post(
  "/voice/transcribe",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "raw audio body required (Content-Type: audio/…)" });
      }
      res.json(await transcribe(req.body, req.headers["content-type"] || "audio/webm"));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// Voice out: text → streamed mp3 in EVE's voice (starts playing on first chunk).
app.post("/voice/speak", async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text (string) is required" });
  }
  await speakToResponse(text.slice(0, 4000), res);
});

app.get("/voice/voices", async (_req, res) => {
  res.json(await listVoices());
});

// Her wardrobe (05 §5): King's approved renders live in the Supabase Storage
// "wardrobe" bucket and are served straight off its CDN — the APK stays light,
// the repo stays small, and adding a look needs no redeploy (drop a PNG in
// brain/data/wardrobe, run scripts/sync-wardrobe.mjs). Names derive from
// filenames; absolute URLs so the app renders them from anywhere.
app.get("/wardrobe", async (_req, res) => {
  try {
    const files = await listLooksAsync();
    res.json({
      wearing: getWearing(),
      looks: files
        .map((f) => ({ file: f, name: f.replace(/\.[^.]+$/, "").toUpperCase(), url: lookUrl(f) }))
        .filter((l): l is { file: string; name: string; url: string } => !!l.url),
    });
  } catch {
    res.json({ wearing: null, looks: [] });
  }
});

// King's manual pick from the app — same single source of truth she writes
// to. Bearer-authed (the wardrobe auth exemption is GET-only).
app.post("/wardrobe/wear", async (req, res) => {
  const { file } = req.body ?? {};
  if (typeof file !== "string" || !file) return res.status(400).json({ error: "file (string) required" });
  res.json(await setWearing(file));
});

// Routine tick — streak increments same-day only (00 Phase-4 DoD).
app.post("/routine/:id/tick", async (req, res) => {
  try {
    res.json(await tickRoutine(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Ops actions route through the brain so tier rules apply (05 §4).
app.post("/attention/:id/action", async (req, res) => {
  try {
    const { action } = req.body ?? {};
    if (!["approve", "hold", "dismiss"].includes(action)) {
      return res.status(400).json({ error: "action must be approve | hold | dismiss" });
    }
    res.json(await actOnAttention(req.params.id, action as AttentionAction));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Scheduled/manual work from n8n or cron. Body: { job, force?, message?, data? }.
app.post("/job", async (req, res) => {
  try {
    const { job, force, message, data } = req.body ?? {};
    const f = force === true;
    if (job === "morning_brief") {
      const result = await runMorningBrief(f);
      lastBrief = { at: new Date().toISOString(), ok: result.ok, reason: result.reason };
      stamp("brief", { ok: result.ok, reason: result.reason });
      return res.json(result);
    }
    if (job === "distill") {
      const result = await runDistill();
      if (result.ok) stamp("distill", result as unknown as Record<string, unknown>);
      return res.json(result);
    }
    if (job === "pulse_sweep") return res.json(await runPulseSweep(f));
    if (job === "floor_check") return res.json(await runFloorCheck(f));
    if (job === "closeout") return res.json(await runCloseout(f));
    if (job === "week_preview") return res.json(await runWeekPreview(f));
    if (job === "routine_risk") return res.json(await runRoutineRiskCheck());
    if (job === "tripwire") {
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "tripwire needs a message" });
      }
      return res.json(await fireTripwire(message, data, f));
    }
    if (job === "embed_backfill") return res.json(await backfillEmbeddings());
    return res.status(400).json({ error: `unknown job: ${job}` });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /chat  { message: string, conversationId?: string, surface?: string }
// Default: SSE stream of typed events. ?stream=false → single JSON reply
// (glasses-friendly, 02 §3).
app.post("/chat", async (req, res) => {
  const { message, conversationId, surface } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message (string) is required" });
  }
  const convId: string = conversationId || randomUUID();
  const surf: string = surface || "app";
  const streaming = req.query.stream !== "false";

  if (!streaming) {
    let text = "";
    await runChat(convId, message, surf, {
      onState: () => {},
      onToken: (t) => (text += t),
      onTool: () => {},
      onDone: () => {
        res.json({ conversationId: convId, reply: text });
      },
      onError: (msg) => {
        if (!res.headersSent) res.status(500).json({ error: msg });
      },
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // If the phone bails mid-stream, stop the agent loop — don't keep burning
  // tokens into a dead socket (review C18).
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  // writableEnded guard: an agent-level error path must never write to a
  // response that already ended (review finding — ERR_STREAM_WRITE_AFTER_END).
  const send = (event: string, data: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  await runChat(
    convId,
    message,
    surf,
    {
      onState: (state) => send("state", { state }),
      onToken: (text) => send("token", { text }),
      onTool: (name) => send("tool", { name }),
      onConfirm: (confirm) => send("confirm_request", confirm),
      onDone: (info) => {
        send("done", info);
        if (!res.writableEnded) res.end();
      },
      onError: (msg) => {
        send("error", { message: msg });
        if (!res.writableEnded) res.end();
      },
    },
    abort,
  );
});

initFirebase();
initDb();
// Warm the closet cache + her worn look before the first request.
void initWardrobe();
// Warm the ambient OS board snapshot so the very first board question is fast
// (also gives the Vercel /api/eve function an early hit toward staying warm).
void warmBoard();

app.listen(PORT, () => {
  console.log(`EVE brain listening on :${PORT}`);
  startSchedulers();
});
