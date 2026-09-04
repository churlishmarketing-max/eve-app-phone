// EVE DESKTOP — main process.
//
// Lifecycle, the single-instance lock, both windows, the IPC handler table,
// the global hotkey, the tray, and smoke mode. No intelligence lives here:
// every decision that matters is the brain's, and every byte that leaves goes
// through api.ts.
//
// Owning stream: S1.

import { app, dialog, globalShortcut, ipcMain, BrowserWindow, shell } from "electron";
import { filterHandoffNames } from "../src/shared/handoff.js";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as api from "./api.js";
// THE BUILD HANDSHAKE — a literal compiled into THIS bundle, not a file read.
import { BUILD_STAMP, IS_UNSTAMPED, stampLabel } from "../src/shared/build-stamp.js";
import * as desk from "./desk/index.js";
import { runE2E } from "./e2e.js";
import { brainUrl, isHarness, isMock, isSmoke, readConfig, windowsHidden, writeConfig } from "./config.js";
import { isQuietHours } from "./quiet.js";
import { lastState, pollOnce, startPoll, stopPoll } from "./poll.js";
import { setToken, tokenSet } from "./secrets.js";
import { createTray, describeMenu as describeTrayMenu, destroyTray, refreshMenu as refreshTrayMenu, setTrayState, wireDeskKill } from "./tray.js";
import {
  BG,
  broadcast,
  createDeck,
  createSummon,
  deckFocused,
  focusDeck,
  getDeck,
  getSummon,
  getWindow,
  hideSummon,
  positionSummon,
  setWindowPaths,
  showSummon,
  summonVisible,
} from "./windows.js";
import {
  IPC,
  type ChatFrame,
  type ConfigPatch,
  type ConfigView,
  type DeskRootConfig,
  type FileBatchPayload,
  type PttEvent,
  type VoiceEventWire,
} from "../src/shared/contract.js";

const APP_VERSION = "0.8.0";

// electron-vite emits CJS here, but keep this resolution style so a future
// ESM flip does not silently break __dirname.
const here =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// BUILD IDENTITY — is this process the same build as the windows it is serving?
//
// THE INCIDENT THIS ANSWERS (2026-09-01). Her voice made no sound. The code on
// disk was fine — it was proved by running it. What was wrong is that this
// process had been launched at 13:42 the previous day while the renderer bundle
// it was handing to its windows had been written at 23:39, ten hours later. A
// main process reads its script ONCE, at launch; a BrowserWindow reads preload
// and HTML from disk when the window is created. So the voice picker King was
// clicking was code that did not exist when the process answering it booted,
// `eve:voice:speak` had no handler, ipcRenderer.invoke rejected, and the
// renderer turned that rejection into the word "NO AUDIO".
//
// Nothing could see it. Now something can: we stat our own artifacts at boot
// and compare them to our own start time. Anything newer than the process means
// somebody rebuilt while we were running, and every window we are serving is
// from a different build than we are.
//
// This is cheap (three stats, once) and it is honest: when the artifacts cannot
// be read at all — `electron-vite dev` serves the renderer from memory — we
// report builtAt:null and stale:false rather than inventing a verdict.
// ---------------------------------------------------------------------------

const PROCESS_STARTED_AT = new Date(Date.now() - Math.round(process.uptime() * 1000));

function newestMtimeMs(target: string): number {
  let newest = 0;
  const visit = (p: string, depth: number): void => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return; // not built, or not readable — silence here is correct
    }
    if (st.isDirectory()) {
      if (depth > 4) return;
      let entries: string[];
      try {
        entries = readdirSync(p);
      } catch {
        return;
      }
      for (const e of entries) visit(path.join(p, e), depth + 1);
      return;
    }
    if (st.mtimeMs > newest) newest = st.mtimeMs;
  };
  visit(target, 0);
  return newest;
}

const BUILD_IDENTITY = ((): { builtAt: string | null; stale: boolean } => {
  // `here` is out/main at runtime, so out/ is one level up.
  const outDir = path.resolve(here, "..");
  const newest = Math.max(
    newestMtimeMs(path.join(outDir, "main")),
    newestMtimeMs(path.join(outDir, "preload")),
    newestMtimeMs(path.join(outDir, "renderer")),
  );
  if (newest === 0) return { builtAt: null, stale: false };
  // One second of slack: a build that finishes microseconds before the launch
  // it triggered is not a skew, and calling it one would cry wolf forever.
  return {
    builtAt: new Date(newest).toISOString(),
    stale: newest > PROCESS_STARTED_AT.getTime() + 1000,
  };
})();

// ---------------------------------------------------------------------------
// Single instance. A second launch focuses the deck rather than opening a
// second tray icon, a second poll loop and a second hotkey registration.
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => focusDeck());
}

app.on("window-all-closed", () => {
  // The tray keeps her resident on Windows — closing the deck is not quitting.
  // Under smoke/shots there is no tray to keep us alive, so we do quit.
  if (windowsHidden() || process.platform !== "win32") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopPoll();
  api.abortAllChats();
  destroyTray();
});

// ---------------------------------------------------------------------------
// PUSH-TO-TALK — and the exact limitation, stated plainly.
//
// Electron's globalShortcut fires ONCE on key-down. There is NO key-up event
// and no way to observe the release: the API registers an accelerator with the
// OS, it does not hook the keyboard. So true hold-to-talk (press, speak,
// RELEASE to send) is not implementable with globalShortcut alone.
//
// What v1 actually does, in BOTH modes:
//   press 1 -> emit { phase:"down" }   (start capture)
//   press 2 -> emit { phase:"up" }     (stop capture, send)
// i.e. tap-toggle mechanics under both labels. `mode` is forwarded on every
// event so the renderer can tell which contract the user THINKS they have:
// in "hold" it is an emulation, in "toggle" it is the real thing.
//
// The honest fix is a low-level keyboard hook (uiohook-napi) which reports
// keyup. That is a NATIVE dependency and is explicitly out of scope for S1 —
// S4 owns that call. Until then, S4's summon/voice UI must render "hold" as
// press-to-start / press-again-to-send, or the copy lies about the gesture.
// ---------------------------------------------------------------------------

let pttDown = false;

function emitPtt(): void {
  pttDown = !pttDown;
  const cfg = readConfig();
  const surface: PttEvent["surface"] = deckFocused() ? "deck" : "summon";
  const payload: PttEvent = { phase: pttDown ? "down" : "up", mode: cfg.pttMode, surface };

  // Hotkey pressed while the deck is NOT focused -> bring up Summon and talk
  // into it from whatever app King is in.
  if (payload.phase === "down" && !deckFocused()) {
    showSummon();
    broadcast(IPC.summonShown, { at: new Date().toISOString() });
  }
  broadcast(IPC.ptt, payload);
  setTrayState(payload.phase === "down" ? "thinking" : isQuietHours() ? "quiet" : "idle");
}

/**
 * FILING HANDS kill switch (G-A6). Registered here rather than inline at boot
 * because `registerHotkey` calls `globalShortcut.unregisterAll()` — so changing
 * the push-to-talk hotkey in Settings would otherwise silently unbind the stop
 * on a feature that writes to his disk.
 */
// The spec names Ctrl+Shift+Esc. Windows OWNS that combination — it is Task
// Manager, and `globalShortcut.register` returns false for it on every Windows
// install. A stop that silently fails to bind is not a stop, so we try the
// spec'd accelerator first (in case a future Windows frees it) and fall back
// until one actually binds. Whichever one is live is logged and reported
// through `deskKillAccel()` so the Settings panel can print the real key
// rather than the one the document wished for.
const DESK_KILL_ACCELS = [
  "CommandOrControl+Shift+Escape",
  "CommandOrControl+Alt+Shift+F",
  "CommandOrControl+Shift+F9",
];

let liveKillAccel: string | null = null;

export function deskKillAccel(): string | null {
  return liveKillAccel;
}

function registerKillHotkey(): void {
  if (liveKillAccel && globalShortcut.isRegistered(liveKillAccel)) return;
  liveKillAccel = null;
  for (const accel of DESK_KILL_ACCELS) {
    try {
      if (globalShortcut.register(accel, () => deskKill("hotkey"))) {
        liveKillAccel = accel;
        break;
      }
    } catch {
      /* an accelerator this build of Electron will not parse; try the next */
    }
  }
  if (liveKillAccel) {
    console.log(
      `[desk] kill hotkey armed: ${liveKillAccel.replace(/CommandOrControl/g, "Ctrl")}` +
        `${liveKillAccel === DESK_KILL_ACCELS[0] ? "" : ` (the spec's ${DESK_KILL_ACCELS[0]!.replace(/CommandOrControl/g, "Ctrl")} is Task Manager — Windows owns it and will not give it up)`}` +
        " · the tray's right-click STOP FILING NOW item is the same stop",
    );
  } else {
    console.warn("[desk] NO kill hotkey could be bound — the tray's right-click STOP FILING NOW item is the ONLY stop");
  }
}

function registerHotkey(): boolean {
  globalShortcut.unregisterAll();
  registerKillHotkey(); // re-arm the stop FIRST, before anything can fail
  const accel = readConfig().hotkey || "CommandOrControl+Space";
  try {
    // Returns false when another app already owns the combination — that is a
    // fact worth logging, not an exception.
    const ok = globalShortcut.register(accel, emitPtt);
    if (!ok) console.error(`[hotkey] ${accel} is already taken by another app — PTT is unbound`);
    return ok;
  } catch (err) {
    console.error("[hotkey] register failed:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function configView(): ConfigView {
  const c = readConfig();
  return {
    brainUrl: brainUrl(), // env override reflected, so settings never lies
    silentAtDesk: c.silentAtDesk,
    pttMode: c.pttMode,
    hotkey: c.hotkey,
    ...(c.osUrl ? { osUrl: c.osUrl } : {}),
    tokenSet: tokenSet(),
    quietHours: isQuietHours(),
    harness: isHarness(),
  };
}

function senderWindow(e: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender);
}


/**
 * ONE PICTURE, OR NOTHING. Main's own last look before anything leaves.
 *
 * Deliberately narrow and deliberately silent about it: a shape that fails here
 * is a shape the renderer should never have produced, and the renderer already
 * has the sentence for every case a person can cause. What this catches is a
 * bug or a tampered bridge call, and the right answer to that is to send the
 * turn WITHOUT the picture rather than to fail his message.
 */
const CHAT_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
/** 5 MB decoded, expressed as its base64 length — checked before any decode. */
const MAX_CHAT_IMAGE_B64 = 6_990_516;

function sanitiseChatImage(raw: unknown): { mime: string; data: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { mime?: unknown; data?: unknown };
  if (typeof o.mime !== "string" || !CHAT_IMAGE_MIMES.has(o.mime)) return null;
  if (typeof o.data !== "string" || o.data.length === 0) return null;
  if (o.data.length > MAX_CHAT_IMAGE_B64) return null;
  // Raw base64 only. A `data:` URI and any whitespace are refused by the brain
  // and there is no reason to spend 5 MB of wire finding that out.
  if (o.data.startsWith("data:") || /[^A-Za-z0-9+/=]/.test(o.data)) return null;
  return { mime: o.mime, data: o.data };
}


/**
 * DOES THIS MACHINE STILL HOLD A FILE WITH THIS DISPLAY NAME?
 *
 * ONE function, TWO callers — the handoff resolution on the way in (api.ts
 * setDeskIndex) and the carried names on the way back out (chatStart). Two
 * copies of this question would eventually be two different answers, and the
 * whole point of both call sites is that they agree.
 *
 * It asks the LIVE snapshot, never a revision: a revision can be old, and his
 * disk is now.
 */
function deskHoldsName(name: string): boolean {
  const snap = desk.indexStore.snapshot();
  return !!snap && snap.entries.some((e) => e.dispName === name);
}

function registerIpc(): void {
  ipcMain.handle(IPC.ping, () => ({
    ok: true as const,
    pong: new Date().toISOString(),
    version: APP_VERSION,
    mock: isMock(),
    smoke: isSmoke(),
    // The build handshake. A renderer that expects these fields and does not
    // get them is, by that fact alone, newer than this process — see PingResult.
    // The authoritative half of the handshake: what THIS bundle was built as.
    // The renderer holds the same constant from the same build and compares
    // the two strings. Nothing is read from disk on either side, so a skewed
    // pair cannot agree by both looking at the same files. See build-stamp.ts.
    buildStamp: BUILD_STAMP,
    startedAt: PROCESS_STARTED_AT.toISOString(),
    builtAt: BUILD_IDENTITY.builtAt,
    stale: BUILD_IDENTITY.stale,
  }));

  ipcMain.handle(IPC.configGet, () => configView());

  ipcMain.handle(IPC.configSet, (_e, patch: ConfigPatch) => {
    try {
      const { token, ...rest } = patch ?? {};
      // The token never touches config.json in the clear — it is peeled off
      // here and handed to safeStorage. A refusal (no OS encryption) is
      // reported and NOTHING is written.
      if (typeof token === "string") {
        const r = setToken(token);
        if (!r.ok) return { ok: false, error: r.error };
      }
      const hotkeyChanged = typeof rest.hotkey === "string" && rest.hotkey !== readConfig().hotkey;
      writeConfig(rest);
      if (hotkeyChanged) registerHotkey();
      return { ok: true, config: configView() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC.stateGet, () => lastState());
  ipcMain.handle(IPC.stateRefresh, () => pollOnce());
  ipcMain.handle(IPC.health, () => api.getHealth());

  type ChatStartArgs = {
    message: string;
    viaVoice?: boolean;
    conversationId?: string;
    /** One picture, this turn. Re-checked by sanitiseChatImage before it moves. */
    image?: { mime?: unknown; data?: unknown };
    /**
     * NAMES HE CARRIED INTO THIS THREAD OFF THE HANDOFF (audit 5, B2).
     * Re-checked below against this machine's LIVE index before they move.
     */
    names?: unknown;
  };
  ipcMain.handle(IPC.chatStart, (_e, args: ChatStartArgs) => {
    // FILING HANDS — the desk briefing, built THIS instant and attached to
    // THIS turn only (hop 2). `pack()` returns null whenever filing is off, no
    // root survived enrollment, or the Windows attribute sweep failed, and
    // api.ts then omits the field entirely. There is no cache anywhere: the
    // pack cannot outlive the request it rode in on.
    const deskPack = desk.pack();
    // WHEN THERE IS NO PACK, SAY WHY — in the pack slot, not by omission.
    //
    // An absent `desk` field is silence, and silence made her invent a cause:
    // he typed "sort my desk-test folder" standing at this very app with filing
    // never armed, and she told him to try from the desktop app. The refusal
    // object rides in the SAME slot (its `pack: null` is the discriminator), so
    // the brain's pack validator still rejects it and her tools get the real
    // reason: switched off, nothing enrolled, or a named root that failed.
    const deskRefusal = deskPack ? null : desk.packRefusalObject();
    if (!deskPack && desk.packRefusal()) console.log(`[desk] pack withheld — ${desk.packRefusal()}`);
    else if (deskPack && desk.packNote()) console.log(`[desk] pack note — ${desk.packNote()}`);
    // A PICTURE, RE-CHECKED HERE.
    //
    // The renderer already sniffed the magic bytes at attach time (see
    // src/renderer/deck/image.ts) — that is where the honesty lives, because
    // that is where he can see the answer before he presses send. This second
    // pass is not a duplicate of it; it is main refusing to put a shape on the
    // wire that it cannot vouch for at all. A `data:` prefix, whitespace, a
    // mime outside the three, or an absurd length never leave this machine.
    //
    // WHAT MAIN DOES NOT DO: read the picture. There is no OCR step anywhere in
    // this design. Text inside the image is written by whoever made the image
    // and is UNTRUSTED — the brain wraps the pixels in the same
    // `<untrusted_…>` envelope a filename rides in, and this process never
    // looks. It measures and forwards.
    const image = sanitiseChatImage(args?.image);
    // THE CARRIED NAMES, RE-ASKED OF THE LIVE INDEX HERE (audit 5, B2).
    //
    // The renderer holds these as chips between the handoff and the send, and
    // the renderer is downstream of a `handoff` frame that came out of a
    // conversation a picture was in. So they get the SAME question a second
    // time, at the same door and off the same index that answered it the first
    // time: does this machine still hold a file with this name?
    //
    // Anything that fails is DROPPED — never repaired, never guessed at, and
    // never passed through because it was "already checked". A name that has
    // left his disk between the button and the send is a name he would be
    // sending a message about a file that is not there.
    //
    // And they go on the wire as their OWN FIELD. They are never concatenated
    // into `message`: that string is the trusted half of the turn and a
    // filename is not his. The brain renders them inside <untrusted_filenames>.
    const carried = filterHandoffNames(Array.isArray(args?.names) ? args.names : [], deskHoldsName);
    if (carried.dropped > 0) console.log(`[desk] carried names — ${carried.dropped} dropped at send`);
    const chatId = api.startChat(
      {
        message: args?.message ?? "",
        conversationId: args?.conversationId ?? null,
        viaVoice: args?.viaVoice,
        ...(deskPack ? { desk: deskPack } : deskRefusal ? { desk: deskRefusal } : {}),
        ...(image ? { image } : {}),
        ...(carried.names.length > 0 ? { names: carried.names } : {}),
      },
      (frame: ChatFrame) => {
        // Frames go to EVERY live window, not just the one that started the
        // turn: a turn spoken into Summon has to land in the deck's thread too.
        // Every frame carries its chatId and the renderers filter on it, so a
        // window that did not start this turn either adopts it (the deck's
        // unknown-chatId bubble path) or ignores it (useVoiceTurn).
        broadcast(IPC.chatFrame, { chatId, frame });
        if (frame.type === "state") setTrayState(frame.state === "idle" ? "idle" : "thinking");
        if (frame.type === "done" || frame.type === "error") {
          setTrayState(isQuietHours() ? "quiet" : "idle");
        }
      },
    );
    return { chatId };
  });

  ipcMain.handle(IPC.chatAbort, (_e, chatId: string) => ({ ok: api.abortChat(chatId) }));

  ipcMain.handle(IPC.confirm, async (_e, a: { id: string; hash: string; approve: boolean }) => {
    const r = await api.postConfirm(a.id, a.hash, a.approve);
    if (!r.ok || !r.clientAction) return r;
    // An unknown clientAction type is handed straight back untouched. An old
    // desktop can never be handed a shape it does not understand, and a new one
    // never guesses at one.
    if (r.clientAction.type !== "apply_file_batch") return r;
    // The payload arrived TWICE — once over SSE with the card, once in this
    // HTTP response. `desk.startBatch` recomputes the hash over THIS delivery
    // and refuses if it differs from the one he approved. (CARD-1c / G-C3)
    const start = desk.startBatch(r.clientAction.payload as unknown as FileBatchPayload, a.hash);
    // Returns IMMEDIATELY with a job id. The IPC handler never blocks on a
    // 50-file move; progress and outcome arrive on IPC.deskProgress. (PART-3)
    return start.ok
      ? { ...r, deskJobId: start.jobId }
      : { ...r, deskRefusal: start.refusal ?? "the desk refused that batch" };
  });
  ipcMain.handle(IPC.attention, (_e, a: { id: string; action: "approve" | "hold" | "dismiss" }) =>
    api.postAttentionAction(a.id, a.action),
  );
  ipcMain.handle(IPC.vitals, (_e, days?: number) => api.getVitals(days ?? 7));
  ipcMain.handle(IPC.checkin, (_e, patch) => api.postCheckin(patch ?? {}));
  ipcMain.handle(IPC.routineTick, (_e, a: { id: string; onDate?: string }) =>
    api.postRoutineTick(a.id, a.onDate),
  );
  ipcMain.handle(IPC.routineUntick, (_e, a: { id: string; onDate?: string }) =>
    api.postRoutineUntick(a.id, a.onDate),
  );
  ipcMain.handle(IPC.routineCreate, (_e, a: { name: string; cadence?: string; slot?: "habit" | "checkin" }) =>
    api.postRoutine(a.name, a.cadence, a.slot),
  );
  ipcMain.handle(IPC.routineArchive, (_e, id: string) => api.postRoutineArchive(id));
  ipcMain.handle(IPC.jobRun, (_e, a: { job: string; force?: boolean }) =>
    api.postJob(a.job, a.force ?? true),
  );
  ipcMain.handle(IPC.dispatch, (_e, a: { task: string; agent?: string; client?: string }) =>
    api.postDispatch(a.task, a.agent, a.client),
  );
  ipcMain.handle(IPC.capture, (_e, a: { text: string; sourceLink?: string }) =>
    api.postCapture(a.text, a.sourceLink),
  );
  ipcMain.handle(IPC.wardrobeGet, () => api.getWardrobe());
  ipcMain.handle(IPC.wardrobeWear, (_e, file: string) => api.postWear(file));
  ipcMain.handle(IPC.voiceTranscribe, (_e, a: { buf: ArrayBuffer; mime?: string }) =>
    api.postTranscribe(a.buf, a.mime),
  );
  ipcMain.handle(IPC.voiceSpeak, (_e, a: { text: string; voiceId?: string }) =>
    api.postSpeak(a?.text ?? "", a?.voiceId),
  );
  ipcMain.handle(IPC.voices, () => api.getVoices());

  // VOICE RELAY. The renderer's voice bus is per-window; this is how a mode or
  // a user-turn emitted in Summon reaches the deck. Main is a dumb repeater and
  // NEVER sends the event back to the window it came from — that echo is what
  // would turn two subscribed windows into an infinite loop.
  ipcMain.handle(IPC.voiceRelay, (e, payload: VoiceEventWire) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed() || w.webContents.id === e.sender.id) continue;
      w.webContents.send(IPC.voiceEvent, payload);
    }
  });

  ipcMain.handle(IPC.winMinimize, (e) => {
    senderWindow(e)?.minimize();
  });
  ipcMain.handle(IPC.winMaximize, (e) => {
    const w = senderWindow(e);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.handle(IPC.winClose, (e) => {
    senderWindow(e)?.close();
  });
  // Esc inside Summon routes here (the renderer owns the keybind, main owns
  // the window).
  ipcMain.handle(IPC.summonHide, () => hideSummon());

  // --- S1b bridge additions -------------------------------------------------
  ipcMain.handle(IPC.deckFocus, () => {
    focusDeck();
  });

  ipcMain.handle(IPC.openExternal, async (_e, target: unknown) => {
    // ALLOWLIST ONLY — the renderer sends a target key, never a URL. This is
    // the one place that turns a key into an actual destination.
    const url =
      target === "gmail" ? "https://mail.google.com" : target === "os" ? readConfig().osUrl : undefined;
    if (!url) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  // The flyout window is S4's (electron/windows.js's registerWindow("flyout",
  // win) is how it gets found here) — until then this is a safe no-op.
  ipcMain.handle(IPC.flyoutHide, () => {
    const win = getWindow("flyout");
    if (win && win.isVisible()) win.hide();
  });

  registerDeskIpc();
}

// ---------------------------------------------------------------------------
// FILING HANDS — the desk IPC surface.
//
// Eleven invoke channels and one broadcast. Three of them take a path or a
// path-adjacent value and each one is bounded:
//
//   enroll()        takes NOTHING. Main opens the folder dialog itself and uses
//                   its own result. The renderer cannot type a path into it.
//   undo(batchId)   a batch id, never a path.
//   undoSince(iso)  a timestamp, never a path.
//
// This is the `openExternal` allowlist precedent verbatim: the renderer sends
// a key, never a destination. There is deliberately no deskMove channel — the
// renderer cannot express a file operation at all.
// ---------------------------------------------------------------------------

function deskCfgRoots(): DeskRootConfig[] {
  return readConfig().deskRoots ?? [];
}

function registerDeskIpc(): void {
  ipcMain.handle(IPC.deskRoots, () => desk.roots());
  // DESK/S3: two fields main owns and the desk module cannot know — which
  // accelerator actually bound (Windows refuses the spec'd one), and the
  // never-list as it is on disk. Settings prints the real key and the real
  // rules instead of the documented defaults.
  ipcMain.handle(IPC.deskStatus, () => ({
    ...desk.status(),
    killAccel: deskKillAccel(),
    neverList: readConfig().deskNeverList ?? [],
  }));
  ipcMain.handle(IPC.deskLog, (_e, limit?: number) => desk.log(typeof limit === "number" ? limit : 50));
  // WHERE DID IT GO — read-only, journal-driven, and it works with the brain
  // offline, which is exactly the state he is in when he notices a file is
  // missing. It returns rows and a batch id and nothing else; putting a file
  // back still goes through IPC.deskUndo below, the mover that already exists.
  ipcMain.handle(IPC.deskWhere, (_e, a: { query?: unknown; limit?: unknown }) =>
    desk.whereIs(typeof a?.query === "string" ? a.query : "", typeof a?.limit === "number" ? a.limit : 40),
  );
  ipcMain.handle(IPC.deskOutcome, (_e, jobId: string) => desk.outcome(String(jobId)));
  ipcMain.handle(IPC.deskCancel, (_e, jobId: string) => desk.cancel(String(jobId)));
  ipcMain.handle(IPC.deskUndo, (_e, batchId: string) => desk.undoBatch(String(batchId)));
  ipcMain.handle(IPC.deskUndoPreview, (_e, batchId: string) => desk.previewUndo(String(batchId)));
  ipcMain.handle(IPC.deskUndoSince, (_e, a: { iso: string; preview?: boolean }) =>
    desk.undoSince(String(a?.iso ?? ""), a?.preview !== false),
  );
  ipcMain.handle(IPC.deskPreflight, (_e, payload: FileBatchPayload) => desk.preflight(payload));

  // The ONE channel that produces an absolute path — and it produces it HERE,
  // in main, from a native dialog. Nothing the renderer sent is used as a path.
  ipcMain.handle(IPC.deskEnroll, async (e) => {
    const win = senderWindow(e);
    const opts: Electron.OpenDialogOptions = {
      properties: ["openDirectory"],
      title: "Pick a folder EVE may file in",
    };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled || r.filePaths.length !== 1) return { ok: false, refusal: "no folder picked" };
    const picked = r.filePaths[0] as string;
    const label =
      path.basename(picked).toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 24) || "root";
    const probe = desk.enroll(picked, label);
    if (!probe.ok) return probe;
    const roots = deskCfgRoots().filter((x) => x.label !== label);
    roots.push({
      label,
      path: picked,
      dryRun: true, // DRY RUN IS ON. Always, on every newly enrolled root.
      synced: probe.synced === true,
      trash: String(probe.trash ?? ""),
    });
    writeConfig({ deskRoots: roots });
    desk.arm(readConfig().deskEnabled === true, roots);
    return probe;
  });

  ipcMain.handle(IPC.deskSetRoot, (_e, a: { label: string; patch: { dryRun?: boolean; remove?: true } }) => {
    const label = String(a?.label ?? "");
    const roots = deskCfgRoots();
    const i = roots.findIndex((x) => x.label === label);
    if (i < 0) return { ok: false, error: "no such folder" };
    if (a.patch?.remove === true) roots.splice(i, 1);
    else if (typeof a.patch?.dryRun === "boolean") (roots[i] as DeskRootConfig).dryRun = a.patch.dryRun;
    writeConfig({ deskRoots: roots });
    desk.arm(readConfig().deskEnabled === true, roots);
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // DESK/S3 — THE MASTER SWITCH AND THE PHYSICAL STOP.
  //
  // Neither takes a path, a filename, or anything path-adjacent: `arm` takes a
  // boolean and `kill` takes nothing. They are the two renderer-visible state
  // changes the Settings panel and the deck's log panel need, and without them
  // filing ships with no way to turn it on and no way to stop it from a screen.
  //
  // `arm(false)` is a CLEAN disarm: it does not abort a running batch, because
  // a switch flick is not an emergency. `kill()` is the emergency and aborts
  // between ops — the same function the global hotkey and the tray land on.
  // -------------------------------------------------------------------------
  ipcMain.handle(IPC.deskArm, (_e, on: unknown) => {
    // Anything that is not a literal `true` reads as OFF. A corrupt or coerced
    // argument can never arm the feature. (Mirrors config.ts's `=== true`.)
    const want = on === true;
    try {
      writeConfig({ deskEnabled: want });
      const report = desk.arm(want, deskCfgRoots());
      refreshTrayMenu(); // G-A6 — the tray item's label and enabled state move with it
      console.log(`[desk] ARM ${want ? "ON" : "OFF"} (settings) — roots ${report.roots.filter((p) => p.ok).length}/${report.roots.length}`);
      return { ok: true, enabled: desk.status().enabled, killAccel: deskKillAccel() };
    } catch (err) {
      return {
        ok: false,
        enabled: desk.status().enabled,
        killAccel: deskKillAccel(),
        error: err instanceof Error ? err.message : "could not write the config",
      };
    }
  });

  ipcMain.handle(IPC.deskKill, () => {
    const r = deskKill("deck");
    return { ok: true, enabled: desk.status().enabled, killAccel: deskKillAccel(), stopped: r.stopped };
  });
}

/**
 * The kill switch. A tray item and a global hotkey both land here. Neither
 * source architecture had a physical stop on a feature that writes to his
 * disk, and that absence was its own finding. (G-A6)
 */
export function deskKill(reason: string): { stopped: number; wasEnabled: boolean } {
  const r = desk.kill();
  try {
    writeConfig({ deskEnabled: false });
  } catch {
    /* the in-memory disarm already happened; the config write is best-effort */
  }
  refreshTrayMenu();
  console.log(`[desk] KILL (${reason}) — armed was ${r.wasEnabled}, stopped ${r.stopped} in-flight batch(es)`);
  broadcast(IPC.deskProgress, {
    jobId: "",
    batchId: "",
    phase: "refused",
    done: 0,
    total: 0,
    dryRun: false,
    refusal: `FILING HANDS STOPPED — ${r.stopped} batch(es) aborted between operations. Filing is now OFF.`,
  });
  // DESK/S3: returns what it stopped so the deck's kill button can say it in
  // words. The hotkey and the tray ignore the value; nothing else changed.
  return r;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  app.setAppUserModelId("com.churlish.eve.desktop"); // Windows toasts need this

  const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL;
  setWindowPaths({
    preload: path.join(here, "../preload/index.js"),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererDir: path.join(here, "../renderer"),
  });

  // FILING HANDS — init + boot reconcile BEFORE any window exists, so an
  // interrupted batch from a previous session is classified before anything
  // else can touch the disk. `deskEnabled` defaults to false, so on a machine
  // that has never turned this on `init` enrols zero roots and does nothing but
  // open the journal.
  const cfg = readConfig();
  const deskReport = desk.init({
    userDataDir: app.getPath("userData"),
    deskId: cfg.deskId ?? "",
    deskEnabled: cfg.deskEnabled === true,
    deskRoots: cfg.deskRoots ?? [],
    deskTrashCeilingBytes: cfg.deskTrashCeilingBytes ?? 20 * 1024 * 1024 * 1024,
    deskNeverList: cfg.deskNeverList ?? [],
    deskMaxIndex: cfg.deskMaxIndex ?? 1200,
    emit: (e) => broadcast(IPC.deskProgress, e),
    isHarness,
    // The eye watches for real in the app. Under a harness it walks once, on
    // demand, so a background rebuild can never race a fixture.
    startEye: !isHarness(),
  });
  console.log(
    `[desk] ${deskReport.enabled ? "ARMED" : "OFF"} · roots ${deskReport.roots.filter((p) => p.ok).length}/` +
      `${deskReport.roots.length} · reconciled ${deskReport.reconciled.batches} interrupted batch(es), ` +
      `${deskReport.reconciled.ambiguous} ambiguous · journal ${deskReport.journalPath}`,
  );

  // THE HANDOFF'S INDEX. api.ts turns the brain's `{rev, ids}` frame into
  // filenames HERE, on this machine, and it can only do that with this. Wired
  // right after desk.init so the store is live; left unwired, api.ts fails
  // closed and nothing travels — which is visible to him, unlike the other
  // failure, which would be trusting a string the brain sent.
  //
  // Two questions, both answered by the eye and neither by her: WHAT WAS ID n
  // IN THAT REVISION (the same door a filing plan comes home through, G-P1),
  // and IS THAT FILE STILL THERE NOW. The names handed back are the SANITISED
  // display names — the strings that already rode the wire in the census —
  // never the real ones, which never leave this process.
  api.setDeskIndex({
    nameFor: (rev, i) => {
      const hit = desk.indexStore.resolve(rev, i);
      if (!hit) return null;
      const cut = hit.wireRel.lastIndexOf("/");
      return cut < 0 ? hit.wireRel : hit.wireRel.slice(cut + 1);
    },
    holdsName: deskHoldsName,
  });

  registerIpc();
  const deck = createDeck();
  createSummon(); // built up front and kept hidden so summon is instant

  // The deck's own focus is a refresh trigger — the screen King just looked at
  // is never more than a moment stale.
  deck.on("focus", () => {
    void pollOnce();
    // Hop 1 — a reconcile walk on window focus, so the census he is about to
    // ask her about is the folder he was just looking at.
    desk.noteFocus();
  });

  if (!windowsHidden()) {
    createTray();
    // G-A6 — the tray item and the global hotkey are the SAME stop. The menu
    // asks for the accelerator every time it is built, so it prints the key
    // that actually bound rather than the one the spec wished for.
    wireDeskKill({ kill: deskKill, accel: deskKillAccel, enabled: () => desk.status().enabled });
  }
  setTrayState(isQuietHours() ? "quiet" : "idle");
  registerHotkey(); // also arms the filing-hands kill hotkey (G-A6)

  // G-A6 RECEIPT — `EVE_TRAY_MENU=1 electron .` builds the real tray, wires the
  // real kill, prints the menu Electron actually produced, and exits. Env-gated
  // and inert otherwise, the same shape as EVE_SMOKE and EVE_TRAY_DUMP. A grep
  // proves a string is in a file; this proves there is a menu item on screen.
  if (process.env.EVE_TRAY_MENU) {
    createTray();
    wireDeskKill({ kill: deskKill, accel: deskKillAccel, enabled: () => desk.status().enabled });
    console.log(`TRAY MENU (filing ${desk.status().enabled ? "ARMED" : "OFF"}):`);
    console.log(describeTrayMenu());
    desk.arm(true, deskCfgRoots());
    refreshTrayMenu();
    console.log(`TRAY MENU (filing ${desk.status().enabled ? "ARMED" : "OFF"}):`);
    console.log(describeTrayMenu());
    console.log(`KILL ACCEL AS BOUND: ${deskKillAccel() ?? "(none bound)"}`);
    app.exit(0);
    return;
  }
  startPoll();

  console.log(
    `[eve] desktop ${APP_VERSION} · ${isDev ? "dev" : "packaged"} · brain ${brainUrl()} · ` +
      `token ${tokenSet() ? "set" : "NOT set"} · mock=${isMock()} · smoke=${isSmoke()} · ` +
      `quiet=${isQuietHours()} · windows ${windowsHidden() ? "HIDDEN" : "visible"}`,
  );
  // The stamp goes in the boot line unconditionally: when he pastes a log at
  // me, the FIRST question — "is this one build or two?" — is answered on the
  // first line instead of being reconstructed from timestamps.
  console.log(
    `[eve] build stamp ${BUILD_STAMP}${IS_UNSTAMPED ? " (UNSTAMPED — this bundle was not produced by electron-vite build)" : ` (built ${stampLabel(BUILD_STAMP)})`}`,
  );
  if (BUILD_IDENTITY.stale) {
    // Impossible at a normal launch (we stat AFTER we start), but a `dev`
    // rebuild can beat us to it. Say it loudly rather than let a window fail
    // with a mystery later.
    console.warn(
      `[eve] BUILD SKEW — artifacts written ${BUILD_IDENTITY.builtAt} are newer than this process ` +
        `(started ${PROCESS_STARTED_AT.toISOString()}). Quit and relaunch: windows created from here on ` +
        `will run code this process has no handlers for.`,
    );
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createDeck();
  });
});

// ---------------------------------------------------------------------------
// SMOKE MODE — the main-process half of `npm run smoke`.
//
// scripts/smoke.mjs launches electron with EVE_SMOKE=1 EVE_MOCK=1 and reads the
// SMOKE: lines this block prints. Everything runs with the windows hidden.
// ---------------------------------------------------------------------------

if (isSmoke()) {
  const results: { name: string; pass: boolean; detail: string }[] = [];
  const check = (name: string, pass: boolean, detail: string): void => {
    results.push({ name, pass, detail });
  };

  app.whenReady().then(async () => {
    const deck = getDeck();
    if (!deck) {
      console.log("SMOKE: FAIL boot — no deck window");
      app.exit(1);
      return;
    }

    await new Promise<void>((resolve) => {
      if (!deck.webContents.isLoading()) resolve();
      else deck.webContents.once("did-finish-load", () => resolve());
    });
    check("deck did-finish-load", true, deck.webContents.getURL().split("/").pop() ?? "");
    check("windows hidden", !deck.isVisible() && !summonVisible(), `deck visible=${deck.isVisible()} summon visible=${summonVisible()}`);

    // IPC self-test: the RENDERER calls window.eve.ping(), which round-trips
    // through the preload bridge into main and back. If contextIsolation or
    // the bridge is broken, this is where it shows.
    try {
      const pong = (await deck.webContents.executeJavaScript(
        "window.eve.ping().then(r => JSON.stringify(r))",
      )) as string;
      const parsed = JSON.parse(pong) as { ok: boolean; version: string; mock: boolean };
      check("ipc ping (renderer -> main)", parsed.ok === true, `version=${parsed.version} mock=${parsed.mock}`);
    } catch (err) {
      check("ipc ping (renderer -> main)", false, err instanceof Error ? err.message : String(err));
    }

    // The renderer must NOT be able to see a token or a raw ipcRenderer.
    try {
      const leak = (await deck.webContents.executeJavaScript(
        "JSON.stringify({ keys: Object.keys(window.eve), node: typeof window.require, ipc: typeof window.ipcRenderer, tok: JSON.stringify(window.eve).includes('Bearer') })",
      )) as string;
      const l = JSON.parse(leak) as { keys: string[]; node: string; ipc: string; tok: boolean };
      check(
        "renderer isolation (no require/ipcRenderer/token)",
        l.node === "undefined" && l.ipc === "undefined" && l.tok === false,
        `require=${l.node} ipcRenderer=${l.ipc} bearerInBridge=${l.tok} bridgeKeys=${l.keys.length}`,
      );
    } catch (err) {
      check("renderer isolation", false, err instanceof Error ? err.message : String(err));
    }

    // Quiet hours — the four boundary times, dates injected. 21:30-06:30
    // America/Chicago; these are built as UTC instants that land on the exact
    // local minute (CDT = UTC-5 in August).
    const at = (localHour: number, localMin: number): Date =>
      new Date(Date.UTC(2026, 7, 29, localHour + 5, localMin));
    const boundaries: [string, Date, boolean][] = [
      ["21:29 -> false", at(21, 29), false],
      ["21:30 -> true", at(21, 30), true],
      ["06:29 -> true", at(6, 29), true],
      ["06:30 -> false", at(6, 30), false],
    ];
    for (const [label, date, want] of boundaries) {
      const got = isQuietHours(date);
      check(`quiet ${label}`, got === want, `got=${got} want=${want} (${date.toISOString()})`);
    }

    // Mock state must reach the renderer through the real IPC path.
    try {
      const raw = (await deck.webContents.executeJavaScript(
        "window.eve.state.refresh().then(r => JSON.stringify(r))",
      )) as string;
      const upd = JSON.parse(raw) as { state: { floor?: { count: number } } };
      check(
        "mock state.get floor.count === 2",
        upd.state?.floor?.count === 2,
        `floor.count=${upd.state?.floor?.count}`,
      );
    } catch (err) {
      check("mock state.get floor.count === 2", false, err instanceof Error ? err.message : String(err));
    }

    for (const r of results) {
      console.log(`SMOKE: ${r.pass ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
    const failed = results.filter((r) => !r.pass).length;
    console.log(`SMOKE: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${results.length} checks)`);
    app.exit(failed === 0 ? 0 : 1);
  });
}

// ---------------------------------------------------------------------------
// SHOTS MODE — the main-process half of `npm run shots`.
//
// capturePage() only exists on a webContents, which only exists in the main
// process, so the capture itself has to live here; scripts/shots.mjs is the
// launcher and the verifier. Windows stay hidden throughout.
//
// This is the harness S2-S4 lean on for visual receipts: fixed 1440x900 deck,
// wait on the renderer's own window.__RENDER_DONE flag (not a sleep), 15s
// ceiling per page so a broken render fails loudly instead of hanging CI.
// ---------------------------------------------------------------------------

if (process.env.EVE_SHOTS === "1") {
  const OUT = path.join(here, "..", "..", "verify");
  const RENDER_TIMEOUT_MS = 15_000;

  const waitForRender = async (win: BrowserWindow, label: string): Promise<boolean> => {
    if (win.webContents.isLoading()) {
      await new Promise<void>((r) => win.webContents.once("did-finish-load", () => r()));
    }
    const deadline = Date.now() + RENDER_TIMEOUT_MS;
    for (;;) {
      let done = false;
      try {
        done = (await win.webContents.executeJavaScript("window.__RENDER_DONE === true")) as boolean;
      } catch {
        done = false;
      }
      if (done) return true;
      if (Date.now() > deadline) {
        console.log(`SHOTS: TIMEOUT ${label} — window.__RENDER_DONE never went true in ${RENDER_TIMEOUT_MS}ms`);
        return false;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  };

  const capture = async (win: BrowserWindow, file: string, label: string): Promise<boolean> => {
    const ok = await waitForRender(win, label);
    if (!ok) return false;
    // One more frame after the flag so the paint that set it is on screen.
    await new Promise((r) => setTimeout(r, 250));
    try {
      const img = await win.webContents.capturePage();
      const png = img.toPNG();
      const size = img.getSize();
      writeFileSync(path.join(OUT, file), png);
      console.log(`SHOTS: WROTE ${file} — ${size.width}x${size.height}, ${png.length} bytes`);
      return png.length > 0;
    } catch (err) {
      console.log(`SHOTS: FAIL ${label} — ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };

  app.whenReady().then(async () => {
    mkdirSync(OUT, { recursive: true });
    const deckWin = getDeck();
    const summonWin = getSummon();
    if (!deckWin || !summonWin) {
      console.log("SHOTS: FAIL — windows missing");
      app.exit(1);
      return;
    }
    // The deck's saved geometry must not decide what a screenshot looks like.
    deckWin.setSize(1440, 900);
    positionSummon(summonWin);

    const a = await capture(deckWin, "deck.png", "deck");
    const b = await capture(summonWin, "summon.png", "summon");
    console.log(`SHOTS: ${a && b ? "DONE" : "INCOMPLETE"}`);
    app.exit(a && b ? 0 : 1);
  });
}

// ---------------------------------------------------------------------------
// SHOT-URL MODE — generic single-page screenshot harness (S1b bridge work).
//
// scripts/shot.mjs sets EVE_SHOT_URL (a renderer-relative URL + optional
// query, e.g. "index.html?shot=confirm" or "summon.html?shot=listening"),
// EVE_SHOT_SIZE ("WxH", default 1440x900) and EVE_SHOT_OUT (absolute PNG
// path), then spawns electron. This block creates ONE dedicated window (never
// the real deck/summon — those still boot normally above, hidden, because
// config.windowsHidden() now also covers EVE_SHOT_URL), sized from
// EVE_SHOT_SIZE, transparent+frameless when the URL starts with "summon" or
// "flyout" (matching those windows' real chrome), loads the URL on both the
// dev-server and packaged-file paths, waits for window.__RENDER_DONE (poll,
// 15s ceiling — same pattern as EVE_SHOTS above), captures, writes the PNG,
// prints one SHOT: line, exits 0/1.
//
// Additive only: the EVE_SMOKE and EVE_SHOTS blocks above are untouched.
// ---------------------------------------------------------------------------

if (process.env.EVE_SHOT_URL) {
  const shotUrl = process.env.EVE_SHOT_URL;
  const [wStr, hStr] = (process.env.EVE_SHOT_SIZE || "1440x900").split("x");
  const shotWidth = Number(wStr) || 1440;
  const shotHeight = Number(hStr) || 900;
  const shotOut = process.env.EVE_SHOT_OUT || path.join(here, "..", "..", "verify", "shot.png");
  const SHOT_RENDER_TIMEOUT_MS = 15_000;
  const overlay = /^(summon|flyout)/.test(shotUrl);

  const waitForShotRender = async (win: BrowserWindow): Promise<boolean> => {
    if (win.webContents.isLoading()) {
      await new Promise<void>((r) => win.webContents.once("did-finish-load", () => r()));
    }
    const deadline = Date.now() + SHOT_RENDER_TIMEOUT_MS;
    for (;;) {
      let done = false;
      try {
        done = (await win.webContents.executeJavaScript("window.__RENDER_DONE === true")) as boolean;
      } catch {
        done = false;
      }
      if (done) return true;
      if (Date.now() > deadline) {
        console.log(
          `SHOT: TIMEOUT ${shotUrl} — window.__RENDER_DONE never went true in ${SHOT_RENDER_TIMEOUT_MS}ms`,
        );
        return false;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  };

  // EVE_SHOT_WAIT=online — a LIVE capture must not race the brain: a fresh
  // window.__RENDER_DONE only proves React painted SOMETHING, even a
  // degraded/offline shell. This additionally waits for poll.ts's cache
  // (already ticking from the normal boot's startPoll() below) to report
  // online, plus one main-side GET /wardrobe (no cache exists for that today)
  // to confirm a look is actually worn — so a "still showing the core orb"
  // capture is never just a cold-brain race. Never blocks the capture: on
  // timeout it prints SHOT-WAIT: timeout and falls through to capture anyway.
  const SHOT_WAIT_ONLINE_MS = 20_000;
  const SHOT_WAIT_POLL_MS = 250;
  const waitForOnline = async (): Promise<void> => {
    const deadline = Date.now() + SHOT_WAIT_ONLINE_MS;
    for (;;) {
      if (lastState().state.online) {
        const w = await api.getWardrobe();
        if (w.wearing) return;
      }
      if (Date.now() > deadline) {
        console.log("SHOT-WAIT: timeout");
        return;
      }
      await new Promise((r) => setTimeout(r, SHOT_WAIT_POLL_MS));
    }
  };

  app.whenReady().then(async () => {
    mkdirSync(path.dirname(shotOut), { recursive: true });

    const win = new BrowserWindow({
      width: shotWidth,
      height: shotHeight,
      show: false,
      // Both real windows (windows.ts) are frame:false ALWAYS — only summon
      // adds transparent:true on top. An OS frame here would eat pixels from
      // the captured content area, so the PNG would come out smaller than
      // EVE_SHOT_SIZE. Frameless unconditionally; transparency conditional.
      frame: false,
      transparent: overlay,
      backgroundColor: overlay ? "#00000000" : BG,
      webPreferences: {
        preload: path.join(here, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });

    const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL;
    const [file, search] = shotUrl.split("?");
    if (isDev) {
      void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${shotUrl}`);
    } else {
      const query = search ? Object.fromEntries(new URLSearchParams(search)) : undefined;
      void win.loadFile(path.join(here, "..", "renderer", file), query ? { query } : {});
    }

    if (process.env.EVE_SHOT_WAIT === "online") {
      await waitForOnline();
    }

    const ok = await waitForShotRender(win);
    if (!ok) {
      app.exit(1);
      return;
    }
    // One more frame after the flag so the paint that set it is on screen.
    await new Promise((r) => setTimeout(r, 250));
    if (process.env.EVE_SHOT_WAIT === "online") {
      // Measured empirically (S9): a never-shown window's compositor frame can
      // still lag the DOM by MORE than the usual 250ms once real network data
      // (the wardrobe portrait's <img>, in particular) lands a beat after
      // /state does — the DOM was already provably correct here while
      // capturePage() kept returning the pre-online frame until ~3s total had
      // passed. This extra settle is additive to the 250ms above only for a
      // live wait; it does not touch the mock/default capture path.
      await new Promise((r) => setTimeout(r, 2750));
    }
    try {
      const img = await win.webContents.capturePage();
      const png = img.toPNG();
      const size = img.getSize();
      writeFileSync(shotOut, png);
      console.log(`SHOT: ${shotOut} ${size.width}x${size.height} ${png.length} bytes`);
      app.exit(png.length > 0 ? 0 : 1);
    } catch (err) {
      console.log(`SHOT: FAIL ${shotUrl} — ${err instanceof Error ? err.message : String(err)}`);
      app.exit(1);
    }
  });
}


// ---------------------------------------------------------------------------
// END-TO-END MODE — the main-process half of `npm run verify:e2e`.
//
// verify/desk-e2e-harness.mjs builds a scratch tree, starts a stub brain, and
// spawns electron with EVE_E2E=1 (+ EVE_DESK_SCRATCH, EVE_BRAIN_URL). This
// block drives one full confirm round trip through the REAL renderer and the
// REAL executor and prints the E2E: lines the launcher grades.
//
// Additive only, and the same shape as the EVE_SMOKE / EVE_SHOTS blocks above.
// ---------------------------------------------------------------------------

if (process.env.EVE_E2E === "1") {
  runE2E({ desk, getDeck, brainUrl });
}
