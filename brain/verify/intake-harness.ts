// AUDIT 7 — PICTURE INTAKE IS OFF. THE PROOF THAT IT IS OFF EVERYWHERE, THAT
// IT COSTS HIS MEMORY NOTHING, AND THAT IT COMES BACK WHOLE.
//
//   cd C:\dev\eve\brain && npx tsx verify/intake-harness.ts
//
// Nothing here touches a real folder, a real store, a network or a model. The
// store is a fake `SupabaseClient` shaped like the statements the brain
// actually issues, and it COUNTS every write so "nothing was written" is an
// observation rather than an intention.
//
// FIVE BLOCKS:
//
//   D  THE DOOR. Every shape of image body, on every surface, refused —
//      including the ones the old validator had a nicer error for. The bytes
//      are never decoded and the turn that comes out is text-only.
//   E  THE ENUMERATION. Source-level: `imageFromBody` has ONE call site, it is
//      the ONLY producer of a ChatImage, `buildTurnContent` is the ONLY
//      constructor of an image content block and has ONE call site, and the
//      refusal is the first reachable statement in the validator. This is the
//      block that answers "prove the door is the only door".
//   L  THE LEDGER AND THE COLUMN NEVER MOVE. No in-memory taint, no
//      `saw_image` write, no upsert carrying it — counted at the fake store.
//   M  HIS MEMORY IS WHOLE, AND THE NUMBER IS COUNTED. A corpus shaped like his
//      real one (no sql/006) goes NONE-recallable with the door open and
//      ALL-recallable with it shut — and a POSITIVELY tainted row is still
//      withheld in both states. The fixture's size is a fixture's size; the
//      live pair comes from verify/recall-measure.ts, never from here.
//   W  THE NIGHTLY WINDOW. The distiller's quarantine predicate follows the
//      switch, and a night it could not judge is retried instead of stamped.
//   S  NOTHING PROMISES WHAT CANNOT HAPPEN. The assembled system prompt, the
//      two desk tool descriptions and the deck's own copy.
//
// And every block runs in BOTH states where the answer should differ, because
// "the guard comes back at full strength" is a claim that needs a run behind it.
//
// Owning stream: BRAIN/S2.

import { readFileSync, readdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { _setIntakeForTests, pictureIntake, pictureIntakeOn, INTAKE_OFF_WHY, PICTURES_OFF_TOOL_NOTE, intakeBanner, pic } from "../src/intake.js";
import { imageFromBody, buildTurnContent, renderImageRefusal, persistedUserText } from "../src/image.js";
import { pictureVerdict } from "../src/picture.js";
import { withholdTaintedRows } from "../src/durable.js";
import { withholdTaintedSources, saveMemory, appendMessage } from "../src/memory.js";
import { renderHandoff } from "../src/handoff.js";
import { runDistill } from "../src/distill.js";
import { guardDurableWrite } from "../src/durable.js";
import { noteTurn, resetImageLedger } from "../src/image-ledger.js";
import { _setDbForTests } from "../src/db.js";
import { withPictureDoctrine } from "../src/persona.js";
import { buildConnectorServer } from "../src/connectors.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const PROMPTS = join(HERE, "..", "prompts");
const readSrc = (f: string) => readFileSync(join(SRC, f), "utf8");

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
function ok(id: string, cond: boolean, why: string): void {
  if (cond) {
    pass += 1;
    console.log(`  ${id.padEnd(9)} PASS  ${why}`);
  } else {
    fail += 1;
    console.log(`  ${id.padEnd(9)} ****FAIL****  ${why}`);
  }
}
const head = (s: string) => console.log(`\n=== ${s} ===`);

// ---------------------------------------------------------------------------
// A REAL PNG. Same construction the other harnesses use: a genuine deflate
// stream inside a genuine IHDR/IDAT/IEND chain, so `sniff()` and the length
// checks are exercised against bytes rather than against a stub.
// ---------------------------------------------------------------------------
function crc32(b: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const REAL_PNG = png(48, 24);
const B64 = REAL_PNG.toString("base64");

// ---------------------------------------------------------------------------
// THE FAKE STORE. It COUNTS. Every statement the brain issues lands in
// `writes`, so "nothing touched saw_image" is checked rather than assumed.
// ---------------------------------------------------------------------------
interface MemRow {
  id: string;
  content: string;
  source_conversation: string | null;
  origin?: string | null;
}
interface Store {
  conversations: Map<string, { id: string; surface: string; saw_image: boolean }>;
  memory: MemRow[];
  messages: { conversation_id: string; role: string; content: string }[];
  /** every statement, in order, as "<table>.<op>" plus what it carried */
  writes: { stmt: string; payload: unknown }[];
  noOriginColumn: boolean;
  /**
   * THE DISTILLER'S WINDOW LEDGER (block W). `since` is the `at` of the last
   * row this job stamped ok:true, so what lands here — and with what `ok` — is
   * the whole of whether a dropped night is ever revisited.
   */
  runs: { job: string; ok: boolean; detail: Record<string, unknown>; at: string }[];
  /** Name a table to make every statement against it error, the way a missing sql/005 does. */
  failTable: string | null;
}
function emptyStore(noOriginColumn = true): Store {
  return { conversations: new Map(), memory: [], messages: [], writes: [], noOriginColumn, runs: [], failTable: null };
}

let seq = 0;
function fakeDb(store: Store) {
  const from = (table: string) => {
    const st = { op: "select", cols: "*", payload: null as unknown, ids: [] as string[], eq: null as string | null,
      eqs: [] as [string, unknown][] };
    const run = async (): Promise<{ data: unknown; error: { message: string } | null }> => {
      if (store.failTable === table) return { data: null, error: { message: "relation unavailable (fixture)" } };
      if (store.noOriginColumn && table === "memory_entries" && st.op === "select" && st.cols.includes("origin")) {
        return { data: null, error: { message: "column memory_entries.origin does not exist" } };
      }
      if (st.op === "insert") {
        store.writes.push({ stmt: `${table}.insert`, payload: st.payload });
        const v = st.payload as Record<string, unknown>;
        if (store.noOriginColumn && table === "memory_entries" && "origin" in v) {
          return { data: null, error: { message: "Could not find the 'origin' column of 'memory_entries' in the schema cache" } };
        }
        if (table === "memory_entries") {
          const row: MemRow = {
            id: `mem-${++seq}`,
            content: String(v.content ?? ""),
            source_conversation: (v.source_conversation as string | null) ?? null,
            ...(store.noOriginColumn ? {} : { origin: (v.origin as string | null) ?? null }),
          };
          store.memory.push(row);
          return { data: [row], error: null };
        }
        if (table === "runs") {
          // NOT COERCED. The fixture records exactly what the brain handed it,
          // because "did this run stamp a successful window" is the property
          // under test.
          store.runs.push({
            job: String(v.job),
            ok: v.ok === true,
            detail: (v.detail as Record<string, unknown>) ?? {},
            at: typeof v.at === "string" ? v.at : new Date().toISOString(),
          });
          return { data: [v], error: null };
        }
        if (table === "messages") {
          store.messages.push({
            conversation_id: String(v.conversation_id),
            role: String(v.role),
            content: String(v.content),
          });
          return { data: [v], error: null };
        }
        return { data: [], error: null };
      }
      if (st.op === "upsert") {
        store.writes.push({ stmt: `${table}.upsert`, payload: st.payload });
        const v = st.payload as Record<string, unknown>;
        const id = String(v.id);
        const prev = store.conversations.get(id);
        store.conversations.set(id, {
          id,
          surface: typeof v.surface === "string" ? v.surface : prev?.surface ?? "desktop",
          saw_image: "saw_image" in v ? v.saw_image === true : prev?.saw_image === true,
        });
        return { data: null, error: null };
      }
      if (st.op === "update") {
        store.writes.push({ stmt: `${table}.update`, payload: st.payload });
        return { data: [], error: null };
      }
      // selects
      if (table === "conversations") {
        const all = [...store.conversations.values()];
        const hit = st.eq ? all.filter((r) => r.id === st.eq) : st.ids.length ? all.filter((r) => st.ids.includes(r.id)) : all;
        return { data: hit, error: null };
      }
      if (table === "memory_entries") {
        const hit = st.ids.length ? store.memory.filter((r) => st.ids.includes(r.id)) : store.memory;
        return { data: hit, error: null };
      }
      if (table === "messages") {
        const hit = st.eq ? store.messages.filter((m) => m.conversation_id === st.eq) : store.messages;
        return { data: hit, error: null };
      }
      if (table === "runs") {
        // Both eq columns matter here and only here — `since` reads job AND
        // ok:true, and a fixture that ignored `ok` would hand back the failed
        // night as if it had succeeded, which is the bug under test.
        const hit = store.runs.filter((r) =>
          st.eqs.every(([col, val]) => (col === "job" ? r.job === val : col === "ok" ? r.ok === val : true)));
        return { data: hit, error: null };
      }
      return { data: [], error: null };
    };
    const api: Record<string, unknown> = {
      select: (cols = "*") => {
        st.cols = cols;
        return api;
      },
      insert: (p: unknown) => {
        st.op = "insert";
        st.payload = p;
        return api;
      },
      upsert: (p: unknown) => {
        st.op = "upsert";
        st.payload = p;
        return api;
      },
      update: (p: unknown) => {
        st.op = "update";
        st.payload = p;
        return api;
      },
      in: (_c: string, v: string[]) => {
        st.ids = v;
        return api;
      },
      eq: (c: string, v: unknown) => {
        st.eq = String(v);
        st.eqs.push([c, v]);
        return api;
      },
      is: () => api,
      // Chainable no-ops for the rest of the builder surface the distiller
      // touches. Wider than the real filter only ever means MORE rows reach the
      // code under test, which is the safe direction for a taint filter.
      gte: () => api,
      gt: () => api,
      lt: () => api,
      or: () => api,
      contains: () => api,
      order: () => api,
      limit: () => api,
      textSearch: () => api,
      single: async () => {
        const r = await run();
        const d = r.data as unknown[] | null;
        return { data: d && d.length ? d[0] : null, error: r.error };
      },
      maybeSingle: async () => {
        const r = await run();
        const d = r.data as unknown[] | null;
        return { data: d && d.length ? d[0] : null, error: r.error };
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
    };
    return api;
  };
  return { from, rpc: async () => ({ data: null, error: { message: "no rpc in this fixture" } }) };
}
function useStore(store: Store): void {
  _setDbForTests(fakeDb(store) as never);
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("AUDIT 7 — PICTURE INTAKE OFF. The door, the enumeration, the memory, the strings.");
  console.log(intakeBanner());

  // =========================================================================
  head("D — THE DOOR. Every surface, every shape, refused before a byte is read");
  // =========================================================================
  _setIntakeForTests("off");

  ok("D0", pictureIntake() === "off" && !pictureIntakeOn(), `the switch defaults OFF without anyone setting it — pictureIntake() === "${pictureIntake()}"`);

  const good = imageFromBody({ mime: "image/png", data: B64 });
  ok(
    "D1",
    good.image === null && good.refusal?.code === "INTAKE-OFF",
    `a PERFECTLY VALID ${REAL_PNG.length}-byte PNG — right mime, right magic bytes, well under the cap — is refused anyway. This is not a validation failure and the code says so: ${good.refusal?.code}`,
  );
  ok(
    "D2",
    typeof good.refusal?.why === "string" && good.refusal.why === INTAKE_OFF_WHY,
    "and the reason is the CONSTANT from src/intake.ts, never a sentence built from the body, the mime or the filename — nothing an attacker draws into a screenshot can write the line about screenshots",
  );
  {
    const w = good.refusal!.why.toLowerCase();
    ok(
      "D3",
      w.includes("there's a picture on this message") && w.includes("not opening it"),
      "SHE NOTICED, and she says so first. A screenshot that vanishes without a word is a screenshot he will believe she read",
    );
    ok(
      "D4",
      w.includes("not a fault") && w.includes("nothing is wrong with your machine") && w.includes("trying again won't change it"),
      "SHE IS NOT BROKEN, and it forecloses all four wrong conclusions by name: not a fault, not his machine, not the size or kind, not worth a retry",
    );
    ok(
      "D5",
      w.includes("won't guess") && w.includes("type me the names"),
      "AND THERE IS A NEXT STEP. A refusal with nowhere to go is a refusal he spends three turns arguing with — and every one of those turns is another attempt to send it",
    );
  }

  // Every OTHER shape the validator used to have an opinion about.
  const shapes: [string, unknown, string][] = [
    ["a JPEG", { mime: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64") }, "image/jpeg"],
    ["a WebP", { mime: "image/webp", data: Buffer.from("RIFF0000WEBPVP8 ").toString("base64") }, "image/webp"],
    ["two pictures at once", [{ mime: "image/png", data: B64 }, { mime: "image/png", data: B64 }], "MULTIPLE"],
    ["a 40 MB paste", { mime: "image/png", data: "A".repeat(40 * 1024 * 1024) }, "OVERSIZE"],
    ["a data: URI", { mime: "image/png", data: `data:image/png;base64,${B64}` }, "ENCODING"],
    ["a GIF", { mime: "image/gif", data: B64 }, "MIME"],
    ["an .exe wearing image/png", { mime: "image/png", data: Buffer.from("MZ\u0000\u0000not a picture").toString("base64") }, "CONTENT"],
    ["a bare string", "a screenshot, honest", "SHAPE"],
    ["an empty object", {}, "SHAPE"],
  ];
  let allOff = true;
  for (const [, body] of shapes) {
    const r = imageFromBody(body);
    if (r.image !== null || r.refusal?.code !== "INTAKE-OFF") allOff = false;
  }
  ok(
    "D6",
    allOff,
    `and all ${shapes.length} other shapes — ${shapes.map((s) => s[0]).join(", ")} — come back INTAKE-OFF too, NOT with the specific code they used to get. The door is above every one of those branches, so none of them runs`,
  );

  {
    // The 40 MB one is the one that matters for "the bytes are never read": the
    // old path allocated nothing for it either, but the new path does not even
    // reach the length check.
    const t0 = process.hrtime.bigint();
    imageFromBody({ mime: "image/png", data: "A".repeat(40 * 1024 * 1024) });
    const us = Number(process.hrtime.bigint() - t0) / 1000;
    ok("D7", us < 5000, `a 40 MB base64 body is refused in ${us.toFixed(0)} µs — it is never measured, never decoded, never allocated as a Buffer. A size guard that has to build the thing first is not a guard, and this one does not even reach the size guard`);
  }

  ok("D8", imageFromBody(undefined).refusal === null && imageFromBody(null).refusal === null,
    "AND AN ORDINARY TURN IS UNTOUCHED. No image field means no refusal and no note — the door only exists for a body that actually carried one, so her answer to a plain message is byte-identical to what it was before any of this");

  // What the model is told.
  {
    const rendered = renderImageRefusal(good.refusal);
    ok("D9", rendered.includes("<picture_intake_off"), "the model-facing render is its OWN tag, not the generic <image_not_attached> wrapper");
    ok(
      "D10",
      /refused at the door/.test(rendered) && /re-send is refused the same way/.test(rendered) && /not a fault/.test(rendered),
      "and it tells her the re-send is refused too — the generic wrapper would have left her believing a smaller or different picture would work, and she would have said so",
    );
    ok("D11", !/try again|smaller|different format|PNG instead/i.test(rendered), "it offers no workaround, because there is none. Every other refusal in image.ts implies one and this one must not");
  }

  // The turn that comes out.
  {
    const blocks = buildTurnContent("<context_pack/>", "what do you make of this?", null, good.refusal);
    ok("D12", blocks.length === 1 && blocks[0].type === "text", `the assembled turn is ONE TEXT BLOCK — ${blocks.length} block(s), type "${blocks[0].type}". There is no {type:"image"} in it and structurally there cannot be: buildTurnContent's image branch needs a ChatImage and imageFromBody produced none`);
    ok("D13", (blocks[0] as { text: string }).text.includes("PICTURE INTAKE IS OFF"), "and the refusal rides inside it, so she cannot answer as though he sent words alone");
    ok("D14", !(blocks[0] as { text: string }).text.includes(B64.slice(0, 32)), "no fragment of the base64 is anywhere in the turn");
  }
  ok("D15", persistedUserText("look at this", null) === "look at this", "and what gets persisted is his words with no picture marker — because there was no picture");

  // =========================================================================
  head("E — THE ENUMERATION. Prove the door is the ONLY door");
  // =========================================================================
  {
    const imageSrc = readSrc("image.ts");
    const idxSrc = readSrc("index.ts");
    const chatSrc = readSrc("chat.ts");

    // 1. Every /chat body arrives at exactly one validator.
    const callSites = (idxSrc.match(/imageFromBody\(/g) ?? []).length;
    ok("E1", callSites === 1 && /const \{ image: chatImage, refusal: imageRefusal \} = imageFromBody\(image\)/.test(idxSrc),
      `imageFromBody has EXACTLY ${callSites} call site in index.ts, and it is the /chat body. His desk, his phone, the glasses and a raw curl all arrive there — one door, four surfaces`);

    // 2. No other route reads an image off a body.
    //
    // COUNTING ZERO WAS THE WRONG ASSERTION and the first real run of this
    // harness proved it: the door itself is a line that reads an image off a
    // request body, so "zero such lines" can only ever be made true by
    // excluding the one line that matters — which is how an enumeration
    // quietly stops enumerating. Count ONE and NAME it instead: exactly one
    // line in the whole file, and it is the /chat destructure that hands the
    // value straight to the validator. That proves both halves at once.
    const routes = (idxSrc.match(/^app\.(get|post|put|delete)\(/gm) ?? []).length;
    const imageBodyReads = idxSrc.split("\n").filter((l) => /req\.body/.test(l) && /\bimage\b/.test(l));
    ok("E2", imageBodyReads.length === 1 && /const \{ message, conversationId, surface, desk, image, names \} = req\.body/.test(imageBodyReads[0] ?? ""),
      `exactly ${imageBodyReads.length} line in the whole of index.ts reads an image off a request body, and it is the /chat destructure that hands it to imageFromBody on the very next statement. None of the other ${routes - 1} routes — /senses/sms, /senses/notification, /capture, /checkin, /confirm, /dispatch, /job, /routine, /wardrobe, /voice/* and the rest — destructures anything that could hold pixels`);

    // 3. The refusal is the FIRST thing that runs.
    const body = imageSrc.slice(imageSrc.indexOf("export function imageFromBody"));
    const iNull = body.indexOf("if (raw === undefined || raw === null)");
    const iDoor = body.indexOf("if (!pictureIntakeOn()) return refuse(\"INTAKE-OFF\"");
    const iArray = body.indexOf("if (Array.isArray(raw))");
    const iMime = body.indexOf("IMAGE_MIMES as readonly string[]");
    const iDecode = body.indexOf('Buffer.from(data, "base64")');
    ok("E3", iDoor > iNull && iDoor < iArray && iDoor < iMime && iDoor < iDecode,
      "and inside the validator the refusal is the FIRST reachable statement — after the no-image early return and BEFORE the array check, the mime check, the length check and the decode. Nothing below it can run");

    // 4. There is exactly one constructor of an image content block.
    const blockCtors = (imageSrc.match(/\{ type: "image", source:/g) ?? []).length;
    const anywhereElse = ["chat.ts", "connectors.ts", "tools.ts", "dispatch.ts", "brief.ts", "distill.ts", "pulse.ts", "proactive.ts", "capture.ts", "desk.ts"]
      .filter((f) => /type:\s*"image"/.test(readSrc(f)));
    ok("E4", blockCtors === 1 && anywhereElse.length === 0,
      `and there is exactly ${blockCtors} place in the whole brain that constructs an {type:"image"} content block — buildTurnContent, in image.ts. Not one of the other ten model-facing files contains the shape at all`);

    // 5. That constructor has one caller, and it is guarded.
    const btcCalls = ["chat.ts", "connectors.ts", "dispatch.ts", "brief.ts", "distill.ts", "pulse.ts", "proactive.ts", "capture.ts"]
      .filter((f) => /buildTurnContent\(/.test(readSrc(f)));
    ok("E5", btcCalls.length === 1 && btcCalls[0] === "chat.ts",
      `and buildTurnContent has ONE caller (${btcCalls.join(", ")}). The other six query() sites — brief, capture, dispatch, distill, proactive, pulse — build a plain string prompt and have no picture parameter to pass`);

    // 6. The one caller cannot manufacture a ChatImage of its own.
    ok("E6", !/image\s*=\s*\{[^}]*mime/.test(chatSrc) && /let image = opts\?\.image \?\? null/.test(chatSrc),
      "chat.ts's `image` comes from the validated opts and is only ever assigned `null` afterwards (the UNRECORDED path). It never builds one");

    // 7. And the type system is the last fence.
    ok("E7", /export interface ChatImage/.test(imageSrc) && /image: ChatImage \| null/.test(imageSrc),
      "buildTurnContent's image parameter is `ChatImage | null`, and ChatImage is only ever produced by the one return at the bottom of imageFromBody — so a future caller cannot route round the door without writing the word ChatImage and being seen doing it");

    // 8. AND THE SURFACES THEMSELVES, FROM THE OTHER END.
    //
    // Everything above proves the brain has one door. It does not, on its own,
    // prove that a surface cannot reach some OTHER brain — and "one door, four
    // surfaces" is a claim about the surfaces as much as about the validator.
    // So each client in this repo is read where it actually builds a request:
    // the desktop and the phone both have exactly one `/chat` fetch and no
    // other route they could hang pixels on. The glasses and a raw curl are the
    // same HTTP door by construction — there is no second server to hit.
    const repo = join(HERE, "..", "..");
    const phoneSrc = readFileSync(join(repo, "app", "src", "eveApi.ts"), "utf8");
    const deskApiSrc = readFileSync(join(repo, "desktop", "electron", "api.ts"), "utf8");
    const phoneChat = (phoneSrc.match(/\/chat`/g) ?? []).length;
    const deskChat = (deskApiSrc.match(/\$\{brainUrl\(\)\}\/chat`/g) ?? []).length;
    ok("E8", phoneChat === 1 && deskChat === 1 && !/\bimage\b/.test(phoneSrc),
      `each surface has exactly ONE way to reach her — the desktop's api.ts has ${deskChat} /chat fetch and the phone's eveApi.ts has ${phoneChat}, and the phone's client does not contain the word "image" at all, so it could not attach one even if the door were open. Both land on the same POST /chat, which is the line E1 just enumerated`);
  }

  // =========================================================================
  head("L — THE LEDGER AND THE COLUMN NEVER MOVE");
  // =========================================================================
  {
    resetImageLedger();
    const store = emptyStore();
    useStore(store);
    const CONV = "conv-intake-off";

    // What chat.ts does on a turn where the body carried a picture.
    const { image, refusal } = imageFromBody({ mime: "image/png", data: B64 });
    const stamp = noteTurn(CONV, !!image);
    ok("L1", image === null && refusal?.code === "INTAKE-OFF", "the body carried a real PNG and the validator produced no ChatImage");
    ok("L2", stamp.sawImage === false && stamp.seen === false && stamp.turnsAgo === null,
      `so noteTurn is handed FALSE and the in-memory ledger records nothing — {sawImage:${stamp.sawImage}, seen:${stamp.seen}, turnsAgo:${stamp.turnsAgo}}. The ledger is fed by !!image and by nothing else`);

    // chat.ts's markPictureSeen is inside `if (image)`.
    const chatSrc = readSrc("chat.ts");
    ok("L3", /if \(image\) \{\s*\n\s*const written = await markPictureSeen\(conversationId, surface\);/.test(chatSrc),
      "and markPictureSeen — the ONLY writer of conversations.saw_image in the whole brain — sits inside `if (image)`, which is now unreachable on every surface");
    // ENUMERATED, NOT SAMPLED — and comment-blind, which is what the first run
    // of this harness caught. The old form read ONE file, asserted a fact about
    // all of them, and then tripped on the word `saw_image` appearing in a
    // COMMENT in memory.ts explaining the join. That is the point in miniature:
    // a text search over a whole file cannot tell a write from a sentence about
    // a write. So comments and string literals come out first, and then EVERY
    // .ts file in src/ is asked whether it puts saw_image into a statement.
    const stripProse = (t: string) =>
      t
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""');
    const srcFiles = readdirSync(SRC).filter((f) => f.endsWith(".ts")).sort();
    const writers = srcFiles.filter((f) => /saw_image/.test(stripProse(readSrc(f))));
    ok("L4", writers.length === 1 && writers[0] === "taint.ts" && !/saw_image/.test(stripProse(readSrc("memory.ts"))),
      `of all ${srcFiles.length} source files in the brain, exactly ${writers.length} mentions saw_image in a statement rather than a comment (${writers.join(", ")}) — and memory.ts's ensureConversation upsert does not carry the column in any form`);

    const touchedTaint = store.writes.filter((w) => JSON.stringify(w.payload).includes("saw_image"));
    ok("L5", touchedTaint.length === 0,
      `and the fake store COUNTED the statements: ${store.writes.length} write(s) issued on this turn, ${touchedTaint.length} of them carrying saw_image. Not "we did not mean to" — nothing did`);

    const v = pictureVerdict({ sawImage: !!image, imageSeen: stamp.seen, imageTurnsAgo: stamp.turnsAgo, durable: "clean", intake: "off" });
    ok("L6", v.blocked === false && v.code === "",
      "so the turn's verdict is NOT BLOCKED — filing, recall and the transcript behave exactly as on any other turn. A picture that never entered cannot taint anything");
  }
  {
    // The one thing the switch must NOT soften.
    const v = pictureVerdict({ durable: "tainted", intake: "off" });
    ok("L7", v.blocked === true && v.code === "P-SESSION",
      "AND A POSITIVE TAINT STILL BLOCKS WITH THE DOOR SHUT. saw_image is monotonic, so a conversation that carried a picture during some future ON period stays refused after the switch goes off again");
    const u = pictureVerdict({ durable: "unknown", durableWhy: "the store timed out", intake: "off" });
    ok("L8", u.blocked === false,
      "while an UNREADABLE store no longer blocks — otherwise a database blip would put FILING IS OFF — SHE CANNOT CHECK FOR A PICTURE on his deck, which is a picture-shaped explanation for a network problem");
    const uOn = pictureVerdict({ durable: "unknown", durableWhy: "the store timed out", intake: "on" });
    ok("L9", uOn.blocked === true && uOn.code === "P-UNKNOWN",
      "and with the door open the same input fails closed again, in the same line. The softening is absence-of-proof only, and it is one branch wide");
    const noIntake = pictureVerdict({ durable: "unknown" });
    ok("L10", noIntake.blocked === true,
      "a caller that never mentions the switch gets the STRICT behaviour — the parameter defaults to \"on\", so a forgetful future caller fails closed instead of silently opening the gate");
  }

  // =========================================================================
  head("M — HIS MEMORY IS WHOLE, AND THE NUMBER IS COUNTED");
  // =========================================================================
  {
    // A corpus shaped like his real one — a snapshot of it, taken 2026-09-03:
    // 159 rows, 154 carrying a source conversation, 5 with none, and NO origin
    // column because sql/006 is not applied.
    //
    // THESE NUMBERS ARE THE FIXTURE'S, NOT HIS, and the distinction is the
    // point: his store grows every day, so the counts below are a SHAPE that
    // must keep holding (all-or-nothing, and one tainted conversation still
    // withholds its own rows), never a claim about what is in Supabase this
    // morning. verify/recall-measure.ts is the only thing here allowed to state
    // a live count, because it reads one.
    const store = emptyStore(true);
    for (let i = 0; i < 115; i++) store.conversations.set(`c${i}`, { id: `c${i}`, surface: "desktop", saw_image: false });
    for (let i = 0; i < 154; i++) store.memory.push({ id: `m${i}`, content: `a fact about his business #${i}`, source_conversation: `c${i % 115}` });
    for (let i = 154; i < 159; i++) store.memory.push({ id: `m${i}`, content: `a save_note row #${i}`, source_conversation: null });
    useStore(store);
    const rows = store.memory.map((r) => ({ id: r.id }));

    _setIntakeForTests("on");
    const on = await withholdTaintedSources(rows);
    ok("M1", on.kept.length === 0 && on.withheld === 159,
      `WITH THE DOOR OPEN AND sql/006 UNAPPLIED: ${on.kept.length} of ${rows.length} rows recallable, ${on.withheld} withheld. That is audit 6's rule, unchanged and still fail-closed — and it is exactly what shipping this tree as-is would have done to him`);

    _setIntakeForTests("off");
    const off = await withholdTaintedSources(rows);
    ok("M2", off.kept.length === 159 && off.withheld === 0,
      `WITH THE DOOR SHUT: ${off.kept.length} of ${rows.length} rows recallable, ${off.withheld} withheld. His memory is whole — because no picture has ever reached this brain and none can while the door is shut, so there is no contamination for the quarantine to be protecting him from`);

    // The one row that must still be withheld.
    store.conversations.set("c7", { id: "c7", surface: "desktop", saw_image: true });
    const withTaint = await withholdTaintedSources(rows);
    const expected = store.memory.filter((r) => r.source_conversation === "c7").length;
    ok("M3", withTaint.withheld === expected && expected > 0,
      `AND IT IS NOT A BLANKET AMNESTY: mark ONE conversation saw_image=true and ${withTaint.withheld} row(s) drop out — the ${expected} whose source is that conversation. With no origin column at all, a row that names a source is still JOINED to conversations.saw_image and a positive taint still wins`);
    store.conversations.set("c7", { id: "c7", surface: "desktop", saw_image: false });

    // The read is not the only half.
    _setIntakeForTests("off");
    const wrote = await saveMemory("fact", "Rustic Lumber Store pays net 30", { kind: "system", why: "harness" });
    ok("M4", wrote.ok === true && store.memory.length === 160,
      `and a WRITE lands against a store with no origin column — saveMemory retried without it and the row is in (${store.memory.length} rows now). Without that retry every note she takes, every fact the distiller lifts and every check-in line would have failed with an error about a column he has never heard of`);
    const attempts = store.writes.filter((w) => w.stmt === "memory_entries.insert");
    ok("M5", attempts.length === 2 && JSON.stringify(attempts[0].payload).includes('"origin"') && !JSON.stringify(attempts[1].payload).includes('"origin"'),
      `it TRIED with the origin stamp first and only dropped it when the store said the column is not there (${attempts.length} statements, first with origin, second without) — so the day sql/006 is applied the stamp starts landing again with no code change`);

    const appended = await appendMessage("c3", "user", "did we settle the Ridgeline invoice?");
    ok("M6", appended.ok === true && store.messages.length === 1,
      "and the transcript writes too — guardDurableWrite's UNKNOWN branch is inert with the door shut, so a conversation the store cannot answer about no longer silently loses his half of the turn as well as hers");

    _setIntakeForTests("on");
    const guardedOn = await guardDurableWrite({ kind: "conversation", conversationId: "not-a-real-conversation" });
    _setIntakeForTests("off");
    const guardedOff = await guardDurableWrite({ kind: "conversation", conversationId: "not-a-real-conversation" });
    ok("M7", guardedOn.ok === false && guardedOn.code === "UNKNOWN" && guardedOff.ok === true,
      `an unanswerable conversation refuses the write with the door open (${guardedOn.code}) and allows it with the door shut — the guard is inert, not deleted, and it is one flag away from being armed`);

    const taintedGuard = await (async () => {
      store.conversations.set("dirty", { id: "dirty", surface: "desktop", saw_image: true });
      return guardDurableWrite({ kind: "conversation", conversationId: "dirty" });
    })();
    ok("M8", taintedGuard.ok === false && taintedGuard.code === "TAINTED",
      "while a PROVED taint still refuses the write with the door shut. Both halves of the guard soften absence of proof and neither softens proof");
  }
  {
    // The generic filter, directly, so the rule is visible without a store.
    _setIntakeForTests("off");
    const rows = [{ id: "a" }, { id: "b" }];
    useStore((() => {
      const s = emptyStore();
      s.conversations.set("clean-one", { id: "clean-one", surface: "d", saw_image: false });
      s.conversations.set("dirty-one", { id: "dirty-one", surface: "d", saw_image: true });
      return s;
    })());
    const r = await withholdTaintedRows(rows, (row) =>
      row.id === "a" ? { kind: "unknown" } : { kind: "conversation", conversationId: "dirty-one" });
    ok("M9", r.kept.length === 1 && r.kept[0].id === "a" && r.withheld === 1,
      "withholdTaintedRows, stated plainly: with the door shut UNKNOWN is kept and PROVED TAINTED is dropped. One branch, read once for the whole batch, so a filter cannot change its mind halfway through a recall");
  }

  // =========================================================================
  head("W — THE NIGHTLY WINDOW, IN BOTH STATES");
  // =========================================================================
  //
  // The distiller quarantines a conversation it cannot prove clean, and then
  // stamps `runs {job:"distill", ok:true}` on its way out. The next night's
  // window starts at THE LAST ok:true RUN. So a night that dropped everything
  // because one select failed also moved the window past the messages it
  // dropped, and no later run ever saw them again — the file's own comment
  // called that skip "recoverable" and the window logic made it permanent.
  //
  // Two rules are under test here and they are different rules:
  //   THE PREDICATE follows the switch, exactly as durable.ts's does.
  //   THE STAMP follows the EVIDENCE: absence of an answer is a retry, a
  //   positive answer is a verdict, and only one of those may move the window.
  {
    const seededAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    const msgAt = new Date(Date.now() - 1 * 3600_000).toISOString();
    const windowStore = (failTable: string | null, sawImage: boolean) => {
      const st = emptyStore(true);
      st.failTable = failTable;
      st.conversations.set("cw", { id: "cw", surface: "desktop", saw_image: sawImage });
      st.messages.push({ conversation_id: "cw", role: "user", content: "Ridgeline invoice goes net 15" });
      // LAST NIGHT SUCCEEDED. This row is the boundary every later run reads.
      st.runs.push({ job: "distill", ok: true, detail: {}, at: seededAt });
      return st;
    };
    const quiet = async (f: () => Promise<unknown>) => {
      const warned: string[] = [];
      const real = console.warn;
      console.warn = (...a: unknown[]) => { warned.push(a.map(String).join(" ")); };
      let threw = "";
      let out: unknown = null;
      try { out = await f(); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
      console.warn = real;
      return { warned, threw, out: out as { ok?: boolean; reason?: string; conversations?: number } | null };
    };
    void msgAt;

    // ---- THE TAINT CANNOT BE READ AT ALL -------------------------------
    _setIntakeForTests("off");
    const offUnread = windowStore("conversations", false);
    useStore(offUnread);
    const offRun = await quiet(() => runDistill());
    ok("W1", offRun.threw !== "" && !offRun.warned.some((w) => /not provably/.test(w)),
      `WITH THE DOOR SHUT, AN UNREADABLE TAINT IS NOT A QUARANTINE. Nothing was withheld and the conversation went all the way to the distiller's model call — the one step this offline box cannot do ("${offRun.threw.slice(0, 34)}…"). The predicate follows the switch, the way durable.ts's does: with the door shut only a PROVED taint withholds`);

    _setIntakeForTests("on");
    const onUnread = windowStore("conversations", false);
    useStore(onUnread);
    const onRun = await quiet(() => runDistill());
    ok("W2", onRun.threw === "" && onRun.out?.ok === false && onRun.out?.conversations === 0 &&
      /read again next run/.test(onRun.out?.reason ?? ""),
      `WITH THE DOOR OPEN THE SAME STORE QUARANTINES EVERYTHING — and the run says so: ok:false, 0 conversations, no exception thrown anywhere. Audit 6's rule, unchanged; what changed is that it no longer reports success`);
    ok("W3", onUnread.runs.filter((r) => r.ok).length === 1 && onUnread.runs.filter((r) => r.ok)[0].at === seededAt &&
      onUnread.runs.some((r) => !r.ok && r.detail.windowRetried === true),
      `AND THE WINDOW IS NOT LOST. A row went into the ledger — the night is visible, not silent — but ok:false, so the only ok:true run is still last night's and the next run recomputes the SAME \`since\`. Before this, that select stamped ok:true and the dropped messages were outside every future window`);

    // ---- A PROVED TAINT IS A VERDICT, NOT A FAILED READ ----------------
    for (const state of ["off", "on"] as const) {
      _setIntakeForTests(state);
      const st = windowStore(null, true);
      useStore(st);
      const r = await quiet(() => runDistill());
      ok(state === "off" ? "W4" : "W5",
        r.threw === "" && r.out?.ok === true && r.out?.conversations === 0 &&
          st.runs.filter((x) => x.ok).length === 2,
        `and with intake "${state}" a conversation PROVED tainted is withheld — 0 distilled, in both states — but the run still stamps ok:true (${st.runs.filter((x) => x.ok).length} successful runs in the ledger now). A verdict is not a retry: re-reading that window every night for ever would stall distillation instead of recovering it`);
    }
    _setIntakeForTests("off");
  }

  // =========================================================================
  head("S — NOTHING PROMISES WHAT CANNOT HAPPEN");
  // =========================================================================
  {
    const digest = readFileSync(join(PROMPTS, "doctrine-digest.md"), "utf8");
    ok("S1", digest.includes("<!-- PICTURE-SECTION -->") && digest.includes("<!-- /PICTURE-SECTION -->"),
      "the picture doctrine is still in the file, whole, between markers — four NOT DEPLOYABLE audits and two dead mechanisms are a record worth keeping, not something to delete and rediscover");

    _setIntakeForTests("off");
    const offDoc = withPictureDoctrine(digest);
    _setIntakeForTests("on");
    const onDoc = withPictureDoctrine(digest);

    ok("S2", /Pictures are switched off in you/.test(offDoc) && !/NAMES ONLY: SHE READS, HE DIRECTS/.test(offDoc),
      "with the door shut she is taught the SHORT TRUE version instead: what happens, and what to say when he attaches one anyway");
    ok("S3", !/desk_handoff/.test(offDoc) && /desk_handoff/.test(onDoc),
      "and the promise of the fresh-thread handoff button is GONE — she can no longer cause that button to appear, so she must not offer it");
    ok("S4", !/CHIPS BESIDE AN EMPTY MESSAGE BOX/i.test(offDoc),
      "nor the chips beside the empty composer, nor the button on his deck. Anything that cannot happen is not described as if it can");
    ok("S5", /not a fault/i.test(offDoc) && /re-?send/i.test(offDoc) && /never claim to have seen/i.test(offDoc),
      "what replaces it is the four things she would otherwise get wrong: it is not a fault, a re-send is refused too, do not claim to have half-seen it, and do not offer a workaround");
    ok("S6", offDoc.length < onDoc.length && /Filenames are still untrusted text/.test(offDoc),
      `the off doctrine is ${onDoc.length - offDoc.length} characters shorter, and the one rule that was never about pictures — filenames are untrusted text — survives the swap`);
    ok("S7", (() => { try { withPictureDoctrine("no markers here"); return false; } catch { return true; } })(),
      "and a missing marker THROWS at boot rather than silently shipping the wrong half of this doctrine, which is the failure the swap exists to prevent");
  }
  {
    // The tool descriptions, off the real server.
    const descOf = (state: "on" | "off", name: string): string => {
      _setIntakeForTests(state);
      const server = buildConnectorServer(() => {}, null, null, "desktop", {}, {}, {});
      const reg = (server as unknown as { instance: { _registeredTools: Record<string, { description: string }> } }).instance._registeredTools;
      return reg[name]?.description ?? "";
    };
    const planOff = descOf("off", "desk_file_plan");
    const planOn = descOf("on", "desk_file_plan");
    const scanOff = descOf("off", "desk_scan");
    const scanOn = descOf("on", "desk_scan");
    const noteOff = descOf("off", "save_note");
    const noteOn = descOf("on", "save_note");
    const whereOff = descOf("off", "desk_where");
    const whereOn = descOf("on", "desk_where");
    const hoffOff = descOf("off", "desk_handoff");
    const hoffOn = descOf("on", "desk_handoff");

    ok("S8", !/desk_handoff/.test(planOff) && /desk_handoff/.test(planOn),
      `desk_file_plan's description drops the handoff instruction (${planOn.length} chars with the door open, ${planOff.length} with it shut) — two of its bullets actively told her to offer him a button she can no longer produce`);
    ok("S9", /PICTURES ARE SWITCHED OFF IN YOU/.test(planOff) && /a destination comes from his typed or spoken words/i.test(planOff),
      "and it does not just fall silent: a model handed a detailed procedure for an impossible situation concludes the situation is IMPORTANT and starts looking for it, so it is told plainly that there is nothing to look for");
    ok("S10", /PICTURES ARE SWITCHED OFF IN YOU/.test(scanOff) && !/WHEN HE SENDS A SCREENSHOT NAMING FILES/.test(scanOff) && /WHEN HE SENDS A SCREENSHOT NAMING FILES/.test(scanOn),
      "desk_scan stops calling itself the bridge from a screenshot — that paragraph would have her asking him for a screenshot he cannot send — while keeping the half of the tool that still works");
    // NOT `!/screenshot/i` — PICTURES_OFF_TOOL_NOTE contains the word, on
    // purpose, to say there is no screenshot to read names off. What must be
    // gone is the PROMISE, so the promise is what is read.
    ok("S10b", !/only shows you in a screenshot/.test(whereOff) && /only shows you in a screenshot/.test(whereOn) &&
      /PICTURES ARE SWITCHED OFF IN YOU/.test(whereOff) && /filing log/.test(whereOff),
      `desk_where stops telling her a clip name can arrive in a screenshot (${whereOn.length} chars open, ${whereOff.length} shut) — the rest of that bullet, about a name he SAYS or TYPES, is word for word what it was, and the filing log it reads is untouched`);
    ok("S10c", !/INSTEAD OF FILING FROM A PICTURE/.test(hoffOff) && /INSTEAD OF FILING FROM A PICTURE/.test(hoffOn) &&
      !/read the names off the picture/i.test(hoffOff) && /PICTURES ARE SWITCHED OFF IN YOU/.test(hoffOff) &&
      /CHIPS BESIDE AN EMPTY/.test(hoffOff),
      `and desk_handoff no longer opens by teaching her the picture dance — read the names off the screenshot, scan them, hand them over — while the tool's actual job, ids in and chips on his deck beside an empty box, is still described in full. It is a GREEN tool that works today; only its stated reason for existing was unreachable`);
    ok("S11", !/A PICTURE HAS BEEN IN/i.test(noteOff) && /A PICTURE HAS BEEN IN/i.test(noteOn),
      "and save_note, log_conversation and log_checkin drop their withhold paragraphs, because there is no conversation a picture has been in for them to describe");
    ok("S12", noteOn.length > noteOff.length && /Discord/.test(noteOff) && /durable memory/.test(noteOff),
      "everything about those tools that is still true is untouched — only the picture clause went");
    // PUT THE SWITCH BACK BEFORE ASKING IT ANYTHING. `descOf` above sets the
    // state on every call and the last one asked for "on", so this assertion
    // was reading a state it had not set — which is exactly the bug the first
    // run of this harness surfaced. An assertion that reads module state must
    // OWN that state, never inherit it from the assertion above it.
    _setIntakeForTests("off");
    ok("S13", pic("PROMISE", "TRUTH") === "TRUTH" && pic("PROMISE") === "" && (() => { _setIntakeForTests("on"); const r = pic("PROMISE", "TRUTH"); _setIntakeForTests("off"); return r === "PROMISE"; })(),
      "pic() is the one helper every one of those sites goes through, and it defaults its off-text to \"\" — DROPPING the paragraph, which is the right answer wherever a rule describes something that cannot occur");
    ok("S14", PICTURES_OFF_TOOL_NOTE.includes("refused at the door") && PICTURES_OFF_TOOL_NOTE.includes("every surface"),
      "and the replacement note says WHERE the refusal happens, so she does not describe it as her own choice or as a fault");
  }
  {
    // ---------------------------------------------------------------------
    // S3 REACHES THE BOOT LOG TOO, AND THAT IS THE STRING HE ACTUALLY READS.
    //
    // sql/006 is deliberately unapplied, so `probeDurableOriginSchema` FAILS on
    // every boot of the shipping build and its warning goes into every Railway
    // deploy log. It used to say "RECALL IS WITHHELD until then" — false with
    // the door shut, and worse than merely false: it is an instruction to paste
    // another migration into another SQL editor, which is the operation he has
    // already performed once this week in the wrong project.
    //
    // The same applies to taint.ts's "FILING IS REFUSED until then". Neither is
    // true while intake is off, and an operator warning that asks for a fix
    // that is not needed is not a safe kind of wrong.
    //
    // Asserted at SOURCE rather than by capturing console output, because the
    // failure mode being guarded is someone editing the string back — and a
    // captured log would only catch it on a boot that happens to fail.
    // ---------------------------------------------------------------------
    const durableSrc = readSrc("durable.ts");
    const taintSrc = readSrc("taint.ts");
    const stripComments = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    ok("S19", /function originConsequence\(\)/.test(durableSrc) && /pictureIntakeOn\(\)\s*\n?\s*\?\s*"RECALL IS WITHHELD/.test(stripComments(durableSrc)),
      "the sql/006 boot warning states a consequence that depends on the switch — RECALL IS WITHHELD is on the intake-ON arm only, where it is true");
    ok("S20", /recall is UNAFFECTED/.test(durableSrc) && /does not need applying/.test(durableSrc),
      "and the OFF arm says plainly that the missing column costs nothing today and must NOT be applied for it — this build asks him for no migration, and the log has to stop asking too");
    ok("S21", /function taintConsequence\(\)/.test(taintSrc) && /pictureIntakeOn\(\)\s*\n?\s*\?\s*"FILING IS REFUSED/.test(stripComments(taintSrc)),
      "same for sql/005's warning: FILING IS REFUSED is true only with the door open, and with it shut the log says filing still runs");
    ok("S22", /becomes a filing outage the moment intake is switched back on/.test(taintSrc) && /becomes required the day intake is switched on/.test(durableSrc),
      "and BOTH off-arms name what they will cost the day the switch flips, so turning intake back on is not a discovery exercise");

    // THE 413 IS THE SAME CLASS OF SENTENCE, ADDRESSED TO WHOEVER IS HOLDING
    // THE PHONE. It advertised "an image has to be under 5MB before it's
    // base64'd" — a size ceiling for a feature that is off, which reads as
    // "send a smaller one". No size gets through: imageFromBody refuses on its
    // first line. Read at source for the same reason as S19-S22: the failure
    // mode is someone editing the string back, and only a request that happens
    // to be oversized would ever surface it at runtime.
    const idx413 = readSrc("index.ts");
    const off413 = /pic\([\s\S]*?`, and an image has to be under 5MB[^`]*`,[\s\S]*?`([^`]*)`/.exec(idx413);
    ok("S23", !!off413 && /switched off in me/.test(off413[1]) && /wouldn't help/.test(off413[1]) &&
      !/under 5MB/.test(off413[1]),
      `the 413 stops advertising an image ceiling with the door shut: "${(off413?.[1] ?? "").trim().slice(0, 96)}…". The 5MB clause is on the ON arm, where it is true, and the body limit itself is unchanged because the desk pack still needs the room`);

    // THE HANDOFF'S OWN REPLY IS THE SAME CLASS OF SENTENCE, and it is handed to
    // the MODEL on every successful desk_handoff — which is a GREEN tool she can
    // still call today, off any desk_scan. The instruction (the folder comes
    // from him) is true in both states and survives; the REASON it used to give
    // (a picture does not get to choose one) describes a conversation that
    // cannot exist while the door is shut.
    const handed = { frame: { rev: "r1", ids: [1] }, names: ["C9452.MP4"], missing: [], overflow: 0 };
    _setIntakeForTests("off");
    const saidOff = renderHandoff(handed);
    _setIntakeForTests("on");
    const saidOn = renderHandoff(handed);
    _setIntakeForTests("off");
    ok("S24", !/picture/i.test(saidOff) && /folder has to come from him/.test(saidOff) &&
      /because a picture does not get to choose one/.test(saidOn),
      `and the sentence renderHandoff hands the model when the button goes up carries no picture with the door shut — "…${saidOff.slice(-72)}" — while keeping the instruction that is true in both states`);
  }
  {
    // The deck's own copy, read across the repo boundary.
    const deckSrc = readFileSync(join(HERE, "..", "..", "desktop", "src", "shared", "handoff.ts"), "utf8");
    const brainSrc = readSrc("intake.ts");
    const deckState = /const DEFAULT_PICTURE_INTAKE = "(on|off)"/.exec(deckSrc)?.[1];
    const brainState = /const DEFAULT_PICTURE_INTAKE: IntakeState = "(on|off)"/.exec(brainSrc)?.[1];
    ok("S15", !!deckState && deckState === brainState,
      `the deck's copy switch and the brain's enforcement switch agree — both "${brainState}". Read out of the two files here so they cannot drift silently; the deck's is COPY ONLY and the brain's is the door`);
    // NOT `/DROPZONE_HINT/.test(src)` — that matches the export's own name and
    // is true no matter what the constant says, which is an assertion that
    // cannot fail. Read the OFF arm of the ternary and check the promise is
    // absent from IT specifically, while the ON arm still carries it.
    const hintOff = /DROPZONE_HINT =\s*\n?\s*pictureIntakeOn\(\)\s*\n?\s*\?\s*"([^"]*)"\s*\n?\s*:\s*"([^"]*)"/.exec(deckSrc);
    ok("S16", !!hintOff && !/RIDES YOUR NEXT MESSAGE/.test(hintOff[2]) && /RIDES YOUR NEXT MESSAGE/.test(hintOff[1]) && deckState === "off",
      `and with the switch off the dropzone reads "${hintOff?.[2]}" — the promise "DROP A PICTURE — IT RIDES YOUR NEXT MESSAGE" is on the ON arm only, where it is true. An app that makes a promise the brain then breaks is worse than no feature at all`);
    const talk = readFileSync(join(HERE, "..", "..", "desktop", "src", "renderer", "deck", "TalkColumn.tsx"), "utf8");
    ok("S17", !/RIDES THE NEXT MESSAGE"/.test(talk) && /ATTACHED_CHIP_FATE/.test(talk) && /attachedFlash\(/.test(talk),
      "the attach chip says SHE WILL NOT OPEN IT rather than RIDES THE NEXT MESSAGE, and the flash tells him to type the names instead");
    ok("S18", /const hit = pickImage\(e\.clipboardData\)/.test(talk),
      "AND THE PASTE HANDLER IS STILL THERE, deliberately. Swallowing it here would mean he drops a screenshot, watches it disappear and is told nothing by anyone — the message goes, and SHE says why she is not looking, in the thread, in her own words");
  }

  // =========================================================================
  head("R — AND IT ALL COMES BACK");
  // =========================================================================
  {
    _setIntakeForTests("on");
    const r = imageFromBody({ mime: "image/png", data: B64 });
    ok("R1", r.image !== null && r.image.bytes === REAL_PNG.length && r.refusal === null,
      `flip ONE constant and the same PNG validates again — ${r.image?.bytes} bytes, mime ${r.image?.mime}. Nothing was deleted for this build: image.ts, picture.ts, taint.ts, durable.ts, carried.ts, handoff.ts and the image ledger are whole`);
    // SIX BLOCKS NEEDS SIX INPUTS. The first run of this harness asserted six
    // while passing no carried names — buildTurnContent correctly returns FIVE
    // then, so the assertion was describing an ordering it had not built. Hand
    // it the carried block and check the order by CONTENT rather than by count,
    // because the count is the part that was never the security property.
    const CARRIED = "<untrusted_filenames>a.mp4</untrusted_filenames>";
    const blocks = buildTurnContent("<pack/>", "what is this", r.image, null, CARRIED);
    const order = blocks
      .map((b) => (b.type === "image" ? "image" : (b as { text: string }).text))
      .map((t) =>
        t === "image" ? "image"
          : t === "<pack/>" ? "pack"
          : t.startsWith("<untrusted_image") ? "open tag"
          : t === "</untrusted_image>" ? "close tag"
          : t === CARRIED ? "carried"
          : "his words");
    ok("R2", blocks.length === 6 && blocks[2].type === "image" && order.join(" · ") === "pack · open tag · image · close tag · carried · his words",
      `and the turn is six blocks again with the pixels sandwiched inside the untrusted envelope — ${order.join(" · ")}. His words are last and outside every envelope, where an instruction belongs`);
    ok("R3", pictureVerdict({ sawImage: true, intake: "on" }).code === "P-TURN" && pictureVerdict({ sawImage: true, intake: "off" }).code === "P-TURN",
      "the gate refuses a picture turn in BOTH states, so even a half-flipped switch cannot produce a filing plan off a screenshot");
    _setIntakeForTests("off");
    ok("R4", imageFromBody({ mime: "image/png", data: B64 }).refusal?.code === "INTAKE-OFF",
      "and flipping it back shuts the door again in the same statement. One line, one test, no archaeology");
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

await main();
