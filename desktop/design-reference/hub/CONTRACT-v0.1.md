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
