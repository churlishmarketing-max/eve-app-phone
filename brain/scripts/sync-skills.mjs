// Sync Brandon's on-disk skills into the brain as dispatchable "skill" units.
//
//   node scripts/sync-skills.mjs            # rebuild skills/<key>/ + skills/MANIFEST.json
//   node scripts/sync-skills.mjs --dry      # classify + report, write nothing
//
// A SKILL.md is a system prompt: text in, text out. That is exactly the shape
// the registry's SDK-subagent workers already run as (registry.ts `worker`
// kind), so a text-only skill becomes runnable by becoming a manifest row that
// loads its SKILL.md (+ text references) as doctrine. The registry merges
// MANIFEST.json with its code rows at boot; code rows win on conflict.
//
// CLASSIFICATION IS EXPLICIT. Every skill directory found in a source must be
// named in RUNNABLE or EXCLUDED below, with a reason. A directory in neither
// aborts the sync — a new skill is classified on purpose, never by default.
// The verdicts (and reasons) are written into MANIFEST.json so the evidence
// travels with the bundle.
//
// Bundled per skill: SKILL.md plus text references only (.md .txt .json .csv).
// Binaries, scripts, html, fonts, office files are skipped and listed. Each
// skill is capped at MAX_BYTES; over the cap the largest references are
// dropped (SKILL.md is never dropped) and the trim is recorded.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const brain = path.join(here, "..");
const OUT = path.join(brain, "skills");
const MANIFEST = path.join(OUT, "MANIFEST.json");
const DRY = process.argv.includes("--dry");

const MAX_BYTES = 400 * 1024;
const TEXT_EXT = new Set([".md", ".txt", ".json", ".csv"]);
const STD_COST = { maxTurns: 16, maxBudgetUsd: 1.5, minutes: 10 };
const BIG_COST = { maxTurns: 16, maxBudgetUsd: 3, minutes: 12 }; // doctrine > 60 KB: each turn carries more input
const BIG_DOCTRINE = 60 * 1024;

// Source directories, in priority order (first hit wins on a duplicate name).
// Override with EVE_SKILL_SOURCES="dirA;dirB" (';' or ':' delimited).
const DEFAULT_SOURCES = [
  "C:/Users/mrkin/AppData/Roaming/Claude/local-agent-mode-sessions/skills-plugin/cae82843-359e-4be7-8cdb-7e9039f69fb3/fb4f662d-e133-4c51-97b4-17c756ca0e45/skills",
  "C:/Users/mrkin/.claude/skills",
];
const SOURCES = (process.env.EVE_SKILL_SOURCES ? process.env.EVE_SKILL_SOURCES.split(/[;:](?![\\/])/) : DEFAULT_SOURCES).map((s) => s.trim()).filter(Boolean);

// The units he names most — surfaced on THE CORE by default. pennyworth and
// research are registry CODE rows and carry their pin in registry.ts.
const PINNED = new Set(["starfire", "kid-flash", "red-robin", "blue-beetle", "perry-white", "jimmy-olsen", "watchtower"]);

// dir name → { reason, as? (roster key when it differs from the dir name), note? }
// RUNNABLE = text-in/text-out from the brain: no local filesystem, no scripts,
// no Premiere/UXP, no repo, no binary document generation, no MCP the brain lacks.
const RUNNABLE = {
  "ad-diagnostic-engine": { reason: "diagnoses pasted ad numbers → prescription; the optional .docx packaging stays workspace" },
  "ad-script-factory": { reason: "writes ad scripts/hooks from a brief; pure copy" },
  "alfred-editor": { as: "alfred", reason: "Phase 2 (analyze → plan → brand → mockup) is text from a pasted transcript; Remotion build + Premiere placement stay workspace", note: "planning phases only" },
  "aqualad": { reason: "fiction/RP/worldbuilding writer; text references only" },
  "avatar-bible-loader": { reason: "serves avatar profiles from its text references; builds new ones from pasted material" },
  "blue-beetle": { reason: "drafts outreach sequences and reply routing; the worker holds no send tools so nothing goes out", note: "drafts only — Smartlead/LinkedIn/Calendar stay workspace" },
  "brainiac": { reason: "rewrites a request into a model-tuned prompt; text only" },
  "brother-eye": { reason: "AEO query battery + visibility report; needs web search, which workers have" },
  "cassandra-cain": { reason: "scores a draft against pasted performance data; text in, score out", note: "pattern files cannot be saved from the brain — the score is the deliverable" },
  "churlish-master-plan-formula": { as: "master-plan-formula", reason: "structures a brain-dump into the 10-section plan as markdown; the python triple-output (HTML/PDF/DOCX) packaging stays workspace", note: "markdown deliverable, no HTML/PDF/DOCX" },
  "churlish-proposal-generator": { as: "proposal-generator", reason: "proposal content (tiers, pricing, pain language) as markdown; the .docx build via the docx skill stays workspace" },
  "churlish-voice-guard": { reason: "voice/style rules as a review pass over pasted copy; reference text only" },
  "cinemarketer-sales-coach": { reason: "scores a pasted sales-call transcript → chat report; scripts/build_report.js (the .docx) is skipped" },
  "content-calendar-engine": { reason: "monthly calendar as a markdown table; .xlsx/.docx packaging stays workspace" },
  "doctor-mid-nite": { reason: "fetches the live page (WebFetch) and writes the Bleed Report" },
  "editor-brief-generator": { reason: "writes editor/VA briefs from a description" },
  "email-sequence-writer": { reason: "writes nurture/follow-up sequences; copy only" },
  "fable-mind": { reason: "the operator-mode reasoning doctrine applied to a pasted problem; text only" },
  "guardian": { reason: "renewal/churn shield report from pasted account facts; text only", note: "needs the account facts in the task — no CRM read from the brain" },
  "hlp-clip-finder": { reason: "HLP transcript → clip sheet; the workflow is in SKILL.md, the .docx/.pdf assets are skipped" },
  "hlp-youtube-package": { reason: "episode transcript → title/description/thumbnail package" },
  "invoice-scoper": { reason: "scope + line items as inline text; .docx packaging stays workspace" },
  "iris-west": { reason: "7-day news sweep per client; needs web search, which workers have" },
  "jimmy-olsen": { reason: "messy notes → filed minutes; pure text, template is a text reference" },
  "kid-flash": { reason: "prospect research/qualification/tiering as a text list via web search", note: "Apollo + email verification are not on the brain — unverified rows must be flagged [NEEDS: verify]" },
  "martian-manhunter": { reason: "forges a client voice file from pasted raw material; text out" },
  "mister-miracle": { reason: "review-only code review of PASTED code; fixed checklist, text findings", note: "no repo access from the brain — paste the code in the task" },
  "perry-white": { reason: "writes one-off/high-stakes emails as drafts; the worker holds no send tools" },
  "red-robin": { reason: "transcript → short-form clips + ad creative as text; nothing is rendered" },
  "rustic-lumber-store": { reason: "client file: RLS/Woodaddy copy, metadata, strategy; text references only" },
  "starfire": { reason: "social post drafting, calendar, captions, image prompts as text", note: "Canva design + publishing stay workspace; drafts land in approvals" },
  "strategy-doc-builder": { reason: "strategy docs/gameplans/KPI trackers as markdown; .docx/.xlsx packaging stays workspace" },
  "transcript-clip-finder": { reason: "transcript → clip opportunities; text only" },
  "truenorth-clip-finder": { reason: "TrueNorth transcript → clip sheet; text only" },
  "watchtower": { reason: "grades a PASTED build/output against its fleet-health checklist", note: "cannot walk agent folders from the brain — paste what it should inspect" },
  "youtube-council": { reason: "5-seat war room + chairman verdict as markdown; the .html report template is skipped" },
  "youtube-metadata": { reason: "titles/descriptions/tags/chapters from a description or transcript" },
};

// dir name → reason it stays WORKSPACE_ONLY (never bundled, never run from the brain)
const EXCLUDED = {
  "jsa": "already a registry WORKER row (code) — not double-registered",
  "justice-league": "already a registry WORKER row (code) — not double-registered",
  "suicide-squad": "already a registry WORKER row (code) — not double-registered",
  "big-barda": "orchestrates Claude Code seats and /fable; a workflow over the workspace, not a text job",
  "brand-guidelines": "Anthropic brand styling for pptx/canvas artifacts (python-pptx); not a Churlish job",
  "canvas-design": "renders .png/.pdf art with bundled .ttf fonts; binary output",
  "churlish-master-plan-style": "HTML/CSS + python-docx build helpers producing HTML/PDF/DOCX; binary document generation",
  "consolidate-memory": "edits memory files on disk",
  "cyborg": "builds live Meta campaign objects through the Meta Ads MCP, which the brain does not hold",
  "docx": "python scripts + OOXML schemas for .docx generation; binary document generation",
  "eve-super-brain": "EVE's own operating doctrine — she IS this unit; dispatching herself is a loop, not a job",
  "explain-usage": "reads session .jsonl transcripts from the local disk",
  "frontend-design": "UI design guidance applied inside a codebase; needs the repo",
  "import-memory": "writes to Claude's memory tools",
  "mcp-builder": "builds MCP servers (python/node scripts, evaluation harness); code, not text",
  "morning": "playwright render of an HTML artifact with a bundled woff2 font; needs the local browser",
  "pdf": "python scripts for PDF forms/merging/rendering; binary document handling",
  "pptx": "python scripts + OOXML schemas for .pptx generation; binary document generation",
  "reel-vision": "ffmpeg/whisper-cli/yt-dlp pipeline over local video files",
  "schedule": "creates scheduled tasks through the host's scheduler tool",
  "second-brain": "filesystem census (ls ~/.claude/skills) + OS roster sync writes; fleet_roster already answers the read side",
  "setup-cowork": "guided plugin install/connector flow inside Cowork",
  "skill-creator": "python eval/packaging scripts over skill directories on disk",
  "ui-ux-pro-max": "python search scripts over bundled CSV data (3.5 MB); needs the local toolchain",
  "xlsx": "python scripts + OOXML schemas for .xlsx generation; binary document generation",
};

// ---- roster enrichment (name / triggers / division by key) ----
let roster = new Map();
try {
  const rows = JSON.parse(readFileSync(path.join(brain, "data", "fleet-roster.json"), "utf8"));
  roster = new Map(rows.map((u) => [u.key, u]));
} catch {
  console.warn("[sync-skills] data/fleet-roster.json not readable — no roster enrichment");
}

// ---- helpers ----
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  const lines = m[1].split(/\r?\n/);
  let key = null;
  for (const line of lines) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      out[key] = kv[2].trim();
    } else if (key && /^\s+\S/.test(line)) {
      out[key] = `${out[key]} ${line.trim()}`.trim();
    }
  }
  for (const k of Object.keys(out)) {
    let v = out[k];
    if (v === ">" || v === "|" || v === ">-" || v === "|-") v = "";
    v = v.replace(/^["'](.*)["']$/s, "$1").replace(/\\"/g, '"');
    out[k] = v.trim();
  }
  return out;
}

function firstSentence(s, max = 160) {
  const t = s.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{40,}?[.!?])(\s|$)/);
  let out = m ? m[1] : t;
  if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return out;
}

function shortTriggers(s, max = 80) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const parts = t.split(" · ");
  let out = "";
  for (const p of parts) {
    if ((out ? out + " · " + p : p).length > max) break;
    out = out ? out + " · " + p : p;
  }
  return out || t.slice(0, max - 1) + "…";
}

function triggersFromDescription(desc, name) {
  const found = [];
  const re = /["“‘']([^"”’']{3,40})["”’']/g;
  let m;
  while ((m = re.exec(desc)) && found.length < 3) found.push(`"${m[1].trim()}"`);
  return found.length ? found.join(" · ") : `"run ${name}"`;
}

function titleize(s) {
  return s.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

function walk(dir, rel = "") {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...walk(path.join(dir, ent.name), r));
    else out.push(r);
  }
  return out;
}

// ---- scan ----
const found = new Map(); // dir name → { src, source }
for (const src of SOURCES) {
  if (!existsSync(src)) {
    console.warn(`[sync-skills] source missing: ${src}`);
    continue;
  }
  for (const ent of readdirSync(src, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const skillMd = path.join(src, ent.name, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    if (found.has(ent.name)) {
      console.warn(`[sync-skills] duplicate skill "${ent.name}" in ${src} — first source wins (${found.get(ent.name).src})`);
      continue;
    }
    found.set(ent.name, { src: path.join(src, ent.name), source: src === SOURCES[0] ? "plugin" : "user" });
  }
}

const unclassified = [...found.keys()].filter((n) => !(n in RUNNABLE) && !(n in EXCLUDED));
if (unclassified.length) {
  console.error(`[sync-skills] UNCLASSIFIED skill directories (add to RUNNABLE or EXCLUDED with a reason): ${unclassified.join(", ")}`);
  process.exit(2);
}
const missing = [...Object.keys(RUNNABLE), ...Object.keys(EXCLUDED)].filter((n) => !found.has(n));
if (missing.length) console.warn(`[sync-skills] classified but not found on disk (skipped): ${missing.join(", ")}`);

// ---- bundle ----
const units = [];
const report = [];
for (const [dir, { src, source }] of [...found.entries()].sort()) {
  if (!(dir in RUNNABLE)) continue;
  const verdict = RUNNABLE[dir];
  const key = verdict.as ?? dir;
  const md = readFileSync(path.join(src, "SKILL.md"), "utf8");
  const fm = parseFrontmatter(md);
  const r = roster.get(key);
  const name = r?.name ?? titleize(fm.name || dir);
  const desc = fm.description || "";
  const role = firstSentence(desc || r?.job || name);
  const triggers = shortTriggers(r?.triggers || triggersFromDescription(desc, name));

  const all = walk(src);
  const text = all.filter((f) => f !== "SKILL.md" && TEXT_EXT.has(path.extname(f).toLowerCase()));
  const skipped = all.filter((f) => f !== "SKILL.md" && !TEXT_EXT.has(path.extname(f).toLowerCase()));
  const sized = text.map((f) => ({ f, bytes: statSync(path.join(src, f)).size })).sort((a, b) => a.bytes - b.bytes);
  const skillBytes = Buffer.byteLength(md, "utf8");
  let total = skillBytes + sized.reduce((n, x) => n + x.bytes, 0);
  const trimmed = [];
  while (total > MAX_BYTES && sized.length) {
    const drop = sized.pop();
    trimmed.push({ file: drop.f, bytes: drop.bytes });
    total -= drop.bytes;
  }
  if (total > MAX_BYTES) console.warn(`[sync-skills] ${key}: SKILL.md alone is ${skillBytes} bytes (> cap) — kept anyway`);
  const files = ["SKILL.md", ...sized.map((x) => x.f).sort()];

  if (!DRY) {
    const dst = path.join(OUT, key);
    rmSync(dst, { recursive: true, force: true });
    for (const f of files) {
      mkdirSync(path.dirname(path.join(dst, f)), { recursive: true });
      writeFileSync(path.join(dst, f), readFileSync(path.join(src, f)));
    }
  }

  units.push({
    key,
    name,
    role,
    triggers,
    division: r?.division ?? null,
    kind: "skill",
    tier: "yellow",
    cost: total > BIG_DOCTRINE ? BIG_COST : STD_COST,
    pinned: PINNED.has(key),
    source,
    sourceDir: dir,
    files,
    bytes: total,
    skipped,
    trimmed,
    why: verdict.reason,
    ...(verdict.note ? { note: verdict.note } : {}),
  });
  report.push(`${key.padEnd(26)} ${String(Math.round(total / 1024)).padStart(4)} KB  files=${files.length}${skipped.length ? ` skipped=${skipped.length}` : ""}${trimmed.length ? ` TRIMMED=${trimmed.map((t) => t.file).join(",")}` : ""}`);
}

const excluded = [...found.keys()]
  .filter((n) => n in EXCLUDED)
  .sort()
  .map((n) => ({ key: n, reason: EXCLUDED[n] }));

const manifest = {
  generatedAt: new Date().toISOString(),
  generator: "scripts/sync-skills.mjs",
  sources: SOURCES,
  maxBytesPerSkill: MAX_BYTES,
  pinned: [...PINNED].sort(),
  units: units.sort((a, b) => a.key.localeCompare(b.key)),
  excluded,
};

if (!DRY) {
  mkdirSync(OUT, { recursive: true });
  // Remove stale bundles (a skill retired or reclassified since the last sync).
  const keep = new Set(units.map((u) => u.key));
  for (const ent of readdirSync(OUT, { withFileTypes: true })) {
    if (ent.isDirectory() && !keep.has(ent.name)) {
      rmSync(path.join(OUT, ent.name), { recursive: true, force: true });
      console.log(`[sync-skills] removed stale bundle ${ent.name}`);
    }
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
}

console.log(report.join("\n"));
console.log(`\n${units.length} RUNNABLE bundled, ${excluded.length} WORKSPACE_ONLY excluded, ${found.size} skill dirs scanned${DRY ? " (dry run — nothing written)" : ` → ${MANIFEST}`}`);
