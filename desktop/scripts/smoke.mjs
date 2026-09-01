// npm run smoke — boot the real app, hidden, against mock data, and prove the
// wiring. No network, no token, no window on King's screen.
//
// This script is a LAUNCHER: the assertions themselves live in the main process
// (electron/main.ts, the `if (isSmoke())` block) because that is the only place
// that can reach both the quiet-hours module and a real webContents. Here we
// spawn electron, relay its output, and turn SMOKE: lines into an exit code.
//
// Boots against a throwaway --user-data-dir by default so it never collides
// with a running EVE's single-instance lock (see user-data-dir.mjs);
// `npm run smoke -- --real-profile` opts out.
//
// Owning stream: S1.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pickProfile } from "./user-data-dir.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const mainBundle = path.join(root, "out", "main", "index.js");
if (!existsSync(mainBundle)) {
  console.error(`smoke: ${path.relative(root, mainBundle)} is missing — run \`npm run build\` first.`);
  process.exit(1);
}

// The `electron` package exports the absolute path to its binary.
const electronBin = require("electron");
const profile = pickProfile(process.argv.slice(2), "smoke");
process.on("exit", () => profile.cleanup());

const child = spawn(electronBin, [root, ...profile.electronArgs], {
  cwd: root,
  env: {
    ...process.env,
    EVE_SMOKE: "1",
    EVE_MOCK: "1",
    // A deterministic zone so the boundary assertions mean the same thing on
    // any machine. This is the brain's own default.
    EVE_TZ: process.env.EVE_TZ || "America/Chicago",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let out = "";
const relay = (buf) => {
  const s = buf.toString();
  out += s;
  process.stdout.write(s);
};
child.stdout.on("data", relay);
child.stderr.on("data", relay);

const timeout = setTimeout(() => {
  console.error("smoke: TIMEOUT after 60s — killing electron");
  child.kill();
  process.exit(1);
}, 60_000);

child.on("exit", (code) => {
  clearTimeout(timeout);
  const lines = out.split(/\r?\n/).filter((l) => l.startsWith("SMOKE:"));
  const passes = lines.filter((l) => l.startsWith("SMOKE: PASS")).length;
  const fails = lines.filter((l) => l.startsWith("SMOKE: FAIL")).length;
  if (lines.length === 0) {
    console.error("smoke: electron produced no SMOKE: lines — the harness never ran.");
    process.exit(1);
  }
  console.log(`smoke: ${passes} passed, ${fails} failed, electron exit ${code}`);
  process.exit(fails === 0 && code === 0 ? 0 : 1);
});

child.on("error", (err) => {
  clearTimeout(timeout);
  console.error("smoke: could not launch electron —", err.message);
  process.exit(1);
});
