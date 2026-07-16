import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db } from "./db.js";

// Her closet (05 §5 + King's 2026-07-16 grant: wearing is HER call).
//
// Renders live in the Supabase Storage bucket "wardrobe", NOT in git and NOT
// on the host's disk: the repo stays small, deploys stay fast, and adding a
// look never needs a redeploy (drop a PNG in data/wardrobe → run
// scripts/sync-wardrobe.mjs → she sees it within a minute). The local folder
// remains the authoring source and the offline fallback.
//
// "Wearing" lives in app_state (sql/002) because a hosted filesystem forgets.

const here = path.dirname(fileURLToPath(import.meta.url));
const localDir = path.join(here, "..", "data", "wardrobe");
const BUCKET = "wardrobe";
const WEARING_KEY = "wardrobe.wearing";

let cache: { files: string[]; at: number } = { files: [], at: 0 };
const CACHE_MS = 60_000;

function localLooks(): string[] {
  try {
    return readdirSync(localDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  } catch {
    return [];
  }
}

// Storage listing is cached — /wardrobe is polled every 60s by the app.
export async function listLooksAsync(): Promise<string[]> {
  if (Date.now() - cache.at < CACHE_MS && cache.files.length) return cache.files;
  const c = db();
  if (c) {
    const { data, error } = await c.storage.from(BUCKET).list("", { limit: 500, sortBy: { column: "name", order: "asc" } });
    if (!error && data?.length) {
      const files = data.map((o) => o.name).filter((n) => /\.(png|jpe?g|webp)$/i.test(n));
      cache = { files, at: Date.now() };
      return files;
    }
  }
  const local = localLooks();
  if (local.length) cache = { files: local, at: Date.now() };
  return local;
}

// Sync view for the tools — served from cache, warmed at boot.
export function listLooks(): string[] {
  return cache.files.length ? cache.files : localLooks();
}

export function lookUrl(file: string): string | null {
  const base = process.env.SUPABASE_URL?.trim();
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(file)}`;
}

export async function getWearingAsync(): Promise<string | null> {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("app_state").select("value").eq("key", WEARING_KEY).maybeSingle();
  const file = (data?.value as { file?: string } | undefined)?.file;
  return file ?? null;
}

let wearingCache: string | null = null;
export function getWearing(): string | null {
  return wearingCache;
}

export async function refreshWearing(): Promise<void> {
  wearingCache = await getWearingAsync();
}

// Fuzzy match: exact name (sans extension, case-insensitive), then unique
// substring — so "wear the velvet lounge one" just works.
export function resolveLook(query: string): string | { ambiguous: string[] } | null {
  const looks = listLooks();
  const q = query.trim().toLowerCase().replace(/\.(png|jpe?g|webp)$/i, "");
  const byName = (f: string) => f.toLowerCase().replace(/\.(png|jpe?g|webp)$/i, "");
  const exact = looks.filter((f) => byName(f) === q);
  if (exact.length === 1) return exact[0];
  const sub = looks.filter((f) => byName(f).includes(q));
  if (sub.length === 1) return sub[0];
  if (sub.length > 1) return { ambiguous: sub };
  return null;
}

export async function setWearing(file: string): Promise<{ ok: boolean; wearing?: string; error?: string }> {
  if (!listLooks().includes(file)) return { ok: false, error: `no look named "${file}" in the closet` };
  const c = db();
  if (!c) return { ok: false, error: "memory spine offline — can't remember what I put on" };
  const { error } = await c
    .from("app_state")
    .upsert({ key: WEARING_KEY, value: { file, at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  wearingCache = file;
  return { ok: true, wearing: file };
}

// Warm both caches at boot so the first request is instant and her tools
// know the closet without awaiting.
export async function initWardrobe(): Promise<void> {
  const files = await listLooksAsync();
  await refreshWearing();
  console.log(`[wardrobe] ${files.length} looks${wearingCache ? `, wearing ${wearingCache}` : ""}`);
}
