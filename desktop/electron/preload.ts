// THE BRIDGE — window.eve.
//
// contextIsolation:true, nodeIntegration:false, sandbox:false (the preload
// needs require() to reach ipcRenderer). This is the ENTIRE surface the
// renderer gets: no fetch, no fs, no ipcRenderer, no token.
//
// The ONLY URL that crosses is brainUrl, inside config.get — it is published
// in the design handoff and is not a secret. The bearer token never appears
// here in any form; `tokenSet` is a boolean and that is all a UI needs to draw
// "BEARER — SET".
//
// Owning stream: S1. Adding a channel means adding it to contract.ts's IPC map,
// to main.ts's handlers, and here — in that order.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IPC,
  type AttentionAction,
  type BrainJob,
  type ChatFrameEvent,
  type ConfigPatch,
  type DeskProgress,
  type EveBridge,
  type PttEvent,
  type StateUpdate,
  type SummonShownEvent,
  type Unsub,
  type VoiceEventWire,
} from "../src/shared/contract.js";

/** Subscribe helper: every on*() returns its own unsubscribe. */
function on<T>(channel: string, cb: (payload: T) => void): Unsub {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const eve: EveBridge = {
  config: {
    get: () => ipcRenderer.invoke(IPC.configGet),
    set: (patch: ConfigPatch) => ipcRenderer.invoke(IPC.configSet, patch),
  },
  state: {
    get: () => ipcRenderer.invoke(IPC.stateGet),
    refresh: () => ipcRenderer.invoke(IPC.stateRefresh),
  },
  health: () => ipcRenderer.invoke(IPC.health),
  chat: {
    start: (args) => ipcRenderer.invoke(IPC.chatStart, args),
    abort: (chatId: string) => ipcRenderer.invoke(IPC.chatAbort, chatId),
  },
  onChatFrame: (cb) => on<ChatFrameEvent>(IPC.chatFrame, cb),
  onStateUpdate: (cb) => on<StateUpdate>(IPC.stateUpdate, cb),
  onPtt: (cb) => on<PttEvent>(IPC.ptt, cb),
  onSummonShown: (cb) => on<SummonShownEvent>(IPC.summonShown, cb),
  // The voice bus is a RENDERER singleton, so two windows have two of them.
  // These two members are the wire between them: relay out, listen in. Main
  // never echoes a relay back to its sender, which is the loop guard.
  voiceRelay: (e: VoiceEventWire) => ipcRenderer.invoke(IPC.voiceRelay, e),
  onVoiceEvent: (cb) => on<VoiceEventWire>(IPC.voiceEvent, cb),
  confirm: (id: string, hash: string, approve: boolean) =>
    ipcRenderer.invoke(IPC.confirm, { id, hash, approve }),
  attention: (id: string, action: AttentionAction) => ipcRenderer.invoke(IPC.attention, { id, action }),
  vitals: (days?: number) => ipcRenderer.invoke(IPC.vitals, days),
  checkin: (patch) => ipcRenderer.invoke(IPC.checkin, patch),
  routineTick: (id: string, onDate?: string) => ipcRenderer.invoke(IPC.routineTick, { id, onDate }),
  routineUntick: (id: string, onDate?: string) => ipcRenderer.invoke(IPC.routineUntick, { id, onDate }),
  routineCreate: (name: string, cadence?: string, slot?: "habit" | "checkin") =>
    ipcRenderer.invoke(IPC.routineCreate, { name, cadence, slot }),
  routineArchive: (id: string) => ipcRenderer.invoke(IPC.routineArchive, id),
  jobRun: (job: BrainJob, force?: boolean) => ipcRenderer.invoke(IPC.jobRun, { job, force }),
  dispatch: (task: string, agent?: string, client?: string) =>
    ipcRenderer.invoke(IPC.dispatch, { task, agent, client }),
  capture: (text: string, sourceLink?: string) => ipcRenderer.invoke(IPC.capture, { text, sourceLink }),
  wardrobe: {
    get: () => ipcRenderer.invoke(IPC.wardrobeGet),
    wear: (file: string) => ipcRenderer.invoke(IPC.wardrobeWear, file),
  },
  voice: {
    // The ArrayBuffer is structured-cloned across the bridge — no base64, no
    // string copy of the audio.
    transcribe: (buf: ArrayBuffer, mime?: string) => ipcRenderer.invoke(IPC.voiceTranscribe, { buf, mime }),
    // `voiceId` is optional and per-utterance; omitted means "her configured
    // voice", which is exactly what every pre-picker caller already sends.
    speak: (text: string, voiceId?: string) => ipcRenderer.invoke(IPC.voiceSpeak, { text, voiceId }),
  },
  voices: () => ipcRenderer.invoke(IPC.voices),
  win: {
    minimize: () => void ipcRenderer.invoke(IPC.winMinimize),
    maximize: () => void ipcRenderer.invoke(IPC.winMaximize),
    close: () => void ipcRenderer.invoke(IPC.winClose),
  },
  summon: {
    hide: () => void ipcRenderer.invoke(IPC.summonHide),
  },
  deckFocus: () => ipcRenderer.invoke(IPC.deckFocus),
  openExternal: (target: "os" | "gmail") => ipcRenderer.invoke(IPC.openExternal, target),
  flyoutHide: () => ipcRenderer.invoke(IPC.flyoutHide),
  ping: () => ipcRenderer.invoke(IPC.ping),
  // FILING HANDS — added LAST, per the documented order.
  //
  // Look at what is not here. There is no `move`, no `rename`, no `delete`, no
  // `emptyTrash`, and `enroll()` takes NO argument — main opens the folder
  // dialog itself and the renderer never types a path. `undo` and `undoSince`
  // take a batch id and a timestamp, never a path: the `openExternal`
  // allowlist precedent verbatim, where the renderer sends a key and never a
  // URL. `cancel` is a stop, not a request to act.
  // DESK/S3 added `arm` and `kill` and nothing else. `arm` takes a boolean,
  // `kill` takes nothing — still no path, still no way to express a file
  // operation from this side of the bridge.
  desk: {
    arm: (on: boolean) => ipcRenderer.invoke(IPC.deskArm, on === true),
    kill: () => ipcRenderer.invoke(IPC.deskKill),
    roots: () => ipcRenderer.invoke(IPC.deskRoots),
    enroll: () => ipcRenderer.invoke(IPC.deskEnroll),
    setRoot: (label: string, patch: { dryRun?: boolean; remove?: true }) =>
      ipcRenderer.invoke(IPC.deskSetRoot, { label, patch }),
    preflight: (payload) => ipcRenderer.invoke(IPC.deskPreflight, payload),
    cancel: (jobId: string) => ipcRenderer.invoke(IPC.deskCancel, jobId),
    undo: (batchId: string) => ipcRenderer.invoke(IPC.deskUndo, batchId),
    previewUndo: (batchId: string) => ipcRenderer.invoke(IPC.deskUndoPreview, batchId),
    undoSince: (iso: string, preview?: boolean) => ipcRenderer.invoke(IPC.deskUndoSince, { iso, preview }),
    log: (limit?: number) => ipcRenderer.invoke(IPC.deskLog, limit),
    status: () => ipcRenderer.invoke(IPC.deskStatus),
    outcome: (jobId: string) => ipcRenderer.invoke(IPC.deskOutcome, jobId),
    onProgress: (cb) => on<DeskProgress>(IPC.deskProgress, cb),
  },
};

contextBridge.exposeInMainWorld("eve", eve);
