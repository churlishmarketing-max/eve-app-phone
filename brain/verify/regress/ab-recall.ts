// REGRESSION LENS — A/B ON ONE CORPUS.
// Runs the SHIPPED recall path and the HEAD (live-on-Railway) recall path over
// an IDENTICAL corpus in my own store, and diffs what King actually gets.
// The corpus models a SNAPSHOT of his (2026-09-03): no memory_entries.origin
// column, conversations.saw_image present and false everywhere, 159 durable
// rows of which 5 carry no source. Those are the FIXTURE's numbers and they are
// held fixed on purpose, so the A/B diff is about the code and not about how
// much he said to her yesterday. Nothing here is a claim about the live store —
// verify/recall-measure.ts is the only thing that reads that.
import { startStore, type Store } from "./store.js";

const N_MEM = 159, N_NO_SRC = 5, N_CONV = 115;

function corpus(): Store {
  const conversations = Array.from({ length: N_CONV }, (_, i) => ({
    id: `conv-${String(i).padStart(3, "0")}`, surface: "desk", saw_image: false, summary: null,
  }));
  const day = (i: number) => new Date(Date.UTC(2026, 5, 1 + (i % 90), 12, 0, 0)).toISOString();
  const memory_entries = Array.from({ length: N_MEM }, (_, i) => ({
    id: `mem-${String(i).padStart(3, "0")}`,
    kind: i % 17 === 0 ? "promise" : i % 5 === 0 ? "decision" : "fact",
    content: `Rustic Lumber invoice cadence note ${i} — Woodaddy finish margin and the Chisel community launch.`,
    salience: 3, status: "active", created_at: day(i),
    // 154 carry a source conversation; the last 5 (the save_note population) do not.
    source_conversation: i < N_MEM - N_NO_SRC ? `conv-${String(i % N_CONV).padStart(3, "0")}` : null,
    embedding: null, last_recalled_at: null, fts: null,
  }));
  const messages = Array.from({ length: 256 }, (_, i) => ({
    id: `msg-${i}`, conversation_id: `conv-${String(i % 50).padStart(3, "0")}`,
    role: i % 2 ? "eve" : "user", content: `turn ${i} about the lumber invoices`, created_at: day(i),
  }));
  return {
    log: [],
    rpc: { match_memories: () => [] },
    tables: {
      // NOTE THE COLUMN LIST: no `origin`. This is his schema, sql/006 unapplied.
      memory_entries: { cols: ["id","kind","content","salience","status","created_at","source_conversation","embedding","last_recalled_at","fts"], rows: memory_entries },
      conversations: { cols: ["id","surface","saw_image","summary","created_at"], rows: conversations },
      messages: { cols: ["id","conversation_id","role","content","created_at"], rows: messages },
      tasks: { cols: ["id","title","priority","due_at","done_at","created_at"], rows: [
        { id: "t1", title: "Cut the RLS spring reel", priority: 1, due_at: null, done_at: null },
        { id: "t2", title: "Woodaddy label proof", priority: 2, due_at: null, done_at: null },
      ] },
      attention_items: { cols: ["id","kind","message","nudge_level","resolved_at","created_at","ref"], rows: [
        { id: "a1", kind: "silent_client", message: "Zach has gone quiet 9 days", nudge_level: 2, resolved_at: null, created_at: day(3), ref: {} },
      ] },
      clients: { cols: ["id","name","status","last_touch_at"], rows: [{ id: "cl1", name: "Rustic Lumber Store", status: "active", last_touch_at: null }] },
      touches: { cols: ["id","client_id","channel","summary","at"], rows: [] },
      daily_checkins: { cols: ["id","on_date","energy","sleep_hours","note","created_at"], rows: [] },
      habits: { cols: ["id","name","active"], rows: [] },
      habit_ticks: { cols: ["id","habit_id","on_date"], rows: [] },
      app_state: { cols: ["id","key","value"], rows: [] },
    },
  };
}

const norm = (s: string) => s.replace(/Now: .*\(King's local time\)/g, "Now: <frozen>");

async function run(which: "SHIPPED" | "HEAD") {
  const store = corpus();
  const { url, close } = await startStore(store);
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "regress-lens-key";
  delete process.env.VOYAGE_API_KEY;
  delete process.env.GOOGLE_REFRESH_TOKEN;
  const base = which === "SHIPPED" ? "../../src" : "./head-src";
  const db = await import(`${base}/db.js`);
  db.initDb();
  const memory = await import(`${base}/memory.js`);
  const context = await import(`${base}/context.js`);

  const out: Record<string, unknown> = {};
  const r = await memory.searchMemory("lumber invoices Woodaddy", 10);
  out.searchMemory = Array.isArray(r) ? { hits: r.length, withheld: "n/a (HEAD returns an array)" , ids: r.map((h:any)=>h.id) }
                                      : { hits: r.hits.length, withheld: r.withheld, ids: r.hits.map((h:any)=>h.id) };
  const pack = await context.buildContextPack("desk", "what did I decide about the lumber invoices", "conv-001", true);
  out.packLines = norm(pack).split("\n").length;
  out.pack = norm(pack);
  out.storeRoundTrips = store.log.length;
  out.failedSelects = store.log.filter((l: any) => l.status >= 400).map((l: any) => decodeURIComponent(l.path).slice(0, 90));
  out.byTable = store.log.reduce((a: any, l: any) => { const t = decodeURIComponent(l.path).replace('/rest/v1/','').split('?')[0]; a[t] = (a[t] ?? 0) + 1; return a; }, {});
  await close();
  return out;
}

const which = process.argv[2] as "SHIPPED" | "HEAD";
const res = await run(which);
console.log(JSON.stringify(res, null, 1));
process.exit(0);
