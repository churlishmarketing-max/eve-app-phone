// THE ONE SECRET — the brain bearer token.
//
// Law (02 §7, and the desktop's own hard rule): the token lives in the MAIN
// process only, encrypted at rest via Electron safeStorage (DPAPI on Windows),
// is never logged, never crosses to the renderer, and never appears in an
// error string. The only thing that goes outward is the boolean `tokenSet`.
//
// If safeStorage says encryption is unavailable, we REFUSE to store. There is
// no plaintext fallback: a token sitting in a readable JSON file next to the
// app is exactly the failure this module exists to prevent.
//
// Owning stream: S1.

import { safeStorage } from "electron";
import { readConfig, writeConfig } from "./config.js";

/** Runtime override for smoke tests / CI. Takes precedence, never persisted. */
function envToken(): string | null {
  const t = process.env.EVE_BRAIN_TOKEN;
  return t && t.trim() ? t.trim() : null;
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** True when a token can be produced — env override OR a decryptable blob. */
export function tokenSet(): boolean {
  if (envToken()) return true;
  return !!readConfig().tokenEnc && encryptionAvailable();
}

/**
 * MAIN-PROCESS ONLY. Never return this over IPC, never interpolate it into a
 * log line, never put it in an Error message.
 */
export function getToken(): string | null {
  const env = envToken();
  if (env) return env;
  const enc = readConfig().tokenEnc;
  if (!enc) return null;
  if (!encryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, "base64"));
  } catch {
    // Wrong machine / wrong user / rotated DPAPI key. Say nothing about the
    // ciphertext; the caller degrades to "not set".
    return null;
  }
}

export interface SecretWrite {
  ok: boolean;
  error?: string;
}

/** Store (or, with an empty string, clear) the token. */
export function setToken(token: string): SecretWrite {
  if (!token) {
    try {
      writeConfig({ tokenEnc: undefined });
      return { ok: true };
    } catch {
      return { ok: false, error: "could not write config" };
    }
  }
  if (!encryptionAvailable()) {
    return {
      ok: false,
      error:
        "OS encryption is unavailable, so the token was NOT saved. EVE will not " +
        "keep a bearer token in plaintext. Sign in to the desktop session (or " +
        "unlock the keyring) and try again.",
    };
  }
  try {
    const enc = safeStorage.encryptString(token).toString("base64");
    writeConfig({ tokenEnc: enc });
    return { ok: true };
  } catch {
    // Deliberately generic: an exception message here could carry the input.
    return { ok: false, error: "could not encrypt the token" };
  }
}

/** The Authorization header value, or null. Main-process only. */
export function authHeader(): string | null {
  const t = getToken();
  return t ? `Bearer ${t}` : null;
}
