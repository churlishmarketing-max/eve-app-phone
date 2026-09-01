// CONFIG — userData/config.json.
//
// Shape: { brainUrl, tokenEnc?, silentAtDesk, pttMode, hotkey, osUrl? }
// tokenEnc is base64 of safeStorage.encryptString output (see secrets.ts) and
// is the ONLY sensitive field on disk. It is never read by anything but
// secrets.ts and never leaves the main process.
//
// Writes are atomic: temp file in the same directory, then rename. A power cut
// mid-write must not leave King with a half-written config and no token.
//
// Owning stream: S1.

import { app } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DeskRootConfig, EveConfig } from "../src/shared/contract.js";

export interface StoredConfig extends EveConfig {
  tokenEnc?: string;
  // FILING HANDS (hop 0). All defaulted, so an existing config.json upgrades
  // silently — and `deskEnabled` defaults to FALSE, so the feature ships off.
  deskEnabled?: boolean;
  deskId?: string;
  deskRoots?: DeskRootConfig[];
  deskNeverList?: string[];
  deskMaxIndex?: number;
  deskTrashCeilingBytes?: number;
}

/** The never-list defaults NON-EMPTY. (G-V1) */
const DEFAULT_NEVER_LIST = [
  "**/.ssh/**",
  "**/.aws/**",
  "**/.gnupg/**",
  "id_rsa*",
  "*.pem",
  "*.p12",
  "*.pfx",
  "*.ovpn",
  "*.kdbx",
  ".env*",
  "credentials",
  "*.keystore",
  "**/.git/**",
  "**/node_modules/**",
  "**/venv/**",
  "**/AppData/**",
  "**/Personal Vault/**",
];

// The live brain (handoff §7). Not a secret — it ships in the design doc.
export const DEFAULT_BRAIN_URL = "https://eve-app-phone-production.up.railway.app";

const DEFAULTS: StoredConfig = {
  brainUrl: DEFAULT_BRAIN_URL,
  silentAtDesk: false,
  pttMode: "hold",
  hotkey: "CommandOrControl+Space",
};

let cache: StoredConfig | null = null;

function configPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

function coerce(raw: unknown): StoredConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    brainUrl: typeof o.brainUrl === "string" && o.brainUrl.trim() ? o.brainUrl.trim() : DEFAULTS.brainUrl,
    tokenEnc: typeof o.tokenEnc === "string" && o.tokenEnc ? o.tokenEnc : undefined,
    silentAtDesk: o.silentAtDesk === true,
    pttMode: o.pttMode === "toggle" ? "toggle" : "hold",
    hotkey: typeof o.hotkey === "string" && o.hotkey.trim() ? o.hotkey.trim() : DEFAULTS.hotkey,
    osUrl: typeof o.osUrl === "string" && o.osUrl.trim() ? o.osUrl.trim() : undefined,
    // FILING HANDS — off unless the stored value is literally `true`.
    deskEnabled: o.deskEnabled === true,
    deskId: typeof o.deskId === "string" && o.deskId ? o.deskId : randomUUID(),
    deskRoots: coerceRoots(o.deskRoots),
    deskNeverList: Array.isArray(o.deskNeverList)
      ? (o.deskNeverList.filter((x) => typeof x === "string") as string[])
      : [...DEFAULT_NEVER_LIST],
    deskMaxIndex: typeof o.deskMaxIndex === "number" && o.deskMaxIndex > 0 ? Math.min(o.deskMaxIndex, 5000) : 1200,
    deskTrashCeilingBytes:
      typeof o.deskTrashCeilingBytes === "number" && o.deskTrashCeilingBytes > 0
        ? o.deskTrashCeilingBytes
        : 20 * 1024 * 1024 * 1024,
  };
}

/** Anything malformed in `deskRoots` is DROPPED, never half-trusted. */
function coerceRoots(raw: unknown): DeskRootConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: DeskRootConfig[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.label !== "string" || typeof o.path !== "string") continue;
    if (!o.label.trim() || !o.path.trim()) continue;
    out.push({
      label: o.label.trim(),
      path: o.path,
      // Dry-run is ON unless the stored value is literally `false`. A missing
      // or corrupt flag must never read as "live".
      dryRun: o.dryRun !== false,
      synced: o.synced === true,
      trash: typeof o.trash === "string" ? o.trash : "",
    });
  }
  return out;
}

export function readConfig(): StoredConfig {
  if (cache) return cache;
  try {
    const p = configPath();
    cache = existsSync(p) ? coerce(JSON.parse(readFileSync(p, "utf8"))) : { ...DEFAULTS };
  } catch (err) {
    // A corrupt config must not brick the app — fall back to defaults and say
    // so once. The token is lost in that case, which is correct: we will not
    // guess at half-parsed ciphertext.
    console.error("[config] unreadable, using defaults:", err instanceof Error ? err.message : String(err));
    cache = { ...DEFAULTS };
  }
  return cache;
}

/** Merge a patch and persist atomically. Returns the merged config. */
export function writeConfig(patch: Partial<StoredConfig>): StoredConfig {
  const next = coerce({ ...readConfig(), ...patch });
  // `undefined` in the patch means "clear it" for the two optional fields.
  if ("tokenEnc" in patch && !patch.tokenEnc) delete next.tokenEnc;
  if ("osUrl" in patch && !patch.osUrl) delete next.osUrl;
  cache = next;

  const dir = app.getPath("userData");
  const target = configPath();
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    renameSync(tmp, target); // atomic on the same volume
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* the temp file is already gone or unremovable; nothing to salvage */
    }
    console.error("[config] write failed:", err instanceof Error ? err.message : String(err));
    throw err;
  }
  return next;
}

/**
 * The base URL every brain call uses. EVE_BRAIN_URL wins when set — that is
 * how the smoke test and CI point at a throwaway brain without touching the
 * user's saved config. Never persisted.
 */
export function brainUrl(): string {
  const env = process.env.EVE_BRAIN_URL;
  if (env && env.trim()) return env.trim().replace(/\/+$/, "");
  return readConfig().brainUrl.replace(/\/+$/, "");
}

export function isMock(): boolean {
  return process.env.EVE_MOCK === "1";
}

export function isSmoke(): boolean {
  return process.env.EVE_SMOKE === "1";
}

/** Windows stay hidden under smoke, shots and the generic shot-url harness —
 *  never steal the user's screen. */
export function windowsHidden(): boolean {
  return isSmoke() || process.env.EVE_SHOTS === "1" || !!process.env.EVE_SHOT_URL || isE2E();
}

/**
 * The end-to-end harness (verify/desk-e2e-harness.mjs). It is deliberately
 * counted as a harness: that makes the executor'''s G-A3 first line live, so the
 * ONLY reason a byte moves under it is that every enrolled root resolved inside
 * the temp-bounded EVE_DESK_SCRATCH tree.
 */
export function isE2E(): boolean {
  return process.env.EVE_E2E === "1";
}

/**
 * Is a HARNESS driving this launch — smoke, either screenshot harness, or the
 * tray-icon dump? The renderer asks so it can keep his numbers honest: sixty
 * robot boots must not read as sixty sessions in the title bar.
 */
export function isHarness(): boolean {
  return windowsHidden() || !!process.env.EVE_TRAY_DUMP;
}

/** Test seam only — drops the in-memory cache so a fresh read hits disk. */
export function resetConfigCache(): void {
  cache = null;
}
