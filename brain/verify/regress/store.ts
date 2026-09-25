// MY OWN STORE. A PostgREST-shaped mock over an in-memory corpus, so the SHIPPED
// code can be run against a schema I control (no origin column, saw_image=false)
// and the SAME requests replayed against the HEAD build. Nothing here touches
// his Supabase. Every request is recorded so "which selects ran" is observed.
import http from "node:http";

export type Row = Record<string, unknown>;
export interface Table { cols: string[]; rows: Row[] }

export interface Store {
  tables: Record<string, Table>;
  rpc: Record<string, (body: any) => unknown>;
  log: { method: string; path: string; status: number; body?: unknown }[];
}

function parseSelect(sel: string | null): string[] | null {
  if (!sel || sel === "*") return null;
  return sel.split(",").map((s) => s.trim().split(":").pop()!.split("(")[0].trim()).filter(Boolean);
}

function applyFilter(rows: Row[], key: string, raw: string): Row[] {
  // PostgREST: key=op.value  (in.(a,b) / is.null / eq.x / gte.x / not.is.null)
  const m = /^(not\.)?([a-z]+)\.(.*)$/s.exec(raw);
  if (!m) return rows;
  const [, neg, op, val] = m;
  const test = (r: Row): boolean => {
    const v = r[key];
    switch (op) {
      case "eq": return String(v) === val || (val === "true" && v === true) || (val === "false" && v === false);
      case "neq": return String(v) !== val;
      case "is": return val === "null" ? v === null || v === undefined : val === "true" ? v === true : v === false;
      case "in": {
        const list = val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
        return list.includes(String(v));
      }
      case "gte": return String(v) >= val;
      case "lte": return String(v) <= val;
      case "gt": return String(v) > val;
      case "lt": return String(v) < val;
      case "cs": return true; // contains(jsonb) — not exercised by the paths under test
      case "wfts": case "fts": case "plfts": case "phfts": {
        // websearch_to_tsquery, approximated: OR of the stemmed-ish terms.
        const q = decodeURIComponent(val.replace(/^[a-z]*\./, ""));
        const terms = q.toLowerCase().split(/\s+or\s+|\s+/).map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length > 2);
        const hay = String(r["content"] ?? "").toLowerCase();
        return terms.some((t) => hay.includes(t));
      }
      default: return true;
    }
  };
  return rows.filter((r) => (neg ? !test(r) : test(r)));
}

export function startStore(store: Store): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const seg = u.pathname.replace(/^\/rest\/v1\//, "");
    const chunks: Buffer[] = [];
    for await (const ch of req) chunks.push(ch as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : null;
    const send = (status: number, payload: unknown, extra: Record<string, string> = {}) => {
      store.log.push({ method: req.method!, path: req.url!, status });
      const s = JSON.stringify(payload);
      res.writeHead(status, { "content-type": "application/json", "content-range": extra["content-range"] ?? "*/*", ...extra });
      res.end(s);
    };
    const err = (code: string, message: string) => send(400, { code, message, details: null, hint: null });

    if (seg.startsWith("rpc/")) {
      const fn = seg.slice(4);
      if (!store.rpc[fn]) return err("42883", `function public.${fn} does not exist`);
      return send(200, store.rpc[fn](body));
    }
    const t = store.tables[seg];
    if (!t) return err("42P01", `relation "public.${seg}" does not exist`);

    if (req.method === "POST") {
      const incoming: Row[] = Array.isArray(body) ? body : [body];
      for (const r of incoming) {
        if (!t.cols.includes("*")) for (const k of Object.keys(r)) {
          if (!t.cols.includes(k)) return err("PGRST204", `Could not find the '${k}' column of '${seg}' in the schema cache`);
        }
      }
      const made = incoming.map((r) => ({ id: r.id ?? `gen-${seg}-${t.rows.length + 1}`, created_at: new Date().toISOString(), ...r }));
      // upsert on conflict id
      for (const r of made) {
        const i = t.rows.findIndex((x) => x.id === r.id);
        if (i >= 0) { if (!/ignoreDuplicates|ignore-duplicates/.test(String(req.headers["prefer"] ?? "")) ) t.rows[i] = { ...t.rows[i], ...r }; }
        else t.rows.push(r);
      }
      const cols = parseSelect(u.searchParams.get("select"));
      const out = made.map((r) => (cols ? Object.fromEntries(cols.map((k) => [k, r[k]])) : r));
      const single = String(req.headers["accept"] ?? "").includes("pgrst.object");
      return send(201, single ? out[0] : out);
    }
    if (req.method === "PATCH") {
      let rows = [...t.rows];
      for (const [k, v] of u.searchParams) if (k !== "select" && k !== "order" && k !== "limit") rows = applyFilter(rows, k, v);
      for (const r of rows) Object.assign(r, body);
      return send(200, []);
    }

    // GET / HEAD
    let rows = [...t.rows];
    const cols = parseSelect(u.searchParams.get("select"));
    if (cols && !t.cols.includes("*")) for (const cname of cols) if (!t.cols.includes(cname)) return err("42703", `column ${seg}.${cname} does not exist`);
    for (const [k, v] of u.searchParams) {
      if (["select", "order", "limit", "offset"].includes(k)) continue;
      rows = applyFilter(rows, k, v);
    }
    const order = u.searchParams.get("order");
    if (order) {
      const [col, dir] = order.split(".");
      rows.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (dir === "desc" ? -1 : 1));
    }
    const total = rows.length;
    const lim = u.searchParams.get("limit");
    if (lim) rows = rows.slice(0, Number(lim));
    const out = rows.map((r) => (cols ? Object.fromEntries(cols.map((k) => [k, r[k]])) : r));
    const single = String(req.headers["accept"] ?? "").includes("pgrst.object");
    if (req.method === "HEAD") { store.log.push({ method: "HEAD", path: req.url!, status: 200 }); res.writeHead(200, { "content-range": `0-${total}/${total}` }); return res.end(); }
    if (single) {
      if (out.length > 1) return err("PGRST116", "JSON object requested, multiple (or no) rows returned");
      return send(200, out[0] ?? null);
    }
    return send(200, out, { "content-range": `0-${Math.max(0, out.length - 1)}/${total}` });
  });
  return new Promise((resolve) => {
    server.listen(Number(process.env.REGRESS_STORE_PORT || 0), "127.0.0.1", () => {
      const port = (server.address() as any).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
