// REGRESSION LENS — READ-ONLY probe of the live store. No writes, ever.
// Question: what does THIS build's distiller/recall do to rows that exist today?
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error("no creds"); process.exit(1); }
console.log(`creds: present, url ${url.length} chars, key ${key.length} chars`);
const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const line = (k: string, v: unknown) => console.log(`${k.padEnd(52)}: ${v}`);

// ---- schema state
for (const [t, col] of [["conversations","saw_image"],["memory_entries","origin"],["memory_entries","status"],["memory_entries","source_conversation"]] as const) {
  const { error } = await c.from(t).select(col).limit(1);
  line(`${t}.${col}`, error ? `ABSENT (${error.message})` : "PRESENT");
}

// ---- conversations
const cnt = async (t: string, f?: (q: any) => any) => {
  let q = c.from(t).select("id", { count: "exact", head: true });
  if (f) q = f(q);
  const { count, error } = await q;
  return error ? `ERR ${error.message}` : count;
};
line("conversations total", await cnt("conversations"));
line("conversations saw_image = true", await cnt("conversations", (q:any)=>q.eq("saw_image", true)));
line("conversations saw_image = false", await cnt("conversations", (q:any)=>q.eq("saw_image", false)));
line("conversations saw_image IS NULL", await cnt("conversations", (q:any)=>q.is("saw_image", null)));

// ---- THE DISTILLER WINDOW. distill.ts: messages since N days, grouped by
// conversation, then quarantined if readPictureTaintMany() != "clean".
// "clean" requires a conversations ROW to come back. A messages row whose
// conversation row is absent => "unknown" => silently NOT distilled.
const since = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
for (const days of [1, 7, 45]) {
  const { data: msgs, error } = await c.from("messages").select("conversation_id").gte("created_at", since(days)).limit(20000);
  if (error) { line(`messages last ${days}d`, `ERR ${error.message}`); continue; }
  const ids = [...new Set((msgs ?? []).map((m: any) => m.conversation_id).filter((s: any) => typeof s === "string" && s.length))];
  const { data: convs, error: ce } = ids.length ? await c.from("conversations").select("id, saw_image").in("id", ids) : { data: [], error: null } as any;
  const have = new Set((convs ?? []).map((r: any) => r.id));
  const tainted = (convs ?? []).filter((r: any) => r.saw_image === true).length;
  const orphan = ids.filter((i) => !have.has(i));
  line(`messages last ${days}d — rows`, msgs?.length ?? 0);
  line(`messages last ${days}d — distinct conversations`, ids.length);
  line(`  of those: conversations row PRESENT (=> clean)`, have.size);
  line(`  of those: NO conversations row (=> unknown => DROPPED)`, orphan.length);
  line(`  of those: saw_image=true (=> tainted => dropped)`, tainted);
  if (orphan.length) line(`  orphan ids (first 5)`, orphan.slice(0,5).join(", "));
  if (ce) line("  conversations lookup error", ce.message);
}

// ---- memory_entries corpus
line("memory_entries total", await cnt("memory_entries"));
line("memory_entries status=active", await cnt("memory_entries", (q:any)=>q.eq("status","active")));
line("memory_entries kind=promise & active", await cnt("memory_entries", (q:any)=>q.eq("kind","promise").eq("status","active")));
line("memory_entries source_conversation IS NULL", await cnt("memory_entries", (q:any)=>q.is("source_conversation", null)));
const { data: me } = await c.from("memory_entries").select("id, source_conversation").limit(5000);
const rows = me ?? [];
const srcIds = [...new Set(rows.map((r:any)=>r.source_conversation).filter((s:any)=>typeof s==="string"))];
const { data: srcConvs } = srcIds.length ? await c.from("conversations").select("id, saw_image").in("id", srcIds) : { data: [] } as any;
const srcMap = new Map((srcConvs ?? []).map((r:any)=>[r.id, r.saw_image === true]));
let keptOff=0, heldOff=0, keptOn=0, heldOn=0;
for (const r of rows as any[]) {
  const hasSrc = typeof r.source_conversation === "string";
  const provedTainted = hasSrc && srcMap.get(r.source_conversation) === true;
  const provedClean = hasSrc && srcMap.has(r.source_conversation) && srcMap.get(r.source_conversation) === false;
  if (!provedTainted) keptOff++; else heldOff++;      // intake OFF rule
  if (provedClean) keptOn++; else heldOn++;            // intake ON rule (no origin col)
}
line("memory_entries sampled for recall math", rows.length);
line("  intake OFF  -> RECALLABLE", keptOff);
line("  intake OFF  -> withheld", heldOff);
line("  intake ON   -> RECALLABLE", keptOn);
line("  intake ON   -> withheld", heldOn);
line("  rows whose source_conversation has NO conversations row", rows.filter((r:any)=>typeof r.source_conversation==="string" && !srcMap.has(r.source_conversation)).length);
