// DESK — the Win32 file-attribute mechanism. (G-A1, PATH-6)
//
// `fs.Stats` on Windows exposes no FILE_ATTRIBUTE_* bits. There is no
// `stat.attrs`. Every attribute-based rule in the guardrail table — hidden,
// system, reparse point, OneDrive placeholder — is vacuous unless something
// actually reads those bits, and the failure mode of "silently defaults to 0"
// is a rule that passes everything.
//
// So: one PowerShell sweep per root walk, cached, and a HARD failure signal.
// If the sweep does not work, `attrSweepOk` is false, the pack is withheld and
// the feature pauses. A rule that cannot fail is not a rule.
//
// This module reads. It never writes and never resolves a path for anyone.
//
// Owning stream: DESK/S1.

import { execFileSync } from "node:child_process";
import { lstatSync, statSync } from "node:fs";

/* eslint-disable no-bitwise */
export const FILE_ATTRIBUTE_READONLY = 0x1;
export const FILE_ATTRIBUTE_HIDDEN = 0x2;
export const FILE_ATTRIBUTE_SYSTEM = 0x4;
export const FILE_ATTRIBUTE_DIRECTORY = 0x10;
export const FILE_ATTRIBUTE_REPARSE_POINT = 0x400;
export const FILE_ATTRIBUTE_OFFLINE = 0x1000;
export const FILE_ATTRIBUTE_RECALL_ON_OPEN = 0x40000;
export const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x400000;

/** The bit set that means "this is not really a file sitting on this disk". */
export const PLACEHOLDER_BITS =
  FILE_ATTRIBUTE_OFFLINE | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS;

/** Signature the guard is handed. Returns null when the bits are UNKNOWN. */
export type AttrFn = (absPath: string) => number | null;

export interface SweepResult {
  ok: boolean;
  /** Keyed by lowercased absolute path. */
  map: Map<string, number>;
  error?: string;
  ms: number;
  count: number;
}

/**
 * PowerShell writes stdout in the console code page, not UTF-8. Without this
 * line every filename containing a character outside the active ANSI page —
 * an accent, a zero-width joiner, a dash that is not a hyphen — comes back
 * mangled, its key never matches the path we looked up, and the attribute read
 * returns UNKNOWN.
 *
 * UNKNOWN is refused rather than zeroed, so the failure is safe. It is not
 * harmless: it silently erases those files from his census and from her index,
 * and he would only find out by noticing that she never mentions the one file
 * he actually wanted moved. Found by the eye harness, on a fixture whose name
 * carried a U+200B. (G-A1)
 */
const UTF8_PREAMBLE = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ";

interface CacheEntry {
  at: number;
  result: SweepResult;
}

const CACHE_MS = 30_000;
const cache = new Map<string, CacheEntry>();

/** Test seam: point the sweep at a stub without touching PowerShell. */
let sweepImpl: ((root: string, depth: number) => SweepResult) | null = null;
export function __setSweepImpl(fn: ((root: string, depth: number) => SweepResult) | null): void {
  sweepImpl = fn;
  cache.clear();
}

function runPowerShell(root: string, depth: number): SweepResult {
  const t0 = Date.now();
  // -LiteralPath so a root containing [ ] or ` is not treated as a wildcard.
  // Single quotes are the PowerShell literal-string quote; ' is escaped as ''.
  const lit = root.replace(/'/g, "''");
  const script =
    UTF8_PREAMBLE +
    `Get-ChildItem -LiteralPath '${lit}' -Force -Recurse -Depth ${depth} -ErrorAction SilentlyContinue | ` +
    `Select-Object FullName,@{n='A';e={$_.Attributes.value__}} | ConvertTo-Json -Compress`;
  try {
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: 60_000, windowsHide: true },
    );
    const map = new Map<string, number>();
    const trimmed = out.trim();
    if (trimmed) {
      const parsed: unknown = JSON.parse(trimmed);
      // ConvertTo-Json emits a bare object for a single row and an array otherwise.
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      for (const r of rows) {
        const row = r as { FullName?: unknown; A?: unknown };
        if (typeof row.FullName === "string" && typeof row.A === "number") {
          map.set(row.FullName.toLowerCase(), row.A);
        }
      }
    }
    // An empty directory legitimately sweeps to zero rows; that is still OK.
    return { ok: true, map, ms: Date.now() - t0, count: map.size };
  } catch (err) {
    return {
      ok: false,
      map: new Map(),
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      ms: Date.now() - t0,
      count: 0,
    };
  }
}

/** One sweep per root walk. Cached for 30 s; `force` bypasses the cache. */
export function sweep(root: string, depth = 3, force = false): SweepResult {
  const key = `${root.toLowerCase()}::${depth}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  const result = sweepImpl ? sweepImpl(root, depth) : runPowerShell(root, depth);
  cache.set(key, { at: Date.now(), result });
  return result;
}

/**
 * Attributes for a SPECIFIC list of paths — the destination ancestor chain at
 * execute time, where a full sweep is far too slow and far too stale. One
 * PowerShell call for the whole list.
 *
 * Returns null for any path the mechanism could not read. The caller must
 * treat null as UNKNOWN and refuse, never as zero.
 */
export function attrsFor(paths: string[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const p of paths) out.set(p.toLowerCase(), null);
  if (paths.length === 0) return out;
  if (sweepImpl) {
    // Under a stub, answer from the stubbed sweep of each path's parent.
    for (const p of paths) {
      const r = sweepImpl(p, 0);
      const v = r.ok ? (r.map.get(p.toLowerCase()) ?? null) : null;
      out.set(p.toLowerCase(), v);
    }
    return out;
  }
  const list = paths.map((p) => `'${p.replace(/'/g, "''")}'`).join(",");
  const script =
    UTF8_PREAMBLE +
    `@(${list}) | ForEach-Object { $i = Get-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue; ` +
    `if ($i) { [pscustomobject]@{ FullName = $i.FullName; A = $i.Attributes.value__ } } } | ConvertTo-Json -Compress`;
  try {
    const raw = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000, windowsHide: true },
    ).trim();
    if (!raw) return out;
    const parsed: unknown = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    for (const r of rows) {
      const row = r as { FullName?: unknown; A?: unknown };
      if (typeof row.FullName === "string" && typeof row.A === "number") {
        out.set(row.FullName.toLowerCase(), row.A);
      }
    }
  } catch {
    /* every entry stays null — UNKNOWN, and the guard refuses on unknown */
  }
  return out;
}

/**
 * The belt-and-braces reparse test. `lstat().isSymbolicLink()` catches NTFS
 * junctions through libuv's IO_REPARSE_TAG_MOUNT_POINT mapping, and that
 * mapping is verified on this machine (see the harness, T09). The attribute
 * bit is the second, independent signal.
 *
 * Returns true when EITHER signal fires. Returns true when BOTH are unknown
 * and `strict` is set, because an unreadable path on the destination chain is
 * not a path we are willing to write through.
 */
export function isReparse(absPath: string, attr: number | null, strict: boolean): boolean {
  if (attr !== null && (attr & FILE_ATTRIBUTE_REPARSE_POINT) !== 0) return true;
  try {
    return lstatSync(absPath).isSymbolicLink();
  } catch {
    return strict && attr === null;
  }
}

/** Volume id for a path. Cross-volume refusal (G-D9) and same-volume trash lean on this. */
export function volumeOf(absPath: string): number | null {
  try {
    return statSync(absPath).dev;
  } catch {
    return null;
  }
}
