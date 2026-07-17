// Build the Railway "Raw Editor" paste from brain/.env.
//
//   cd C:\dev\eve\brain && node scripts/make-railway-env.mjs
//
// Writes RAILWAY-ENV-PASTE-THIS.txt to the Desktop. Two deltas vs .env, both
// because the cloud has no local disk:
//   - PORT is dropped (Railway injects its own)
//   - FIREBASE_SERVICE_ACCOUNT_PATH → FIREBASE_SERVICE_ACCOUNT_JSON, the key
//     file inlined as one line (firebase.ts checks the JSON var first)
// Prints variable NAMES and lengths only — never values. DELETE the txt file
// once it's pasted; it holds every key EVE has.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const raw = readFileSync(".env", "utf8").replace(/^﻿/, "");
const vars = new Map();
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  vars.set(t.slice(0, i), t.slice(i + 1));
}

vars.delete("PORT"); // Railway sets this itself

// Inline the Firebase key file — the hosted filesystem has no C:\dev\eve-secrets.
const keyPath = vars.get("FIREBASE_SERVICE_ACCOUNT_PATH");
vars.delete("FIREBASE_SERVICE_ACCOUNT_PATH");
if (keyPath && existsSync(keyPath)) {
  const json = JSON.parse(readFileSync(keyPath, "utf8"));
  vars.set("FIREBASE_SERVICE_ACCOUNT_JSON", JSON.stringify(json));
} else if (!vars.has("FIREBASE_SERVICE_ACCOUNT_JSON")) {
  console.warn(`! service-account key not found at ${keyPath} — push will be dead in the cloud`);
}

const out = [...vars].map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
const dest = path.join(homedir(), "OneDrive", "Desktop", "RAILWAY-ENV-PASTE-THIS.txt");
writeFileSync(dest, out, "utf8");

console.log("wrote " + dest + "\n");
for (const [k, v] of vars) console.log(`  ${k}  (${v.length} chars)`);
console.log(`\n${vars.size} variables. Paste into Railway → Variables → Raw Editor, then DELETE the file.`);
