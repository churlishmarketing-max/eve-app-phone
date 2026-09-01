# G-FLEET — What EVE's fleet and dispatch system does TODAY

Sources read: `C:\dev\eve\brain\src\{fleet,dispatch,ops,tools,chat,proactive,connectors,confirm,index,os,state}.ts`, `C:\dev\eve\brain\data\fleet-roster.json`. All line numbers below are exact.

---

## 1. What IS a fleet unit today?

**A fleet unit is a JSON roster row — name, alias, job description, trigger phrase, schedule string, location tag. Nothing executable is attached to it.**

- `fleet.ts:20-30` — the whole data model, `FleetUnit`: `division, key, name, alias, job, triggers, schedule, loc, detailed`. No process handle, no function pointer, no endpoint, no agent ID field.
- `fleet.ts:43-54` — the bundled copy is a static file read: `data/fleet-roster.json` (51 entries, verified by count).
- `fleet.ts:76-95, 100-125` — the "live" version is an HTTP GET to a *different* system (Churlish OS, `churlishos.app/api/fleet/roster`) that returns thin rows (key/name/division/loc); EVE just merges her static job-description text onto whatever names that other system reports. She never writes this data and holds no execution relationship to it (`fleet.ts:5-9` docstring says this explicitly: "a separate process owns writes to it... EVE only READS it").
- The `fleet_roster` tool's own description admits this: `connectors.ts:509-512` — "You can DISPATCH **a few** of these as live workers here (dispatch_fleet: research / justice-league / jsa / suicide-squad); **the rest run in King's workspace or the OS** — for those, tell him the unit and its trigger phrase." That is the code itself documenting that most roster rows are not runnable through EVE.

**Does dispatching "Perry White" actually run anything? Bluntly: no.**

- Perry White is roster row `fleet-roster.json:193-200` (division `fleet`, loc `WS`). "WS" units live nowhere EVE can execute — no code path in this repo touches Perry White, his 11-gate desk law, or his voice.
- The only execution path is `dispatch_fleet` (chat tool, `connectors.ts:663-687`) or raw `POST /dispatch` (`index.ts:207-217`). Both funnel into `runDispatch` → `runWorker` in `dispatch.ts`, which selects a system prompt from a **hardcoded 5-entry map**: `PERSONAS = { eve, research, justice-league, jsa, suicide-squad }` (`dispatch.ts:42-99`).
  - Via the chat tool, the model is *schema-blocked* from even trying "perry-white": `connectors.ts:676` — `agent: z.enum(["research", "justice-league", "jsa", "suicide-squad", "eve"])`.
  - Via the raw HTTP API (bypassing the chat model), you *can* POST `{agent:"perry-white"}` — but `dispatch.ts:145` — `const persona = PERSONAS[agent] ?? PERSONAS.eve;` — silently falls back to the generic "eve" persona. Nothing named Perry White runs; you get a generic Sonnet-5 subagent with EVE's base law and none of Perry White's rules, voice, or gates.
- **Net: "dispatching Perry White" either can't be called, or silently runs as a different, generic worker wearing his name in the job title only.**

---

## 2. The full dispatch path: POST /dispatch → result

`index.ts:207-217` → `runDispatch(task, agent, client)` in `dispatch.ts:107-127`:

1. **`dispatch.ts:112-116`** — inserts a row into Supabase `jobs`: `{agent, title, status:"queued"}`. Returns `jobId` to the caller **immediately** (fire-and-forget, `dispatch.ts:119-127`) — the HTTP response never waits for the work.
2. **`runWorker` (`dispatch.ts:129-227`), in the background:**
   - `dispatch.ts:132` — `jobs.status = "running"`.
   - `dispatch.ts:135-138` — pulls up to 5 memory hits for grounding.
   - `dispatch.ts:150-171` — runs a **real, live Claude Agent SDK `query()`** call: model `claude-sonnet-5` (`dispatch.ts:14`), tools limited to `["WebSearch","WebFetch"]` (read-only web), `permissionMode: "bypassPermissions"`, `persistSession: false`, capped at 16 turns / $1.50 / 10 min (research: 32 turns / $3 / 20 min).
   - This IS a real worker process — not fake. It genuinely browses the web and writes a document.
   - `dispatch.ts:172-183` — captures the SDK's terminal result text. **On failure**, `jobs.status = "failed"` (`dispatch.ts:176`) and the function returns — no deliverable, no attention item, no push. The only trace is a `console.error` server-side; the user is not told anything failed.
3. **On success:**
   - `dispatch.ts:189-196` — best-effort write to local disk (`data/deliverables/{jobId}.md`) — explicitly documented as ephemeral on the hosted filesystem.
   - `dispatch.ts:198-201` — the durable copy: `jobs.status = "in_approvals"`, `jobs.result_ref = filePath`.
   - `dispatch.ts:204-209` — inserts an `attention_items` row, `kind:"approval"`, carrying the **full deliverable text inline** in `ref.content`.
   - `dispatch.ts:211-226` — sends a push notification ("EVE · FLEET — {agent} finished...") **only if** push is configured, a device token exists, and it isn't quiet hours. No push configured = no notice at all beyond the approvals list.
4. **How the user learns it finished:** two mechanisms, both best-effort —
   - The push above, or
   - `GET /state` (`index.ts:168-174`) → `buildState()` → `state.ts:23` queries unresolved `attention_items` — the phone app must be open/polling to see it.
5. **Closing the loop:** `POST /attention/:id/action` (`index.ts:378-388`) → `actOnAttention` (`ops.ts:138-186`). Approving an `approval`-kind item with a `job_id` sets `jobs.status = "done"` (`ops.ts:180-184`). **There is no other way a job reaches `done`** — approval is manual, always.

**Yes — there is a real `jobs` table with a real status lifecycle:** `queued` → `running` → `in_approvals` (success) or `failed` (error) → `done` (only after the human approves). This is genuine infrastructure, not a stub. What is fake is the idea that the `agent` field selects a *named* worker — it selects one of 5 generic personas (§1).

---

## 3. The tool surface in her agent loop

Two in-process MCP servers are wired into the chat loop (`chat.ts:59-60, 71, 77-84`): `eve_memory` (3 tools) and `eve_hands` (25 tools), plus stock `WebSearch`/`WebFetch`. `Bash/Read/Write/Edit/Glob/Grep` are explicitly disallowed (`chat.ts:85`) — she has no filesystem or shell access from chat.

**`eve_memory` (`tools.ts`) — all internal record I/O, no external action:**
| Tool | Line | What it does |
|---|---|---|
| `search_memory` | `tools.ts:20-45` | reads the memory store (read-only) |
| `save_memory` | `tools.ts:46-59` | writes a memory row |
| `log_touch` | `tools.ts:60-73` | writes a client-touch log row |

**`eve_hands` (`connectors.ts`) — 25 tools (`connectorToolNames`, `connectors.ts:53-79`):**

*Real external sends — RED tier, queued via `confirm.ts:requestConfirm`, never execute inline:*
| Tool | Line | Executes on approval via |
|---|---|---|
| `gmail_send` | `connectors.ts:130-154` | brain calls `google.sendMail` (`confirm.ts:105-107`) |
| `calendar_create_event` *with attendees* | `connectors.ts:169-198` | brain calls `google.createEvent` (invite emails out) |
| `send_sms` | `connectors.ts:300-324` | **brain does NOT send it** — `execute: null` (`connectors.ts:315`); a `clientAction` is handed back so the **phone fires it from King's own SIM** (`confirm.ts:95-104`) |
| `os_send_pending_email` | `connectors.ts:640-661` | brain calls `os.osTool("send_pending_email", …)` — an HTTP POST to the separate Churlish OS system |

*Real writes that stop short of sending (GREEN, draft-only):*
`gmail_create_draft` (114), `calendar_create_event` w/o attendees (169), `os_draft_proposal` (579), `os_draft_email` (599), `os_create_invoice` (616), `save_note` (228, posts to King's own private Discord), `wear_look` (212, her own avatar), `log_conversation` (326), plus habit/check-in writes (`log_checkin`, `tick_habit` — not shown in excerpt but present at `connectors.ts:368-450` per file map).

*Reads only:* `gmail_unread` (87), `gmail_search` (100), `calendar_view` (156), `list_looks` (200), `read_texts` (264), `read_notifications` (282), `os_board` (478), `os_clients` (492), `fleet_roster` (505), `list_habits`.

*Internal-business-data writer:* `os_command` (`connectors.ts:546-578`) — a fixed catalog of ~17 named operations against the separate Churlish OS (add_deal, add_client, add_expense, set_kpi, propose_automation, etc.). All internal bookkeeping; explicitly documented as unable to email a client (`connectors.ts:548-549`).

*Dispatch bridge:* `dispatch_fleet` (`connectors.ts:663-687`) — thin wrapper over `runDispatch`, `agent` locked to the 5-value enum (§1, §2).

**What is absent from this entire surface, confirmed by exhaustive enumeration:** no video/editing tool, no Premiere or any desktop-execution tool, no social-DM or contact-form-submission tool, no Meta/Facebook Ads tool, no generic "message this external person" tool, no computer-control tool. The only three channels that can leave the building at all are Gmail, SMS (fired by the phone, not the brain), and OS-routed client email — all three RED-gated.

---

## 4. The roster

**51 units total** in `data/fleet-roster.json` (verified: `grep -c '"key"'` = 51), across 7 divisions:

| Division | Count | Units |
|---|---|---|
| command | 5 | EVE, Fable Mind, WATCHTOWER, Churlish Voice Guard, Avatar Bible Loader |
| war-rooms | 4 | JSA, YouTube Council, Suicide Squad, Justice League |
| fleet | 19 | Starfire, Kid Flash, Blue Beetle, Red Robin, Iris West, Guardian, Cassandra Cain, Martian Manhunter, Doctor Mid-Nite, Brother Eye, **Perry White**, Oracle, **Pennyworth**, Cyborg, Steele, The Flash, Lois Lane, The Question, Huntress |
| production | 15 | Alfred, HLP Clip Finder, HLP YouTube Package, Transcript Clip Finder, Content Calendar Engine, Ad Script Factory, Ad Diagnostic Engine, Email Sequence Writer, Strategy Doc Builder, Master Plan Formula, Master Plan Style, Proposal Generator, Invoice Scoper, Editor Brief Generator, YouTube Metadata |
| systems | 5 | Verification Loop, Goal Runner, Session Handoff, MindCTRL Publishing Council, Big Barda |
| clients | 2 | Rustic Lumber Store, TrueNorth Clip Finder |
| writers-room | 1 | Aqualad |

**Executable behaviour behind the name, via EVE's dispatch, exists for exactly 3 of 51:** JSA, Justice League, and Suicide Squad — because and only because their roster `key` happens to match a `PERSONAS` key in `dispatch.ts:42-98`, wiring their war-room doctrine into a real dispatched Sonnet-5 subagent. `research` and `eve` in the same map aren't named roster units — they're the two generic fallback lenses.

**The remaining 48 — including Perry White and Pennyworth, his two headline examples — are roster-only through this dispatch path.** Pennyworth is a partial special case: three *purpose-built* bridge tools (`os_draft_proposal`, `os_draft_email`, `os_create_invoice`/`os_send_pending_email`) proxy specific operations to Pennyworth's actual logic — but that logic lives entirely inside the **separate Churlish OS backend** (`os.ts:10,47` — `fetch(`${OS_URL}/api/eve`)`, `OS_URL` defaulting to `churlishos.app`), a different codebase not present here. EVE's brain is just an HTTP client calling it for those four specific verbs. Every other unit — Starfire, Kid Flash, Blue Beetle, Red Robin, Guardian, WATCHTOWER, all of production and systems — has no code path anywhere in this repo that runs them. They are names with job descriptions, full stop.

---

## 5. Can anything today run a Churlish SKILL (jimmy-olsen, perry-white, kid-flash, big-barda, etc.)?

**No.** Skills are a Claude Code / Claude.ai construct (the `Skill` tool, invoked inside an interactive Claude session with the skill library loaded). Nothing in `fleet.ts`, `dispatch.ts`, `ops.ts`, `tools.ts`, `chat.ts`, `connectors.ts`, or `index.ts` invokes the `Skill` tool, shells out to a skill file, or has any concept of a skill markdown file. `runWorker`'s SDK `query()` call (`dispatch.ts:150-171`) passes only `tools: ["WebSearch","WebFetch"]` — it cannot load or run a skill package, and the disallowed-tools list in `chat.ts:85` blocks the filesystem access a skill invocation would need. The 5 dispatch personas *approximate* four skills' doctrine by pasting condensed instructions inline as system-prompt text (`dispatch.ts:62-98` — hand-written strings that echo the JSA/Justice League/Suicide Squad skill logic) — that is prompt-text imitation, not running the skill. Skills run only in a Claude Code session on Brandon's own machine; EVE's brain (a headless Node/Express service on Railway) has no mechanism to reach them.

---

## 6. THE GAP, precisely

### "Send Pennyworth to email this client"
**What exists:** A real, working, GREEN→RED two-step path — but it does not go through the "fleet" concept at all.
- `os_draft_email` (`connectors.ts:599-615`) sends an instruction to Churlish OS, which runs its own Pennyworth logic and lands a draft in that client's Comms panel. Real and functioning, but it is **Churlish OS's Pennyworth**, a different system, called over HTTP — not an EVE fleet worker.
- `os_send_pending_email` (`connectors.ts:640-661`) queues the send as a RED confirm; only on Brandon's approve does the brain call `os.osTool("send_pending_email",...)`.
- **What is missing:** any notion of "dispatch Pennyworth" as a fleet unit. You cannot say `dispatch_fleet(agent:"pennyworth")` — the enum forbids it (`connectors.ts:676`). The path that *does* work exists because someone built two bespoke, hardcoded bridge tools for this exact one use case (drafting/sending a client email through the OS), not because the fleet/dispatch system generalizes to "pick a named unit and hand it a task." Every other "send X to do Y" example he gave (Perry White writing an email outside the OS client list, any non-email deliverable from Pennyworth) has no equivalent bridge and falls back to either the 5 generic dispatch personas (document-only, cannot send) or nothing at all.

### "Find this person's contact info and message them" (podcast guest outreach)
**What exists, partially:** In live chat (not fleet dispatch), `WebSearch`/`WebFetch` are allowed tools (`chat.ts:82-83`), so EVE can genuinely search the web and read pages — she could plausibly surface a guess at someone's public email or social handle this way. If a real email address is found, `gmail_send` (RED-confirmed) could then actually send to it.
**What is missing, entirely:**
- No structured "find contact info" tool — this is unguided general web search/fetch, with no guarantee of finding anything, no social-platform API access, and no contact-form submission capability at all.
- No DM/message-send tool for any social platform (Instagram, LinkedIn, X, YouTube, etc.) — `eve_hands` has exactly three outbound channels (Gmail, SMS via phone, OS client-email), none of which is a social platform.
- The `dispatch_fleet` `research` persona (`dispatch.ts:50-61`) could be asked to research a person and write up their public channels as a **document** — but fleet workers are hard-capped to `WebSearch`/`WebFetch` only and explicitly documented as producing documents they "never send anything external" (`dispatch.ts:21-22`) — so even the "tell me the options" half would come back as a deliverable in the approvals queue (minutes later, `dispatch.ts:16-20` persona.minutes), not an inline chat answer, and the "send a message to them" half has no tool to execute at all, on any channel outside email/SMS.

**Bottom line for both examples:** the confirm-gated send infrastructure (`confirm.ts`) is real and correctly built — nothing external ever fires without a hash-matched human approval, exactly per the binding laws. What's missing is (a) any general mechanism that routes a task to a *specific named* fleet unit rather than one of 5 generic personas, and (b) any outbound channel beyond email/SMS/OS-client-email — no social messaging, no contact-form filling, no video/desktop execution tool of any kind in this codebase.
