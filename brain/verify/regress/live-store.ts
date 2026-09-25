// A LONG-LIVED COPY OF MY OWN STORE for the live brain to talk to.
// Modelled on a SNAPSHOT of his (2026-09-03): 159 durable rows (5 with no
// source), 115 conversations all saw_image=false, NO memory_entries.origin
// column, a jobs table for dispatch. The numbers are this fixture's shape, not
// a live count — his store grows daily and verify/recall-measure.ts is the only
// thing here that reads the real one.
import { startStore, type Store } from "./store.js";
const N_MEM=159,N_NO_SRC=5,N_CONV=115;
const day=(i:number)=>new Date(Date.UTC(2026,5,1+(i%90),12,0,0)).toISOString();
const store: Store = { log: [], rpc: { match_memories: () => [] }, tables: {
  memory_entries:{cols:["id","kind","content","salience","status","created_at","source_conversation","embedding","last_recalled_at","fts"],
    rows:Array.from({length:N_MEM},(_,i)=>({id:`mem-${String(i).padStart(3,"0")}`,kind:i%17===0?"promise":"fact",
      content:`Rustic Lumber invoice cadence note ${i} — Woodaddy finish margin and the Chisel launch.`,
      salience:3,status:"active",created_at:day(i),
      source_conversation:i<N_MEM-N_NO_SRC?`conv-${String(i%N_CONV).padStart(3,"0")}`:null,embedding:null,last_recalled_at:null,fts:null}))},
  conversations:{cols:["id","surface","saw_image","summary","created_at"],rows:Array.from({length:N_CONV},(_,i)=>({id:`conv-${String(i).padStart(3,"0")}`,surface:"desk",saw_image:false,summary:null}))},
  messages:{cols:["id","conversation_id","role","content","created_at"],rows:[]},
  tasks:{cols:["id","title","detail","priority","due_at","done_at","created_at"],rows:[{id:"t1",title:"Cut the RLS spring reel",detail:"Assembly cut",priority:1,due_at:null,done_at:null}]},
  attention_items:{cols:["id","kind","message","nudge_level","resolved_at","created_at","ref"],rows:[]},
  clients:{cols:["id","name","cadence_days","status","last_touch_at"],rows:[{id:"cl1",name:"Rustic Lumber Store",cadence_days:7,status:"active",last_touch_at:null}]},
  touches:{cols:["id","client_id","channel","summary","at"],rows:[]},
  daily_checkins:{cols:["id","on_date","energy","sleep_hours","note","created_at"],rows:[]},
  habits:{cols:["id","name","active"],rows:[]},habit_ticks:{cols:["id","habit_id","on_date"],rows:[]},
  jobs:{cols:["*"],rows:[]},
  runs:{cols:["*"],rows:[]},
  app_state:{cols:["id","key","value"],rows:[]},
  sales_conversations:{cols:["id","summary","client_id","at","created_at"],rows:[]},
  routine_days:{cols:["id","routine_id","on_date"],rows:[]},
  routines:{cols:["id","name","streak","last_done_on","slot","active"],rows:[{id:"r1",name:"Gym",streak:3,last_done_on:null,slot:"am",active:true}]},
} };
const { url } = await startStore(store);
console.log(`STORE_URL=${url}`);
process.on("SIGTERM",()=>process.exit(0));
setInterval(()=>{},1<<30);
