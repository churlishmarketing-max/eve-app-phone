import { BRAIN_URL, BRAIN_TOKEN } from "./config";

// ---- live state for Today/Ops (Phase 2–3; 05 §4) ----

export interface PendingConfirm {
  id: string;
  kind: string;
  summary: string;
  payload: Record<string, unknown>;
  hash: string;
  createdAt: string;
  expiresAt: string;
}

export interface ConnectorStatus {
  key: string;
  name: string;
  connected: boolean;
  detail: string;
}

export interface EveState {
  online: boolean;
  latestBrief?: { text: string; at: string } | null;
  todaysThree?: { id: string; title: string; detail?: string; priority: number; due_at?: string }[];
  floor?: { count: number; goal: number };
  attentionItems?: { id: string; kind: string; message: string; nudge_level: number; ref?: any; created_at: string }[];
  clients?: { id: string; name: string; cadence_days: number; days_quiet: number | null }[];
  jobs?: { id: string; agent?: string; title: string; status: string }[];
  routines?: { id: string; name: string; streak: number; last_done_on?: string }[];
  pendingConfirms?: PendingConfirm[];
  connectors?: ConnectorStatus[];
}

export async function fetchState(): Promise<EveState> {
  try {
    const res = await fetch(`${BRAIN_URL}/state`, {
      headers: { Authorization: `Bearer ${BRAIN_TOKEN}` },
    });
    if (!res.ok) return { online: false };
    return (await res.json()) as EveState;
  } catch {
    return { online: false };
  }
}

// Streaming client for POST /chat. Reads the brain's SSE frames
// (event: <name>\ndata: <json>\n\n) and dispatches typed callbacks.
// Uses fetch + ReadableStream (works in modern browsers and Android WebView).

export interface StreamHandlers {
  onState?: (state: "thinking" | "speaking" | "idle") => void;
  onToken?: (text: string) => void;
  onTool?: (name: string) => void;
  onConfirm?: (confirm: PendingConfirm) => void; // RED-tier confirm cards (02 §6)
  onDone?: (info: { conversationId: string; fullText: string }) => void;
  onError?: (message: string) => void;
}

// ---- RED-tier confirm resolution (02 §6): echo id + payload hash ----

// Approve on a client-executed confirm (send_sms) hands back a clientAction —
// the PHONE fires it, never the brain (05 §7).
export interface ConfirmResolution {
  ok: boolean;
  executed?: boolean;
  detail?: string;
  error?: string;
  clientAction?: { type: string; payload: Record<string, unknown> };
}

export async function resolveConfirm(
  id: string,
  hash: string,
  approve: boolean,
): Promise<ConfirmResolution> {
  try {
    const res = await fetch(`${BRAIN_URL}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRAIN_TOKEN}` },
      body: JSON.stringify({ id, hash, approve }),
    });
    return (await res.json()) as ConfirmResolution;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

// ---- her senses (Phase 4, 05 §7): forward while the app is open ----
// Fire-and-forget: a missed forward is a transient loss by design (02 §7).

export async function forwardSms(msg: { address: string; body: string; dateMs: number }): Promise<void> {
  try {
    await fetch(`${BRAIN_URL}/senses/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRAIN_TOKEN}` },
      body: JSON.stringify(msg),
    });
  } catch {
    /* offline — the buffer is transient anyway */
  }
}

export async function forwardNotification(n: {
  package: string;
  title: string | null;
  text: string | null;
  postTimeMs: number;
}): Promise<void> {
  try {
    await fetch(`${BRAIN_URL}/senses/notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRAIN_TOKEN}` },
      body: JSON.stringify(n),
    });
  } catch {
    /* offline — the buffer is transient anyway */
  }
}

// The phone reports a confirmed SMS actually left the SIM.
export async function reportSmsSent(to: string, body: string): Promise<void> {
  try {
    await fetch(`${BRAIN_URL}/senses/sms-sent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRAIN_TOKEN}` },
      body: JSON.stringify({ to, body }),
    });
  } catch {
    /* log-only endpoint — nothing depends on it */
  }
}

// ---- Ops actions route through the brain so tier rules apply (05 §4) ----

export async function actOnAttention(
  id: string,
  action: "approve" | "hold" | "dismiss",
): Promise<{ ok: boolean; outcome?: string; error?: string }> {
  try {
    const res = await fetch(`${BRAIN_URL}/attention/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRAIN_TOKEN}` },
      body: JSON.stringify({ action }),
    });
    return (await res.json()) as { ok: boolean; outcome?: string; error?: string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

// ---- voice loop (05 §3): mic blob → transcript; text → spoken audio ----

export async function transcribeAudio(
  blob: Blob,
): Promise<{ ok: boolean; transcript?: string; error?: string }> {
  try {
    const res = await fetch(`${BRAIN_URL}/voice/transcribe`, {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm", Authorization: `Bearer ${BRAIN_TOKEN}` },
      body: blob,
    });
    return (await res.json()) as { ok: boolean; transcript?: string; error?: string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

// ---- wardrobe (05 §5): renders live on the brain, served over LAN ----

export interface WardrobeLook {
  file: string;
  name: string;
  url: string;
}

export async function fetchWardrobe(): Promise<{ wearing: string | null; looks: WardrobeLook[] }> {
  try {
    const res = await fetch(`${BRAIN_URL}/wardrobe`);
    if (!res.ok) return { wearing: null, looks: [] };
    const j = (await res.json()) as { wearing?: string | null; looks: WardrobeLook[] };
    return { wearing: j.wearing ?? null, looks: j.looks ?? [] };
  } catch {
    return { wearing: null, looks: [] };
  }
}

// King's manual pick — writes the same brain-side truth her wear_look uses.
export async function postWear(file: string): Promise<void> {
  try {
    await fetch(`${BRAIN_URL}/wardrobe/wear`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRAIN_TOKEN}` },
      body: JSON.stringify({ file }),
    });
  } catch {
    /* offline — localStorage still holds his pick */
  }
}

// Her looks come off the Supabase CDN as absolute URLs; older brains served
// them brain-relative. Handle both so a stale brain doesn't blank her closet.
export function wardrobeImgUrl(look: WardrobeLook): string {
  return /^https?:\/\//i.test(look.url) ? look.url : `${BRAIN_URL}${look.url}`;
}

// Returns an object URL for the spoken reply, or null when voice-out isn't
// wired (503) — callers degrade to text silently.
export async function speakText(text: string): Promise<string | null> {
  try {
    const res = await fetch(`${BRAIN_URL}/voice/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${BRAIN_TOKEN}` },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function streamChat(
  message: string,
  conversationId: string | null,
  surface: string,
  h: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BRAIN_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BRAIN_TOKEN}`,
      },
      body: JSON.stringify({ message, conversationId, surface }),
      signal,
    });
  } catch (err) {
    h.onError?.(err instanceof Error ? err.message : "network error");
    return;
  }

  if (!res.ok || !res.body) {
    h.onError?.(
      res.status === 401 ? "unauthorized — check the brain token" : `HTTP ${res.status}`,
    );
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (err) {
      h.onError?.(err instanceof Error ? err.message : "stream error");
      return;
    }
    if (chunk.done) break;
    buf += decoder.decode(chunk.value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) dispatchFrame(frame, h);
  }
}

function dispatchFrame(frame: string, h: StreamHandlers): void {
  let event = "";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) data = line.slice(6);
  }
  if (!event) return;
  let payload: any = {};
  if (data) {
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
  }
  switch (event) {
    case "state":
      h.onState?.(payload.state);
      break;
    case "token":
      h.onToken?.(payload.text ?? "");
      break;
    case "tool":
      h.onTool?.(payload.name);
      break;
    case "confirm_request":
      h.onConfirm?.(payload);
      break;
    case "done":
      h.onDone?.(payload);
      break;
    case "error":
      h.onError?.(payload.message ?? "unknown error");
      break;
  }
}
