// THE NIGHTLY DISTILLER — the job that turns his conversations into permanent
// memory. SHIPPED adds an UNCONDITIONAL quarantine (NOT gated on the intake
// switch). This runs the shipped runDistill and the HEAD runDistill over one
// corpus and reports which conversations each one is willing to distil.
import { startStore, type Store } from "./store.js";
const ORPHAN = process.argv[3] === "orphan";
const TAINTERR = process.argv[3] === "tainterr";
function corpus(): Store {
  const day = (i: number) => new Date(Date.now() - i * 36e5).toISOString();
  // 6 conversations with transcript. In the ORPHAN variant conv-E has messages
  // but NO conversations row — the shape a lost/never-minted row leaves behind.
  const ids = ["conv-A","conv-B","conv-C","conv-D","conv-E","conv-F"];
  const messages = ids.flatMap((id, k) => Array.from({length:4},(_,j)=>({
    id:`m-${id}-${j}`, conversation_id:id, role:j%2?"eve":"user",
    content:`${id} turn ${j}: Zach wants the Woodaddy label proof by Friday.`, created_at: day(k*4+j) })));
  const convRows = ids.filter((id) => !(ORPHAN && id === "conv-E"))
    .map((id) => ({ id, surface:"desk", saw_image:false, summary:null }));
  return { log: [], rpc: {}, tables: {
    messages: { cols:["id","conversation_id","role","content","created_at"], rows: messages },
    conversations: { cols: TAINTERR ? ["id","surface","summary","created_at"] : ["id","surface","saw_image","summary","created_at"], rows: convRows },
    memory_entries: { cols:["id","kind","content","salience","status","created_at","source_conversation","embedding","last_recalled_at","fts"], rows: [] },
    clients: { cols:["id","name","status","last_touch_at"], rows: [] },
    touches: { cols:["id","client_id","channel","summary","at"], rows: [] },
  } };
}
const which = process.argv[2] as "SHIPPED"|"HEAD";
const store = corpus();
const { url, close } = await startStore(store);
process.env.SUPABASE_URL = url; process.env.SUPABASE_SERVICE_ROLE_KEY = "regress-lens-key";
process.env.EVE_PICTURE_INTAKE = "off";
const base = which === "SHIPPED" ? "../../src" : "./head-src";
const db = await import(`${base}/db.js`); db.initDb();
const distill = await import(`${base}/distill.js`);
const warned: string[] = [];
const ow = console.warn; console.warn = (...a: unknown[]) => { warned.push(a.join(" ")); };
const res = await distill.runDistill().catch((e: unknown) => ({ ok:false, reason: String(e) }));
console.warn = ow;
// WHICH CONVERSATIONS DID THE SHIPPED CODE ACTUALLY REACH? Observed off the
// store's own request log — the model call is what fails here, so the last
// thing each conversation does before that is what we can count.
const reached = new Set(store.log.filter(l => l.method === "PATCH" && l.path.includes("conversations")).map(l => decodeURIComponent(l.path)));
console.log(JSON.stringify({ which, orphanVariant: ORPHAN, result: res,
  quarantineWarnings: warned.filter(w => /distill/.test(w)),
  conversationsInStore: store.tables.conversations.rows.length,
  conversationsWithTranscript: 6,
  summaryPatches: [...reached].length }, null, 1));
process.exit(0);
