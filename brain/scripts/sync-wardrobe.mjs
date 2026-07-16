#!/usr/bin/env node
// Sync her closet to Supabase Storage.
//
//   cd C:\dev\eve\brain && node scripts/sync-wardrobe.mjs
//
// Her renders live in the "wardrobe" storage bucket, NOT in git: the repo
// stays small, deploys stay fast, and adding a look never needs a redeploy.
// Drop new PNGs in data/wardrobe, run this, done — she sees them within a
// minute. (Removing a look: delete it in the Supabase dashboard, or pass
// --prune here to mirror local deletions.)

import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from brain/.env");
  process.exit(1);
}

const BUCKET = "wardrobe";
const dir = path.join(process.cwd(), "data", "wardrobe");
const prune = process.argv.includes("--prune");

const mimeOf = (f) => {
  const e = f.toLowerCase();
  if (e.endsWith(".png")) return "image/png";
  if (e.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
};

const H = { apikey: key, Authorization: `Bearer ${key}` };

async function ensureBucket() {
  const r = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 10485760,
      allowed_mime_types: ["image/png", "image/jpeg", "image/webp"],
    }),
  });
  if (r.ok) console.log(`[wardrobe] bucket "${BUCKET}" created`);
  // 409 = already there, which is the normal path.
}

async function remoteFiles() {
  const r = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 500, sortBy: { column: "name", order: "asc" } }),
  });
  if (!r.ok) return [];
  return (await r.json()).map((o) => o.name);
}

async function main() {
  await ensureBucket();
  const local = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  let ok = 0;
  const failed = [];

  for (const f of local) {
    const body = readFileSync(path.join(dir, f));
    const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodeURIComponent(f)}`, {
      method: "POST",
      headers: { ...H, "Content-Type": mimeOf(f), "x-upsert": "true" },
      body,
    });
    if (r.ok) {
      ok++;
      process.stdout.write(`\r[wardrobe] uploaded ${ok}/${local.length}`);
    } else {
      failed.push(`${f} → ${r.status} ${(await r.text()).slice(0, 80)}`);
    }
  }
  process.stdout.write("\n");

  if (prune) {
    const gone = (await remoteFiles()).filter((n) => !local.includes(n));
    if (gone.length) {
      await fetch(`${url}/storage/v1/object/${BUCKET}`, {
        method: "DELETE",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: gone }),
      });
      console.log(`[wardrobe] pruned ${gone.length} look(s) no longer on disk: ${gone.join(", ")}`);
    }
  }

  console.log(`[wardrobe] ${ok}/${local.length} in the cloud closet`);
  if (failed.length) {
    console.error("[wardrobe] failures:");
    failed.forEach((f) => console.error("  " + f));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[wardrobe] sync failed:", e.message);
  process.exit(1);
});
