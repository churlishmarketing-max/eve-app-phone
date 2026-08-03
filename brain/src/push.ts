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

// THE SEND WALL. 2026-08-02: a throwaway dev probe on the laptop put TWO real
// notifications on King's phone — the job was checked while its data source was
// offline, the source came online, and the job was re-run. A registered token
// (Supabase or data/push-tokens.json) plus working Firebase credentials means
// ANY process that boots this repo can reach his device, so transmission is
// gated HERE, at the one function that talks to FCM, and it FAILS CLOSED.
//
// The signal has to be free in production and unobtainable by accident on a
// laptop. Nothing in the environment itself distinguishes them: Railway's
// variables ARE brain/.env, pasted (RUNBOOK_railway.md §3 /
// scripts/make-railway-env.mjs), so every EVE_/FIREBASE_ name exists in both
// places. What only the cloud has is Railway's own injected RAILWAY_* block
// (RAILWAY_ENVIRONMENT, RAILWAY_SERVICE_ID, RAILWAY_PUBLIC_DOMAIN, …), which
// costs him nothing to keep — no new variable to set, so the 07:00 brief and
// the 20:00 nudge survive this change untouched. The whole prefix is scanned
// rather than one hardcoded name so a Railway rename can never mute her.
//
// EVE_PUSH_ALLOW=1 is the deliberate local override, for a worker who MEANS to
// exercise the send path. Anything else — ambiguous, missing, unknown host —
// does not send.
export function isPushAllowed(): { allowed: boolean; why: string } {
  if (process.env.EVE_PUSH_ALLOW === "1") return { allowed: true, why: "EVE_PUSH_ALLOW=1" };
  const marker = Object.keys(process.env).find((k) => k.startsWith("RAILWAY_") && process.env[k]);
  if (marker) return { allowed: true, why: `hosted (${marker} set)` };
  return { allowed: false, why: "no RAILWAY_* marker, no EVE_PUSH_ALLOW=1" };
}

// Current API is FCM HTTP v1 via the Admin SDK (legacy HTTP API shut down 2024).
export async function sendPush(token: string, opts: SendPushArgs): Promise<string> {
  const { title, body, channelId, data } = opts;
  const gate = isPushAllowed();
  if (!gate.allowed) {
    // Dev runs stay fully observable: the exact notification is printed instead
    // of delivered. The return is the same shape a real send gives (the message
    // id) but EMPTY, so `!!id` stays false and no caller can read a blocked
    // push as a sent one.
    console.log(`[push] BLOCKED (dev) would have sent: ${title} | ${body} | ${data.deeplink}`);
    return "";
  }
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
    const id = await getMessaging().send(message);
    // "Why did that reach his phone?" has to be answerable from the log alone,
    // so the rule that opened the gate is named at SEND time, not just at boot.
    // The rule name only — isPushAllowed never interpolates an env VALUE.
    console.log(`[push] sent (${gate.why}): ${channelId}/${data.kind}`);
    return id;
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
