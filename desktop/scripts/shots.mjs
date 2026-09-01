// npm run shots — visual receipts.
//
// Boots the real app with EVE_MOCK=1 and EVE_SHOTS=1, windows HIDDEN, waits for
// each renderer to set window.__RENDER_DONE, captures webContents.capturePage()
// and writes desktop/verify/deck.png + summon.png.
//
// With S1's stub renderer these images are trivial. The point is the HARNESS:
// S2 (deck UI), S3 (screens) and S4 (summon/tray) prove their work by running
// this and looking at the PNGs. So it is built to be strict — a render that
// never finishes is a non-zero exit, not a blank image quietly written.
//
// The capture itself runs inside the main process (electron/main.ts, the
// EVE_SHOTS block) because capturePage() needs a live webContents. This file is
// the launcher and the verifier.
//
// Boots against a throwaway --user-data-dir by default so it never collides
// with a running EVE's single-instance lock (see user-data-dir.mjs);
// `npm run shots -- --real-profile` opts out.
//
// Owning stream: S1.

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pickProfile } from "./user-data-dir.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const mainBundle = path.join(root, "out", "main", "index.js");
if (!existsSync(mainBundle)) {
  console.error(`shots: ${path.relative(root, mainBundle)} is missing — run \`npm run build\` first.`);
  process.exit(1);
}

const electronBin = require("electron");
const profile = pickProfile(process.argv.slice(2), "shots");
process.on("exit", () => profile.cleanup());
const outDir = path.join(root, "verify");
const expected = ["deck.png", "summon.png"];

const child = spawn(electronBin, [root, ...profile.electronArgs], {
  cwd: root,
  env: {
    ...process.env,
    EVE_SHOTS: "1",
    EVE_MOCK: "1",
    EVE_TZ: process.env.EVE_TZ || "America/Chicago",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const relay = (buf) => process.stdout.write(buf.toString());
child.stdout.on("data", relay);
child.stderr.on("data", relay);

const timeout = setTimeout(() => {
  console.error("shots: TIMEOUT after 90s — killing electron");
  child.kill();
  process.exit(1);
}, 90_000);

child.on("exit", (code) => {
  clearTimeout(timeout);
  let bad = 0;
  for (const f of expected) {
    const p = path.join(outDir, f);
    if (!existsSync(p)) {
      console.error(`shots: MISSING ${f}`);
      bad++;
      continue;
    }
    const bytes = statSync(p).size;
    // A zero-byte or near-empty PNG is a failed capture wearing a filename.
    if (bytes < 1024) {
      console.error(`shots: SUSPECT ${f} — only ${bytes} bytes`);
      bad++;
      continue;
    }
    console.log(`shots: OK verify/${f} — ${bytes} bytes`);
  }
  process.exit(bad === 0 && code === 0 ? 0 : 1);
});

child.on("error", (err) => {
  clearTimeout(timeout);
  console.error("shots: could not launch electron —", err.message);
  process.exit(1);
});
