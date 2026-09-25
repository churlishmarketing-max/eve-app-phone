// EVERY DURABLE WRITE HE MAKES IN A DAY, run against his schema (no origin
// column) with intake OFF, on the SHIPPED code and on HEAD. If a write that
// landed on Railway does not land here, that is memory he silently loses.
import { startStore, type Store } from "./store.js";
function corpus(): Store {
  return { log: [], rpc: {}, tables: {
    memory_entries: { cols:["id","kind","content","salience","status","created_at","source_conversation","embedding","last_recalled_at","fts"], rows: [] },
    conversations: { cols:["id","surface","saw_image","summary","created_at"], rows: [{ id:"conv-live", surface:"desk", saw_image:false, summary:null }] },
    messages: { cols:["id","conversation_id","role","content","created_at"], rows: [] },
    clients: { cols:["id","name","status","last_touch_at"], rows: [{ id:"cl1", name:"Rustic Lumber Store", status:"active", last_touch_at:null }] },
    touches: { cols:["id","client_id","channel","summary","at"], rows: [] },
    attention_items: { cols:["id","kind","message","nudge_level","resolved_at","created_at","ref"], rows: [] },
    daily_checkins: { cols:["id","on_date","energy","sleep_hours","note","created_at"], rows: [] },
    sales_conversations: { cols:["id","summary","client_id","at","created_at"], rows: [] },
  } };
}
const which = process.argv[2] as "SHIPPED"|"HEAD";
const store = corpus();
const { url, close } = await startStore(store);
process.env.SUPABASE_URL = url; process.env.SUPABASE_SERVICE_ROLE_KEY = "regress-lens-key";
process.env.EVE_PICTURE_INTAKE = "off";
const base = which === "SHIPPED" ? "../../src" : "./head-src";
const db = await import(`${base}/db.js`); db.initDb();
const memory = await import(`${base}/memory.js`);
const vitals = await import(`${base}/vitals.js`);
const out: Record<string, unknown> = {};
const conv = { kind: "conversation", conversationId: "conv-live" } as any;
const sys  = { kind: "system", why: "regression bench" } as any;

// 1. save_memory / save_note — the permanent spine
out.saveMemory = which === "SHIPPED"
  ? await memory.saveMemory("fact", "Zach signs the Woodaddy label proof on Fridays.", conv)
  : await memory.saveMemory("fact", "Zach signs the Woodaddy label proof on Fridays.");
// 2. the transcript
out.appendMessage = await memory.appendMessage("conv-live", "eve", "Filed it, King.");
// 3. a client touch
out.logTouch = which === "SHIPPED"
  ? await memory.logTouch("Rustic Lumber Store", "call", "Talked through the label proof.", conv)
  : await memory.logTouch("Rustic Lumber Store", "call", "Talked through the label proof.");
// 4. the evening check-in note
out.checkinNote = which === "SHIPPED"
  ? await vitals.rememberCheckinNote("Ran the shop floor solo today.", sys)
  : await vitals.rememberCheckinNote("Ran the shop floor solo today.");
// 5. the SAME note again — the dedupe he triggers a dozen times an evening
out.checkinNoteAgain = which === "SHIPPED"
  ? await vitals.rememberCheckinNote("Ran the shop floor solo today.", sys)
  : await vitals.rememberCheckinNote("Ran the shop floor solo today.");
// 6. recall it straight back
const r = await memory.searchMemory("Woodaddy label proof Zach", 10);
out.recallAfterWrite = Array.isArray(r) ? { hits: r.length } : { hits: r.hits.length, withheld: r.withheld };
out.ROWS = { memory_entries: store.tables.memory_entries.rows.length,
             messages: store.tables.messages.rows.length,
             touches: store.tables.touches.rows.length };
out.memoryRowsWritten = store.tables.memory_entries.rows.map((r:any)=>({ kind:r.kind, source: r.source_conversation, origin: (r as any).origin ?? "(column absent)", content: String(r.content).slice(0,48) }));
console.log(JSON.stringify(out, null, 1));
await close(); process.exit(0);
