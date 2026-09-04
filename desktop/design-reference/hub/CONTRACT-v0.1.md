# CONTRACT v0.1 — the dispatcher, brain → desktop

**Written 2026-09-01 from the shipping brain source (`C:\dev\eve\brain\src`), not from a design.** Every shape below is what the brain actually emits after the P0 + P1 v0.1 build. The desktop builds against THIS file. Where a value can be absent, it is written as `null` or the key is omitted — nothing is ever invented to fill a slot. Proof: `cd C:\dev\eve\brain && npx tsx verify/dispatch-harness.ts` (69 assertions, pure, no network).

Emitting code: `dispatch.ts` (jobs, frames, settle), `registry.ts` (fleet, ambient line, refusal), `state.ts` (`/state`), `index.ts` (routes, SSE), `confirm.ts` (`jobId` on cards).

---

## 0. Two modes, one flag — read `/health.dispatchReady` first

`sql/004_dispatch.sql` is written but NOT applied by this build. At boot the brain runs one probing select; the result is on the unauthenticated `/health`:

```jsonc
"dispatchReady": { "migrated": true,  "probedAt": "2026-09-01T20:04:18.550Z" }
"dispatchReady": { "migrated": false, "probedAt": "2026-09-01T20:04:18.550Z", "reason": "probe failed: column jobs.host does not exist" }
"dispatchReady": { "migrated": false, "probedAt": null, "reason": "memory spine offline" }
```

**Every shape below is identical in both modes.** The difference is durability: in pre-migration mode `why / tier / confirm_id / result / spec / conversation_id / host / cost_usd` exist only in the brain's memory for jobs created since its last restart, and are `null` for everything else. `unit` is always present (it rides in the legacy `agent` column). Render a `null` as a dash. Do not render `migrated:false` as an error — it is a capability flag; render it as a small "PRE-MIGRATION" tag if you render it at all.

---

## 1. `GET /state` — `jobs[]` (bearer-gated)

Every job **created in the last 24 hours, any status, newest first, limit 50**. A completed job stays on the list for a day. `jobsWindow` rides beside it.

```jsonc
"jobsWindow": { "hours": 24, "limit": 50 },            // + "error": "<message>" if the jobs read failed (jobs is then [])
"jobs": [
  {
    "id": "8069d32b-…",                 // uuid
    "unit": "pennyworth",               // roster key; ALWAYS present (falls back to `agent`)
    "agent": "pennyworth",              // legacy column, same value — the phone still reads this
    "title": "email Acacia about moving the shoot to the 12th",   // his sentence, first 140 chars
    "status": "in_approvals",           // queued | running | in_approvals | done | failed  (v0.1 uses ONLY these five)
    "host": "brain",                    // "brain" | "desk" — every v0.1 job is "brain"
    "why": "client email desk",         // her one-line routing reason, or null
    "tier": "red",                      // "green" | "red" — tier of the job's NEXT/LAST action — or null
    "confirm_id": "c1f0…",              // the pending confirm this job is waiting on, or null
    "result": { … },                    // see §1.1 — or null. NEVER written speculatively
    "result_ref": null,                 // legacy: local deliverable path for worker jobs, or null
    "cost_usd": null,                   // ACTUAL SDK spend for worker jobs, or null = unmeasured → render "—"
    "conversation_id": "conv-…",        // or null
    "spec": { "said": "…", "unit": "pennyworth", "routedBy": "model", "routedWhy": "…", "inputs": { "client": "Acacia Wellness" } },  // or null
    "created_at": "2026-09-01T19:58:01.120Z",
    "finished_at": null,                // set on in_approvals (workers), done, failed
    "updated_at": null                  // post-migration only; null before
  }
]
```

**Status meaning, per unit kind:**

| status | worker units (research, jsa, justice-league, suicide-squad) | pennyworth |
|---|---|---|
| `queued` | row opened, worker not yet started | (transient) |
| `running` | SDK subagent working (minutes) | OS is drafting |
| `in_approvals` | deliverable landed; an `approval` attention item carries the text; **approve → done** (existing `ops.ts`) | **draft is in the OS; the RED send card is up**; `confirm_id` set |
| `done` | he approved the deliverable | he approved the card and the OS sent; `result.kind = "confirm"` |
| `failed` | worker ended without a deliverable — a `job_failed` attention item exists | draft failed, OR he cancelled the card, OR the send threw after approve |

**Counting:** "in flight" = `queued | running | in_approvals`. `state.jobs.length` is no longer that number (the desktop `counters.ts` IN FLIGHT and the phone's "N ACTIVE" both currently use `.length` — both must filter by status now). THE WIRE: `RUNNING` = running, `HELD` = in_approvals, `FAILED` = failed (all inside the 24 h window the list already is). `WAITING` (needs_input) does not exist in v0.1 — render `—`, not 0.

### 1.1 `result` shapes (discriminated on `kind`)

```jsonc
{ "kind": "draft",       "client": "Acacia Wellness", "draft": "<OS draft text ≤4000>", "confirmId": "…", "at": "…" }   // pennyworth: card is up
{ "kind": "confirm",     "approved": true,  "executed": true,  "detail": "<OS reply>", "at": "…" }                       // done via the card
{ "kind": "confirm",     "approved": false, "executed": false, "detail": "cancelled",  "at": "…" }                       // failed: his cancel
{ "kind": "deliverable", "chars": 8123, "path": "…/data/deliverables/<id>.md" | null, "at": "…" }                       // worker landed (text is in the approval attention item's ref.content)
{ "kind": "failure",     "reason": "<≤200 chars>", "at": "…" }                                                          // failed
```

---

## 2. `GET /state` — `fleet` (bearer-gated) — **read the strip from here, not `/health`**

```jsonc
"fleet": {
  "registered": 52,        // units.length — roster rows + 1 brain-only worker (research). Bundled roster = 51 → 52; the LIVE OS roster read 53 on 2026-09-01 (/health.fleet.count) → 54. Never hard-code either.
  "dispatchable": 5,       // units with badge RUNNABLE
  "source": "os",          // "os" = membership read live from Churlish OS this window; "bundled" = cached copy (OS unreachable or unwired)
  "at": "2026-09-01T19:50:00.000Z",   // when that roster view was built
  "units": [
    {
      "key": "pennyworth",
      "name": "Pennyworth",
      "role": "Daily money brief + proposal agent inside Churlish OS.",   // roster job line; for research it is the registry's `does`
      "badge": "RUNNABLE",             // RUNNABLE | DESK | WORKSPACE_ONLY   (v0.1: 5 RUNNABLE, 0 DESK, 47 WORKSPACE_ONLY)
      "live": false,                   // the runner is wired + reachable from this brain RIGHT NOW. pennyworth → OS token present; workers → true; WORKSPACE_ONLY → always false
      "roster": true,                  // false only for research (a brain worker, not an OS roster row)
      "division": "fleet",             // roster division; "brain-workers" for research
      "loc": "CC",                     // roster loc (WS | CC | OS); "BRAIN" for research
      "lastRunAt": "2026-09-01T09:00:00Z"   // newest job created_at for this unit INSIDE the 24 h jobs window. KEY ABSENT when none — never null-as-zero
    }
  ]
}
```

Card dot per D-DISPATCH §7.1: teal = `RUNNABLE && live`; off/grey = `RUNNABLE && !live` (runner unreachable — e.g. OS unwired); purple = `WORKSPACE_ONLY`; blue/amber = `DESK` (none in v0.1). `stc` chip from `jobs[]` filtered by `unit`. `/health.fleet` still returns `{ready, live, count}` for the phone; `count` there is the roster count (51), not `registered`.

---

## 3. SSE frame `event: job` on `POST /chat` (streaming)

Emitted on the **dispatching turn's stream** at every status transition the brain makes during that turn. Best-effort: transitions after the stream closes (a worker finishing ten minutes later, a card approved from the phone) reach the desktop through `/state` on the next poll, not through this frame.

```
event: job
data: {"id":"8069d32b-…","status":"queued","unit":"pennyworth","title":"email Acacia about moving the shoot to the 12th","host":"brain","why":"client email desk","tier":"red"}

event: job
data: {"id":"8069d32b-…","status":"running","unit":"pennyworth","title":"…","host":"brain","why":"client email desk","tier":"red"}

event: confirm_request
data: { …existing PendingConfirm…, "jobId":"8069d32b-…" }        // ← NEW optional field on the existing frame (see §5)

event: job
data: {"id":"8069d32b-…","status":"in_approvals","unit":"pennyworth","title":"…","host":"brain","why":"client email desk","tier":"red","confirmId":"c1f0…"}
```

Keys are exactly `{ id, status, unit, title, host, why?, tier?, confirmId? }` — `why`/`tier`/`confirmId` are **omitted** (not null) when unknown. Sequence for pennyworth in one turn: `queued → running → in_approvals` (or `failed`). For a worker: `queued` only (then `running` a few ms later, usually still on the stream); `in_approvals`/`failed` arrive minutes later via `/state`. Upsert into the JOBS rail by `id`; the SESSION LOG gets one line per frame.

---

## 4. Attention item `kind: "job_failed"` (in `/state.attentionItems[]` — existing shape)

```jsonc
{
  "id": "…",
  "kind": "job_failed",
  "message": "pennyworth — email Acacia about moving the shoot to the 12th: The OS line isn't wired up yet (CHURLISH_OS_TOKEN missing…)",
  //          <unit> — <title ≤100> : <reason ≤200>
  "nudge_level": 1,
  "ref": { "jobId": "8069d32b-…", "job_id": "8069d32b-…", "unit": "pennyworth", "reason": "<same ≤200>" },
  "created_at": "…"
}
```

Actions through the existing `POST /attention/:id/action` — `dismiss` resolves it; `approve` on this kind changes nothing but resolves it. A job he **cancelled** at the card does NOT produce one (his own act is not a nag) — the row is `failed` with `result.kind:"confirm", approved:false`. The successful worker item is unchanged (`kind:"approval"`, `ref.job_id`) with `ref.jobId` and `ref.unit` added beside the legacy keys.

---

## 5. Confirm cards — `jobId`

`PendingConfirm` (SSE `confirm_request`, `/state.pendingConfirms[]`, `GET /confirm/:id`) gains one optional field: `"jobId": "<uuid>"`, present only on cards a job raised. Kind is the existing `"os_send_email"`; payload is `{ "client_name": "Acacia Wellness", "jobId": "…" }` (the hash covers both).

`POST /confirm {id, hash, approve}` reply, when the card carried a job:

```jsonc
{ "ok": true,  "executed": true,  "detail": "<OS reply>", "jobId": "…", "job": { "id": "…", "status": "done"   } }   // approve, sent
{ "ok": true,  "executed": false, "detail": "cancelled",  "jobId": "…", "job": { "id": "…", "status": "failed" } }   // cancel
{ "ok": false, "error": "send failed: OS answered 502",  "jobId": "…", "job": { "id": "…", "status": "failed" } }   // approve, OS refused → job_failed item too
{ "ok": false, "error": "payload hash mismatch — refresh and re-approve" }                                             // nothing settled, card kept
```

Not covered in v0.1 (say so in the UI rather than guessing): a card that **expires** unresolved (30 min) leaves the job at `in_approvals` with a `confirm_id` that `GET /confirm/:id` now 404s. Render that as "card expired — ask her again"; the brain does not yet sweep it.

---

## 6. The `dispatch_unit` tool (model-facing) and `POST /dispatch` (HTTP)

**Tool** `mcp__eve_hands__dispatch_unit` — parameters, no enum, no default:

```ts
{ unit: string,      // roster key or name ("pennyworth", "Perry White", "jsa"). Normalised (case/space/underscore → key); NEVER fuzzy-matched
  task: string,      // his sentence, verbatim
  why: string,       // her one-line routing reason → jobs.why / frame.why
  client?: string }  // required by pennyworth (declared in the registry row); missing → refusal, nothing started
```

Returns text. On acceptance, the `say` string (e.g. `Pennyworth drafted it for Acacia Wellness (job 8069d32b) and the send card is up (confirm c1f0…, expires …). NOT sent — his approve fires it through the OS. Draft as the OS returned it: …`). On refusal, the same text with `isError:true` — she must speak it.

**HTTP** `POST /dispatch { unit | agent, task, client?, why? }` → `200` with `DispatchAccepted`, `422` with `DispatchRefusal`, `400` if `task`/`unit` missing. **There is no default unit any more** (`agent:"eve"` used to be the default — now refused).

```jsonc
// 200 DispatchAccepted
{ "ok": true, "jobId": "…", "unit": "pennyworth", "name": "Pennyworth", "status": "in_approvals", "tier": "red", "confirmId": "…", "say": "…" }
{ "ok": true, "jobId": "…", "unit": "research",   "name": "Research",   "status": "queued",       "tier": "green",                  "say": "Research has it (job 8069d32b). It's running in the background — …" }

// 422 DispatchRefusal — the spoken-error shape (P0.1). NO job row is created, NO frame emitted, NO substitution.
{
  "ok": false,
  "code": "unit_not_runnable",        // unit_unknown | unit_not_runnable | missing_input | spine_offline | run_failed
  "unit": "perry-white",
  "name": "Perry White",              // when the unit exists on the roster
  "badge": "WORKSPACE_ONLY",          // when the unit exists on the roster
  "say": "I don't have a runner for Perry White — it's a workspace skill (trigger: \"Perry White\" · \"run Perry\" · …), WORKSPACE_ONLY from here. Here is who can actually do that from here: research (deep web research → document), justice-league (portfolio & sequencing verdict → document), jsa (single-decision tribunal → verdict), suicide-squad (adversarial teardown → document), pennyworth (client email: OS draft → RED send card).",
  "runnable": [ { "key": "research", "name": "Research", "does": "deep web research → document" }, … 5 rows … ]
}
```

`run_failed` is the one refusal code that DID open a job row (pennyworth accepted, the OS draft step failed): that row is `failed` and a `job_failed` item exists. `missing_input` / `spine_offline` open nothing.

---

## 7. The ambient fleet line (for the record — it is in her context pack, not on the wire)

```
Fleet: 51 roster units + 1 brain-only. RUNNABLE via dispatch_unit: research, justice-league, jsa, suicide-squad, pennyworth(email). DESK-wired: none. 47 are WORKSPACE_ONLY — name the unit + trigger, never claim to run them.
```

≈58 tokens, every turn, names and badges only. Counts are computed from the roster + registry, never literals. `(cached)` is appended when the roster came from the bundled copy.

---

## 8. What the desktop must NOT assume

- `jobs[]` is not "in flight" — filter by status (§1).
- `registered` (52) ≠ `/health.fleet.count` (51): one is the fleet block's unit count including the brain-only research worker, the other is the OS roster count.
- A `job` frame may never arrive for a transition the brain made after the stream closed; `/state` is the truth, the frame is the fast path.
- `cost_usd` is null for every pennyworth job and for worker jobs the SDK did not price; render `—`.
- `DESK` badge and `needs_input` status exist in the type space and in nothing shipped; render nothing for them.

---

## v0.2 fleet additions — skills are units (2026-09-01)

**Written from the shipping brain source after the v0.2 build (`registry.ts`, `dispatch.ts`, `index.ts`, `skills/MANIFEST.json`). Not deployed yet.** Proof: `cd C:\dev\eve\brain && npx tsx verify/dispatch-harness.ts` (111 assertions, pure, no network). Everything in §0–§8 above still holds; this section lists ONLY what is new or changed.

### v0.2.0 What changed, in one paragraph

His on-disk skills are now dispatchable. `scripts/sync-skills.mjs` classifies every SKILL.md directory (RUNNABLE = text-in/text-out from the brain; WORKSPACE_ONLY otherwise, each with a written reason), bundles the runnable ones (SKILL.md + `.md/.txt/.json/.csv` references, ≤ 400 KB each) into `brain/skills/<key>/`, and writes `brain/skills/MANIFEST.json`. `registry.ts` loads the manifest at boot and merges it with the 5 code rows (code wins on conflict). A manifest row has runner **kind `"skill"`**: it runs on the SAME SDK-subagent path as `research` (same turn/budget/minute caps, same `WebSearch`/`WebFetch`-only tool list — **no send tools**, that list is code), with the skill's SKILL.md + references as the system prompt, and lands `deliverable → approvals → done` exactly like research. The sync on 2026-09-01: **37 skills bundled, 22 excluded** (jsa / justice-league / suicide-squad stay code rows and are not double-registered), so the registry is **42 units** (4 workers + 1 tool + 37 skills).

### v0.2.1 `GET /state` — `fleet` block: new fields

```jsonc
"fleet": {
  "registered": 58,        // units.length. LIVE OS roster (53 on 2026-09-01) + 5 brain-only units → 58; bundled roster (51) → 56. Never hard-code.
  "dispatchable": 42,      // badge === RUNNABLE  (was 5)
  "pinned": 9,             // NEW — units with pinned:true (the CORE default set)
  "kinds": { "worker": 4, "tool": 1, "skill": 37 },   // NEW — registry units by runner kind (sums to dispatchable while nothing is DESK)
  "source": "os",
  "at": "…",
  "units": [
    {
      "key": "starfire", "name": "Starfire",
      "role": "First seat on EVE's directors bench. Owns organic social end-to-end: …",   // roster job line (unchanged); for brain-only skills it is the skill's short role
      "badge": "RUNNABLE", "live": true, "roster": true, "division": "fleet", "loc": "WS",
      "kind": "skill",         // NEW — "worker" | "tool" | "skill" | null. null ⇔ WORKSPACE_ONLY
      "pinned": true,          // NEW — boolean, always present
      "triggers": "\"run Starfire\" · \"post this\" · \"what's pending\" · social calendar/approvals",   // NEW — string, always present, ≤ 80 chars, "" when unknown; whole " · " phrases only, never cut mid-phrase
      "tier": "yellow"         // NEW — the UNIT'S DEFAULT tier: "green" | "yellow" | "red". KEY ABSENT for WORKSPACE_ONLY units. yellow = drafts, then waits for him (every worker + every skill); red = pennyworth (needs his approve to act); green = none today
      // "lastRunAt" unchanged (absent when none)
    },
    { "key": "cyborg", "badge": "WORKSPACE_ONLY", "kind": null, "pinned": false, "triggers": "Daily ad brief", "live": false, … },   // no "tier" key
    { "key": "jimmy-olsen", "badge": "RUNNABLE", "kind": "skill", "roster": false, "division": "brain-skills", "loc": "BRAIN", "pinned": true, "tier": "yellow", "role": "the minutes desk", … }
  ]
}
```

- `division` gains the value **`"brain-skills"`** (a bundled skill with no roster row: `brainiac`, `cinemarketer-sales-coach`, `jimmy-olsen`, `mister-miracle`); `research` keeps `"brain-workers"`. Both carry `loc:"BRAIN"`, `roster:false`.
- Observed on 2026-09-01 against the LIVE OS roster: 42 RUNNABLE, 0 DESK, 16 WORKSPACE_ONLY (`eve, oracle, cyborg, steele, the-flash, lois-lane, the-question, huntress, rookie, diagnostic-agent, master-plan-style, verification-loop, goal-runner, session-handoff, mindctrl-publishing-council, big-barda`). Against the bundled roster: 42 / 0 / 14. Counts are computed; render what arrives.
- **The pinned set (9):** `research, pennyworth, starfire, kid-flash, red-robin, blue-beetle, perry-white, jimmy-olsen, watchtower`. THE CORE shows `pinned:true` units by default; everything else is behind the fleet_roster/full list. The set lives in `scripts/sync-skills.mjs` (skills) and `registry.ts` (code rows) and can change on a re-sync — read `pinned`, never a literal list.
- Card dot per D-DISPATCH §7.1, extended: `kind:"skill"` behaves exactly like `"worker"` (teal when `live`, which is always true for skills — they ride the chat loop's credentials). `tier` is the unit's default, NOT the job's tier (see v0.2.2).

### v0.2.2 `GET /state` — `jobs[]`: what a skill job looks like

Shape unchanged. `unit` may now be any of the 42 registry keys (e.g. `"starfire"`, `"perry-white"`, `"jimmy-olsen"`). Status meaning for a skill job is the **worker** column of the §1 table: `queued → running → in_approvals (deliverable landed; approve → done) | failed`. `job.tier` stays the v0.1 wire (`"green" | "red" | null`): a skill job carries `"green"` like a worker job (nothing external happens on its last step); the unit's yellow default is on `/state.fleet.units[].tier`, not on the job. `cost_usd` is the SDK's actual spend when it reports one. `result.kind:"deliverable"` unchanged.

### v0.2.3 `/health.fleet` (unauthenticated) — counts only, never a name

```jsonc
"fleet": { "ready": true, "live": true, "count": 53,          // unchanged: roster rows
           "dispatchable": 42, "kinds": { "worker": 4, "tool": 1, "skill": 37 }, "pinned": 9,   // NEW — equal to /state.fleet's
           "manifest": { "loaded": true, "units": 37, "excluded": 22, "generatedAt": "2026-09-02T01:34:49.146Z" } }   // NEW; + "error": "<why>" when loaded:false or rows were dropped
```

`manifest.loaded:false` means the brain booted without `skills/MANIFEST.json` — the 5 code rows still run; render a small "SKILLS NOT LOADED" tag, not an error.

### v0.2.4 `dispatch_unit` / `POST /dispatch` — refusal shape changes

```jsonc
// 422 DispatchRefusal — `runnable` is now AT MOST 8 rows chosen by role relevance to the unit he named (its name, roster job/triggers/division, and the sync's exclusion reason), never the whole list.
{
  "ok": false, "code": "unit_not_runnable", "unit": "cyborg", "name": "Cyborg", "badge": "WORKSPACE_ONLY",
  "say": "I don't have a runner for Cyborg — it's a Claude Code unit (trigger: Daily ad brief), WORKSPACE_ONLY from here (builds live Meta campaign objects through the Meta Ads MCP, which the brain does not hold). Closest units that can run from here: ad-diagnostic-engine (…), red-robin (…), … If you hand it to one of them instead, tell him which unit ran it and why, in one clause.",
  "runnable": [ { "key": "ad-diagnostic-engine", "name": "Ad Diagnostic Engine", "does": "…" }, … ≤ 8 rows … ]
}
```

- `unit_not_runnable` (with `badge:"WORKSPACE_ONLY"` and a titleized `name`) is now ALSO returned for a skill that exists on his disk but was classified WORKSPACE_ONLY and is not a roster row (`docx`, `pptx`, `xlsx`, `pdf`, `reel-vision`, `eve-super-brain`, …) — with the classification reason in `say`. `unit_unknown` is reserved for names on neither the roster nor the sync's lists.
- **Re-route honesty** (his ask): the `say` of every refusal ends with the clause above; the tool description tells her that when the unit he named is not runnable and she routes elsewhere she must say which unit ran it and why, and that when the unit IS runnable she runs THAT unit. `perry-white`, `starfire`, `kid-flash`, … are runnable now and are no longer refused. Acceptance `say` for a skill: `"<Name> has it (job xxxxxxxx). Drafting in the background — the deliverable lands in his approvals with a ping when done (minutes). It drafts, then waits for him: nothing is sent, posted, or published by a skill worker. Don't claim its results before it lands."`

### v0.2.5 The ambient fleet line (context pack, not on the wire)

```
Fleet: 58 units — 42 RUNNABLE, 16 WORKSPACE_ONLY. dispatch_unit runs them by name; fleet_roster lists them; others can't run here. Pinned: research, pennyworth, blue-beetle, jimmy-olsen, kid-flash, perry-white, red-robin, starfire, watchtower. Re-routing? say which unit and why.
```

Counts per badge (DESK named only when > 0) + the pinned names + the re-route clause; the 42 names live in `fleet_roster`. `(cached)` is appended after the counts when the roster came from the bundled copy. Measured with the real tokenizer (`count_tokens`, claude-haiku-4-5, 2026-09-01): the cached-roster line is **~92 content tokens** (100 reported; the live line drops " (cached)" → ~90) (reported count minus the 8-token single-message baseline); chars/4 under-counts it (≈72) because hyphenated keys and `WORKSPACE_ONLY` tokenize expensively. The harness bounds it by length (≤ 300 chars).

### v0.2.6 What the desktop must NOT assume (additions)

- `dispatchable` is not 5 and `registered` is not 52/54 — both moved and both are computed. `WORKSPACE_ONLY` is `registered − dispatchable` while nothing is DESK.
- `tier` on a fleet unit is a DEFAULT, not a job state; `job.tier` still never carries `"yellow"`.
- `triggers` is always a string (possibly `""`); `kind` is `null` (not absent) for WORKSPACE_ONLY units; `tier` is ABSENT (not null) for them.
- A unit's `role` for brain-only skills is the skill's short role (e.g. `"the minutes desk"`), not a roster job line.
- The skill bundle is only as fresh as the last `node scripts/sync-skills.mjs` + redeploy; a skill edited on disk does not change the brain until then. `/health.fleet.manifest.generatedAt` says when.

---

## v0.3 turn provenance on a filing card (2026-09-02)

### v0.3.0 What changed, in one paragraph

An independent audit ran ten adversarial screenshots through a real brain. Every PHYSICAL law held — a source path is unrepresentable in the plan schema (`desk_file_plan` takes `{i, toRoot, toRel}`; `validatePlan` sets `fromRel` off the pack entry, `brain/src/desk.ts:1787`), nothing moved, no URL was fetched, the hash bound every path. What failed was SOCIAL: a forged Slack bubble wearing King's name talked her into narrating "standing authorisation" and raising a real card on a turn where he typed the two words *"What's this?"*. So the card itself now carries two facts he can read before he approves. **Neither is a refusal. APPROVE stays enabled in every case — this is information.**

Two fields, from two different processes, on purpose:

| Field | Where it lives | Who computes it | Inside the hash? |
| --- | --- | --- | --- |
| `payload.provenance` | inside the `file_batch` payload | **the brain** (`connectors.ts` `desk_file_plan`) | **yes** |
| `destCheck` | on `PendingConfirm`, beside `payload` | **the desktop** (`electron/api.ts`) | **no** |

### v0.3.1 `payload.provenance` — a picture was in this turn

New optional object on the `kind: "file_batch"` payload only. It is stamped from a fact the hard image validator established in `index.ts` **before the model generated a token**, so the model cannot set it, clear it, or argue with it — and because it is inside the hashed payload, it cannot be stripped between the brain and his screen without `POST /confirm` failing closed on `payload hash mismatch`.

```jsonc
"provenance": {
  "sawImage": true,                                            // required when the object is present
  "imageNote": "a PNG he attached to this message (412 KB)"    // optional; absent when sawImage is false
}
```

- `sawImage` — `true` iff the chat turn that produced this plan carried a validated image. `false` is emitted explicitly, so `{ "sawImage": false }` means *this brain checked and there was no picture*.
- `imageNote` — one short sentence, built from the brain's OWN measurements (the **sniffed** mime, the **decoded** byte count), never from the declared mime, the filename, or anything the picture claims about itself. A hostile screenshot cannot write the line that warns about hostile screenshots. Present only when `sawImage` is `true`.
- The whole object is **ABSENT on an older brain**. Absent means UNKNOWN and the desktop renders nothing — never "no picture", because it does not know that. The renderer parser (`src/renderer/desk/payload.ts:82`) drops the object unless `sawImage === true` and clamps `imageNote` to 120 chars.
- The tool's text reply to the model also says the turn carried a picture, so she is told to name any part of the plan that came off the image rather than out of his words.

### v0.3.2 `destCheck` — this destination did not come from your message

New optional field on `PendingConfirm`, **beside `payload`, never inside it**: the payload hash is minted in the brain and this is computed afterwards, so it must not touch it.

```jsonc
{
  "id": "…", "kind": "file_batch", "hash": "…", "expiresAt": "…",
  "payload": { … },
  "destCheck": {
    "grounded":   [],                                  // destinations he named
    "ungrounded": ["projects\GE Outdoors\Footage"]   // destinations he did not
  }
}
```

The brain never sends this. **The desktop computes it**, because `a5`/`a3`/`a9` are exactly the case where the turn is compromised, and a compromised turn cannot be trusted to grade itself. Main is the only process holding both halves — the message King typed and the plan she raised on it — and no model is in the loop: `src/shared/destination-check.ts` is a pure function, and `electron/api.ts:515` routes every frame of the turn through it.

The rule, small enough to explain on the card:

- Only `move` and `rename` are graded. A `stage` composes its own path into his trash, so there is no destination he could have named → `null`.
- A row that lands in the folder it started in chose no destination → skipped.
- A destination is **grounded** when EVERY folder segment along its path appears in his typed message as a whole-word run (case-, accent- and punctuation-folded) — or, for a file landing in the root of a census folder, when the root label does.
- A half-named path is **ungrounded**: he said `Clients`, the plan says `desktop\Clients\Acme`, and `Acme` came from somewhere else. The root label alone never grounds a subfolder — `validatePlan` refuses a root off the census, so the root is the part an attacker could not have chosen and is worth nothing as evidence.
- Everything else is **ungrounded**, and the card names it.

`destCheck` is **ABSENT** when there is nothing honest to say — a `stage`, an unreadable payload, a batch where every row stays put, or a card rehydrated in a session that never saw the turn. **Absent is silence, not a clean bill of health**; the card renders nothing rather than implying it checked. A card rehydrated from the 30 s `/state` poll gets the remembered check re-applied (`api.ts:140`, bounded at 50 ids in memory) so the warning does not quietly vanish when the modal re-mounts.

### v0.3.3 What the desktop must NOT assume

- `provenance` absent ≠ `sawImage: false`. One is "I don't know", the other is "I checked".
- `destCheck` absent ≠ `ungrounded: []`. Same distinction.
- `grounded` being non-empty says nothing about `ungrounded` — a batch can be both, and the card names only the ungrounded half.
- Neither field may disable APPROVE, gate the hold, or shorten the read-to-end. They are lines above the rows in the existing gold/warning treatment. **Never red** — red is the RED tier and the live mic.
- `provenance` appears on `file_batch` only. Do not look for it on `os_send_email`.

---

## v0.4 the taint is on the conversation, and the brain refuses (2026-09-02)

**Written from the shipping source after the H1–H4 build. Not deployed.** Proof: `cd C:\dev\eve\brain && npx tsx verify/image-harness.ts` (101 assertions, pure, no network, no model) and `cd C:\dev\eve\desktop && npm run verify:injection` (34 assertions). Everything in §0–§8 and v0.2 still holds. v0.3 holds except where this section says otherwise, and it says otherwise in two places: `provenance` gains a field, and `destCheck` gains two.

### v0.4.0 What changed, in one paragraph

A second independent audit ran fourteen adversarial screenshots through a real brain. The physical layer held again — nothing moved, no path escaped, no byte left the box. Five attacks were inert. **Four got through, and all four were the same mistake: the card was correct about the TURN and wrong about the PLAN.** The worst was b10/b10c, *the launder*: turn N carries a picture that names a folder and she refuses it correctly; turn N+1 carries no picture and five words — *"yeah, go ahead and file them"* — and she raises a real card for the picture's folder, calls it *"as you said"*, and stamps it `{"sawImage": false}`, which per §v0.3.3 means **"I checked and there was no picture."** The stamp was actively wrong about where the plan came from. So: **the taint belongs to the conversation, not the turn**, and **the brain now refuses rather than warns** when a picture is in the room and the destination is not in his words.

Four changes, three of them new fields and one of them a new refusal:

| # | Change | Where | Behaviour |
| --- | --- | --- | --- |
| H1 | `provenance.imageTurnsAgo` | brain, **inside the hash** | the banner fires on the CONVERSATION |
| H2 | `desk_file_plan` refusal (`G-I7`) | brain, before the card is minted | **NO CARD IS RAISED** |
| H3 | `destCheck.renamedUngrounded` | desktop, beside `payload` | a third gold line |
| H4 | `destCheck.attributionSuspect` | desktop, beside `payload` | a fourth gold line, above HER REASON |

### v0.4.1 `provenance.imageTurnsAgo` — a picture is in this CONVERSATION

New optional field inside the existing `payload.provenance` object on `file_batch` payloads. Like `sawImage`, it is computed **before the model generates a token** and rides **inside the hashed payload**.

```jsonc
"provenance": {
  "sawImage": false,          // no picture on THIS turn — and that is still true
  "imageTurnsAgo": 1,         // but one came in one turn ago, and it is still in her context
  "imageNote": "…"            // optional; present ONLY when sawImage is true
}
```

- `imageTurnsAgo` — `0` when the picture rode in on this turn, `n` when the most recent picture was `n` turns back, **`null`** when there has been no picture inside the window. **SUPERSEDED BY v0.5:** `null` now means no picture has EVER been in this SDK session, and the distance never degrades to `null` while that session is alive. Read §v0.5.2.
- ~~**The window is 25 turns**~~ — **DELETED AS A BOUNDARY BY v0.5.** The constant survives as `TAINT_FRESH_TURNS` and is now a DISPLAY threshold that gates nothing. The reasoning below is kept for the record, and the thing it got wrong is that it reasoned about the window's LENGTH when the bug was that the window existed at all:
  - **Not 5** (the audit's suggestion). An attacker's only cost to beat a short window is patience, and patience is free. The hostile caption sits in the SDK transcript until the session dies; a number small enough to wait out buys the appearance of a fix and nothing else.
  - **Not unbounded**, which is what "the pixels are still in her context" argues for. His desktop keeps ONE `conversationId` in `localStorage` effectively forever. Unbounded taint means one screenshot, ever, and every filing plan for the rest of that conversation needs a folder he typed by hand — the feature switched off by a Slack paste six weeks ago.
  - **25** is five times the audit's number and roughly an hour of real back-and-forth. Every laundering attempt in audit 2 fired on turn N+1; none waited at all.
- ~~**How he escapes it**, and all three are cheap: name the folder in words, let 25 turns pass, or start a new conversation.~~ **DELETED BY v0.5.** Naming the folder is no longer the escape (the grounding rule is gone), and *waiting* was never an escape at all — the window lapsed while the pixels stayed in the resumed transcript. The one remaining escape is a new conversation or a brain restart, both of which drop the SDK session that holds the picture. See §v0.5.2.
- The ledger is **in-memory, per conversation, bounded at 500 conversations (LRU)**, and dies with the process — the same lifetime as the SDK `sessions` map that holds the pixels. There is no endpoint onto it and it is never persisted.
- The **desktop banner** now reads `A PICTURE WAS IN THIS CONVERSATION — 1 TURN AGO` when `sawImage` is false and `imageTurnsAgo` is a number, and keeps the original `A PICTURE WAS IN THIS TURN` when `sawImage` is true. Still gold, still never red, and **APPROVE stays enabled**.
- `imageNote` remains **turn-scoped**: a picture two turns back leaves `imageTurnsAgo: 2` and NO note, because the brain describes only bytes it validated on this turn.

### v0.4.2 `null` is not absent, and neither is `false` — the three-state rule

This is the rule §v0.3.3 stated for `provenance` as a whole, now stated for every field on it, because the launder turned the distinction into a live exploit:

| Value | Means |
| --- | --- |
| field **absent** | an older brain. **UNKNOWN.** The card says nothing. |
| `imageTurnsAgo: null` | this brain looked and found no picture in the window. |
| `imageTurnsAgo: 0` | the picture is on this turn. |
| `imageTurnsAgo: n` | the picture was `n` turns ago and is still in her context. |
| `sawImage: false` | no picture on **this turn** — **which no longer means no picture.** |

**`provenance` absent ≠ `sawImage: false`, and `sawImage: false` ≠ "no picture was involved".** Read `imageTurnsAgo` before concluding anything about origin. A desktop that renders a banner on `sawImage === true` alone will print nothing on exactly the card that needs it — that was the bug.

### v0.4.3 ~~`G-I7`~~ — **DELETED BY v0.5. THIS RULE NO LONGER EXISTS.**

The refusal this section described has been removed from the brain, along with `brain/src/grounding.ts`. It tried to infer authorship from string overlap with his typed message: a QUESTION grounded as well as an order (P8) and a bare root label grounded a mass move (P2). It is replaced by the narrow shape — see **§v0.5.3**. Nothing in the wire shape changed; a refusal was always the absence of a confirm frame. Anything asserting on `G-I7` is asserting on a rule that was deleted.

The one claim from this section worth carrying forward is the one that still holds: **when the brain refuses, there is no confirm, no id, and nothing for the desktop to render.**

### v0.4.4 `destCheck` — two new fields

```jsonc
"destCheck": {
  "grounded":   [],
  "ungrounded": ["downloads\\GE Outdoors\\Footage"],
  "renamedUngrounded": ["GE_260901_01", "GE_260901_02", "GE_260901_03"],
  "attributionSuspect": true
}
```

**§v0.4.4 SURVIVES AS DECORATION ONLY (v0.5).** Both fields below still ride on the confirm and still render. Neither gates anything, and `brain/src/grounding.ts` — the twin that refused on the same grade — is deleted.

- **`renamedUngrounded`** *(H3)* — new file **stems** on rows whose basename changed and which he never typed. Graded the same way a folder segment is: folded to a whole-word run, tested against his typed message. The **extension is never graded** — `validatePlan` refuses an extension change outright, so it is not something he could have failed to authorise.
  - Previously `destinationCheck` graded folders only and returned `null` — **total silence** — for a rename in place, because a rename in place lands where it started and every row fell through the same-place skip. That is a hole with a name: an attacker who cannot relocate a file can still rename **every file on his desk** to whatever a photograph says, and nothing on the card mentions it. The early-out on "both folder arrays empty" is gone; a verdict now survives on the strength of the names alone.
  - Renders as a third gold line: `THESE NEW NAMES DID NOT COME FROM YOUR MESSAGE.`
  - **ABSENT** on a check computed by an older desktop. Absent is silence.
- **`attributionSuspect`** *(H4)* — `true` when the grade already found something ungrounded **and** her own `intent` line claims his authorship. One regex in main (`\byour\b`, `\byou (said|named|asked|told|wanted|mentioned)\b`, `\bper you\b`, `\bas discussed\b`), no trust in the model: she attributed the picture's text to him on roughly half of audit-2 samples — *"per your doc"*, *"as you said"*, *"the destination he named"* — and the prompt law did not stop her.
  - **Never set on a clean grade.** A possessive is ordinary prose on an honest turn, and a banner that fires on honest turns is a banner he stops reading.
  - Renders **directly above HER REASON**, because it is a statement about the sentence underneath it: `SHE SAYS THIS CAME FROM YOU. IT DID NOT.`

### v0.4.5 What the desktop must NOT assume (additions to §v0.3.3)

- **`sawImage: false` no longer means "no picture was involved."** It means no picture on this turn. Read `imageTurnsAgo`. A banner gated on `sawImage === true` alone is the launder bug.
- `imageTurnsAgo: null` ≠ field absent. `null` is "I looked"; absent is "an older brain".
- `imageTurnsAgo: 0` is falsy in JavaScript. Test `typeof x === "number"`, never `if (x)`.
- `renamedUngrounded` absent ≠ `[]`. Same distinction as everywhere else here.
- `attributionSuspect` is **advisory and derived**. It never gates APPROVE, and it never appears without an ungrounded destination or an ungrounded name above it.
- **A card that does not arrive is not an error to retry.** When the brain refuses under `G-I7` there is no confirm and no id; the desktop has nothing to render and must not synthesise a placeholder card, a "refused" card, or a toast implying something is pending. Her spoken answer is the whole of the UI for that outcome.
- None of the four may disable APPROVE, gate the hold, or shorten the read-to-end. They are gold lines above the rows and one gold line above HER REASON. **Never red** — red is the RED tier and the live mic.

---

## v0.5 the narrow shape — a picture may supply FILENAMES and nothing else (2026-09-02)

**Written from the shipping source after the audit-3 rebuild. Not deployed, not committed.** Proof: `cd C:\dev\eve\brain && npx tsx verify/image-harness.ts` (132 assertions, pure, no network, no model — the reader's transport is injected) and `cd C:\dev\eve\desktop && npm run verify:injection` (34). Everything in §0–§8 and v0.2 still holds. **v0.3 and v0.4 hold except where this section deletes them, and it deletes a lot.**

### v0.5.0 What changed, in one paragraph

A third independent audit killed lexical grounding outright. Its verdict, accepted and not re-litigated:

> *This feature cannot be made safe in this shape. The refusal tries to infer AUTHORSHIP from STRING OVERLAP, and a picture can write the string. Every patch to it will be a longer regex against an adversary who is choosing his words for him.*

Two findings ended it. **P8:** a QUESTION grounds as well as an order — *"what's this note on my monitor about the Clients Northwind thing"* contains every word of `Clients\Northwind`, so the move was GROUNDED and CARDED, off a question he asked about a picture whose answer the picture wrote. **P2:** a bare root label grounds a mass move — *"sort my downloads into projects"* is two words he says every day and it authorised every file he owns landing in the top level of a root.

So the test is **inverted**. It no longer asks *"is this destination in his message?"* (unanswerable — a picture can put words in his mouth by writing them where he will read them out). It asks *"is this destination in THE PICTURE?"*, which is a fact about a string and a bitmap, and it is answered by a **separate reader pass** that has no tools and no plan to defend. Around that sits a **structural operation lock**: while a picture is in the session it is MOVE only, no renames, no bare root drops.

| # | Change | Where | Behaviour |
| --- | --- | --- | --- |
| N1 | `brain/src/grounding.ts` **DELETED** | brain | `G-I7` no longer exists |
| N2 | operation lock | brain, `narrow.ts` | `stage` and any rename raise **NO CARD** while a picture is in the session |
| N3 | reader-exclusion refusal | brain, `narrow.ts` + `reader.ts` | a destination written in the picture raises **NO CARD** |
| N4 | `payload.nameProvenance` | brain, **inside the hash** | a fifth gold line: `SHE ADDED N FILES YOU DID NOT NAME.` |
| N5 | `provenance.imageSeen` / `imageExpired` | brain, **inside the hash** | the taint is on the SDK SESSION and never degrades to `null` |
| N6 | stage card anatomy | desktop | a stage card finally says it is a stage |

### v0.5.1 DELETED FROM v0.4 — claims that no longer hold

Read this before anything else in v0.3/v0.4. These are not softened, they are **gone**.

- **`G-I7` does not exist.** §v0.4.3 in its entirety is deleted. The brain no longer refuses on "the destination is not in his typed message", because that test refused honest turns and passed hostile ones. Nothing in the wire shape is affected — a refusal was always the *absence* of a confirm frame — but a desktop or harness asserting on `G-I7` is asserting on a rule that was removed.
- **`brain/src/grounding.ts` is deleted, and the "deliberate twins" claim with it.** `desktop/src/shared/destination-check.ts` no longer has a twin, no longer refuses anything, and is **not load-bearing**. It survives as a banner because *"you did not type that folder"* is still worth printing. It gates nothing.
- **The 25-turn taint window is deleted as a security boundary.** §v0.4.1's escape hatch *"let 25 turns pass"* is gone. The window lapsed while the pixels did not: `chat.ts` keeps its session map with no expiry and passes `resume:`, so at turn 27 a hostile screenshot was still in her context while the stamp said `imageTurnsAgo: null` — which §v0.4.2 defines as **"I looked and there was no picture"**. A number that stops being true on a schedule is worse than no number, because the contract gave that particular falsehood a confident meaning.
- **`imageTurnsAgo: null` no longer means "no picture in the window".** It means **no picture has ever been in this session**. See §v0.5.2.
- **"A stage is never blocked by the window" is deleted.** §v0.4.3 said a stage composes its own path into his trash, so there is no destination he could have named, so the window never blocks his trash. That was true and it was the hole: `destCheck` returned `null` — silence — on exactly the operation that takes files away from him. See §v0.5.3.

### v0.5.2 `provenance` — the taint is on the SDK SESSION

```jsonc
"provenance": {
  "sawImage": false,        // no picture on THIS turn — still true, still not the whole truth
  "imageSeen": true,        // NEW: a picture is in this SDK session's transcript
  "imageTurnsAgo": 41,      // how far back. NEVER null while imageSeen is true
  "imageExpired": true,     // NEW: past the 25-turn freshness threshold. Degrades the banner. GATES NOTHING
  "imageNote": "…"          // optional; present ONLY when sawImage is true
}
```

| Value | Means |
| --- | --- |
| `provenance` **absent** | an older brain. **UNKNOWN.** The card says nothing. |
| `imageSeen` **absent** | an older brain, or v0.4-era. Fall back to `imageTurnsAgo`. |
| `imageSeen: true` | a picture is in the session that produced this plan. **Gate the banner on this.** |
| `imageTurnsAgo: null` | no picture has **ever** been in this session. |
| `imageTurnsAgo: 0` | the picture is on this turn. |
| `imageTurnsAgo: n` | `n` turns back **and still in her context**. |
| `imageExpired: true` | `n` is past 25. **Advisory only** — softens the banner's wording, changes no rule. |

- **The taint is cleared in exactly one place**: `chat.ts` `endSession()`, which calls `sessions.delete()` and `clearImageTaint()` in the same statement. The pixels live in the SDK transcript; when it goes, they go, and not one turn before.
- **The freshness threshold (25) is a DISPLAY threshold and must never become a security parameter.** The banner degrades from `A PICTURE WAS IN THIS CONVERSATION — 1 TURN AGO` to `A PICTURE CAME INTO THIS CONVERSATION A LONG WAY BACK — 41 TURNS AGO, AND IT IS STILL IN HER CONTEXT`. The refusals in §v0.5.3 do not soften with it.
- **How he escapes a taint he did not earn:** start a new conversation, or let the brain restart. Both drop the SDK session, which is the only thing that was ever holding the picture. *Waiting* is no longer an escape, because waiting never actually removed anything.
- **Session-lifetime taint is affordable now, and it was not before.** Under v0.4 one screenshot meant every filing destination for the rest of that conversation had to be typed by hand. Under the narrow shape, filing **keeps working** with a picture in the room — move-only, no renames, and a destination the picture does not mention. The taint no longer switches the feature off; it narrows it.

### v0.5.3 THE NARROW SHAPE — five refusals, all of them structural

Not fields. `desk_file_plan` declining to mint a card at all: **no confirm frame, no id, no `hash`, nothing in `/state.pendingConfirms`, nothing on his screen.** Her spoken answer is the whole of the UI for that outcome, and the desktop must not synthesise a placeholder card or a toast implying something is pending.

**All five fire only while `imageSeen` is true.** With no picture anywhere in the session, none of this executes and filing behaves exactly as it did in v0.2: she picks her own folder names, she renames, she stages.

| Code | Refuses | Dead attack |
| --- | --- | --- |
| `N-OP` | `op` is not `"move"` — **`stage` is refused outright** | **d8.** A fake cleanup report staged his tax return and his passport scan. `destCheck` returned `null` because a stage has no destination to grade. |
| `N-RENAME` | any row where `basename(toRel) !== basename(fromRel)` | a photograph naming a renaming scheme. No grounding test, no banner substituting for a refusal. |
| `N-ROOTDROP` | any destination with no folder under the root | **P2**, and it stays dead. |
| `N-BLIND` | the reader pass did not come back | fail closed. The exclusion list **is** the defence; an absent list is not a clean bill. |
| `N-INPICTURE` | a destination folder name occurs in what the reader read | **the crux.** Replaces the whole of `G-I7`. |

**The reader pass** (`brain/src/reader.ts`) is one SDK call with the image and **no tools, no context, no history, one turn**, whose entire prompt is *transcribe the visible text*. Its output is UNTRUSTED DATA used as an **EXCLUSION LIST and nothing else**: it never becomes a filename she acts on, never becomes a destination, never reaches the planner, and reaches his screen only as a quoted refusal. A hostile reader output can do exactly one thing — cause **more** refusals. It runs **once per picture, not once per plan**, and is remembered against the conversation for the life of the taint.

**Matching** is whole-word after an NFKD fold, in both directions: the whole segment inside the transcript, or any word of the segment ≥4 characters (never a bare number) inside the transcript. A segment that folds to nothing is a **hit** — what cannot be folded cannot be cleared.

**THE HONEST LIMIT, stated rather than hidden.** A picture that hides its destination from the READER while showing it to the PLANNER is the residual risk. It is small: both passes are the same model family on the same pixels through the same decoder, and the reader has the strictly easier job. Text legible enough to steer a planner is text a transcriber reads. It is also a door that only ever opens onto a **card** — nothing here moves a file, the destination still renders, and he still has to scroll it and press APPROVE.

### v0.5.4 `payload.nameProvenance` — which rows she added (d10c)

New optional object on `file_batch` payloads, **inside the hash**, present **only** while a picture is in the session.

```jsonc
"nameProvenance": {
  "fromPicture": ["C9452.MP4", "C9453.MP4"],
  "added":       ["2025 tax return.pdf", "passport scan.jpg"]
}
```

**d10c:** his tax return and his passport scan rode into a footage folder inside a batch of camera clips, because **WHERE** a batch goes was graded three different ways and **WHAT** is in it was never graded at all. Every banner on the card was about the destination.

So each row's **source basename** is sorted three ways — read off the picture, typed by him, or chosen by her — and the third list is the one that prints:

- `fromPicture` — the reader could read this name. This is the one thing a picture is allowed to supply.
- `added` — in **neither** the picture nor his typed message. She chose to include this file.
- (Names he typed himself are simply absent from both lists; they need no banner.)

**This is INFORMATION, not a refusal, and APPROVE stays enabled.** A batch is not wrong for holding a file he did not name — *"file the rest of that shoot too"* is a normal thing to want. It was the **silence** that cost him a tax return. The card renders it above the fold, in gold, as `SHE ADDED N FILES YOU DID NOT NAME.` and names every one of them. The tool's reply also instructs her to say it out loud in the same answer.

**ABSENT** when there is no picture in the session (there is no read-off-it half to contrast against) or on an older brain. **Absent is silence, not "she added nothing".**

### v0.5.5 The stage card says it is a stage

No wire change — this is the desktop rendering `op: "stage"` as what it is. Previously **every** verb on the card said MOVE, and the one thing a stage does — take his files out of the folder he keeps them in and put them where he has to go and look — appeared nowhere. That is half of what made d8 approvable: the card he read was a tidy-up.

A `file_batch` with `op: "stage"` now renders:

- header `▲ NEEDS YOU · STAGE TO TRASH — NOTHING MOVES WITHOUT YOU`
- live chip `● LIVE — THESE FILES ACTUALLY LEAVE THEIR FOLDER`
- the route line labelled `TO TRASH`, showing the path the guard will actually compose — `<root>\trash\<YYYY-MM-DD>\<batchId prefix>` — with `← WILL BE CREATED`. The date is recomputed off the card's ticking clock, so a card left open past midnight prints the folder it would really land in.
- every row's second line labelled `TO TRASH` and showing that composed path rather than the payload's `toRel`, which for a stage carries the **original** relative path (G-D2) and used to render as a move that goes nowhere.
- the law line carrying **both halves of the truth on one line**: `NOTHING IS DELETED. NOTHING IS OVERWRITTEN. THESE FILES LEAVE THE FOLDER THEY ARE IN — YOU EMPTY THE TRASH YOURSELF, SHE NEVER DOES.` The reassurance and the consequence sit together or the reassurance does the work of a lie.
- the button `APPROVE — STAGE N FILES TO TRASH` (still `APPROVE — DRY RUN N FILES` when `dryRun`).

### v0.5.6 What the desktop must NOT assume (replaces §v0.4.5)

- **Gate the picture banner on `imageSeen`, not on `sawImage` and not on `imageTurnsAgo !== null`.** `sawImage: false` means no picture *on this turn*. A finite `imageTurnsAgo` is a stronger signal than nothing but `imageSeen` is the authoritative one.
- **`imageTurnsAgo: null` now means "no picture has ever been in this session"**, not "none in the window". Do not carry v0.4's reading forward.
- **`imageExpired: true` never gates anything.** It changes wording. A desktop that hides the banner on it has reintroduced the exact bug audit 3 found.
- `imageTurnsAgo: 0` is falsy in JavaScript. Test `typeof x === "number"`, never `if (x)`.
- **`nameProvenance` absent ≠ `{added: []}`.** Absent is silence.
- **`destCheck` is decoration.** It never gates APPROVE, no refusal depends on it, and it must never be described as the thing that stops an attack.
- **A card that does not arrive is not an error to retry.** When the brain refuses under any `N-*` code there is no confirm and no id.
- **Do not render `op: "stage"` through the move anatomy.** A stage card that says MOVE is the card's most-read string lying about the operation underneath it.
