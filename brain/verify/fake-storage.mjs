// A SCRATCH STORE SHAPED LIKE SUPABASE STORAGE. Nothing here is his bucket.
//
// This is the only store any wardrobe-sync verification is ever pointed at.
// His 99 real looks are not test data, so no harness in this tree is allowed
// near the real project — SUPABASE_URL is set to this server's own address.
//
// It implements exactly the four calls @supabase/storage-js issues for the
// paths under test (read off node_modules/@supabase/storage-js/dist/index.mjs):
//
//   POST /storage/v1/object/list/:bucket        list()
//   POST /storage/v1/object/:bucket/<path>      upload()   — honours x-upsert
//   GET  /storage/v1/object/:bucket/<path>      download()
//   DELETE anything                              recorded and REFUSED
//
// plus two admin reads that no product code knows about:
//
//   GET  /__scratch/objects   { count, names, sha256 by name, deleteAttempts }
//   POST /__scratch/reset
//
// DELETE IS THE POINT OF THE ADMIN COUNTERS. Every delete-shaped request is
// counted and never honoured, so "nothing can delete" is an observation at the
// store rather than a promise made by the code being tested.

import { createHash, randomUUID } from "node:crypto";
import http from "node:http";

const objects = new Map(); // "bucket/name" -> { buf, mime, at }
let deleteAttempts = 0;

const sha = (b) => createHash("sha256").update(b).digest("hex");

function body(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function json(res, code, payload) {
  const s = JSON.stringify(payload);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s) });
  res.end(s);
}

export function startFakeStorage() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const p = decodeURIComponent(url.pathname);

    if (req.method === "DELETE") {
      deleteAttempts += 1;
      return json(res, 500, { statusCode: "500", error: "Refused", message: "this scratch store never deletes" });
    }

    if (p === "/__scratch/objects" && req.method === "GET") {
      const names = [...objects.keys()].sort();
      const hashes = {};
      for (const k of names) hashes[k] = sha(objects.get(k).buf);
      return json(res, 200, { count: names.length, names, hashes, deleteAttempts });
    }
    if (p === "/__scratch/reset" && req.method === "POST") {
      objects.clear();
      deleteAttempts = 0;
      return json(res, 200, { ok: true });
    }

    // list()
    let m = /^\/storage\/v1\/object\/list\/([^/]+)$/.exec(p);
    if (m && req.method === "POST") {
      const bucket = m[1];
      const rows = [...objects.entries()]
        .filter(([k]) => k.startsWith(`${bucket}/`))
        .map(([k, v]) => ({
          name: k.slice(bucket.length + 1),
          id: randomUUID(),
          updated_at: v.at,
          created_at: v.at,
          metadata: { size: v.buf.length, mimetype: v.mime, eTag: sha(v.buf).slice(0, 32) },
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return json(res, 200, rows);
    }

    // upload() / download()
    m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(p);
    if (m) {
      const key = `${m[1]}/${m[2]}`;
      if (req.method === "POST") {
        const buf = await body(req);
        const upsert = String(req.headers["x-upsert"] ?? "false") === "true";
        if (objects.has(key) && !upsert) {
          return json(res, 409, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        }
        objects.set(key, {
          buf,
          mime: req.headers["content-type"] || "application/octet-stream",
          at: new Date().toISOString(),
        });
        return json(res, 200, { Key: key, Id: randomUUID() });
      }
      if (req.method === "GET") {
        const o = objects.get(key);
        if (!o) return json(res, 404, { statusCode: "404", error: "NotFound", message: "Object not found" });
        res.writeHead(200, { "Content-Type": o.mime, "Content-Length": o.buf.length });
        return res.end(o.buf);
      }
    }

    return json(res, 404, { statusCode: "404", error: "NotFound", message: `no scratch route for ${req.method} ${p}` });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ port, url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

/** Seed an object without going through the product code (fixture setup). */
export function seed(bucket, name, buf, mime = "image/png") {
  objects.set(`${bucket}/${name}`, { buf, mime, at: new Date().toISOString() });
}
