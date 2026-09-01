// node scripts/shot.mjs <url> <outPath> [WxH]
//
// Generic single-page screenshot. Sets EVE_SHOT_URL / EVE_SHOT_OUT /
// EVE_SHOT_SIZE (+ EVE_MOCK=1, matching shots.mjs) and boots the built app
// hidden; electron/main.ts's EVE_SHOT_URL block does the capture and prints
// the SHOT: line. This is the companion to shots.mjs (which only knows
// deck.png/summon.png) — this one takes ANY renderer-relative URL, including
// the "?shot=<key>" scenarios S2/S3/S4 register in src/renderer/shots/*.
//
// Boots against a throwaway --user-data-dir by default so it never collides
// with a running EVE's single-instance lock (see user-data-dir.mjs);
// --real-profile opts out.
//
// Owning stream: S1b.

import { spawn } from "node:child_process";
import { existsSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pickProfile } from "./user-data-dir.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const profile = pickProfile(process.argv.slice(2), "shot");
process.on("exit", () => profile.cleanup());
const [url, outArg, size] = profile.argv;
if (!url || !outArg) {
  console.error("usage: node scripts/shot.mjs <url> <outPath> [WxH] [--real-profile]");
  process.exit(1);
}

const mainBundle = path.join(root, "out", "main", "index.js");
if (!existsSync(mainBundle)) {
  console.error(`shot: ${path.relative(root, mainBundle)} is missing — run \`npm run build\` first.`);
  process.exit(1);
}

const electronBin = require("electron");
const outPath = path.resolve(root, outArg);
mkdirSync(path.dirname(outPath), { recursive: true });

const child = spawn(electronBin, [root, ...profile.electronArgs], {
  cwd: root,
  env: {
    ...process.env,
    EVE_SHOT_URL: url,
    EVE_SHOT_OUT: outPath,
    ...(size ? { EVE_SHOT_SIZE: size } : {}),
    EVE_MOCK: process.env.EVE_MOCK ?? "1",
    EVE_TZ: process.env.EVE_TZ || "America/Chicago",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const relay = (buf) => process.stdout.write(buf.toString());
child.stdout.on("data", relay);
child.stderr.on("data", relay);

const timeout = setTimeout(() => {
  console.error("shot: TIMEOUT after 45s — killing electron");
  child.kill();
  process.exit(1);
}, 45_000);

child.on("exit", (code) => {
  clearTimeout(timeout);
  if (!existsSync(outPath)) {
    console.error(`shot: MISSING ${path.relative(root, outPath)}`);
    process.exit(1);
    return;
  }
  const bytes = statSync(outPath).size;
  // A zero-byte or near-empty PNG is a failed capture wearing a filename.
  if (bytes < 1024) {
    console.error(`shot: SUSPECT ${path.relative(root, outPath)} — only ${bytes} bytes`);
    process.exit(1);
    return;
  }
  console.log(`shot: OK ${path.relative(root, outPath)} — ${bytes} bytes`);
  process.exit(code === 0 ? 0 : 1);
});

child.on("error", (err) => {
  clearTimeout(timeout);
  console.error("shot: could not launch electron —", err.message);
  process.exit(1);
});
