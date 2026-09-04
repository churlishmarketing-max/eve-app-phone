// RECALL, COUNTED — NOT ASSERTED. BEFORE AND AFTER, ON HIS REAL CORPUS.
//
//   cd C:\dev\eve\brain && npx tsx verify/recall-measure.ts
//
// Answers ONE question with two numbers: of the durable rows he actually owns,
// how many survive the recall filter as the tree WOULD have shipped, and how
// many survive it as it ships now? "Her memory still works" is a claim; this is
// the count behind it, taken against the store rather than against a fixture.
//
// WHY BOTH STATES, IN ONE RUN, ON THE SAME ROWS. The synthetic corpus in
// verify/intake-harness.ts (block M) proves the RULE — none of them recallable
// with the door open, all of them with it shut. It cannot prove the COST,
// because the rows are invented, and it must not be quoted as a count of his
// store: THIS file is the only thing in the tree that may state one, because it
// is the only thing that reads it. This runs the same filter over the rows he owns, twice, and the gap
// between the two numbers is the exact quantity of his real memory that
// shipping the durable-origin work unchanged would have taken away from him.
//
// STRICTLY READ-ONLY, and structurally so. It issues exactly two kinds of
// statement — `select` on memory_entries and whatever `withholdTaintedSources`
// itself reads — and it never calls `searchMemory`, because searchMemory calls
// `bumpRecalled`, which UPDATES salience and last_recalled_at. Measuring a thing
// must not move it. `_setIntakeForTests` moves a module-local variable in THIS
// process and nothing else; it reaches no store and no file.
//
// It prints counts and column presence. It never prints a row's content, a key,
// or a conversation id.
import "../src/env.js";
import { db, initDb } from "../src/db.js";
import { withholdTaintedSources } from "../src/memory.js";
import { pictureIntakeOn, PICTURE_INTAKE, _setIntakeForTests } from "../src/intake.js";

initDb();
const c = db();
if (!c) {
  console.log("memory spine offline — nothing to measure.");
  process.exit(0);
}

const originCol = await c.from("memory_entries").select("origin").limit(1);
console.log(`sql/006 memory_entries.origin : ${originCol.error ? `ABSENT (${originCol.error.message})` : "PRESENT"}`);
const sawCol = await c.from("conversations").select("saw_image").limit(1);
console.log(`sql/005 conversations.saw_image: ${sawCol.error ? `ABSENT (${sawCol.error.message})` : "PRESENT"}`);

const { count: conversations } = await c.from("conversations").select("*", { count: "exact", head: true });
const { count: tainted } = await c
  .from("conversations")
  .select("*", { count: "exact", head: true })
  .eq("saw_image", true);
console.log(`conversations total                : ${conversations ?? "unreadable"}`);
console.log(`conversations with saw_image=true  : ${tainted ?? "unreadable"}`);

const { data, error } = await c
  .from("memory_entries")
  .select("id, created_at")
  .order("created_at", { ascending: false })
  .limit(1000);
if (error || !data) {
  console.log(`could not read the corpus: ${error?.message}`);
  process.exit(1);
}
const rows = data as { id: string; created_at: string }[];
const t0 = Date.now();

// THE SAME ROWS, THE SAME FILTER, BOTH STATES. Measured in this order so the
// process is left in the state it shipped in.
_setIntakeForTests("on");
const before = await withholdTaintedSources(rows);
_setIntakeForTests("off");
const after = await withholdTaintedSources(rows);

console.log("");
console.log(`durable rows in the corpus        : ${rows.length}`);
console.log("");
console.log(`BEFORE — intake "on"  (the durable-origin work as it would have shipped)`);
console.log(`  RECALLABLE (kept)               : ${before.kept.length}`);
console.log(`  WITHHELD                        : ${before.withheld}`);
console.log("");
console.log(`AFTER  — intake "${PICTURE_INTAKE}" (what this build actually does · on=${pictureIntakeOn()})`);
console.log(`  RECALLABLE (kept)               : ${after.kept.length}`);
console.log(`  WITHHELD                        : ${after.withheld}`);
console.log("");
console.log(`ROWS OF HIS REAL MEMORY HANDED BACK: ${after.kept.length - before.kept.length}`);
console.log(`(${Date.now() - t0} ms, read-only — no salience bumped, nothing written)`);
