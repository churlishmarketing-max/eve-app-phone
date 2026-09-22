// Sync Brandon's OS v5 operating documents into the brain as a REFERENCE
// CORPUS — a shelf she looks things up on, not doctrine she carries.
//
//   node scripts/sync-corpus.mjs                      # rebuild corpus/MANIFEST.json from corpus/*.txt
//   node scripts/sync-corpus.mjs --from <dir>         # re-ingest the extracted text, then rebuild
//   node scripts/sync-corpus.mjs --dry                # classify + report, write nothing
//
// WHY THIS IS NOT A SKILL BUNDLE, even though it copies that script's
// discipline line for line. A skill is a SYSTEM PROMPT: sync-skills.mjs bundles
// SKILL.md so registry.ts can hand the whole thing to a worker as doctrine, and
// every byte of it rides that worker's context. These 17 documents are ~280 KB
// / ~70,000 tokens of business fact. Carried, they would be twenty times her
// whole doctrine on every turn. So the output shape is deliberately different:
// no registry row, no runner, no doctrine assembly. What boot loads is the
// INDEX (titles, one-line purposes, section headings and offsets); the prose
// stays on disk until corpus_read or corpus_search goes and gets a slice of it.
//
// WHAT IS COPIED FROM sync-skills.mjs, because it is the house rule that
// matters: CLASSIFICATION IS EXPLICIT. Every .txt found in the source must be
// named in DOCS below with its real title, its one-line purpose, and how it is
// sectioned. A file in neither DOCS nor SKIP aborts the sync — a new document
// is classified on purpose, never absorbed by default. The verdicts travel with
// the bundle in MANIFEST.json.
//
// SECTIONING IS MECHANICAL, NOT GUESSED. Every one of these documents marks its
// own sections with a `// ` line, in one of two shapes:
//   `// 04 · THE FORMAT`                  → ref "04"   (sectioning: "numbered")
//   `// PART A · SALES & PIPELINE · …`    → a GROUP, and the citable units
//                                           inside it are the SOP ids A1…E10
//                                           (sectioning: "sops")
// A `// ` line that parses as neither ABORTS, for the same reason an
// unclassified directory does: the plan cites these documents BY SECTION
// ("Show Bible §05, §09", "Q4 Cutover Plan §04"), so a section we silently
// failed to index is a citation she cannot make.
//
// REFRESH (Dec 18 is a scheduled revision point):
//   1. Extract each revised PDF to UTF-8 text, one .txt per document, keeping
//      the file names below. A renamed file is an abort, not a surprise.
//   2. node scripts/sync-corpus.mjs --from <that dir>
//   3. Read the report: char counts, section counts, and the ambient index size
//      in characters. If a document lost sections, the extraction broke.
//   4. npx tsx verify/corpus-harness.ts

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const brain = path.join(here, "..");
const OUT = path.join(brain, "corpus");
const MANIFEST = path.join(OUT, "MANIFEST.json");
const DRY = process.argv.includes("--dry");
const fromIdx = process.argv.indexOf("--from");
const FROM = fromIdx >= 0 ? process.argv[fromIdx + 1] : process.env.EVE_CORPUS_SOURCE || null;

// THE PER-READ CAP, stated here and carried into the manifest so the tool and
// this script cannot disagree about it.
//
// 8,000 CHARACTERS ≈ 2,000 TOKENS, and the number comes off the measured
// distribution rather than out of the air: of the 164 sections in the set the
// median is 1,164 chars and 162 arrive WHOLE under this cap. The two that do not
// are the Show Bible's question bank (11,256) and the full Justice League session
// in the Council Minutes (9,619), and those PAGE — page 1 says page 2 exists, so
// she can never lose the half she needed without being told.
//
// Why not higher: three reads in one turn is a normal way to answer a
// cross-document question, and 3 × 2,000 tokens is a cost she can carry. At
// 12,000 nothing in the set would page at all, which sounds tidier and is worse:
// the paging path would ship untested and the first long section he writes in the
// December revision would be the one that finds the bug.
const MAX_READ_CHARS = 8000;

// file name (as extracted) → the document's identity. `key` is what the tools
// address it by; `title` is what Brandon calls it out loud; `purpose` is the one
// line the model gets in a lookup; `short` is the 3–6 word version that rides
// the AMBIENT INDEX on every turn, and it is short because that line is the
// only part of this corpus anybody pays for unconditionally.
const DOCS = {
  "Churlish_OS_v5_000_START_HERE.txt": {
    key: "start-here",
    title: "START HERE",
    aliases: ["start here", "the start here", "index", "000"],
    short: "read first",
    purpose: "The cover sheet for the whole v5 set: what to read in what order, what the Sept 21 gate changed, and what is still Brandon's to decide.",
    sectioning: "numbered",
  },
  "Churlish_Media_Master_Plan_2026-2030_v5.txt": {
    key: "master-plan",
    title: "Master Plan V5",
    aliases: ["master plan", "master plan v5", "the plan", "the master plan"],
    short: "",
    purpose: "The company plan through 2030 — thesis, model, pricing, the ladder from stranger to $30K account, revenue, KPIs, ranked gaps, the Sept 21 → Dec 18 roadmap, and the RED-tier approval sheet.",
    sectioning: "numbered",
  },
  "Churlish_Media_Company_Handbook_v5.txt": {
    key: "company-handbook",
    title: "Company Handbook V5",
    aliases: ["handbook", "company handbook", "the handbook"],
    short: "",
    purpose: "The operating handbook — the method, the front door, structure, brands, the offer sheet, sales, the show, the machine, people, the scoreboard, the lock, and 2027–2030.",
    sectioning: "numbered",
  },
  "Churlish_Media_Book_of_SOPs_v5.txt": {
    key: "book-of-sops",
    title: "Book of SOPs V5",
    aliases: ["sops", "book of sops", "the sops", "sop"],
    short: "35 procedures, A1–E10",
    purpose: "The 35 standing procedures in five parts (sales, product delivery, retainer delivery, operations, the show), each with its owner, when it fires, its tools, and its done-when.",
    sectioning: "sops",
  },
  "Churlish_Offer_Ladder_Pricing_OS_Terminal.txt": {
    key: "offer-ladder",
    title: "Offer Ladder + Pricing",
    aliases: ["offer ladder", "the ladder", "pricing", "offer sheet"],
    short: "",
    purpose: "The offer ladder and price sheet by pillar — how a stranger becomes a $30K account, what each rung costs, and the non-negotiable pricing rules.",
    sectioning: "numbered",
  },
  "Churlish_Positioning_Document_OS_Terminal.txt": {
    key: "positioning",
    title: "Positioning Document",
    aliases: ["positioning", "the positioning doc", "positioning document"],
    short: "",
    purpose: "Who Churlish is for and who it is not, the enemy it names, the method claim it can defend, the message hierarchy, and the voice.",
    sectioning: "numbered",
  },
  "Churlish_Q4_Cutover_Plan_OS_Terminal.txt": {
    key: "q4-cutover-plan",
    title: "Q4 Cutover Plan",
    aliases: ["q4 cutover", "cutover plan", "q4 plan", "the cutover"],
    short: "the quarter",
    purpose: "The quarter, week by week — the collected-cash number, the twelve-week clock, the weekly floor, the gate's conditions, and how status is reported.",
    sectioning: "numbered",
  },
  "Churlish_HLP_Show_Bible_OS_Terminal.txt": {
    key: "show-bible",
    title: "HLP Show Bible",
    aliases: ["show bible", "the show bible", "hlp show bible", "bible"],
    short: "",
    purpose: "The show's source of truth — premise, the two audiences, the messaging system, the format, how a guest gets on, the guest matrix and mix rules, the question bank, the master video list, and the Q4 slate.",
    sectioning: "numbered",
  },
  "Churlish_HLP_Guest_Invitation_Kit_OS_Terminal.txt": {
    key: "guest-invitation-kit",
    title: "HLP Guest Invitation Kit",
    aliases: ["invitation kit", "guest invitation kit", "the invitation kit", "invitation sequence"],
    short: "",
    purpose: "Everything between a name on a list and a recorded episode — the rule of the thread, subject lines, the three touches, the replies, the pre-interview, logistics, recording day, and the tracker.",
    sectioning: "numbered",
  },
  "Churlish_HLP_Site_Build_Spec_OS_Terminal.txt": {
    key: "site-build-spec",
    title: "HLP Site Build Spec",
    aliases: ["site build spec", "site spec", "the site spec", "build spec"],
    short: "",
    purpose: "The capped scope, the exact copy, and the build prompt for the one-page High Level Pros site.",
    sectioning: "numbered",
  },
  "Churlish_Guest_Package_One-Pager_OS_Terminal.txt": {
    key: "guest-package-one-pager",
    title: "Guest Package One-Pager",
    aliases: ["guest package", "one-pager", "guest package one-pager", "the package"],
    short: "the $2,500 cut",
    purpose: "The guest-facing page for the paid package — pick the louder problem, what you get, how it goes, and the price.",
    sectioning: "numbered",
  },
  "Churlish_Diagnostic_Call_Script_OS_Terminal.txt": {
    key: "diagnostic-call-script",
    title: "Diagnostic Call Script",
    aliases: ["diagnostic script", "diagnostic call script", "the diagnostic call", "diagnostic"],
    short: "",
    purpose: "The Diagnostic sales call — where it sits in v5, the frame before dialling, the six-step spine, and the toolbelt.",
    sectioning: "numbered",
  },
  "Churlish_Debrief_Call_Script_OS_Terminal.txt": {
    key: "debrief-call-script",
    title: "Debrief Call Script",
    aliases: ["debrief script", "debrief call script", "the debrief call", "debrief"],
    short: "post-episode",
    purpose: "The call after a guest's episode is live — the frame, the runway, the six-step spine, the three cuts being sold, the four objections, and the handoff.",
    sectioning: "numbered",
  },
  "Churlish_Objection_Handling_OS_Terminal.txt": {
    key: "objection-handling",
    title: "Objection Handling",
    aliases: ["objection handling", "objections", "the objections"],
    short: "",
    purpose: "The doctrine and the scripted answers — seven for the Diagnostic, two for the invitation, four for the debrief, three for the cohort, and the mechanics after the answer.",
    sectioning: "numbered",
  },
  "Churlish_Ad_Templates_OS_Terminal.txt": {
    key: "ad-templates",
    title: "Ad Templates",
    aliases: ["ad templates", "the ad templates", "ads"],
    short: "",
    purpose: "What ads are for in v5, the six-beat DNA, script templates by length, show templates, the hook library, the CTA law, and the scoreboard a finished ad answers to.",
    sectioning: "numbered",
  },
  "Churlish_Contract_Invoice_Templates_OS_Terminal.txt": {
    key: "contract-invoice-templates",
    title: "Contract + Invoice Templates",
    aliases: ["contracts", "contract templates", "invoice templates", "contract and invoice templates", "the contracts"],
    short: "",
    purpose: "The paperwork shells — proposal, invoice, the 12-section service agreement, the guest release and on-air disclosure, the guest package agreement, the case-study addendum, and cohort enrollment terms.",
    sectioning: "numbered",
  },
  "Churlish_Council_Minutes_The_Gate_OS_Terminal.txt": {
    key: "council-minutes",
    title: "Council Minutes — The Gate",
    aliases: ["council minutes", "the gate", "the minutes", "minutes"],
    short: "the Sept 21 verdicts",
    purpose: "The Sept 21 gate record — the result, the Justice League session, the Suicide Squad moves, the JSA tribunal and fast passes, the YouTube Council, and what went on the register.",
    sectioning: "numbered",
  },
};

// file name → why it is NOT bundled. Empty today; it exists so a source file
// that should be left out has somewhere to be left out ON PURPOSE.
const SKIP = {};

// ---- helpers ----------------------------------------------------------------

// The extraction left a handful of HTML entities behind (&#x27; for an
// apostrophe, 20 of them across the set). They are decoded here rather than in
// the reader, so what is on disk is what she quotes. Nothing else about the text
// is touched: no reflowing, no de-duplication, no "cleanup" of his wording.
const ENTITIES = { "&#x27;": "'", "&#39;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&nbsp;": " " };

function normalise(raw) {
  let s = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (const [ent, ch] of Object.entries(ENTITIES)) s = s.split(ent).join(ch);
  const left = s.match(/&#?[a-zA-Z0-9]{2,8};/g);
  return { text: s.replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n"), leftover: left ? [...new Set(left)] : [] };
}

/** `// 04 · THE FORMAT` → { ref: "04", heading: "THE FORMAT" }; PART lines → group. */
function parseHeading(line) {
  const body = line.replace(/^\s*\/\/\s*/, "").replace(/\s+$/, "");
  const part = body.match(/^PART\s+([A-Z])\s*·\s*(.+)$/);
  if (part) return { kind: "group", ref: `Part ${part[1]}`, heading: part[2].trim() };
  const num = body.match(/^(\d{1,2})\s*·\s*(.+)$/);
  if (num) return { kind: "section", ref: num[1].padStart(2, "0"), heading: num[2].trim() };
  return null;
}

/**
 * ` A7 The debrief call NEW BRANDON ` → { ref: "A7", heading: "The debrief call NEW BRANDON" }
 *
 * THE OWNER TAG IS KEPT, VERBATIM. An earlier pass stripped the trailing
 * ALL-CAPS owner run and it was wrong twice out of thirty-five: it ate the "QA"
 * in "Brand & voice QA" and it left half of "NEW CYBORG BUILDS · AD-DIAGNOSTIC
 * JUDGES" behind. There is no rule that separates a capitalised word in his
 * title from a capitalised owner name without guessing, and the owner is
 * information he wants anyway ("who runs A7?"). So the heading is the line as he
 * wrote it, and nothing here invents or deletes a word of it.
 */
function parseSop(line) {
  const m = line.match(/^\s*([A-E]\d{1,2})\s+(\S.*?)\s*$/);
  if (!m || line.length > 160) return null;
  return { ref: m[1], heading: m[2].trim() };
}

function charIndexOfLines(text) {
  const lines = text.split("\n");
  const at = [];
  let n = 0;
  for (const l of lines) {
    at.push(n);
    n += l.length + 1;
  }
  return { lines, at };
}

function sectionsFor(file, text, sectioning) {
  const { lines, at } = charIndexOfLines(text);
  const marks = []; // { ref, heading, group?, start }
  let group = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line)) {
      const h = parseHeading(line);
      if (!h) throw new Error(`${file}:${i + 1} — unparseable section marker "${line.trim()}". Add its shape to parseHeading() on purpose; do not let it be skipped.`);
      if (h.kind === "group") {
        if (sectioning !== "sops") throw new Error(`${file}:${i + 1} — a PART marker in a "numbered" document. Re-classify it.`);
        group = `${h.ref} · ${h.heading}`;
        continue;
      }
      if (sectioning !== "numbered") throw new Error(`${file}:${i + 1} — a numbered marker in a "sops" document. Re-classify it.`);
      marks.push({ ref: h.ref, heading: h.heading, start: at[i] });
      continue;
    }
    if (sectioning === "sops") {
      const s = parseSop(line);
      if (s) marks.push({ ref: s.ref, heading: s.heading, group, start: at[i] });
    }
  }
  if (!marks.length) throw new Error(`${file} — no sections found. The extraction is broken or the document changed shape.`);
  const head = { ref: "head", heading: "MASTHEAD", start: 0, end: marks[0].start };
  const out = marks.map((m, i) => ({ ...m, end: i + 1 < marks.length ? marks[i + 1].start : text.length }));
  return [head, ...out].map((s) => ({
    ref: s.ref,
    heading: s.heading,
    ...(s.group ? { group: s.group } : {}),
    start: s.start,
    end: s.end,
    chars: s.end - s.start,
  }));
}

// ---- scan -------------------------------------------------------------------

if (FROM && !existsSync(FROM)) {
  console.error(`[sync-corpus] --from source missing: ${FROM}`);
  process.exit(2);
}
const scanDir = FROM ?? OUT;
if (!existsSync(scanDir)) {
  console.error(`[sync-corpus] nothing to scan: ${scanDir} does not exist. Pass --from <dir of extracted .txt>.`);
  process.exit(2);
}

// When re-ingesting, files are named as extracted. When rebuilding in place they
// are named <key>.txt, so the classification is looked up both ways.
const byFile = new Map(Object.entries(DOCS));
const byKeyFile = new Map(Object.entries(DOCS).map(([f, d]) => [`${d.key}.txt`, [f, d]]));

const found = [];
const unclassified = [];
for (const ent of readdirSync(scanDir, { withFileTypes: true })) {
  if (!ent.isFile() || !ent.name.toLowerCase().endsWith(".txt")) continue;
  if (ent.name in SKIP) continue;
  if (byFile.has(ent.name)) found.push({ file: ent.name, sourceName: ent.name, doc: byFile.get(ent.name) });
  else if (byKeyFile.has(ent.name)) {
    const [sourceName, doc] = byKeyFile.get(ent.name);
    found.push({ file: ent.name, sourceName, doc });
  } else unclassified.push(ent.name);
}
if (unclassified.length) {
  console.error(`[sync-corpus] UNCLASSIFIED documents (add to DOCS with a title, purpose and sectioning, or to SKIP with a reason): ${unclassified.join(", ")}`);
  process.exit(2);
}
const missing = Object.entries(DOCS).filter(([f, d]) => !found.some((x) => x.sourceName === f || x.file === `${d.key}.txt`));
if (missing.length) {
  console.error(`[sync-corpus] classified but NOT FOUND in ${scanDir}: ${missing.map(([f]) => f).join(", ")}`);
  process.exit(2);
}

// ---- build ------------------------------------------------------------------

const docs = [];
const report = [];
const leftovers = [];
for (const { file, sourceName, doc } of found.sort((a, b) => a.doc.key.localeCompare(b.doc.key))) {
  const { text, leftover } = normalise(readFileSync(path.join(scanDir, file), "utf8"));
  if (leftover.length) leftovers.push(`${doc.key}: ${leftover.join(" ")}`);
  const sections = sectionsFor(doc.key, text, doc.sectioning);
  if (!DRY) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, `${doc.key}.txt`), text, "utf8");
  }
  docs.push({
    key: doc.key,
    title: doc.title,
    aliases: doc.aliases,
    short: doc.short,
    purpose: doc.purpose,
    file: `${doc.key}.txt`,
    sourceName,
    sectioning: doc.sectioning,
    chars: text.length,
    sections,
  });
  const over = sections.filter((s) => s.chars > MAX_READ_CHARS).map((s) => s.ref);
  report.push(
    `${doc.key.padEnd(26)} ${String(Math.round(text.length / 1024)).padStart(4)} KB  sections=${String(sections.length).padStart(3)}` +
      (over.length ? `  PAGES: §${over.join(" §")}` : ""),
  );
}

// THE AMBIENT INDEX, built here so the number is measured at build time and
// travels in the manifest: if a future document makes this line fat, the report
// says so before it ever rides a turn.
// A `short` is omitted where the title already says it (Positioning Document,
// Ad Templates) — every character here is paid for on every turn.
const indexLine =
  `His OS v5 documents (Sept 21), on the shelf — look up, never recall: corpus_read a §, corpus_search a ` +
  `passage. Cite the document + §; if they don't cover it, say so. ` +
  docs.map((d) => (d.short ? `${d.title} (${d.short})` : d.title)).join(" · ") +
  `.`;

const manifest = {
  generatedAt: new Date().toISOString(),
  generator: "scripts/sync-corpus.mjs",
  source: scanDir,
  set: "Churlish OS v5 — Sept 21 2026 High Level Pros pivot",
  maxReadChars: MAX_READ_CHARS,
  indexLine,
  indexChars: indexLine.length,
  docs,
  skipped: Object.entries(SKIP).map(([file, reason]) => ({ file, reason })),
};

if (!DRY) {
  mkdirSync(OUT, { recursive: true });
  const keep = new Set([...docs.map((d) => d.file), "MANIFEST.json"]);
  const foreign = [];
  for (const ent of readdirSync(OUT, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    if (keep.has(ent.name)) continue;
    if (ent.name.toLowerCase().endsWith(".txt")) {
      // A .txt this build did not produce is a document that was retired or
      // renamed since the last sync — ours to clear.
      rmSync(path.join(OUT, ent.name), { force: true });
      console.log(`[sync-corpus] removed stale document ${ent.name}`);
    } else {
      // ANYTHING ELSE IS NOT OURS AND IS NOT DELETED. Said out loud rather than
      // ignored, because a second set of documents sharing this directory is
      // exactly the kind of thing that gets committed by accident: the manifest
      // indexes only the files listed in it, so a stranger in here is invisible
      // to her and invisible to the next person reading the folder.
      foreign.push(ent.name);
    }
  }
  if (foreign.length) {
    console.warn(`[sync-corpus] ${foreign.length} file(s) in corpus/ are NOT part of this bundle and were LEFT ALONE — they are in nobody's manifest and nothing reads them: ${foreign.join(", ")}`);
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

console.log(report.join("\n"));
if (leftovers.length) console.warn(`[sync-corpus] undecoded entities still present (add them to ENTITIES): ${leftovers.join(" | ")}`);
console.log(
  `\n${docs.length} documents, ${docs.reduce((n, d) => n + d.chars, 0).toLocaleString()} chars, ` +
    `${docs.reduce((n, d) => n + d.sections.length, 0)} citable sections. ` +
    `Ambient index: ${indexLine.length} chars. Per-read cap: ${MAX_READ_CHARS} chars.` +
    (DRY ? " (dry run — nothing written)" : ` → ${MANIFEST}`),
);
