import { getMessaging, type Message } from "firebase-admin/messaging";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isPushReady } from "./firebase.js";
import { db } from "./db.js";

export { isPushReady };

// Tokens live in Supabase (sql/002_push_tokens.sql) because hosted filesystems
// are EPHEMERAL — a JSON file is wiped on every redeploy, silently killing the
// 7:00 brief until the app next launched. The file is kept as a fallback for
// running with the memory spine offline.
const TOKEN_STORE = path.join(process.cwd(), "data", "push-tokens.json");

type TokenMap = Record<string, { platform: string; updated: string }>;

export async function saveToken(token: string, platform: string): Promise<void> {
  const c = db();
  if (c) {
    const { error } = await c
      .from("push_tokens")
      .upsert({ token, platform, updated_at: new Date().toISOString() }, { onConflict: "token" });
    if (!error) return;
    console.warn("[push] token upsert failed, falling back to file:", error.message);
  }
  let tokens: TokenMap = {};
  try {
    tokens = JSON.parse(await fs.readFile(TOKEN_STORE, "utf8"));
  } catch {
    /* first write */
  }
  tokens[token] = { platform, updated: new Date().toISOString() };
  await fs.mkdir(path.dirname(TOKEN_STORE), { recursive: true });
  await fs.writeFile(TOKEN_STORE, JSON.stringify(tokens, null, 2));
}

export async function getLatestToken(): Promise<string | null> {
  const c = db();
  if (c) {
    const { data, error } = await c
      .from("push_tokens")
      .select("token")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data?.token) return data.token;
  }
  try {
    const tokens: TokenMap = JSON.parse(await fs.readFile(TOKEN_STORE, "utf8"));
    const entries = Object.entries(tokens);
    entries.sort((a, b) => b[1].updated.localeCompare(a[1].updated));
    return entries[0]?.[0] ?? null;
  } catch {
    return null;
  }
}

export type PushChannel = "brief" | "nudge" | "tripwire";
export interface PushData {
  kind: string;
  attention_id: string;
  deeplink: string;
}
export interface SendPushArgs {
  title: string;
  body: string;
  channelId: PushChannel;
  data: PushData;
}

async function evictToken(token: string): Promise<void> {
  try {
    const tokens: TokenMap = JSON.parse(await fs.readFile(TOKEN_STORE, "utf8"));
    delete tokens[token];
    await fs.writeFile(TOKEN_STORE, JSON.stringify(tokens, null, 2));
  } catch {
    /* store missing — nothing to evict */
  }
}

// Current API is FCM HTTP v1 via the Admin SDK (legacy HTTP API shut down 2024).
export async function sendPush(token: string, opts: SendPushArgs): Promise<string> {
  const { title, body, channelId, data } = opts;
  const message: Message = {
    token,
    notification: { title, body },
    android: {
      priority: channelId === "tripwire" ? "high" : "normal",
      notification: { channelId },
    },
    // FCM data values must be strings.
    data: {
      kind: data.kind,
      attention_id: data.attention_id,
      deeplink: data.deeplink,
    },
  };
  try {
    return await getMessaging().send(message);
  } catch (err) {
    // A dead registration must not stay "latest" forever, silently eating
    // every future push until the app happens to re-register (review C28).
    const code = (err as { code?: string })?.code ?? "";
    if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
      await evictToken(token);
      console.warn(`[push] evicted dead FCM token (${code})`);
    }
    throw err;
  }
}
