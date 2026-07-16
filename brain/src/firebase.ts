import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Push must degrade gracefully: if Firebase isn't configured yet, the brain
// still runs for chat, and push simply reports itself unavailable.
let ready = false;

// Detect gcloud Application Default Credentials — the keyless route that works
// when an org policy blocks downloadable service-account keys. Set up with
// `gcloud auth application-default login`.
function adcCredentialFile(): string | null {
  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicit && existsSync(explicit)) return explicit;
  const candidates = [
    process.env.CLOUDSDK_CONFIG && path.join(process.env.CLOUDSDK_CONFIG, "application_default_credentials.json"),
    process.env.APPDATA && path.join(process.env.APPDATA, "gcloud", "application_default_credentials.json"),
    (process.env.HOME || process.env.USERPROFILE) &&
      path.join(process.env.HOME || process.env.USERPROFILE || "", ".config", "gcloud", "application_default_credentials.json"),
  ].filter((p): p is string => Boolean(p));
  return candidates.find(existsSync) ?? null;
}

// Hosted (Railway/Fly) has no key FILE — the whole service-account JSON rides
// in an env var instead, raw or base64. Checked FIRST so the cloud path wins
// even if a stale local path is still set.
function inlineServiceAccount(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text) as Record<string, unknown>;
}

export function initFirebase(): void {
  if (getApps().length) {
    ready = true;
    return;
  }
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  // ADC user credentials don't carry a project — supply it explicitly.
  const projectId = process.env.FIREBASE_PROJECT_ID;
  try {
    const inline = inlineServiceAccount();
    if (inline) {
      initializeApp({ credential: cert(inline as never) });
      ready = true;
      console.log("[firebase] initialized from FIREBASE_SERVICE_ACCOUNT_JSON");
    } else if (keyPath && existsSync(keyPath)) {
      const sa = JSON.parse(readFileSync(keyPath, "utf8"));
      initializeApp({ credential: cert(sa) });
      ready = true;
      console.log("[firebase] initialized from service-account key file");
    } else if (adcCredentialFile()) {
      initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
      ready = true;
      console.log(
        `[firebase] initialized from Application Default Credentials` +
          (projectId ? ` (project ${projectId})` : " (set FIREBASE_PROJECT_ID if sends fail)"),
      );
    } else {
      console.warn("[firebase] no credentials — push disabled; chat still works.");
    }
  } catch (err) {
    console.warn("[firebase] init failed — push disabled:", err instanceof Error ? err.message : err);
  }
}

export function isPushReady(): boolean {
  return ready;
}
