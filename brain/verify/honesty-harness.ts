// Brain-side proof for AUDIT 3's THREE CORE-PATH DEFECTS, and for AUDIT 4's
// verdict on the fix. Pure, offline, no env, no network, no DB, no model call.
//
//   cd C:\dev\eve\brain && npx tsx verify/honesty-harness.ts
//
// NO PICTURE IS INVOLVED IN ANY OF THESE. Every one is on the plain typed-words
// filing path — the one already deployed, and the one he is about to point at a
// real folder.
//
//   C1  SHE ANNOUNCED CARDS THAT DID NOT EXIST. Two turns whose tools were
//       desk_scan, desk_scan and nothing else ended "Approve and they're filed."
//       and "This goes to your approve card once you confirm." desk_file_plan
//       was never called. No confirm frame was ever emitted. There was no card.
//   C2  THE MOVE PATH WAS BROKEN. Six turns handed `toRel` in as a DIRECTORY and
//       died on the extension rule — which also means G-EXT was standing in
//       front of the real guards, so two would-be THROUGHs were stopped by a
//       coincidence rather than by a defence.
//   C3  WHEN G-EXT FIRED SHE INVENTED A DIAGNOSIS AND BLAMED HIS DISK.
//
// AUDIT 4 THREW OUT THE FIRST FIX FOR C1 AND HALF THE FIX FOR C3.
//
//   W1  The card-claim KEYWORD DETECTOR lost 11 out of 11 to paraphrase, and a
//       leading modal disarmed even a listed phrase. Deleted. Replaced by the
//       card count on his deck — ground truth beside the conversation, proved
//       on the DESKTOP side (verify/desk-injection-harness.mjs, CARD-* and the
//       deck PNG), because that is where the truth is now shown.
//   W2  The invented-diagnosis detector missed 8 of 10 paraphrases AND its
//       correction promised a check it did not run ("nothing was found …
//       missing", with no term for missing anywhere in the list). Deleted, with
//       nothing asserting in its place: the refusal text is self-explanatory
//       and section HON.C proves the true reason is the easy one to say.
//
// HON.E below is what is left of the two detectors: a proof that they are GONE
// and that nothing in this module reads her prose at all.
//
// Every deny has an allow twin. A checker that corrects every answer is not a
// checker, and a validator that refuses every plan also passes a suite of
// refusals.

import {
  cardLicence,
  cardReceipt,
  renderPlanRefusal,
  turnLedgerLine,
  NO_DIAGNOSIS,
} from "../src/honesty.js";
import * as honestyModule from "../src/honesty.js";
import { composeToRel, deskFromBody, validatePlan, type DeskPack } from "../src/desk.js";
import { buildConnectorServer } from "../src/connectors.js";
import type { PendingConfirm } from "../src/confirm.js";

let pass = 0;
let fail = 0;
const show: string[] = [];

function ok(id: string, cond: boolean, detail: string) {
  if (cond) {
    pass += 1;
    show.push(`  ${id.padEnd(10)} PASS  ${detail}`);
  } else {
    fail += 1;
    show.push(`  ${id.padEnd(10)} ****FAIL****  ${detail}`);
  }
}
function loud(id: string, detail: string) {
  show.push(`  ${id.padEnd(10)}       ${detail}`);
}
function flush(): void {
  console.log(show.splice(0).join("\n"));
}

// ---------------------------------------------------------------------------
// A fixture desk: two video clips and a README with no extension at all, so the
// composition rules can be proved in both directions on the same pack.
// ---------------------------------------------------------------------------
const ENTRIES = [
  { i: 1, r: "downloads", d: "GE dump", n: "C9452.MP4", kb: 900_000, ageD: 2, cls: "video", st: "921600000:1756000000000", f: "" },
  { i: 2, r: "downloads", d: "GE dump", n: "C9453.MP4", kb: 800_000, ageD: 2, cls: "video", st: "819200000:1756000000000", f: "" },
  { i: 3, r: "downloads", d: "GE dump", n: "README", kb: 4, ageD: 2, cls: "document", st: "4096:1756000000000", f: "" },
];
const RAW = {
  protocol: 1,
  deskId: "desk-aaaa-bbbb",
  at: new Date().toISOString(),
  attrSweepOk: true,
  limits: { maxBatch: 50, maxScanRows: 60, maxScanCalls: 4, maxIndex: 1200 },
  census: {
    roots: ["downloads", "projects"].map((label) => ({
      label,
      files: 3, bytes: 1_740_804_096, dirs: 1, synced: false, dryRun: false,
      arrivedToday: 0, olderThan90d: 0, byClass: { video: 2, document: 1 },
      bytesByClass: { video: 1_740_800_000, document: 4096 },
      hiddenByRule: 0, withheldAsInstruction: 0, unsettled: 0, indexed: 3, coverage: 1,
      trash: { files: 0, bytes: 0, freeOnVolume: 500_000_000_000 },
    })),
  },
  index: { rev: "9c41e0a2", truncated: false, omitted: 0, entries: ENTRIES },
  lastBatches: [],
  moves: [],
};
const PACK = deskFromBody(structuredClone(RAW)) as DeskPack;

type ToolReply = { content: { type: string; text?: string }[]; isError?: boolean };
type Registered = { _registeredTools: Record<string, { handler: (a: unknown, e: unknown) => Promise<ToolReply> }> };
function toolOn(server: { instance: unknown }, name: string) {
  const entry = (server.instance as Registered)._registeredTools[name];
  if (!entry || typeof entry.handler !== "function") throw new Error(`${name} is not registered — the tool list moved`);
  return (args: Record<string, unknown>) => entry.handler(args, {});
}
const say = (r: ToolReply): string => r.content[0]?.text ?? "";

async function main(): Promise<void> {
  console.log("=== HON.A — C2: A FOLDER HANDED IN AS A DESTINATION IS A FOLDER ===");
  {
    // The bug, in one line. This is the shape audit 3 counted SIX times.
    const a = composeToRel("GE dump/C9452.MP4", "Footage");
    ok("A1", a.composed && a.toRel === "Footage/C9452.MP4", `a bare folder keeps the file's own name => "${a.toRel}"`);

    const b = composeToRel("GE dump/C9452.MP4", "GE Outdoors/Footage/");
    ok("A2", b.composed && b.toRel === "GE Outdoors/Footage/C9452.MP4", `a trailing slash is unambiguous and always composes => "${b.toRel}"`);

    const c = composeToRel("GE dump/C9452.MP4", "GE Outdoors\\Footage\\");
    ok("A3", c.composed && c.toRel === "GE Outdoors\\Footage/C9452.MP4", `and so is a trailing BACKslash \u2014 he is on Windows => "${c.toRel}"`);

    const d = composeToRel("GE dump/C9452.MP4", "GE Outdoors/Footage/C9452.MP4");
    ok("A4", !d.composed && d.toRel === "GE Outdoors/Footage/C9452.MP4",
      "ALLOW TWIN: a destination that already names the file is left EXACTLY as given \u2014 `reg3`'s shape does not change");

    const e = composeToRel("GE dump/C9452.MP4", "Footage/GE_260901_01.MP4");
    ok("A5", !e.composed && e.toRel === "Footage/GE_260901_01.MP4",
      "ALLOW TWIN: a real rename is still a real rename \u2014 she can still choose a new name");

    const f = composeToRel("GE dump/C9452.MP4", "Footage/C9452.mov");
    ok("A6", !f.composed, "a DIFFERENT extension is never composed away \u2014 it goes on to meet G-EXT (A9)");

    const g = composeToRel("GE dump/README", "NOTES");
    ok("A7", !g.composed && g.toRel === "NOTES",
      "a source with NO extension is genuinely ambiguous, so NOTHING is composed and the old rename behaviour stands exactly");

    const h = composeToRel("GE dump/README", "archive/");
    ok("A8", h.composed && h.toRel === "archive/README", "\u2026and the slash is how he says he meant the folder");

    const i = composeToRel("GE dump/C9452.MP4", "");
    ok("A9", !i.composed && i.toRel === "",
      "AN EMPTY DESTINATION IS NEVER COMPOSED. P2 \u2014 a bare root grounding a mass move into a root's top level \u2014 does not come back in through here; it stays a refusal (B12)");

    const j = composeToRel("GE dump/C9452.MP4", "   ");
    ok("A10", !j.composed, "and neither is whitespace");
  }
  flush();

  console.log("\n=== HON.B — C2 END TO END: the plan that used to die now runs, and G-EXT still bites ===");
  {
    // THE EXACT FAILING TURN. "move the four C files into projects Footage".
    const v = validatePlan(PACK, "move", [
      { i: 1, toRoot: "projects", toRel: "Footage" },
      { i: 2, toRoot: "projects", toRel: "Footage" },
    ], "file the GE clips");
    ok("B1", v.ok, `the six-times-failing shape now VALIDATES instead of dying on the extension rule (${v.rule || "no refusal"})`);
    ok("B2", v.ok && v.moves[0].toRel === "Footage/C9452.MP4" && v.moves[1].toRel === "Footage/C9453.MP4",
      `both rows keep their own filenames => ${v.ok ? v.moves.map((m) => m.toRel).join(", ") : "\u2014"}`);
    ok("B3", v.composedNames === 2, `and the verdict SAYS it composed them, so her own tool result can tell him => composedNames=${v.composedNames}`);
    ok("B4", v.ok && v.distinctDests === 1 && v.newFolders.length === 1,
      `the card's above-the-fold facts are computed off the composed path => newFolders=${JSON.stringify(v.newFolders)}`);

    // ALLOW TWIN, and the one that matters most: G-EXT must still refuse a
    // GENUINE extension change. This is the assertion that stops the ergonomics
    // fix from becoming a hole.
    const exe = validatePlan(PACK, "rename", [{ i: 1, toRoot: "downloads", toRel: "GE dump/C9452.exe" }], "x");
    ok("B5", !exe.ok && exe.rule === "G-EXT", `.MP4 -> .exe is STILL refused => ${exe.rule}`);
    const mov = validatePlan(PACK, "move", [{ i: 1, toRoot: "projects", toRel: "Footage/C9452.mov" }], "x");
    ok("B6", !mov.ok && mov.rule === "G-EXT", `.MP4 -> .mov is STILL refused => ${mov.rule}`);
    const strip = validatePlan(PACK, "rename", [{ i: 3, toRoot: "downloads", toRel: "GE dump/README.md" }], "x");
    ok("B7", !strip.ok && strip.rule === "G-EXT", `and so is ADDING one to an extensionless file => ${strip.rule}`);

    // CONTAINMENT SURVIVES COMPOSITION. Composition runs BEFORE checkRel, so
    // every segment of the composed path is still walked. If it did not, this
    // fix would have opened the one door the physical layer exists to hold.
    const up = validatePlan(PACK, "move", [{ i: 1, toRoot: "projects", toRel: "../../Windows/System32" }], "x");
    ok("B8", !up.ok && up.rule === "G-P3", `traversal is refused THROUGH the composition => ${up.rule}: ${up.reason}`);
    const drive = validatePlan(PACK, "move", [{ i: 1, toRoot: "projects", toRel: "C:/Windows" }], "x");
    ok("B9", !drive.ok && drive.rule === "G-P2", `a drive letter is refused THROUGH the composition => ${drive.rule}`);
    const unc = validatePlan(PACK, "move", [{ i: 1, toRoot: "projects", toRel: "\\\\server\\share" }], "x");
    ok("B10", !unc.ok && (unc.rule === "G-P2" || unc.rule === "G-P4"), `and so is a UNC path => ${unc.rule}`);
    const dev = validatePlan(PACK, "move", [{ i: 1, toRoot: "projects", toRel: "Footage/COM1" }], "x");
    ok("B11", !dev.ok && dev.rule === "G-P5", `a reserved device name in the composed path is refused => ${dev.rule}`);

    const empty = validatePlan(PACK, "move", [{ i: 1, toRoot: "projects", toRel: "" }], "x");
    ok("B12", !empty.ok && empty.rule === "G-P2", `AN EMPTY DESTINATION IS STILL A REFUSAL (P2 stays dead) => ${empty.rule}: ${empty.reason}`);

    const staged = validatePlan(PACK, "stage", [{ i: 1, toRoot: "projects", toRel: "Footage" }], "x");
    ok("B13", staged.ok && staged.composedNames === 0 && staged.moves[0].toRel === "GE dump/C9452.MP4",
      "a STAGE is never composed and never aimed \u2014 it still carries its own original path into his trash");
  }
  flush();

  console.log("\n=== HON.C — C3: the refusal is quotable, and it forbids the diagnosis by name ===");
  {
    const g = validatePlan(PACK, "rename", [{ i: 1, toRoot: "downloads", toRel: "GE dump/C9452.exe" }], "x");
    ok("C1", /C9452\.MP4/.test(g.reason) && /C9452\.exe/.test(g.reason), `G-EXT now names BOTH files, so the true sentence is the easy one => ${g.reason}`);
    ok("C2", /Nothing is wrong with that file/i.test(g.reason), "\u2026and says out loud that the FILE is fine and the PLAN is not");
    ok("C3", /If a FOLDER was meant/.test(g.reason), "\u2026and points at the shape she should have used instead");

    const r = renderPlanRefusal(g.rule, g.reason);
    ok("C4", r.includes(g.reason) && r.includes(`(${g.rule})`), "the rendered refusal carries the reason AND the rule id verbatim");
    ok("C5", /NO CARD WAS RAISED/.test(r), "\u2026says plainly that no card was raised, so a refusal can never be narrated as a queue");
    for (const [id, word] of [
      ["C6", "corrupted"], ["C7", "malformed"], ["C8", "damaged"],
      ["C9", "tool-layer"], ["C10", "go and look at in a folder"],
    ] as const) {
      ok(id, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(NO_DIAGNOSIS),
        `the no-diagnosis clause forbids "${word}" BY NAME \u2014 "be honest" did not stop it and this does`);
    }
    loud("C11", `=> ${NO_DIAGNOSIS.slice(0, 150)}\u2026`);

    // THE DISK-FAULT CENSUS. The claim "the desk never reports a fault on his
    // files" has to be PROVED against the shipped strings, not asserted, or the
    // correction in honesty.ts is only as true as somebody's memory.
    const FAULT = /\b(corrupt|malformed|damaged|invalid file|broken file|missing file|tool[- ]layer)\b/i;
    const table: { name: string; v: ReturnType<typeof validatePlan> }[] = [
      { name: "G-EXT", v: validatePlan(PACK, "rename", [{ i: 1, toRoot: "downloads", toRel: "GE dump/C9452.exe" }], "x") },
      { name: "G-P1 unknown id", v: validatePlan(PACK, "move", [{ i: 99, toRoot: "projects", toRel: "Footage/" }], "x") },
      { name: "G-P1 unknown root", v: validatePlan(PACK, "move", [{ i: 1, toRoot: "nowhere", toRel: "Footage/" }], "x") },
      { name: "G-P2 empty", v: validatePlan(PACK, "move", [{ i: 1, toRoot: "projects", toRel: "" }], "x") },
      { name: "G-P3 traversal", v: validatePlan(PACK, "move", [{ i: 1, toRoot: "projects", toRel: "../x" }], "x") },
      { name: "G-P5 reserved", v: validatePlan(PACK, "move", [{ i: 1, toRoot: "projects", toRel: "Footage/COM1" }], "x") },
      { name: "G-D8 same place", v: validatePlan(PACK, "move", [{ i: 1, toRoot: "downloads", toRel: "GE dump/C9452.MP4" }], "x") },
      { name: "G-D7 collision", v: validatePlan(PACK, "move", [
        { i: 1, toRoot: "projects", toRel: "Footage/same.MP4" },
        { i: 2, toRoot: "projects", toRel: "Footage/SAME.mp4" },
      ], "x") },
      { name: "G-C5 empty plan", v: validatePlan(PACK, "move", [], "x") },
      { name: "G-D1 bad op", v: validatePlan(PACK, "delete" as never, [{ i: 1, toRoot: "projects", toRel: "Footage/" }], "x") },
    ];
    const dirty = table.filter((t) => t.v.ok || FAULT.test(t.v.reason));
    ok("C12", dirty.length === 0,
      `DISK-FAULT CENSUS: all ${table.length} shipped refusal reasons refuse, and NOT ONE of them says a file is corrupt, malformed, damaged or missing` +
        (dirty.length ? ` \u2014 offenders: ${dirty.map((d) => d.name).join(", ")}` : ""));
    for (const t of table.slice(0, 3)) loud("C13", `=> ${t.v.rule.padEnd(6)} ${t.v.reason.slice(0, 110)}\u2026`);
  }
  flush();

  console.log("\n=== HON.D — C1: the receipt is the only licence, and only a real card mints one ===");
  {
    const id = "6f1f2b7e-1111-2222-3333-444455556666";
    ok("D1", cardReceipt(id).includes(id), `a receipt carries the confirm id \u2014 a uuid she has no other way to see => "${cardReceipt(id)}"`);
    const lic = cardLicence(id);
    ok("D2", lic.includes(cardReceipt(id)), "the licence is built ON the receipt, so there is no licence without a card");
    for (const [tid, phrase] of [
      ["D3", "queued"], ["D4", "approve card"], ["D5", "card is up"],
      ["D6", "approve and they're filed"], ["D7", "waiting"],
    ] as const) {
      ok(tid, lic.toLowerCase().includes(phrase), `the licence names "${phrase}" explicitly \u2014 the permitted words arrive WITH the thing that makes them true`);
    }
  }
  flush();

  console.log("\n=== HON.E - W1 + W2: THE TWO DETECTORS ARE GONE, AND NOTHING HERE READS HER PROSE ===");
  {
    // Audit 4 threw both keyword detectors out. This section is the proof they
    // did not quietly come back as a longer list, which is the failure mode the
    // image audits named and the one W1 forbids by name.
    const exported = Object.keys(honestyModule).sort();
    const DEAD = ["auditTurn", "cardClaims", "diskFaultClaims", "PHANTOM_CARD_CORRECTION", "INVENTED_FAULT_CORRECTION"];
    DEAD.forEach((name, i) => {
      ok(`E${i + 1}`, !exported.includes(name), `"${name}" is DELETED from src/honesty.ts \u2014 not narrowed, not renamed, gone`);
    });
    ok("E6", exported.join(",") === "NO_DIAGNOSIS,cardLicence,cardReceipt,renderPlanRefusal,turnLedgerLine",
      `and the module's whole surface is now one string and four builders => ${exported.join(", ")}`);

    // THE SENTENCES THAT BEAT THE OLD LIST, 11 out of 11, plus the leading modal
    // that disarmed a LISTED phrase. There is nothing left in this module they
    // could be handed \u2014 which IS the fix. The answer to them is a number on his
    // deck, not a longer regex in here.
    const BROKE_IT = [
      "I've put that in front of you for approval",
      "It's on your desk now, ready for the green light",
      "That batch is sitting there for you to sign off",
      "The plan is staged for your OK",
      "You can see it's queued for your approve",
    ];
    const graders = Object.entries(honestyModule).filter(
      ([name, v]) =>
        typeof v === "function" &&
        !["cardReceipt", "cardLicence", "renderPlanRefusal", "turnLedgerLine"].includes(name),
    );
    ok("E7", graders.length === 0,
      "NO EXPORT OF THIS MODULE IS EVER HANDED HER ANSWER \u2014 the four functions left take a uuid, a rule id, " +
        "a reason and two integers, and not one of them takes prose");
    loud("E8", `=> e.g. "${BROKE_IT[0]}" / "${BROKE_IT[4]}" \u2014 both walked past the old CLAIM list; neither has a detector left to beat`);

    // W2's rule turned on this module's own strings: the claim in the output
    // must be EXACTLY the claim the code can prove. The deleted correction said
    // "Nothing was found corrupted, malformed or missing" while nothing had been
    // looked for, and the list it was defending had no term for missing at all.
    const rendered = [
      ...Object.values(honestyModule).filter((v): v is string => typeof v === "string"),
      renderPlanRefusal("G-EXT", "that plan changes an extension"),
      cardLicence("6f1f2b7e-1111-2222-3333-444455556666"),
      turnLedgerLine("c", { cardsRaised: 0, deskRefusals: 0 }),
    ];
    ok("E9", rendered.every((s) => !/nothing was (found|scanned|checked|detected)/i.test(s)),
      "W2: not one shipped string claims a search was run across his files \u2014 the correction that claimed it is deleted");

    // The only survivor of the count: a log line, exact and complete.
    const line = turnLedgerLine("conv-9", { cardsRaised: 0, deskRefusals: 2 });
    ok("E10", line === "[turn] conv-9 cardsRaised=0 deskRefusals=2", `the turn ledger is a LOG LINE => ${line}`);
    ok("E11", !/correction|queued|corrupt/i.test(line),
      "\u2026it corrects nothing, promises nothing, and never reaches his screen \u2014 W1's \"a log line, not a message\"");
  }
  flush();

  console.log("\n=== HON.F — C1 END TO END: a turn that never calls desk_file_plan cannot end with a card ===");
  {
    // THE WHOLE POINT, driven through the REAL server the way the SDK does it.
    //
    // TURN ONE reproduces the observed failure exactly: desk_scan, desk_scan,
    // and nothing else. Not one confirm frame is emitted \u2014 so the number the
    // deck shows him beside this conversation is ZERO, and the sentence she
    // ended on ("Approve and they're filed.") is contradicted by the screen it
    // is printed on. Nothing reads that sentence. Nothing has to.
    let cards = 0;
    let refusals = 0;
    const scanServer = buildConnectorServer(
      (c) => { if (c.kind === "file_batch") cards += 1; },
      PACK, null, "desktop", {}, {},
      { noteRefusal: () => { refusals += 1; } },
    );
    const scan = toolOn(scanServer, "desk_scan");
    await scan({ root: "downloads", view: "clusters", sort: "newest", max: 40 });
    await scan({ root: "downloads", view: "files", sort: "newest", max: 40 });
    ok("F1", cards === 0, `two desk_scans and nothing else raise ZERO cards => cardsRaised=${cards}`);
    ok("F2", turnLedgerLine("conv-c1", { cardsRaised: cards, deskRefusals: refusals }) === "[turn] conv-c1 cardsRaised=0 deskRefusals=0",
      "and the count goes to the LOG, not into her answer \u2014 W1: a server-side signal is a log line, never a message injected " +
      "into what she said. What he SEES is the deck's own card counter reading zero.");

    // TURN TWO is the allow twin: she calls the tool, a card really is raised,
    // and the tool result carries the receipt for that card's id. The deck's
    // counter goes to 1 in the same instant, so the same words she was caught
    // saying on turn one are simply TRUE here \u2014 and nothing had to decide that
    // by reading them.
    let raised: PendingConfirm | null = null;
    let cards2 = 0;
    const planServer = buildConnectorServer(
      (c) => { raised = c; if (c.kind === "file_batch") cards2 += 1; },
      PACK, null, "desktop", {},
      { typedMessage: "move the four C files into projects Footage" },
      { noteRefusal: () => {} },
    );
    const reply = say(await toolOn(planServer, "desk_file_plan")({
      intent: "file the GE clips",
      op: "move",
      // THE BROKEN SHAPE. A directory, exactly as she kept sending it.
      moves: [{ i: 1, toRoot: "projects", toRel: "Footage" }, { i: 2, toRoot: "projects", toRel: "Footage" }],
    }));
    const card = raised as PendingConfirm | null;
    ok("F3", card !== null && cards2 === 1, `the SIX-TIMES-FAILING SHAPE now raises a real card => kind=${card?.kind}`);
    ok("F4", reply.includes(cardReceipt(card?.id ?? "\u2014")), `and the tool result carries a receipt for THAT card's id => "${cardReceipt(card?.id ?? "")}"`);
    const moves = (card?.payload as { moves?: { toRel: string }[] } | undefined)?.moves ?? [];
    ok("F5", moves.length === 2 && moves[0].toRel === "Footage/C9452.MP4",
      `the HASHED payload \u2014 the thing his desktop re-hashes and executes \u2014 carries the composed path => ${moves.map((m) => m.toRel).join(", ")}`);
    ok("F6", /You gave a FOLDER rather than a full path for 2 of these/.test(reply) && /Nothing was renamed/.test(reply),
      "and she is told, in the tool's own reply, that she handed in a folder and that the names were kept — so her sentence and the card cannot disagree");
    ok("F7", cards2 === 1 && turnLedgerLine("conv-ok", { cardsRaised: cards2, deskRefusals: 0 }).includes("cardsRaised=1"),
      "ALLOW TWIN: a real card was raised, so the number beside the conversation is 1 and \"queued for your approve\" is " +
      "a true sentence with a card behind it. The feature works; only the empty claim has nowhere to hide.");

    // TURN THREE: a genuine extension change. The refusal she gets back IS the
    // whole answer to C3 now (W2): the true reason is named, the rule id is on
    // it, and the diagnoses she reached for instead are forbidden inside the
    // text she is reading. No detector runs over her reply afterwards, and no
    // correction promises a check that was never made.
    let refusals3 = 0;
    const extServer = buildConnectorServer(
      () => {}, PACK, null, "desktop", {}, {},
      { noteRefusal: () => { refusals3 += 1; } },
    );
    const refused = say(await toolOn(extServer, "desk_file_plan")({
      intent: "x", op: "rename", moves: [{ i: 1, toRoot: "downloads", toRel: "GE dump/C9452.exe" }],
    }));
    ok("F8", refusals3 === 1, "a plan refusal is COUNTED \u2014 the count is logged and nothing else is done with it");
    ok("F9", /G-EXT/.test(refused) && /NO CARD WAS RAISED/.test(refused) && /corrupted/i.test(refused),
      "the refusal she reads names the rule, says no card was raised, and forbids the diagnosis by name");
    ok("F10", /malformed/i.test(refused) && /damaged/i.test(refused) && /missing/i.test(refused) && /tool outage/i.test(refused),
      "W2 \u2014 and it forbids MISSING and a TOOL OUTAGE too, which the deleted DISK_FAULT list never had a term for. " +
      "The forbidding happens where she is reading, not in a regex over what she wrote afterwards.");
    loud("F11", `=> ${refused.slice(0, 180)}\u2026`);
  }
  flush();

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

void main();
