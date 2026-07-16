#!/usr/bin/env node
// Build the exact env text to paste into Railway's Variables → Raw Editor.
//
//   cd C:\dev\eve\brain
//   node ../scripts/make-railway-env.mjs
//
// Writes RAILWAY-ENV-PASTE-THIS.txt to the Desktop. It reads brain/.env and:
//   - drops PORT (Railway injects its own)
//   - drops FIREBASE_SERVICE_ACCOUNT_PATH (no such file on a host)
//   - adds FIREBASE_SERVICE_ACCOUNT_JSON (the key inlined, single line)
// The output file holds real secrets — delete it once pasted.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const envPath = path.join(process.cwd(), ".env");
if (!existsSync(envPath)) {
  console.error(`No .env at ${envPath} — run this from C:\\dev\\eve\\brain`);
  process.exit(1);
}

const DROP = new Set(["PORT", "FIREBASE_SERVICE_ACCOUNT_PATH"]);
const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
const seen = new Set();
const out = [];

for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const key = t.slice(0, eq).trim();
  if (DROP.has(key)) continue;
  if (seen.has(key)) continue; // .env has a dup FIREBASE path line; keep first
  seen.add(key);
  out.push(`${key}=${t.slice(eq + 1)}`);
}

// Inline the Firebase service account so push works with no key file.
const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "C:/dev/eve-secrets/eve-service-account.json";
if (existsSync(saPath)) {
  const sa = JSON.stringify(JSON.parse(readFileSync(saPath, "utf8")));
  out.push(`FIREBASE_SERVICE_ACCOUNT_JSON=${sa}`);
  console.log("[railway-env] inlined the Firebase service account ✓");
} else {
  console.warn(`[railway-env] ⚠ service account not found at ${saPath} — push will be DISABLED on Railway.`);
}

const dest = path.join(os.homedir(), "OneDrive", "Desktop", "RAILWAY-ENV-PASTE-THIS.txt");
const fallback = path.join(os.homedir(), "Desktop", "RAILWAY-ENV-PASTE-THIS.txt");
const target = existsSync(path.dirname(dest)) ? dest : fallback;
writeFileSync(target, out.join("\n") + "\n", "utf8");

console.log(`[railway-env] ${out.length} variables written to:\n  ${target}`);
console.log("[railway-env] Open it, select all, copy → Railway → Variables → Raw Editor → paste.");
console.log("[railway-env] DELETE that file when you're done — it holds every key EVE has.");
