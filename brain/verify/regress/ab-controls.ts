// NEGATIVE CONTROLS. "Unchanged" only means something if this bench can SEE a
// withhold. Three runs of the SHIPPED code over the same corpus:
//   A  intake off, all conversations clean          -> expect 10 kept, 0 withheld
//   B  intake off, conv-004 saw_image=true          -> expect the tainted rows GONE (proof of a live guard)
//   C  intake on,  no origin column (his schema)    -> expect the strip audit 6 would have shipped
import { startStore, type Store } from "./store.js";
// FIXTURE SHAPE, NOT A LIVE COUNT — a 2026-09-03 snapshot of his store, frozen
// on purpose so a control that fails means the code changed rather than that he
// talked to her overnight. verify/recall-measure.ts reads the real one.
const N_MEM = 159, N_NO_SRC = 5, N_CONV = 115;
function corpus(taint: string[] = []): Store {
  const day = (i: number) => new Date(Date.UTC(2026, 5, 1 + (i % 90), 12, 0, 0)).toISOString();
  return { log: [], rpc: { match_memories: () => [] }, tables: {
    memory_entries: { cols: ["id","kind","content","salience","status","created_at","source_conversation","embedding","last_recalled_at","fts"],
      rows: Array.from({ length: N_MEM }, (_, i) => ({ id:`mem-${String(i).padStart(3,"0")}`, kind:"fact",
        content:`Rustic Lumber invoice cadence note ${i} — Woodaddy finish margin and the Chisel community launch.`,
        salience:3, status:"active", created_at:day(i),
        source_conversation: i < N_MEM-N_NO_SRC ? `conv-${String(i%N_CONV).padStart(3,"0")}` : null, embedding:null, last_recalled_at:null, fts:null })) },
    conversations: { cols:["id","surface","saw_image","summary","created_at"],
      rows: Array.from({length:N_CONV},(_,i)=>({ id:`conv-${String(i).padStart(3,"0")}`, surface:"desk",
        saw_image: taint.includes(`conv-${String(i).padStart(3,"0")}`), summary:null })) },
    messages: { cols:["id","conversation_id","role","content","created_at"], rows: [] },
  } };
}
async function once(label: string, intake: "on"|"off", taint: string[]) {
  const store = corpus(taint);
  const { url, close } = await startStore(store);
  process.env.SUPABASE_URL = url; process.env.SUPABASE_SERVICE_ROLE_KEY = "regress-lens-key";
  process.env.EVE_PICTURE_INTAKE = intake;
  const db = await import(`../../src/db.js`); db.initDb();
  const memory = await import(`../../src/memory.js`);
  const r = await memory.searchMemory("lumber invoices Woodaddy", 10);
  console.log(`${label.padEnd(58)} kept=${String(r.hits.length).padEnd(3)} withheld=${String(r.withheld).padEnd(3)} ids=${r.hits.map((h:any)=>h.id).join(",")||"(none)"}`);
  await close();
}
const mode = process.argv[2];
if (mode==="A") await once("A intake OFF · all clean (his store today)","off",[]);
if (mode==="B") await once("B intake OFF · the 5 conversations behind the top hits PROVED tainted","off",["conv-034","conv-035","conv-036","conv-037","conv-038"]);
if (mode==="C") await once("C intake ON  · no origin column (audit 6 as-would-have-shipped)","on",[]);
process.exit(0);
