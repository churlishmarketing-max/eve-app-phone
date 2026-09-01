# D-DISPATCH — The Dispatcher

**The thing he actually asked for: he says a sentence, the right unit does the work, and one list tells him what happened.**

Designed 2026-08-31 against G-FLEET, G-LOCAL, G-CONNECTORS, and the source of `C:\dev\eve\brain\src` + `C:\dev\eve\desktop`. Read-only pass; nothing under `C:\dev` was modified. Every structural claim carries a file reference. Claims inherited from the file-marshal architecture doc (`desktop\design-reference\file-marshal\FM-ARCH-B.md`) are marked **[FM]** — that build is in flight right now and this design deliberately rides its machinery rather than building a parallel one.

---

## 0. The thesis, in one page

Three facts from the ground truth decide the whole shape:

1. **A real dispatch spine already exists and is 90% wasted.** `POST /dispatch` → a `jobs` row → a real Claude Agent SDK subagent → a deliverable → an approval item → a push (`dispatch.ts:107-227`). Status lifecycle, cost caps, quiet-hours-aware ping — all real. What's missing is not the engine. It is (a) that only **3 of 51** roster units can be named, because `dispatch_fleet`'s agent parameter is a 5-value zod enum (`connectors.ts:676`) and `PERSONAS[agent] ?? PERSONAS.eve` (`dispatch.ts:145`) silently substitutes a generic worker for anything else, and (b) that a job can only ever produce a **document**.

2. **His two examples land on two different machines, and only one of them can be reached today.** Email is entirely brain-side and already has a real two-hop path (`os_draft_email` → GREEN draft in Churlish OS; `os_send_pending_email` → hash-confirmed send). Cutting a trailer is irreducibly local, and per G-LOCAL, **KATANA has no programmatic trigger of any kind** — no socket, no queue, no file watch. The design must carry both hosts behind one list *and say out loud which half doesn't work yet.*

3. **The desktop is being taught to be a pair of hands right now, and the pattern is correct.** [FM] File-marshal's order → claim → execute → report loop, `clientAction` handoff, `deskId` binding, root-key-not-absolute-path law, journal + undo. A dispatcher that invents a second way to hand work to the desktop is a bug. **A filing order and a trailer order are the same envelope with a different `kind`.**

So the dispatcher is four pieces and one refusal:

- **One job record** the brain owns, that means the same thing whether the work ran on Railway or on his desk.
- **A capability registry** that lives *beside the roster*, so adding a unit is a data row, not a deploy.
- **One order envelope**, shared with filing, for anything the desktop executes.
- **A pause that costs nothing** — a multi-step job that needs him ends its step and writes a question to the row; it does not hold a session open.
- **The refusal:** she never claims an outcome no report returned, and she never dresses "I can't reach that channel" as success. A job that ends *"here's the message and the link — you send it"* is a real terminal state, not a failure.

**The one-brain test held throughout, borrowed [FM]:** *a component is a second brain if it can choose something.* The registry can only look up. The desktop guard can only refuse. The adapter can only obey an op list it did not author. Every routing decision, every plan, every word of every draft is decided on Railway.

---

## 1. THE JOB MODEL

### 1.1 One row, both hosts

The brain owns job state. Full stop — the desktop holds no durable job state and the phone holds none. The existing `jobs` table (`sql/001_memory_spine.sql:72`) is the right home; it is thin, and it widens additively.

```sql
-- sql/004_dispatch.sql  (the ONLY schema change this design requires)
alter table jobs add column if not exists host            text default 'brain';  -- 'brain' | 'desk'
alter table jobs add column if not exists unit            text;                  -- roster key: 'pennyworth', 'katana', 'jsa'
alter table jobs add column if not exists spec            jsonb;                 -- the resolved instruction (§1.3)
alter table jobs add column if not exists result          jsonb;                 -- what a REPORT returned. never written speculatively
alter table jobs add column if not exists awaiting        jsonb;                 -- the open question, when status='needs_input' (§5)
alter table jobs add column if not exists parent_id       uuid references jobs(id);
alter table jobs add column if not exists step_no         int  default 1;
alter table jobs add column if not exists conversation_id text;                  -- so the receipt lands in the right thread
alter table jobs add column if not exists desk_id         text;                  -- which install executed it (local jobs only)
alter table jobs add column if not exists cost_usd        numeric;               -- ACTUAL spend, from the SDK result. null = unmeasured
alter table jobs add column if not exists updated_at      timestamptz default now();

alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check check (status in
  ('proposed','queued','running','needs_input','in_approvals','done','failed','cancelled'));
```

Every existing value survives (`queued`, `running`, `in_approvals`, `done`, `failed`), so `state.ts`, `ops.ts:180-184` and OpsPane keep working through the migration. Three values are new.

### 1.2 The lifecycle — and what each state promises

| State | Means | Who moves it | Promise to him |
|---|---|---|---|
| **proposed** | She thinks this should happen. Nothing has run, nothing is reserved. | She, or `proactive.ts` | *"Want me to?"* — a proposal is never work in progress |
| **queued** | Accepted. Waiting for a host to pick it up (a brain worker slot, or the desktop to claim the order). | His yes, or a GREEN auto-accept | *"It's yours, not started"* |
| **running** | A host has claimed it and is working. Heartbeats for local jobs (§4.6). | The executing host | *"Working"* — the only state that may show a progress bar |
| **needs_input** | A step finished by asking one question. **Nothing is holding a session open.** | The worker, at the end of a step | *"Waiting on you"* — and the question is visible in three places (§5.3) |
| **in_approvals** | Finished. A deliverable/receipt is waiting for his read. | The host's report | *"Done, unread"* |
| **done** | He read/approved it, or it was a GREEN job that reported successfully and needed no read. | Him (`ops.ts:180-184`), or the report for GREEN work | *"Closed"* |
| **failed** | It stopped and produced nothing usable. Always carries a reason. | The host, or the heartbeat watchdog | *"Didn't happen, here's why"* |
| **cancelled** | He killed it, or it expired unclaimed. | Him, or expiry | *"Stopped"* |

Two laws bind this table, both carried from existing code:

- **A status may only advance on evidence.** `in_approvals` is written by a report, never by a hopeful worker. This is the job-level restatement of `confirm.ts`'s `executed:false` honesty ("nothing has left the brain") and [FM]'s "queued until `/desk/report` lands."
- **`failed` is never silent.** Today `runWorker` writes `status:"failed"` with no user-facing notice beyond a server log (`dispatch.ts:129-227`) — that is a real bug in the current build. A failed job must produce an attention item exactly like a successful one does.

### 1.3 The `spec` — the shape that makes both hosts one list

```jsonc
{
  "said":   "have Pennyworth email Acacia about pushing the shoot to the 12th",  // his sentence, verbatim
  "unit":   "pennyworth",
  "intent": "email",                       // an op key the registry declares for that unit
  "inputs": { "client": "Acacia Wellness", "topic": "reschedule shoot to Sept 12", "tone": "warm, short" },
  "tier":   "red",                         // resolved at plan time, re-checked at execute time
  "routedBy": "model",                     // 'model' | 'explicit' — he named the unit, or she picked
  "routedWhy": "email desk; she's the OS's client-email path"
}
```

`inputs` keys are declared by the registry (§2.2). **The model never emits a path, a URL, a shell string, or an absolute anything** — it emits a unit key, an intent key, and declared input keys. That is the same law as [FM]'s root-key rule (`main.ts:275-282`'s openExternal target-key pattern), and it deletes an entire class of injection before any guard runs.

### 1.4 How the desktop renders one list

`GET /state` already returns `jobs` and OpsPane already draws **JOBS IN FLIGHT** (`OpsPane.tsx:130`). Three changes make it the real list:

1. **Widen the query.** Today: `.in("status", ["queued","running","in_approvals"]).limit(10)` (`state.ts`). A job therefore *vanishes from the hub the instant it completes* — which is the exact opposite of "tell me it's done." Replace with: every non-terminal job, plus terminal jobs whose `updated_at` is inside 24 h, limit 40.
2. **Push, don't poll.** Add an SSE frame `{type:"job", job:{…}}` beside the existing confirm emitter in `index.ts`, and a `ChatFrame` arm in the desktop contract — the same 7th-arm move [FM] makes for `desk_order`. `poll.ts`'s 30 s tick stays as the fallback for a dropped stream.
3. **Host is a badge, not a lane.** A row is `[BRAIN]` or `[DESK]` in the corner and identical otherwise. The desktop never sorts, filters, or reasons about host — it renders what the brain sent. Local jobs appear in the list at `queued` *before* the desktop has claimed them, and the desktop's report writes their terminal state **through the brain**, never locally. That is why it is one list: because one process writes every row.

**The justified exception.** The desktop keeps exactly one durable thing: an append-only journal of what it executed (`%USERPROFILE%\EVE\dispatch-log.jsonl`, sibling to [FM]'s `filing-log.jsonl`). That is a *receipt*, not state — it exists so he can prove what ran on his machine when the brain is unreachable, and nothing reads it back as authority. The in-flight **order** is also non-durable, in-memory, expiring, exactly like `confirm.ts`'s pending map — a plan built against a 40-minute-old view of his machine should not survive a restart.

---

## 2. ROUTING

### 2.1 What's wrong today, precisely

- The tool can't say the name: `agent: z.enum(["research","justice-league","jsa","suicide-squad","eve"])` (`connectors.ts:676`).
- The runtime lies when it can: `const persona = PERSONAS[agent] ?? PERSONAS.eve` (`dispatch.ts:145`) — via raw HTTP, "pennyworth" runs as a generic worker wearing his name in the job title.
- The doctrine is code: `PERSONAS` is a TypeScript literal. **Adding a unit is a deploy.**

### 2.2 The registry — data, joined to the roster she already reads

`fleet.ts` already does the exact merge this needs: authoritative membership from the Churlish OS (`GET /api/fleet/roster`, secret-gated), enriched by key from a bundled `data/fleet-roster.json`, with an honest `live:false` fallback when the OS is unreachable. **Capability is one more enriched field on that same merge.**

```jsonc
// one capability object per roster key — written into the OS's fleet_roster row,
// mirrored into data/fleet-roster.json by scripts/build-fleet-roster.mjs as the offline copy
{
  "key": "pennyworth",
  "host": "brain",                 // 'brain' | 'desk' | 'advice'
  "runner": { "kind": "tool", "tool": "os_draft_email" },
  "ops": {
    "email": {
      "tier": "red",
      "inputs": [ {"name":"client","required":true}, {"name":"topic","required":true}, {"name":"tone"} ],
      "produces": "draft-then-send"
    }
  },
  "doctrine": null,                // worker units carry their system prompt here
  "cost": { "maxTurns": 16, "maxBudgetUsd": 1.5, "minutes": 10 }
}
```

Four `runner.kind` values, and **that list is code, not data**:

| `runner.kind` | What runs | Adding a unit of this kind |
|---|---|---|
| `worker` | a Claude Agent SDK subagent, exactly today's `runWorker`, with `doctrine` as its system prompt | **data only** — a roster row with a doctrine string |
| `tool` | an existing brain tool (`os_draft_email`, `gmail_send`, …), with `inputs` mapped to its arguments | **data only** — but the tool must already exist and be in `connectorToolNames` |
| `local` | a work order to the desktop (§4) | **data only** if the desktop already registers that worker key |
| `advice` | nothing runs. She names the unit and its trigger phrase. | **data only** |

**Why `runner.kind` must stay code:** the registry is written by a separate process (the OS owns roster writes — `fleet.ts` header comment). If a registry row could name an arbitrary tool grant or an arbitrary executable, a compromised or careless OS row becomes remote code execution. So: the registry *selects from adapters that already exist*; it cannot create one. Doctrine text is data; capability is code.

### 2.3 The three layers of routing

1. **Prompt-level pick (judgement — model).** The context pack gains one ambient line, modelled on [FM]'s desk line and the OS board snapshot pattern (`os.ts:66-120` → `context.ts:195`):

   ```
   Fleet (live, 2m old): 51 units. Runnable from here: research, jsa, justice-league, suicide-squad,
   pennyworth(email), perry-white(draft), katana(cut — desk, Premiere not open). 44 are workspace/OS
   units I can name and hand you the trigger for, but can't run. (fleet_roster for detail.)
   ```

   ~55 tokens, every turn. This is the piece that makes "send Pennyworth" work at all — she opens the turn already knowing who exists and who is reachable, instead of spending a tool call to find out and then guessing.

2. **Registry lookup (deterministic — code).** `dispatch_unit` resolves `unit` → capability row → `runner`. If the key doesn't exist: an error naming the closest matches. If the key exists with `host:"advice"`: **not an error** — a truthful return, *"Cassandra Cain isn't runnable from here; she's a workspace skill. Say 'run Cassandra on this' in Claude Code and she'll load."* She then says exactly that.

3. **No silent substitution, ever.** `PERSONAS[agent] ?? PERSONAS.eve` is deleted. An unresolvable unit returns an error the model must speak. This is the single highest-value line change in the whole design: today the system's failure mode is *pretending*, which is the one thing his laws are all pointed at.

### 2.4 The tool

```ts
tool("dispatch_unit",
  "Hand a job to a named fleet unit. The runnable units this session are listed in your context; " +
  "fleet_roster has all 51. Units marked advice-only can be NAMED but not run — say so and give him " +
  "the trigger phrase; never pretend to dispatch one. Nothing external is sent by a worker: sends " +
  "still route through a confirm card. NEVER claim a result before a report lands.",
  { unit: z.string(), intent: z.string().optional(), inputs: z.record(z.unknown()).optional(),
    task: z.string().describe("The job, specific enough to act on without follow-up") },
  …)
```

`dispatch_fleet` stays as a thin alias for one release so nothing in flight breaks. **And the silent-failure trap [FM] names: `"dispatch_unit"` must be added to `connectorToolNames` (`connectors.ts:53-79`) — a tool omitted there is invisible to the model.**

One honest limit: the tool *description* is built once per chat session by `buildConnectorServer`, so a unit added to the roster mid-conversation becomes visible on her next session, not this one. That's acceptable and it should be said in the description rather than hidden.

---

## 3. BRAIN-SIDE EXECUTION — the email, hop by hop

> *"Send Pennyworth to email Acacia about pushing the shoot to the 12th."*

| # | Hop | Where | Exists? |
|---|---|---|---|
| 1 | He types it in the hub command bar → chat turn | `chat.ts` | **yes** |
| 2 | Context pack carries the client roster (OS board snapshot) + the new fleet line; "Acacia" resolves to a real client | `context.ts:195`, `os.ts` | board **yes**, fleet line **NO** |
| 3 | She calls `dispatch_unit{unit:"pennyworth", intent:"email", inputs:{client, topic}}` | `connectors.ts` | **NO** — no such tool; the enum can't say the name |
| 4 | Registry resolves → `host:"brain"`, `runner:{kind:"tool", tool:"os_draft_email"}`, `tier:"red"` | `fleet.ts` | **NO** — no capability field |
| 5 | Job row inserted: `status:"running"`, `host:"brain"`, `unit:"pennyworth"`, `spec:{…}`, `conversation_id` | `jobs` | row **yes**, columns **NO** |
| 6 | SSE `{type:"job"}` → the hub shows a RUNNING row within a second | `index.ts` | **NO** |
| 7 | Draft: `os_draft_email` → Churlish OS writes a GREEN draft, returns its id + body | `os.ts`, OS `/api/eve` | **yes** |
| 8 | **Tier gate.** Drafting is GREEN — it executed inline and nothing left the building. Sending is RED. | §3.2 | **yes** |
| 9 | `requestConfirm("dispatch_send_email", summary, payload, execute)` — payload carries `jobId` | `confirm.ts:50-73`, `connectors.ts:650` | **yes**, minus `jobId` |
| 10 | Job → `status:"needs_input"`, `awaiting:{kind:"confirm", confirmId}` | | **NO** |
| 11 | Card renders in the hub (and on the phone) with the exact payload + hash | `ConfirmCard.tsx` | **yes** |
| 12 | He approves → `POST /confirm {id, hash}` → hash match → `execute()` → OS sends | `confirm.ts` resolveConfirm | **yes** |
| 13 | On `executed:true`, close the job: `status:"done"`, `result:{to, subject, sentAt, osMessageId}` | | **NO** — confirm.ts knows nothing about jobs |
| 14 | `appendMessage(conversationId,"eve","Sent Acacia the reschedule…")` + a `runs` row | `memory.ts`, `runs` | fns **yes**, wiring **NO** |
| 15 | Hub row flips to DONE with the sent copy inline; one line in her next turn | `state.ts`, OpsPane | **partly** — see §1.4 |

### 3.1 The missing hops, as a build list

1. `dispatch_unit` tool + `connectorToolNames` entry.
2. Capability registry: OS column + `build-fleet-roster.mjs` mirror + `fleet.ts` merge + the ambient context line.
3. `sql/004_dispatch.sql` (§1.1).
4. **Confirm ↔ job linkage.** `requestConfirm` gains an optional `jobId`; `ConfirmResult` carries it back; `resolveConfirm`'s caller closes or fails the job. Small, and it is the seam that makes "she told me it sent" true.
5. SSE `job` frame + contract arm + `/state.jobs` widened to a 24 h terminal window.
6. `failed` produces an attention item (fixing today's silent failure).
7. `cost_usd` written from the SDK's reported spend — or G-core's SPEND tile doesn't get drawn (no fake data).

### 3.2 GREEN / YELLOW / RED, stated against the code that exists

The brain today has **two** mechanisms, not three: execute-inline (GREEN) and hash-matched confirm (RED, `confirm.ts`). His brief says YELLOW/RED. Rather than invent a third gate, define YELLOW as the lane [FM] is building right now:

| Tier | Mechanism | Rule of thumb | Example |
|---|---|---|---|
| **GREEN** | executes inline, she tells him after | Internal, free, reversible | draft an email, write a deliverable, read the board |
| **YELLOW** | executes, then a **receipt with UNDO live for 24 h** in the hub | Changes his stuff, cheaply reversible, nothing leaves the building | file 12 downloads, create a KATANA trailer sequence (non-destructive by construction) |
| **RED** | hash-bound confirm card, never inline | Leaves the building, spends money, or can't be undone | any email/SMS/DM send, any ad spend, any post |

YELLOW's machinery *is* the quiet lane + receipt strip + undo that file-marshal introduces; dispatch reuses it rather than duplicating it. **Sending is RED unconditionally — there is no undo on a sent email**, and no accumulated trust ever promotes a send to YELLOW. Precedent buys quiet on YELLOW work only.

---

## 4. LOCAL EXECUTION — the trailer

> *"Have something cut the True North interview into a trailer."*

### 4.1 The hard truth first

Per G-LOCAL: **KATANA cannot be triggered by anything today.** The panel is a UXP plugin that reacts only to UI events in its own React tree; the timeline mutation only exists inside Premiere's JS host process; there is no socket, no queue, no watcher. The `katana-brain` Supabase function is callable from outside, but it returns a *plan*, not a cut.

So there are exactly three ways this example can ever work, and only one of them belongs in v1:

| Tier | How | Cost | Verdict |
|---|---|---|---|
| **T1 headless** | the tool has a CLI or local HTTP endpoint; the generic `cli` adapter runs it | zero desktop code, zero tool code | the target shape — nothing he owns is T1 today |
| **T2 queue-polling** | KATANA's panel gains a watcher on `KATANA\queue\*.json` and a "run queued job" path | ~a day of work **inside KATANA**, zero in EVE | **the honest recommendation** |
| **T3 UI automation** | scripted clicks against a running Premiere | zero code changes anywhere | **no.** Fragile, indistinguishable from unattended action, and he has not authorised screen reading |

Anyone who says the trailer works today is describing T3. Say so in the hub: the KATANA card reads `NEEDS WIRING`, not `IDLE`.

### 4.2 The order — same envelope as filing

[FM] introduces an order store in `brain/src/desk.ts` with the discipline of `confirm.ts`: in-memory Map, `sweep()`, single-use, hash-matched, expiring, `deskId`-bound, claim-or-409. **Dispatch does not build a second one.** The recommendation is one refactor: promote that store to `brain/src/orders.ts` with a `kind` discriminator.

```jsonc
{
  "orderId": "7c02…",
  "kind": "worker_run",              // sibling of file-marshal's "desk_apply"
  "deskId": "b7f1…",                 // bound to ONE install
  "hash": "…",                       // recursive canonical hash of `job` (the [FM] §2.1 fix applies here too)
  "lane": "ask",                     // 'quiet' | 'ask'
  "dryRun": true,
  "createdAt": "…", "expiresAt": "…",   // expiry governs CLAIM only — see §4.6
  "job": {
    "jobId": "…",
    "worker": "katana",              // a key the DESKTOP registered, not a path
    "op": "cut",
    "args": { "mode": "trailer", "client": "truenorth" },   // every value from a declared enum
    "maxMinutes": 25
  }
}
```

Claim, execute, report are byte-identical in shape to filing's: `POST /dispatch/orders/:id/claim {deskId}` → 200 / 409 already claimed / 410 expired; `POST /dispatch/report`. The **ask** lane hands the order back through the existing `clientAction` path (`confirm.ts:22-27`) — `requestConfirm("dispatch_local", …, payload, null, {type:"dispatch_run", payload:{orderId}})` — which is the mechanism the phone already uses for SMS and the mechanism filing is adopting. Nothing new is invented; a second `clientAction.type` is registered.

**Two `confirm.ts` fixes [FM] already names apply here unchanged and should not be duplicated:** the recursive `payloadHash` (today's replacer-array form collapses nested structure, so two different op lists hash identically), and disambiguating `executed:false`, which `ConfirmCard.tsx` currently renders as **CANCELLED** for an approved client-executed action.

### 4.3 Local worker registration

A local worker is **config, advertised by the sensor**, exactly as desk roots are:

```jsonc
// desktop userData/config.json — non-secret, beside brainUrl and deskRoots
"localWorkers": [
  {
    "key": "katana",
    "label": "KATANA — cut engine",
    "adapter": "katana-queue",                 // which built-in adapter drives it
    "ops": {
      "cut": {
        "args": {
          "mode":   { "enum": ["shorts","midform","trailer","cleanup","brief"], "required": true },
          "client": { "enum": ["hlp","truenorth"], "required": true }
        },
        "maxMinutes": 25,
        "tier": "yellow"                        // non-destructive: KATANA never touches the master sequence
      }
    },
    "requires": ["premiere-beta", "project-open", "active-sequence"],
    "enabled": true,
    "dryRun": true
  }
]
```

Three rules make this safe and extensible:

1. **The adapter is code; the registration is config.** A `cli` adapter (run a named executable with an argument template built only from declared enums, capture stdout, report) ships once and covers every future T1 tool with **zero desktop code**. KATANA needs a bespoke `katana-queue` adapter — one file — because of T2.
2. **`requires` is probed, never assumed.** The adapter answers a readiness probe on every snapshot push; the answer rides to the brain as `workers[].ready` + `reason`. That is why the ambient fleet line can honestly say *"katana(cut — desk, Premiere not open)"* instead of dispatching into a wall.
3. **The desktop advertises; the brain decides.** The snapshot push [FM] already introduces (`POST /desk/snapshot`, every 60 s) carries `workers[]` alongside `roots[]`. The desktop never volunteers to run anything and has no timer that starts work — it only reports what it *could* do. That is what keeps it from being a second brain.

### 4.4 The trace

1. He says it. She resolves `katana` → `host:"desk"` → checks the advertised readiness in her context pack.
2. **Not ready** (Premiere closed) → job goes straight to `needs_input`: *"Premiere Beta isn't open with a project. Open it and say go — I'll hold the job."* Not a failure, not a fake success. This is the most common real outcome and it must feel deliberate.
3. Ready → job row `host:"desk"`, `status:"queued"` → order enqueued → SSE `job_order` → desktop claims (409/410 semantics).
4. **Desktop guard re-validates from scratch** — worker exists, `enabled`, ready *now*, `op` declared, every arg in its declared enum, `dryRun` re-read from config at execute time. A brain-side check is advisory once the payload is on the wire; only the executing shore's copy counts. Same law as filing's guard.
5. Adapter writes the queue file, waits for KATANA's run folder (`KATANA\<run-id>\run.json` — already how KATANA logs every run per its `OPERATIONS.md`), reads it.
6. Report → `status:"in_approvals"`, `result:{ sequences:["TRAILER_v1"], runFolder:"…", clips:14, killed:9 }`.
7. The hub row shows the receipt with **OPEN FOLDER** — routed through main's allowlisted `shell.openPath`, keyed by the run folder recorded in the report, never a path the renderer or the model composed.
8. **Nothing is deleted, for free:** KATANA is non-destructive by construction (master sequence untouched; every mode creates new sequences or a `_KATANA-CLEAN` duplicate). The no-delete law needs no new enforcement here — but the guard should still refuse any adapter op declaring a destructive kind, so a *future* local tool can't quietly acquire one.

### 4.5 What does not exist yet

- The `worker_run` order kind (rides on the `orders.ts` promotion of [FM]'s store).
- `workers[]` on the snapshot push + readiness probing.
- `localWorkers` config + `coerce()` validation + a Settings section.
- The `cli` adapter (generic) and the `katana-queue` adapter (bespoke).
- **KATANA's own queue watcher — new code in `C:\dev\katana`, not in EVE.** This is the single biggest dependency in the whole design and it lives in another repo.

### 4.6 Long jobs, sleeping laptops

A trailer cut is minutes, so filing's 10-minute expiry is the wrong model. Split it:

- **Expiry governs the claim only.** Unclaimed for 10 minutes → `cancelled`, *"I couldn't reach your desk."*
- **After a claim, the clock is the worker's declared `maxMinutes`,** and the desktop POSTs `/dispatch/progress {orderId, pct, step}` every 30 s.
- **Three missed heartbeats → `failed — your desk went quiet.`** Honest, and honestly ambiguous: it looks the same whether Premiere crashed or he shut the lid. The report is the only thing that can disambiguate, and if no report ever arrives, she says she doesn't know what landed rather than guessing.

Heartbeats are also what fills G-core's `mini` progress bar with a real number instead of a decorative one.

---

## 5. THE MULTI-STEP CASE — the podcast guest

> *"Let's reach out to this person to be a guest on the podcast."*

That is three things: **research → a choice he makes → a send.**

### 5.1 Steps are jobs

```
job A "book Dr. X on the podcast"        parent, status tracks the whole thing
 ├ job A.1  research   unit:research     → returns a CHOICE, not a document
 ├ job A.2  (the ask)  status:needs_input
 └ job A.3  outreach   unit:perry-white  → draft → RED confirm → send | handoff
```

Each step is its own `jobs` row with `parent_id` and `step_no`; the parent shows the rolled-up state. The hub renders the parent as one row that expands into its steps — one line in the list, not three.

### 5.2 The pause costs nothing — the load-bearing decision

**A worker that needs an answer ends its step.** It does not block, does not hold a session, does not sit in a `while` loop burning budget. The question is written to `jobs.awaiting` and the process exits.

```jsonc
"awaiting": {
  "kind": "choice",
  "question": "Three ways to reach Dr. X. Which one?",
  "options": [
    {"id":"a","label":"Email — hello@drx.com","detail":"listed on her site's contact page; RED send"},
    {"id":"b","label":"Instagram DM @drx","detail":"14k followers, DMs open — I have NO tool for this; I'd hand you the message"},
    {"id":"c","label":"Her booking form","detail":"drx.com/press — a form; I'd hand you the fields filled in"}
  ],
  "askedAt": "…", "asks_used": 1
}
```

Resume is a **message, not a poll**: `POST /dispatch/answer {jobId, answer}` → the answer is appended to the parent's `spec` → `status:"queued"` → the next step dispatches fresh. State lives in the row; the SDK subagent is stateless between steps. That is the whole trick, and it is why a job can wait three days for free.

This needs one new thing worker-side: **a second return shape.** Today `runWorker` always writes a markdown deliverable. Workers get told they may end with a fenced ` ```eve-ask ` JSON block when they need a decision; `runWorker` parses it and writes `awaiting` instead of a deliverable. Honest weakness: parsing a model's fenced block is brittle — **when parsing fails, it becomes a document and he reads it.** Never invented options.

### 5.3 Not polling him to death

Six rules, and they are the difference between a dispatcher and a nagging machine:

1. **One ask per step, and it must be complete.** Every option the step found, in one question. No drip.
2. **Two asks per job, lifetime.** A third means she failed to scope it and must finish with what she has or fail honestly: *"I need you to tell me how you want this handled."* An unbounded clarification loop is the classic failure mode here.
3. **One question, three surfaces, no duplication.** Mid-conversation → in the turn. At the desk, silent → the hub row turns amber (`needs_input`) and the SESSION LOG gets a line. Away → it rides the 07:00 brief. **Never a toast** — toast policy is exactly `red_confirm` and `tripwire` [FM], and a question is neither.
4. **Answering in chat works identically to clicking.** He should never have to find the right screen. A sentence gets matched to the open ask by the model and posted to the same endpoint.
5. **Quiet hours hold every ask** (21:30–06:30, `schedule.ts:28-33`). A job that waits is not a job that failed.
6. **One push per job, on terminal state only** — `done`, `failed`, or the *first* `needs_input`. Not per step. Channels are only `brief|nudge|tripwire` (`proactive.ts:49`); a finished job is a `nudge`, exactly as `runWorker` already sends today.

### 5.4 The honest outbound gap

Per G-FLEET, the entire outbound surface is three RED sends: `gmail_send`, `send_sms` (fires from his phone), `os_send_pending_email`. **There is no social-DM tool, no contact-form tool, no LinkedIn, no Instagram — anywhere.** So option (b) above cannot end in a send, and the design must not pretend otherwise.

Give that a real terminal state: **`handoff`.** She produces the exact message, the exact destination, and any form fields filled, and the job closes `done — handed to you` with a copy button in the hub. That is a truthful outcome, it still saves him the thinking, and it is strictly better than a fake "sent." A hub that says *"I can't reach Instagram; here's the DM, one click to copy"* is trustworthy. One that quietly drops the step is not.

---

## 6. REPORT-BACK

The matrix, carried from [FM] §1.8 because it is already law in this codebase:

| Where he is | How she tells him | Enforced by |
|---|---|---|
| Mid-conversation | one line in the turn: what ran, what it produced, anything skipped and why | prose + `context.ts`'s existing "only claim what a tool returned this turn" clause |
| At the desk, not talking | the hub JOBS rail updates + a receipt row; UNDO live 24 h on YELLOW work | SSE `job` frame |
| Away | one `nudge` push on terminal state, quiet-hours gated — exactly what `runWorker` already does | `proactive.ts:49`, `schedule.ts:28-33` |
| Overnight / quiet hours | held; the attention item still lands; the 07:00 brief carries *"overnight: 2 finished, 1 waiting on you"* | `brief.ts` reads the context pack |
| Always | a `runs` row; plus the desktop journal for local jobs | `runs` table (zero schema change) |

Three bindings that make it honest:

1. **Queued until a report lands.** She may not say *sent*, *cut*, *filed*, or *done* without one. Direct analogue of `confirm.ts`'s `executed:false` comment.
2. **A skipped or failed step is reported, with its reason, never rounded down to silence.** Today's silent `failed` (`dispatch.ts:129-227`) is fixed as part of this.
3. **Dry-run says WOULD HAVE**, in every surface, every time. A dry run that reads like a real run is a fabrication.

And the law that keeps "no unattended action" intact while still letting her be useful: **`proactive.ts` may create a job at `proposed`. It may never create one at `queued`.** Nothing in this design starts work on a timer. The desktop's 60 s snapshot and 30 s poll refresh *perception* only — the same thing `poll.ts` already does.

---

## 7. THE HUB SCREEN

His own design already is this screen. G-core.html has an 8-up agent card strip that "cards read /health.fleet", a live-counter rail (THE WIRE), a session log, a command bar, and a telemetry footer. Bind those to real dispatch state; add exactly one new surface (job detail).

### 7.1 The fleet strip = the roster (existing component, new binding)

The `.acard` already carries every field needed: `dot`, `nm`, `role`, `stc` chip, `mini` bar.

| Card element | Bound to |
|---|---|
| `dot` colour | host + readiness — teal `brain, runnable` · blue `desk, ready` · amber `desk, needs wiring` · purple `advice-only` · off `unreachable` |
| `nm` | roster `name` |
| `role` | roster `job` (one line, already in the roster) |
| `stc` chip | live: `RUNNING` · `NEEDS YOU` · `2 HELD` · `IDLE` · `NEEDS WIRING` |
| `mini` bar | heartbeat `pct` for a running job; 0 otherwise. **Never decorative** |

**Eight cards, 51 units.** The strip shows the eight with live state (running > needs-input > held > recently-done > pinned), then a `+43 ON ROSTER` chip opens the full list, division-grouped, each row badged **RUNNABLE HERE / DESK / WORKSPACE ONLY / OS**. That badge is the most important pixel on the screen: 47 of 51 are workspace-only today, and a hub that hides that is a hub that lies.

**One contract correction.** G-core's note strip says the cards read `/health.fleet`. Today `/health` returns `fleet: fleetViewStatus()` — `{ready, live, count}` (`index.ts:108`) — which cannot fill eight cards. And `/health` is **unauthenticated** (`index.ts:76`): putting 51 unit names and their jobs there publishes his org chart to anyone who can reach the URL. So the strip must read **`/state.fleet`** (behind the bearer gate), and `/health.fleet` keeps returning counts only. Same visual contract, correct door.

### 7.2 THE WIRE — live counters

Existing rows (LEADS/CLIPS/DRAFTS/SILENT/SPEND/TRIBUNAL/ANGLES/QUIET IN) gain the dispatch four, same `.trow` shape:

`RUNNING n` · `WAITING n` (needs_input, amber) · `HELD n` (in_approvals) · `FAILED n` (24 h, red).

`SPEND` gets a real source only once `cost_usd` is written from the SDK's reported spend. **Until then the tile shows `—`, not a number.** No fake data.

### 7.3 SESSION LOG = the job event feed

Already the right component. One line per state change: `14:02:11 > pennyworth — draft ready, card up`. The `!` amber form is `needs_input`. Zero new UI.

### 7.4 The command bar is the dispatcher's front door

Typing a sentence is a chat turn; routing happens in the turn. Nothing dispatch-specific is added to the bar. The existing pill — `PUSH-TO-TALK ONLY · TYPED TURNS NEVER SPEAK` — is respected: **a job report never speaks unless he was speaking.**

### 7.5 Job detail — the one new surface

Not a new page. It opens in the DATA column (`DataColumn.tsx` already switches views) in the same visual language as `ConfirmCard`. It must show:

1. **Header** — unit name, `[BRAIN]`/`[DESK]` badge, status, elapsed.
2. **What he said**, verbatim (`spec.said`) — so a mis-route is obvious at a glance.
3. **Who she picked and why** (`routedWhy`) — one line. This is the re-route affordance: *"no, Pennyworth"* fixes it.
4. **Steps** — one row each, with state and per-step result.
5. **The next action's tier**, before it happens: `NEXT: RED — SEND EMAIL`.
6. **The pending confirm card, inline**, if there is one. Not a separate place to go.
7. **The result** — the deliverable rendered inline (the attention item already carries the full text in `ref.content`, `dispatch.ts`), or the local receipt (sequences created, run folder, skipped ops and why).
8. **Cost** — turns and dollars actually spent, or `unmeasured`.
9. **Actions** — `APPROVE` · `ANSWER` · `CANCEL` · `OPEN FOLDER` (local) · `UNDO` (YELLOW, 24 h) · `RE-ROUTE`.

---

## 8. HONEST WEAKNESSES, AND THE SMALLEST FIRST VERSION

### 8.1 Weaknesses

1. **The trailer example does not work in v1, and possibly not in v2.** Local dispatch requires new code inside KATANA (a queue watcher) that lives in a different repo, plus a bespoke adapter here. Everything else in this design ships without it; that one example does not. The only zero-change alternative is UI automation, which I am recommending against.
2. **Routing accuracy is unmeasured.** 51 units with overlapping jobs and prose triggers means she will sometimes pick Perry White when he meant Pennyworth. The mitigation is that the unit is named on the card *before* it runs and one word re-routes — but there is no metric in v1, so "is she routing well?" is answerable only by his gut.
3. **Doctrine-as-data is an injection surface.** A roster row written by a separate process supplies a worker's system prompt. Capability stays code-side (§2.2) and workers hold **no send tools at all**, so the worst case is a bad deliverable rather than a bad action — but "the OS can change what a worker believes it is" is a real trust dependency I am adding on purpose, and it should be a reviewed write path on the OS side.
4. **Cancel is best-effort.** Killing a running SDK worker means holding an AbortController in a process map, which dies on restart — so a brain restart orphans a running worker's spend. The `maxBudgetUsd`/`minutes` caps are the real protection; the CANCEL button is a courtesy.
5. **"Desk went quiet" is ambiguous.** A crashed Premiere and a closed laptop lid look identical. If no report ever arrives she must say she doesn't know what landed — which is correct and unsatisfying, and for a partially-applied edit it means a human has to look.
6. **Two clients, one order queue.** `deskId` binding + claim-or-409 closes double-execution, but it depends on the phone ignoring an order kind it doesn't understand — true today, a compatibility assumption, not a guarantee. [FM] names the same weakness.
7. **The two-ask ceiling is a guess.** It is not measured; it is a judgement about how much interruption he will tolerate. A job that ends *"handed to you"* three sessions in a row will read as her not doing the work, even when handing off was the honest outcome.
8. **The job list gets longer to stay truthful.** Widening `/state.jobs` to a 24 h terminal window is what makes "she told me it's done" possible, and it also means the list is busier than the current three-status view. That is the right trade and it is still a trade.
9. **`SPEND` has no source today.** Either `cost_usd` gets wired from the SDK result or that tile stays blank. G-core draws it; the brain cannot fill it yet.
10. **This design adds no outbound channels.** Social DMs, contact forms, LinkedIn, ad-platform writes — all still absent. The `handoff` terminal state makes that honest instead of hidden, but honest and capable are different words.

### 8.2 The smallest first version that genuinely saves him a screen

**V0.1 — one list, five real units, no local execution, no multi-step.**

1. `sql/004_dispatch.sql` (§1.1) — one migration.
2. Capability registry with **only the units that already have a runner**: the 4 existing personas + pennyworth's `os_draft_email`/`os_send_pending_email` pair. Five runnable units on day one.
3. `dispatch_unit` (registry-backed, no enum, **no silent substitution**) + `connectorToolNames` entry + the ambient fleet line in the context pack.
4. Confirm ↔ job linkage, so approving the card closes the job.
5. `/state.jobs` widened to a 24 h terminal window + the SSE `job` frame.
6. Hub: the G-core fleet strip bound to `/state.fleet`, THE WIRE's four dispatch counters, the SESSION LOG feed, and the job detail view.
7. `failed` produces an attention item.

**No local execution. No `needs_input`. No new outbound channels.**

That is the day *"send Pennyworth to email Acacia about pushing the shoot to the 12th"* works end to end for the first time — and the day he stops opening Churlish OS to check whether the draft exists, opening the phone to approve it, and asking her again whether it went. **That is the screen it saves: the OS tab plus the phone, collapsed into the row that was already on his hub.**

**V0.2** adds `needs_input` + the `eve-ask` return shape + parent/step jobs — the podcast-guest case, ending in `handoff` where no channel exists.
**V0.3** adds `orders.ts` (promoting file-marshal's store), the `cli` adapter, `localWorkers` config, and readiness probing — at which point any T1 local tool plugs in as a config row.
**V0.4** is KATANA's queue watcher, in KATANA's repo, and the `katana-queue` adapter here.

---

## 9. LAW COMPLIANCE

| Law | How the dispatcher satisfies it |
|---|---|
| **Desktop holds zero intelligence** | No local model, no agent loop, no local scheduler that starts work. The desktop advertises workers, probes readiness, claims orders it did not author, obeys an arg list drawn from declared enums, and reports. Every routing and planning decision is made on Railway. |
| **Everything that leaves the building or spends money queues a hash-bound confirm card** | Sends stay RED unconditionally and route through the existing `confirm.ts` path. No accumulated trust ever promotes a send. Workers hold no send tools at all (`dispatch.ts` exposes only `WebSearch`/`WebFetch`). |
| **She never deletes** | No dispatch op kind expresses deletion; the local guard refuses any adapter op declaring a destructive kind; KATANA is non-destructive by construction. |
| **Nothing acts unattended on a schedule** | `proactive.ts` may create a job at `proposed`, never at `queued`. No timer anywhere starts work; the 60 s snapshot and 30 s poll refresh perception only. |
| **Keys brain-side; the desktop holds one secret** | Nothing added to the keychain. `localWorkers`, `deskId` and worker readiness are non-secret config beside `brainUrl`. The renderer still gets no fs, no fetch, no path. |
| **No fake data — offline says so** | Status advances only on evidence; `queued` until a report lands; `failed` is loud; dry-run says WOULD HAVE; `SPEND` shows `—` until `cost_usd` is real; advice-only units are badged as unrunnable rather than dispatched into a wall; a channel she cannot reach ends as `handoff`, not as a send. |
