// Brain-side proof for MODELS (src/models.ts) — King, 2026-10-01: "update both
// of those to Sonnet 5.5; give her Opus when there's something that really
// needs it; I want her to stay updated on current Sonnet models when they come
// out."
//
//   E. env overrides and `latest-sonnet`, read at call time
//   P. picking the newest claude-sonnet-* by created_at; never a downgrade
//   C. the Sonnet watch: smoke test, adopt, persist, alert once, boot fallback
//   L. the live Models API lister, with an injected fetch (pagination, headers, no key in errors)
//   S. Opus escalation per chat turn, and the stays-on-Sonnet cases
//   F. the fleet's heavy units
//   R. the router (routeTurn): Haiku judges light/heavy; asks win; rules on failure
//
//   cd brain && npx tsx verify/models-harness.ts
//
// Offline: fetch, clock, store, smoke test and alert are all injected. No
// network, no DB, no model call. Where a check reads SOURCE TEXT it says SOURCE.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  everydayModel,
  fleetModel,
  heavyModel,
  modelsBlock,
  concreteEnv,
  pickNewestSonnet,
  isNewerSonnet,
  runModelCheck,
  initModels,
  listModelsLive,
  pickChatModel,
  decideChatTier,
  routeTurn,
  routerBody,
  parseRouterText,
  sanitizeWhy,
  isShortConfirmation,
  noteChatExchange,
  clip,
  ROUTER_SYSTEM,
  ROUTER_TIMEOUT_MS,
  _resetModelsForTests,
  DEFAULT_SONNET,
  FALLBACK_SONNET,
  DEFAULT_HEAVY,
  FOLLOWUP_MAX,
  type CheckDeps,
  type ListedModel,
  type StoredModels,
  type SmokeResult,
  type RouterDeps,
} from "../src/models.js";
import { turnLedgerLine } from "../src/honesty.js";
import { REGISTRY, HEAVY_UNITS, capability } from "../src/registry.js";
import { workerModel } from "../src/dispatch.js";

const brainDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (f: string) => readFileSync(path.join(brainDir, "src", f), "utf8");

let pass = 0;
let fail = 0;
const show: string[] = [];
function ok(id: string, cond: boolean, what: string) {
  if (cond) pass++;
  else fail++;
  show.push(`  ${id.padEnd(6)} ${cond ? "PASS" : "****FAIL****"}  ${what}`);
}

const KEY = "sk-harness-not-a-real-key";
const NOW = new Date("2026-10-01T14:47:00Z");

const LIST: ListedModel[] = [
  { id: "claude-sonnet-5", display_name: "Claude Sonnet 5", created_at: "2026-03-10T00:00:00Z" },
  { id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", created_at: "2026-08-20T00:00:00Z" },
  { id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-09-01T00:00:00Z" },
  { id: "claude-haiku-5", display_name: "Claude Haiku 5", created_at: "2026-09-15T00:00:00Z" },
  { id: "claude-fable-5", display_name: "Claude Fable 5", created_at: "2026-09-20T00:00:00Z" },
];
const SONNET_6: ListedModel = { id: "claude-sonnet-6", display_name: "Claude Sonnet 6", created_at: "2026-12-01T00:00:00Z" };

interface Fake {
  deps: CheckDeps;
  smokes: string[];
  alerts: string[];
  saves: StoredModels[];
  lists: number;
  logs: string[];
}
function fake(opts: {
  list?: ListedModel[] | Error;
  smoke?: (m: string) => SmokeResult;
  stored?: StoredModels | null;
  env?: Record<string, string | undefined>;
}): Fake {
  const f: Fake = { smokes: [], alerts: [], saves: [], lists: 0, logs: [], deps: null as unknown as CheckDeps };
  let stored = opts.stored ?? null;
  f.deps = {
    listModels: async () => {
      f.lists++;
      if (opts.list instanceof Error) throw opts.list;
      return opts.list ?? LIST;
    },
    smoke: async (m) => {
      f.smokes.push(m);
      return (opts.smoke ?? (() => ({ ok: true })))(m);
    },
    load: async () => stored,
    save: async (s) => {
      stored = s;
      f.saves.push(JSON.parse(JSON.stringify(s)));
    },
    alert: async (title, body) => {
      f.alerts.push(`${title} | ${body}`);
    },
    now: () => NOW,
    env: opts.env ?? {},
    log: (l) => f.logs.push(l),
  };
  return f;
}

// ---------------------------------------------------------------------------
show.push("=== E — ENV OVERRIDES, `latest-sonnet`, READ AT CALL TIME ===");
{
  _resetModelsForTests();
  ok("E1", everydayModel({}) === DEFAULT_SONNET && DEFAULT_SONNET === "claude-sonnet-5-5", `nothing set → everyday ${everydayModel({})}`);
  ok("E2", fleetModel({}) === "claude-sonnet-5-5", `nothing set → fleet ${fleetModel({})}`);
  ok("E3", heavyModel({}) === DEFAULT_HEAVY && DEFAULT_HEAVY === "claude-opus-5-5", `nothing set → heavy ${heavyModel({})}`);
  ok("E4", everydayModel({ EVE_MODEL: "claude-sonnet-5" }) === "claude-sonnet-5", "EVE_MODEL=claude-sonnet-5 → pinned, env wins");
  ok("E5", fleetModel({ EVE_FLEET_MODEL: "claude-haiku-5" }) === "claude-haiku-5", "EVE_FLEET_MODEL=claude-haiku-5 → pinned, env wins");
  ok("E6", everydayModel({ EVE_MODEL: "latest-sonnet" }) === DEFAULT_SONNET && fleetModel({ EVE_FLEET_MODEL: " LATEST-SONNET " }) === DEFAULT_SONNET, "`latest-sonnet` (any case, padded) → the adopted Sonnet");
  ok("E7", everydayModel({ EVE_MODEL: "  " }) === DEFAULT_SONNET && concreteEnv("") === null, "blank → unset");
  ok("E8", heavyModel({ EVE_HEAVY_MODEL: "claude-opus-6" }) === "claude-opus-6", "EVE_HEAVY_MODEL overrides the Opus seat");
  ok("E9", fleetModel({ EVE_MODEL: "claude-sonnet-5" }) === DEFAULT_SONNET, "pinning EVE_MODEL does not pin the fleet");
  const env: Record<string, string | undefined> = {};
  const a = everydayModel(env);
  env.EVE_MODEL = "claude-sonnet-5";
  const b = everydayModel(env);
  ok("E10", a === DEFAULT_SONNET && b === "claude-sonnet-5", "read at CALL time: the same env object answers differently after it changes");

  const files = ["chat.ts", "brief.ts", "capture.ts", "distill.ts", "proactive.ts", "pulse.ts", "dispatch.ts"];
  const stale = files.filter((f) => /process\.env\.EVE_(FLEET_)?MODEL|"claude-sonnet-5"|const MODEL\b|model: MODEL/.test(src(f)));
  ok("E11", stale.length === 0, `SOURCE: none of the seven files keeps its own model constant${stale.length ? ` — still in ${stale.join(", ")}` : ""}`);
  const everyday = ["brief.ts", "capture.ts", "distill.ts", "proactive.ts", "pulse.ts"].filter((f) => !/model: everydayModel\(\),/.test(src(f)));
  ok("E12", everyday.length === 0, `SOURCE: brief, capture, distill, proactive and pulse pass model: everydayModel() inside query()${everyday.length ? ` — not ${everyday.join(", ")}` : ""}`);
  ok("E13", /model: pick\.model,/.test(src("chat.ts")) && /model: workerModel\(unit\),/.test(src("dispatch.ts")), "SOURCE: chat uses the per-turn pick, dispatch the per-unit workerModel()");
  const sdk = files.filter((f) => /maxThinkingTokens|thinking:\s*\{|type:\s*"disabled"|tool_choice|toolChoice|temperature|top_p|top_k/.test(src(f)));
  ok("E14", sdk.length === 0, `SOURCE: no disabled thinking, forced tool choice or sampling params in any of the seven (all 400 on Sonnet/Opus 5.5)${sdk.length ? ` — found in ${sdk.join(", ")}` : ""}`);
  ok("E15", /models: modelsBlock\(\)/.test(src("state.ts")) && (src("state.ts").match(/models: modelsBlock\(\)/g) ?? []).length === 3, "SOURCE: /state carries models on all three returns (online, offline, outage)");
  const mb = modelsBlock({});
  ok("E16", Object.keys(mb).join(",") === "everyday,fleet,heavy,adoptedAt,router" && mb.adoptedAt === null && mb.router.last === null && mb.router.mode === "auto", `/state.models shape: ${JSON.stringify(mb)}`);
  const sched = src("schedule.ts");
  ok("E17", /startModelWatch\(\{ quiet: isQuietHours, tz: TZ \}\)/.test(sched) && sched.indexOf("startModelWatch(") > sched.indexOf("export function startSchedulers"), "SOURCE: the Sonnet watch is armed inside startSchedulers — behind the Railway-only gate");
}

// ---------------------------------------------------------------------------
show.push("=== P — THE NEWEST SONNET, BY created_at ===");
{
  ok("P1", pickNewestSonnet([...LIST, SONNET_6])?.id === "claude-sonnet-6", "sonnet-6 (newest created_at) is picked");
  ok("P2", pickNewestSonnet(LIST)?.id === "claude-sonnet-5-5", "Opus 5.5, Haiku 5 and Fable 5 are NEWER than Sonnet 5.5 and are all ignored");
  ok("P3", pickNewestSonnet(LIST.filter((m) => !m.id.startsWith("claude-sonnet"))) === null, "no Sonnet listed → nothing picked");
  const shuffled = [SONNET_6, ...LIST].reverse();
  ok("P4", pickNewestSonnet(shuffled)?.id === "claude-sonnet-6", "order of the list does not matter");
  ok("P5", pickNewestSonnet([{ id: "claude-sonnet-9", created_at: "not a date" }, ...LIST])?.id === "claude-sonnet-5-5", "a row with no usable created_at is skipped, not trusted");
  ok("P6", !isNewerSonnet(LIST[1], "claude-sonnet-5-5", LIST), "the adopted model is not newer than itself");
  ok("P7", !isNewerSonnet(LIST[0], "claude-sonnet-5-5", LIST.slice(0, 1)), "sonnet-5 vs an UNLISTED sonnet-5-5 → not newer (version compare when the current one is unlisted)");
  ok("P8", isNewerSonnet(SONNET_6, "claude-sonnet-5-5", [SONNET_6]), "sonnet-6 vs an unlisted sonnet-5-5 → newer");
  ok("P9", !isNewerSonnet(LIST[1], "claude-sonnet-6", [...LIST, SONNET_6]), "sonnet-5-5 is NOT newer than an adopted sonnet-6 → never a downgrade");
}

// ---------------------------------------------------------------------------
show.push("=== C — THE SONNET WATCH ===");
{
  // C1 — a newer Sonnet passes: adopt, persist, alert.
  _resetModelsForTests();
  const f = fake({ list: [...LIST, SONNET_6] });
  const r = await runModelCheck(f.deps);
  ok("C1.1", r.action === "adopted" && r.candidate === "claude-sonnet-6", `action ${r.action}, candidate ${r.candidate}`);
  ok("C1.2", f.smokes.join(",") === "claude-sonnet-6", `exactly one smoke test, on the candidate: ${f.smokes.join(",")}`);
  ok("C1.3", everydayModel({}) === "claude-sonnet-6" && fleetModel({}) === "claude-sonnet-6", "everyday and fleet both follow the adoption");
  ok("C1.4", f.saves.length === 1 && f.saves[0].adopted === "claude-sonnet-6" && f.saves[0].adoptedAt === NOW.toISOString(), `persisted: ${JSON.stringify(f.saves[0])}`);
  ok("C1.5", f.alerts.length === 1 && f.alerts[0] === "EVE · MODEL | EVE moved to claude-sonnet-6 after a passing test.", `one alert: "${f.alerts[0]}"`);
  ok("C1.6", modelsBlock({}).adoptedAt === NOW.toISOString(), "/state.models.adoptedAt is the injected clock");
  ok("C1.7", everydayModel({ EVE_MODEL: "claude-sonnet-5" }) === "claude-sonnet-5", "a pinned EVE_MODEL still wins after an adoption");
  const again = await runModelCheck(f.deps);
  ok("C1.8", again.action === "current" && f.smokes.length === 1 && f.alerts.length === 1, "the next pass finds nothing newer: no smoke, no alert");

  // C2 — restart keeps it.
  _resetModelsForTests();
  await initModels(f.deps.load);
  ok("C2.1", everydayModel({}) === "claude-sonnet-6" && modelsBlock({}).adoptedAt === NOW.toISOString(), "after a restart the stored adoption is loaded back");
  _resetModelsForTests();
  await initModels(async () => ({ adopted: "claude-sonnet-5", adoptedAt: null, alertedFailures: [] }));
  ok("C2.2", everydayModel({}) === DEFAULT_SONNET, "a stored id OLDER than the default is ignored — never below claude-sonnet-5-5");
  _resetModelsForTests();
  await initModels(async () => ({ adopted: "claude-opus-5-5", adoptedAt: null, alertedFailures: [] }));
  ok("C2.3", everydayModel({}) === DEFAULT_SONNET, "a stored non-Sonnet id is ignored");
  _resetModelsForTests();
  await initModels(async () => {
    throw new Error("store down");
  });
  ok("C2.4", everydayModel({}) === DEFAULT_SONNET, "an unreadable store → the default, no throw");

  // C3 — a newer Sonnet FAILS: stay put, alert once per id.
  _resetModelsForTests();
  const g = fake({ list: [...LIST, SONNET_6], smoke: () => ({ ok: false, why: "error_during_execution" }) });
  const r1 = await runModelCheck(g.deps);
  const r2 = await runModelCheck(g.deps);
  ok("C3.1", r1.action === "smoke-failed" && r2.action === "smoke-failed" && everydayModel({}) === DEFAULT_SONNET, "both passes keep claude-sonnet-5-5");
  ok("C3.2", g.smokes.length === 2, "the candidate is re-tested on every pass (it may start working)");
  ok("C3.3", g.alerts.length === 1 && g.alerts[0].includes("claude-sonnet-6") && g.alerts[0].includes("staying on claude-sonnet-5-5"), `alerted ONCE: "${g.alerts[0]}"`);
  ok("C3.4", g.saves.some((s) => s.alertedFailures.includes("claude-sonnet-6") && s.adopted === DEFAULT_SONNET), "the alerted id is persisted, so a restart does not re-alert");
  _resetModelsForTests();
  const g2 = fake({ list: [...LIST, SONNET_6], smoke: () => ({ ok: false }), stored: g.saves[g.saves.length - 1] });
  await runModelCheck(g2.deps);
  ok("C3.5", g2.alerts.length === 0 && g2.smokes.length === 1, "after a restart: re-tested, not re-alerted");
  const g3 = fake({ list: [...LIST, SONNET_6], smoke: () => ({ ok: true }), stored: g.saves[g.saves.length - 1] });
  _resetModelsForTests();
  const r3 = await runModelCheck(g3.deps);
  ok("C3.6", r3.action === "adopted" && everydayModel({}) === "claude-sonnet-6" && !g3.saves[0].alertedFailures.includes("claude-sonnet-6"), "when it later passes it is adopted and its failure mark cleared");

  // C4 — never downgrade.
  _resetModelsForTests();
  const h = fake({ list: LIST, stored: { adopted: "claude-sonnet-6", adoptedAt: "2026-12-02T00:00:00Z", alertedFailures: [] } });
  const rh = await runModelCheck(h.deps);
  ok("C4.1", rh.action === "current" && everydayModel({}) === "claude-sonnet-6" && h.smokes.length === 0 && h.alerts.length === 0, "adopted sonnet-6 and a list whose newest Sonnet is 5-5 → stays on 6, no test, no alert");

  // C5 — boot fallback.
  _resetModelsForTests();
  const b = fake({ list: LIST, smoke: (m) => ({ ok: m !== "claude-sonnet-5-5", why: "invalid model" }) });
  const rb = await runModelCheck(b.deps, { boot: true });
  ok("C5.1", rb.fellBack === true && everydayModel({}) === FALLBACK_SONNET && FALLBACK_SONNET === "claude-sonnet-5", `claude-sonnet-5-5 fails its boot test → everyday ${everydayModel({})}`);
  ok("C5.2", fleetModel({}) === "claude-sonnet-5", "the fleet falls back with it");
  ok("C5.3", b.alerts.length === 1 && b.alerts[0].includes("claude-sonnet-5-5") && b.alerts[0].includes("running on claude-sonnet-5"), `one alert: "${b.alerts[0]}"`);
  ok("C5.4", b.saves.every((s) => s.adopted === DEFAULT_SONNET), "the fallback is NOT persisted as an adoption — the next boot tries 5-5 again");
  await runModelCheck(b.deps);
  ok("C5.5", b.alerts.length === 1 && everydayModel({}) === FALLBACK_SONNET, "a later pass that still fails: no second alert, still on the fallback");
  const b2 = fake({ list: LIST, smoke: () => ({ ok: true }) });
  const rb2 = await runModelCheck(b2.deps);
  ok("C5.6", everydayModel({}) === DEFAULT_SONNET && b2.alerts.length === 1 && b2.alerts[0].includes("back on claude-sonnet-5-5") && rb2.action === "current", "when 5-5 passes again she goes back to it and says so");
  _resetModelsForTests();
  const ok5 = fake({ list: LIST });
  const rok = await runModelCheck(ok5.deps, { boot: true });
  ok("C5.7", rok.action === "current" && !rok.fellBack && ok5.smokes.join(",") === "claude-sonnet-5-5,claude-opus-5-5" && ok5.alerts.length === 0, `a passing boot: one smoke on 5-5, one on the Opus seat, no alert, no change (${ok5.smokes.join(",")})`);

  // C8 — the Opus seat's boot test.
  _resetModelsForTests();
  const od = fake({ list: LIST, smoke: (m) => ({ ok: m !== "claude-opus-5-5", why: "invalid model" }) });
  await runModelCheck(od.deps, { boot: true });
  ok("C8.1", heavyModel({}) === DEFAULT_SONNET && pickChatModel("go deep", { env: {} }).model === DEFAULT_SONNET, `Opus fails its boot test → heavy turns run on ${heavyModel({})}, not an error`);
  ok("C8.2", od.alerts.length === 1 && od.alerts[0].includes("claude-opus-5-5"), `alerted once: "${od.alerts[0]}"`);
  ok("C8.3", heavyModel({ EVE_HEAVY_MODEL: "claude-opus-6" }) === "claude-opus-6", "a different configured heavy id is not marked down");
  await runModelCheck(od.deps);
  ok("C8.4", od.alerts.length === 1 && heavyModel({}) === DEFAULT_SONNET, "still failing on the next pass: no second alert");
  const ou = fake({ list: LIST });
  await runModelCheck(ou.deps);
  ok("C8.5", heavyModel({}) === DEFAULT_HEAVY && ou.alerts.length === 1 && ou.alerts[0].includes("back on claude-opus-5-5"), "Opus passes again → heavy turns back on it, and he hears so");
  _resetModelsForTests();
  const op = fake({ list: LIST, env: { EVE_MODEL: "claude-sonnet-5", EVE_FLEET_MODEL: "claude-sonnet-5" }, smoke: () => ({ ok: false }) });
  await runModelCheck(op.deps, { boot: true });
  ok("C8.6", op.smokes.join(",") === "claude-opus-5-5" && heavyModel({ EVE_MODEL: "claude-sonnet-5" }) === "claude-sonnet-5", "both Sonnets pinned: the Opus seat is still tested, and falls back to the pinned everyday model");

  // C6 — list failure, pinned env.
  _resetModelsForTests();
  const lf = fake({ list: new Error("models API answered HTTP 503") });
  const rl = await runModelCheck(lf.deps);
  ok("C6.1", rl.action === "list-failed" && lf.smokes.length === 0 && lf.alerts.length === 0 && everydayModel({}) === DEFAULT_SONNET, "the Models API down → nothing moves, nothing alerts");
  _resetModelsForTests();
  const pn = fake({ list: [...LIST, SONNET_6], env: { EVE_MODEL: "claude-sonnet-5", EVE_FLEET_MODEL: "claude-sonnet-5" } });
  const rp = await runModelCheck(pn.deps, { boot: true });
  ok("C6.2", rp.action === "pinned" && pn.lists === 0 && pn.smokes.join(",") === "claude-opus-5-5" && pn.alerts.length === 0, "both pinned → no list, no Sonnet smoke (only the Opus seat's), no alert");
  _resetModelsForTests();
  const half = fake({ list: [...LIST, SONNET_6], env: { EVE_MODEL: "claude-sonnet-5" } });
  await runModelCheck(half.deps);
  ok("C6.3", fleetModel({ EVE_MODEL: "claude-sonnet-5" }) === "claude-sonnet-6" && everydayModel({ EVE_MODEL: "claude-sonnet-5" }) === "claude-sonnet-5", "only EVE_MODEL pinned → the fleet still moves to sonnet-6");

  // C7 — nothing secret in what the watch says.
  const said = [...f.alerts, ...g.alerts, ...b.alerts, ...f.logs, ...g.logs, ...b.logs, ...lf.logs].join("\n");
  ok("C7.1", !said.includes(KEY) && !/sk-/.test(said) && !/single word/.test(said), "no alert or log line carries a key or the smoke prompt");
}

// ---------------------------------------------------------------------------
show.push("=== L — THE LIVE LISTER, WITH AN INJECTED FETCH ===");
{
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const pages = [
    { data: LIST.slice(0, 3), has_more: true, last_id: "claude-opus-5-5" },
    { data: [...LIST.slice(3), SONNET_6], has_more: false, last_id: "claude-sonnet-6" },
  ];
  const fetchFn = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const body = pages[calls.length - 1];
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
  const got = await listModelsLive(fetchFn, { ANTHROPIC_API_KEY: KEY });
  ok("L1", got.length === 6 && pickNewestSonnet(got)?.id === "claude-sonnet-6", `two pages → ${got.length} models, newest Sonnet ${pickNewestSonnet(got)?.id}`);
  ok("L2", calls[0].url === "https://api.anthropic.com/v1/models?limit=100" && calls[1].url === "https://api.anthropic.com/v1/models?limit=100&after_id=claude-opus-5-5", `paginates with after_id = last_id: ${calls[1]?.url}`);
  ok("L3", calls.every((c) => c.headers["x-api-key"] === KEY && c.headers["anthropic-version"] === "2023-06-01"), "x-api-key + anthropic-version: 2023-06-01 on every page");
  const deny = (async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
  let msg = "";
  try {
    await listModelsLive(deny, { ANTHROPIC_API_KEY: KEY });
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  ok("L4", msg === "models API answered HTTP 401" && !msg.includes(KEY), `a 401 throws a status-only message: "${msg}"`);
  let none = "";
  try {
    await listModelsLive(fetchFn, {});
  } catch (e) {
    none = e instanceof Error ? e.message : String(e);
  }
  ok("L5", none === "ANTHROPIC_API_KEY is not set", "no key → refuses before any fetch");
}

// ---------------------------------------------------------------------------
show.push("=== S — OPUS WHEN IT REALLY NEEDS IT ===");
{
  _resetModelsForTests();
  const env = {};
  const t = (m: string) => decideChatTier(m, null);
  const asked = ["use opus for this one", "Think hard about the Q1 plan", "think harder", "go deep on HLP's numbers", "let's do a deep dive on churn", "Take your time with this"];
  for (const [i, m] of asked.entries()) ok(`S1.${i + 1}`, t(m).tier === "opus" && t(m).reason === "asked", `"${m}" → opus/asked`);
  ok("S2.1", t("x".repeat(1501)).tier === "opus" && t("x".repeat(1501)).reason === "long", "1501 characters → opus/long");
  ok("S2.2", t("x".repeat(1500)).tier === "sonnet", "1500 characters → sonnet");
  const topic = [
    "Draft the proposal for Acme",
    "Help me think through pricing for HLP sponsors",
    "Build the master plan for Rustic Lumber",
    "How should I negotiate the renewal with Dana?",
    "Review the contract terms before I sign",
    "What should our strategy be for Q1?",
  ];
  for (const [i, m] of topic.entries()) ok(`S3.${i + 1}`, t(m).tier === "opus" && t(m).reason === "topic", `"${m}" → opus/topic`);
  const stay = [
    "morning",
    "what's on today",
    "Is the Acme contract signed?",
    "Did the proposal go out?",
    "the pricing page is live",
    "remind me to call Dana at 3",
    "draft a reply to Sam saying thanks",
    "what's the weather",
  ];
  for (const [i, m] of stay.entries()) ok(`S4.${i + 1}`, t(m).tier === "sonnet" && t(m).reason === "default", `"${m}" → sonnet`);

  // Follow-ups: stay on Opus for FOLLOWUP_MAX turns after a real escalation.
  const conv = "conv-deep";
  const seq = ["go deep on the HLP sponsor ladder", "ok and the second tier?", "and the third?", "what about timing?", "cool, thanks"].map((m) => pickChatModel(m, { conversationId: conv, env }));
  ok("S5.1", seq[0].tier === "opus" && seq[0].reason === "asked", "turn 1 asked → opus");
  ok("S5.2", seq.slice(1, 1 + FOLLOWUP_MAX).every((p) => p.tier === "opus" && p.reason === "followup"), `turns 2–${1 + FOLLOWUP_MAX}: previous turn escalated → opus/followup`);
  ok("S5.3", seq[1 + FOLLOWUP_MAX].tier === "sonnet" && seq[1 + FOLLOWUP_MAX].reason === "default", `turn ${2 + FOLLOWUP_MAX} → back to sonnet (one ask does not pin the thread)`);
  const c2 = "conv-drop";
  pickChatModel("use opus", { conversationId: c2, env });
  const drop = pickChatModel("ok use sonnet now, quick one", { conversationId: c2, env });
  const after = pickChatModel("and then?", { conversationId: c2, env });
  ok("S5.4", drop.tier === "sonnet" && drop.reason === "asked" && after.tier === "sonnet", "\"use sonnet\" drops the escalation, and it stays dropped");
  pickChatModel("deep dive on churn", { conversationId: "conv-A", env });
  ok("S5.5", pickChatModel("and then?", { conversationId: "conv-B", env }).tier === "sonnet", "one conversation's escalation never leaks into another");
  ok("S5.6", decideChatTier("and then?", { tier: "opus", followups: 0 }).reason === "followup" && decideChatTier("and then?", { tier: "sonnet", followups: 0 }).tier === "sonnet", "pure rule: previous turn opus → followup; previous sonnet → sonnet");

  const p1 = pickChatModel("use opus", { env: { EVE_HEAVY_MODEL: "claude-opus-6" } });
  const p2 = pickChatModel("morning", { env: { EVE_MODEL: "claude-sonnet-5" } });
  ok("S6.1", p1.model === "claude-opus-6" && p2.model === "claude-sonnet-5", "an Opus turn runs heavyModel(), a Sonnet turn everydayModel(), both env-aware");
  ok("S6.2", pickChatModel("go deep", { env: {} }).model === "claude-opus-5-5" && pickChatModel("hey", { env: {} }).model === "claude-sonnet-5-5", "defaults: claude-opus-5-5 / claude-sonnet-5-5");

  const line = turnLedgerLine("conv-9", { cardsRaised: 0, deskRefusals: 0, model: { tier: p1.tier, id: p1.model, reason: p1.reason } });
  ok("S7.1", line === "[turn] conv-9 cardsRaised=0 deskRefusals=0 model=opus reason=asked id=claude-opus-6", `ledger: "${line}"`);
  ok("S7.2", !line.includes("use opus"), "the ledger line carries no message content");
  ok("S7.3", turnLedgerLine("c", { cardsRaised: 0, deskRefusals: 0 }) === "[turn] c cardsRaised=0 deskRefusals=0", "without a model the line is unchanged (honesty-harness F2 still holds)");
  const chat = src("chat.ts");
  ok("S7.4", /const pickP = routeTurn\(userMessage, \{ conversationId \}\)/.test(chat) && (chat.match(/routeTurn\(/g) ?? []).length === 1 && !/pickChatModel/.test(chat) && /model: \{ tier: pick\.tier, id: pick\.model, reason: pick\.reason \}/.test(chat), "SOURCE: chat.ts routes once per turn (routeTurn, not pickChatModel) and writes the pick to the turn ledger");
  const awaitAt = chat.indexOf("const pick = await pickP;");
  ok("S7.5", awaitAt > 0 && awaitAt < chat.indexOf("const q = query({") && awaitAt > chat.indexOf("readUntrustedTaintBeforeMint(conversationId)"), "SOURCE: the router call overlaps the store reads and is awaited just before the model is built");
  ok("S7.6", /if \(!image\) noteChatExchange\(conversationId, userMessage, fullText\)/.test(chat), "SOURCE: the previous exchange is noted at the end of a finished turn, never on a picture turn");
}

// ---------------------------------------------------------------------------
show.push("=== F — THE FLEET'S HEAVY UNITS ===");
{
  _resetModelsForTests();
  const heavyKeys = Object.keys(HEAVY_UNITS);
  ok("F1", heavyKeys.length === 7, `seven heavy units: ${heavyKeys.join(", ")}`);
  ok("F2", heavyKeys.every((k) => capability(k)?.heavy === true), "every heavy key resolves to a registry row with heavy: true");
  const heavyRows = REGISTRY.filter((c) => c.heavy).map((c) => c.key);
  ok("F3", heavyRows.length === heavyKeys.length, `only those rows are heavy (${heavyRows.length})`);
  ok("F4", ["research", "pennyworth", "red-robin", "starfire", "iris-west", "suicide-squad"].every((k) => !capability(k)?.heavy), "research, Pennyworth, Red Robin, Starfire, Iris West, Suicide Squad stay on the fleet model");
  ok("F5", workerModel("proposal-generator") === heavyModel() && workerModel("research") === fleetModel(), `proposal-generator → ${workerModel("proposal-generator")}, research → ${workerModel("research")}`);
  const prev = process.env.EVE_HEAVY_MODEL;
  process.env.EVE_HEAVY_MODEL = "claude-opus-6";
  const live = workerModel("jsa");
  if (prev === undefined) delete process.env.EVE_HEAVY_MODEL;
  else process.env.EVE_HEAVY_MODEL = prev;
  ok("F6", live === "claude-opus-6", "workerModel reads EVE_HEAVY_MODEL at job time");
  ok("F7", workerModel("no-such-unit") === fleetModel(), "an unknown unit is never heavy");
  ok("F8", heavyKeys.every((k) => HEAVY_UNITS[k].length > 10), "every heavy unit carries its one-line reason");
}

// ---------------------------------------------------------------------------
show.push("=== R — THE ROUTER: HAIKU JUDGES, ASKS WIN, RULES CATCH A FAILURE ===");
{
  interface RCall {
    url: string;
    method?: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
    signal?: AbortSignal;
  }
  interface RF {
    calls: RCall[];
    logs: string[];
    timers: number[];
    cancelled: number;
    deps: Partial<RouterDeps>;
  }
  const RNOW = new Date("2026-10-01T15:02:00Z");
  function rf(opts: { answer?: string; status?: number; hang?: boolean; throws?: boolean; env?: Record<string, string | undefined> } = {}): RF {
    const f: RF = { calls: [], logs: [], timers: [], cancelled: 0, deps: {} };
    const fetchFn = (async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => {
      f.calls.push({ url, method: init?.method, headers: init?.headers ?? {}, body: JSON.parse(init?.body ?? "{}"), signal: init?.signal });
      if (opts.throws) throw new Error("ECONNRESET");
      if (opts.hang) {
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      }
      const status = opts.status ?? 200;
      return { ok: status < 400, status, json: async () => ({ content: [{ type: "text", text: opts.answer ?? '{"tier":"light","why":"a quick status check"}' }] }) } as unknown as Response;
    }) as unknown as typeof fetch;
    f.deps = {
      fetch: fetchFn,
      env: opts.env ?? { ANTHROPIC_API_KEY: KEY },
      now: () => RNOW,
      // The injected clock: a hanging call times out at once; otherwise the timer never fires.
      setTimer: (ms, fn) => {
        f.timers.push(ms);
        if (opts.hang) queueMicrotask(fn);
        return () => {
          f.cancelled++;
        };
      },
      log: (l) => f.logs.push(l),
    };
    return f;
  }
  const HEAVY = '{"tier":"heavy","why":"money and client strategy at stake"}';
  const LIGHT = '{"tier":"light","why":"simple calendar lookup"}';

  // R1 — the router's tier decides.
  _resetModelsForTests();
  const h = rf({ answer: HEAVY });
  const ph = await routeTurn("Look at the HLP sponsor numbers and tell me which tier we cut first", { deps: h.deps });
  ok("R1.1", ph.tier === "opus" && ph.model === "claude-opus-5-5" && ph.source === "router" && ph.reason === 'router:"money and client strategy at stake"', `heavy → ${ph.model} reason=${ph.reason}`);
  const l = rf({ answer: LIGHT });
  const pl = await routeTurn("what's on the calendar for Thursday afternoon", { deps: l.deps });
  ok("R1.2", pl.tier === "sonnet" && pl.model === "claude-sonnet-5-5" && pl.reason === 'router:"simple calendar lookup"', `light → ${pl.model} reason=${pl.reason}`);
  ok("R1.3", h.calls.length === 1 && l.calls.length === 1 && h.timers.join() === String(ROUTER_TIMEOUT_MS) && ROUTER_TIMEOUT_MS === 2500 && h.cancelled === 1, "one call per substantive turn; the 2.5 s timer is armed and cancelled");
  const pl2 = await routeTurn("Draft the proposal for Acme", { deps: rf({ answer: LIGHT }).deps });
  ok("R1.4", pl2.tier === "sonnet" && pl2.source === "router", "the router's judgment beats the old keyword rule (rules would have said topic → opus)");
  const long = await routeTurn("x ".repeat(1200), { deps: rf({ answer: LIGHT }).deps });
  ok("R1.5", long.tier === "sonnet" && long.source === "router", "a long paste the router judges light stays light (the >1500 rule is fallback-only)");

  // R2 — parsing.
  ok("R2.1", parseRouterText('```json\n{"tier":"heavy","why":"x"}\n```')?.tier === "heavy" && parseRouterText('Sure: {"tier":"light","why":"y"}')?.tier === "light", "fenced or prefaced JSON still parses");
  const bad = ["heavy", '{"tier":"medium","why":"x"}', '{"tier":"heavy"}', "{not json}", '{"tier":"heavy","why":7}', ""];
  ok("R2.2", bad.every((b) => parseRouterText(b) === null), `invalid answers → null (${bad.length} shapes)`);

  // R3 — invalid JSON → the fixed rules.
  const inv = rf({ answer: "I'd say this one is heavy." });
  const pi = await routeTurn("Draft the proposal for Acme", { deps: inv.deps });
  ok("R3.1", pi.tier === "opus" && pi.source === "router-failed" && pi.reason === "router-failed cause=invalid-json fallback=rules:topic", `invalid JSON → ${pi.reason}`);
  const pi2 = await routeTurn("what's on the calendar for Thursday afternoon", { deps: rf({ answer: '{"tier":"huge"}' }).deps });
  ok("R3.2", pi2.tier === "sonnet" && pi2.reason === "router-failed cause=invalid-json fallback=rules:default", `schema miss → ${pi2.reason}`);

  // R4 — timeout and errors → the fixed rules.
  const to = rf({ hang: true });
  const pt = await routeTurn("Help me think through pricing for HLP sponsors", { deps: to.deps });
  ok("R4.1", pt.tier === "opus" && pt.reason === "router-failed cause=timeout fallback=rules:topic", `timeout → ${pt.reason}`);
  ok("R4.2", to.timers[0] === 2500 && to.calls[0].signal?.aborted === true, "the timer is 2500 ms and the hung request is aborted");
  const p5 = await routeTurn("what's on the calendar for Thursday afternoon", { deps: rf({ status: 529 }).deps });
  const pe = await routeTurn("what's on the calendar for Thursday afternoon", { deps: rf({ throws: true }).deps });
  const nk = rf({ env: {} });
  const pk = await routeTurn("what's on the calendar for Thursday afternoon", { deps: nk.deps });
  ok("R4.3", p5.reason === "router-failed cause=http-529 fallback=rules:default" && pe.reason === "router-failed cause=error fallback=rules:default", `HTTP 529 / a thrown fetch → ${p5.reason} · ${pe.reason}`);
  ok("R4.4", pk.reason === "router-failed cause=no-key fallback=rules:default" && nk.calls.length === 0, "no ANTHROPIC_API_KEY → no request, rules decide");

  // R5 — EVE_ROUTER=off / rules.
  const off = rf({ answer: HEAVY, env: { ANTHROPIC_API_KEY: KEY, EVE_ROUTER: "off" } });
  const po1 = await routeTurn("use opus and think hard about the HLP master plan", { deps: off.deps });
  const po2 = await routeTurn("Draft the proposal for Acme", { deps: off.deps });
  ok("R5.1", po1.tier === "sonnet" && po2.tier === "sonnet" && po1.reason === "off" && po1.model === "claude-sonnet-5-5" && off.calls.length === 0, "EVE_ROUTER=off → always the everyday model, no router call");
  const ru = rf({ answer: LIGHT, env: { ANTHROPIC_API_KEY: KEY, EVE_ROUTER: " RULES " } });
  const pr1 = await routeTurn("Draft the proposal for Acme", { conversationId: "r-rules", deps: ru.deps });
  const pr2 = await routeTurn("and the timeline section", { conversationId: "r-rules", deps: ru.deps });
  const pr3 = await routeTurn("use opus", { deps: ru.deps });
  ok("R5.2", pr1.reason === "rules:topic" && pr1.tier === "opus" && pr2.reason === "rules:followup" && pr3.reason === "asked" && ru.calls.length === 0, `EVE_ROUTER=rules → the fixed rules, follow-ups included, no call (${pr1.reason}, ${pr2.reason}, ${pr3.reason})`);
  ok("R5.3", modelsBlock({ EVE_ROUTER: "off" }).router.mode === "off" && modelsBlock({ EVE_ROUTER: "banana" }).router.mode === "auto" && modelsBlock({}).router.model === "claude-haiku-4-5", "unknown EVE_ROUTER → auto; default router model claude-haiku-4-5");

  // R6 — explicit asks beat the router, and cost nothing.
  const ask = rf({ answer: LIGHT });
  const pa1 = await routeTurn("use opus — what's on the calendar for Thursday", { deps: ask.deps });
  const ask2 = rf({ answer: HEAVY });
  const pa2 = await routeTurn("use sonnet and draft the master plan for HLP", { deps: ask2.deps });
  const pa3 = await routeTurn("take your time with the renewal email to Dana", { deps: ask.deps });
  ok("R6.1", pa1.tier === "opus" && pa1.reason === "asked" && pa3.tier === "opus" && ask.calls.length === 0, "\"use opus\" / \"take your time\" beat a light router — and no call is made");
  ok("R6.2", pa2.tier === "sonnet" && pa2.reason === "asked" && ask2.calls.length === 0, "\"use sonnet\" beats a heavy router");

  // R7 — short confirmations.
  for (const [i, m] of ["ok", "thanks", "yes do it", "sounds good, go ahead", "cool"].entries()) ok(`R7.${i + 1}`, isShortConfirmation(m), `"${m}" is a short confirmation`);
  const notShort = ["Draft the proposal for Acme", "should I raise prices?", "x".repeat(40)];
  ok("R7.6", notShort.every((m) => !isShortConfirmation(m)), "an ask, a question, or 40+ characters is not");
  const sc = rf({ answer: HEAVY });
  const ps1 = await routeTurn("yes do it", { prev: { tier: "sonnet", followups: 0 }, deps: sc.deps });
  const ps2 = await routeTurn("thanks", { prev: null, deps: sc.deps });
  const ps3 = await routeTurn("yes do it", { prev: { tier: "opus", followups: 0 }, deps: sc.deps });
  ok("R7.7", ps1.tier === "sonnet" && ps1.reason === "short" && ps2.reason === "short" && sc.calls.length === 0, "after a light turn: light, no call");
  ok("R7.8", ps3.tier === "opus" && ps3.reason === "short:kept-heavy" && sc.calls.length === 0, "after a heavy turn: the confirmation stays heavy, no call");
  const q = rf({ answer: HEAVY });
  await routeTurn("should I raise prices?", { deps: q.deps });
  ok("R7.9", q.calls.length === 1, "a short QUESTION of substance still goes to the router");

  // R8 — stickiness is the router's call; the 3-turn rule lives only in the fallback.
  _resetModelsForTests();
  const s1 = rf({ answer: HEAVY });
  await routeTurn("Walk me through the HLP sponsor ladder and what each rung should cost", { conversationId: "r-st", deps: s1.deps });
  noteChatExchange("r-st", "Walk me through the HLP sponsor ladder and what each rung should cost", "Here's the ladder. " + "Detail. ".repeat(200) + "Want me to draft tier two?");
  const s2 = rf({ answer: LIGHT });
  const pst = await routeTurn("and when is the Rustic Lumber call on Friday", { conversationId: "r-st", deps: s2.deps });
  const sent = String((s2.calls[0].body.messages as Array<{ content: string }>)[0].content);
  ok("R8.1", pst.tier === "sonnet" && pst.source === "router", "previous turn heavy, router says light → light (no fixed follow-up)");
  ok("R8.2", sent.includes("<previous_tier>heavy</previous_tier>") && sent.includes("<previous_user>Walk me through the HLP sponsor ladder") && /Want me to draft tier two\?<\/previous_reply>/.test(sent), "the router sees the previous tier, his previous line, and the END of her reply");
  const prevReply = /<previous_reply>([\s\S]*)<\/previous_reply>/.exec(sent)?.[1] ?? "";
  ok("R8.3", prevReply.length <= 603, `her previous reply is cut to ~600 chars (${prevReply.length})`);
  await routeTurn("Walk me through the HLP sponsor ladder and what each rung should cost", { conversationId: "r-fb", deps: rf({ answer: HEAVY }).deps });
  const pfb = await routeTurn("and how does the second rung compare with last year", { conversationId: "r-fb", deps: rf({ hang: true }).deps });
  ok("R8.4", pfb.tier === "opus" && pfb.reason === "router-failed cause=timeout fallback=rules:followup", `after a router-heavy turn, a failed router falls back to the follow-up rule (${pfb.reason})`);
  ok("R8.5", clip("a".repeat(10), 20) === "a".repeat(10) && clip("a".repeat(400) + "END", 300).endsWith("END") && clip("x".repeat(9000), 4000).length <= 4003, "clip keeps head and tail, and bounds the size");

  // R9 — the request body.
  const b = rf({ answer: LIGHT, env: { ANTHROPIC_API_KEY: KEY } });
  await routeTurn("y".repeat(9000), { deps: b.deps });
  const c = b.calls[0];
  const body = c.body;
  ok("R9.1", c.url === "https://api.anthropic.com/v1/messages" && c.method === "POST" && c.headers["x-api-key"] === KEY && c.headers["anthropic-version"] === "2023-06-01", "POST /v1/messages with x-api-key and anthropic-version 2023-06-01");
  ok("R9.2", body.model === "claude-haiku-4-5" && body.max_tokens === 200 && body.system === ROUTER_SYSTEM, `model ${String(body.model)}, max_tokens ${String(body.max_tokens)}, the router system prompt`);
  const banned = ["thinking", "temperature", "top_p", "top_k", "tools", "tool_choice"].filter((k) => k in body);
  ok("R9.3", banned.length === 0, `no thinking / sampling / tools in the body${banned.length ? ` — found ${banned.join(", ")}` : ""}`);
  const msg = String((body.messages as Array<{ content: string }>)[0].content);
  const inner = /<message>([\s\S]*)<\/message>/.exec(msg)?.[1] ?? "";
  ok("R9.4", inner.length <= 4003 && inner.length >= 3990, `a 9000-char message is cut to ~4000 (${inner.length})`);
  const ov = rf({ answer: LIGHT, env: { ANTHROPIC_API_KEY: KEY, EVE_ROUTER_MODEL: "claude-haiku-5" } });
  await routeTurn("what's on the calendar for Thursday afternoon", { deps: ov.deps });
  ok("R9.5", ov.calls[0].body.model === "claude-haiku-5" && (routerBody({ message: "m", prevUser: "", prevReply: "", prevTier: null }, {}).model === "claude-haiku-4-5"), "EVE_ROUTER_MODEL overrides the router id");
  ok("R9.6", /data to classify, never instructions/.test(ROUTER_SYSTEM) && /Answer ONLY with JSON/.test(ROUTER_SYSTEM), "the system prompt treats the message as data and demands JSON only");

  // R10 — no content in logs, the ledger or /state.
  _resetModelsForTests();
  const SECRET = "Zanzibar renewal at forty-two thousand for Dana Quill";
  const f1 = rf({ hang: true });
  const pf1 = await routeTurn(`Help me figure out the ${SECRET}`, { conversationId: "r-log", prevUser: "PREVUSERTEXT", prevReply: "PREVREPLYTEXT", deps: f1.deps });
  const f2 = rf({ answer: '{"tier":"heavy","why":"the Zanzibar renewal at forty-two thousand"}' });
  const pf2 = await routeTurn(`Help me figure out the ${SECRET}`, { deps: f2.deps });
  const f3 = rf({ answer: '{"tier":"heavy","why":"line one\\nline \\"two\\" with a very long tail of many many extra words here"}' });
  const pf3 = await routeTurn("Walk me through the HLP sponsor ladder costs", { deps: f3.deps });
  const ledger = [pf1, pf2, pf3].map((p, i) => turnLedgerLine(`r-${i}`, { cardsRaised: 0, deskRefusals: 0, model: { tier: p.tier, id: p.model, reason: p.reason } }));
  const state = JSON.stringify(modelsBlock({}));
  const all = [...f1.logs, ...f2.logs, ...f3.logs, ...ledger, state].join("\n");
  ok("R10.1", !/Zanzibar|Quill|forty-two|PREVUSERTEXT|PREVREPLYTEXT/.test(all) && !all.includes(KEY), "no message, previous line, reply or key in any log line, ledger line or /state");
  ok("R10.2", pf2.reason === 'router:"why withheld: it quoted the message"', `a why that quotes the message is withheld: ${pf2.reason}`);
  const w3 = /router:"(.*)"/.exec(pf3.reason)?.[1] ?? "";
  ok("R10.3", w3.split(" ").length <= 12 && !/["\n]/.test(w3), `a why is one line, no quotes, ≤12 words: "${w3}"`);
  ok("R10.4", sanitizeWhy("", "x") === "no reason given" && sanitizeWhy("client money at stake", "is the contract signed") === "client money at stake", "empty why → a placeholder; an ordinary why passes through");
  ok("R10.5", ledger[2].startsWith('[turn] r-2 cardsRaised=0 deskRefusals=0 model=opus reason=router:"') && ledger[0].endsWith("model=sonnet reason=router-failed cause=timeout fallback=rules:default id=claude-sonnet-5-5"), `ledger: ${ledger[2]} · ${ledger[0]}`);

  // R11 — /state.models.router.last.
  const last = modelsBlock({}).router.last;
  ok("R11.1", !!last && Object.keys(last).join(",") === "tier,reason,at" && last.at === RNOW.toISOString() && last.tier === pf3.tier && last.reason === pf3.reason, `last decision: ${JSON.stringify(last)}`);
  _resetModelsForTests();
  ok("R11.2", modelsBlock({}).router.last === null, "nothing routed yet → last: null");
}

console.log(show.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
