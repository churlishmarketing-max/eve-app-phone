// The throwaway Electron profile every launcher in this folder boots against.
//
// electron/main.ts takes Electron's single-instance lock at boot (main.ts:131),
// and that lock is keyed on the userData directory. King's resident EVE holds
// it on the real profile — so a launcher that boots a second electron against
// the same profile does not fail loudly: the second instance sees the lock,
// app.quit()s with exit code 0 and prints nothing, and the launcher then
// reports MISSING / "no SMOKE: lines" as if the build were broken. That
// silent collision killed several verification runs before it was named.
//
// So every launcher now boots against an ISOLATED profile by default:
//
//   default              a fresh mkdtemp under os.tmpdir(), removed on exit
//   EVE_USER_DATA_DIR    boot against that directory instead (kept afterwards)
//   --real-profile       opt OUT — the real profile, exactly as the launchers
//                        behaved before this file (EVE_REAL_PROFILE=1 does the
//                        same). Collides with a running EVE; that is the point
//                        of having to ask for it.
//
// Electron honours `--user-data-dir=<dir>` as a launch argument (the e2e
// harness has relied on this since verify/desk-e2e-harness.mjs:160), and
// readConfig() reads config.json from app.getPath("userData") — so an isolated
// profile also means a harness run can never read or write the real
// config.json.
//
// Owning stream: S1b.

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const REAL_PROFILE_FLAG = "--real-profile";

/**
 * @param {string[]} argv   process.argv.slice(2) — the flag is removed from
 *                          the returned `argv` so positional parsing is unchanged.
 * @param {string}   prefix the launcher's log prefix ("shot" / "smoke" / "shots").
 */
export function pickProfile(argv, prefix) {
  const rest = argv.filter((a) => a !== REAL_PROFILE_FLAG);
  const real = rest.length !== argv.length || process.env.EVE_REAL_PROFILE === "1";
  if (real) return { argv: rest, electronArgs: [], cleanup() {} };

  const pinned = (process.env.EVE_USER_DATA_DIR || "").trim();
  if (pinned) {
    return { argv: rest, electronArgs: [`--user-data-dir=${path.resolve(pinned)}`], cleanup() {} };
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), `eve-${prefix}-`));
  let cleaned = false;
  return {
    argv: rest,
    electronArgs: [`--user-data-dir=${dir}`],
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      // `exit` can fire while electron is still releasing its lock file on
      // Windows; a handful of short retries covers that without a new line
      // of output on the happy path.
      for (let i = 0; i < 10; i++) {
        try {
          rmSync(dir, { recursive: true, force: true });
          return;
        } catch {
          const until = Date.now() + 200;
          while (Date.now() < until) {
            /* brief synchronous wait — we are inside process exit */
          }
        }
      }
      console.error(`${prefix}: could not remove throwaway profile ${dir}`);
    },
  };
}
