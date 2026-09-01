# HUB-ROADMAP — EVE Desktop as the one place

Written 2026-08-31 for Brandon King. Built from four ground-truth passes over the shipping code (`G-FLEET`, `G-LOCAL`, `G-CONNECTORS`), two designs (`D-DISPATCH`, `D-CONTROL`) and one adversarial security review (`D-CONTROL-ATTACK`). Read-only pass; nothing under `C:\dev` was modified.

Effort is in **build-days** = one focused engineer-day. Where a range is given, the top of the range is the honest one.

---

## 1. THE ONE-PAGE READ

### What you asked for, in your words

> *"I want to be able to give Eve instructions to do something and she's able to have one of the agents responsible of that handle or do it and either come back with the results or let me know that it's done."*

Stripped down, that is four things:

1. **You say a sentence.** Not a form, not a menu.
2. **The right unit does the work** — Pennyworth for the email, someone for the outreach, KATANA for the cut.
3. **One list tells you what happened** — running, waiting on you, done, failed.
4. **Nothing goes out the door without your yes.**

Everything else on your list — social stats, Meta ads reporting, the Churlish Media slice, computer control — is a *panel on that screen*, not a separate product.

### The one architectural fact you need

**Your two examples run on two different computers, and only one of them currently has a door.**

- *"Send Pennyworth to email a client"* runs on **Railway** — the cloud brain. It needs no part of your desk. The path already exists: draft into Churlish OS, then a hash-confirmed send. Today it takes you three screens to do what is one API call.
- *"Cut this into a trailer"* runs on **your machine, inside Premiere**, and nowhere else. The timeline edit only exists inside Premiere's own plugin host. No cloud model can substitute for it.

That split is permanent. The design carries both behind one job list — a row is badged `[BRAIN]` or `[DESK]` and is otherwise identical.

**The consequence you need to sit with:** KATANA is a finished tool (built through M7, 18 of 20 Premiere operations verified working) with **zero programmatic trigger**. No queue, no socket, no file watch. It only moves when a human clicks in the panel. So "EVE cuts a trailer" is not a permissions problem or a smarts problem — it is a **missing door**, and the door is about a day of work inside KATANA's own repo.

### The second fact, which will annoy you

**Your fleet is a roster, not a workforce.** 51 units across 7 divisions are listed. **3 of them** — JSA, Justice League, Suicide Squad — have code behind the name. Pennyworth is a fourth, part-way: two purpose-built bridge tools proxy to Pennyworth's real logic, which lives in Churlish OS.

The other 47, Perry White included, are names and job descriptions with no execution path anywhere. Worse: today, if something calls dispatch with "perry-white," the code silently substitutes a generic worker wearing his name in the job title. **The system's current failure mode is pretending**, which is the one thing every law you wrote is pointed against. Deleting that one line is the single highest-value change in this whole document.

The fix is not to build 47 agents. It is to badge each unit honestly — `RUNNABLE HERE` / `DESK` / `WORKSPACE ONLY` — and let the runnable set grow one data row at a time.

---

## 2. WHAT ALREADY WORKS TODAY — usable tomorrow, zero build

You have more than you think. Nine things, none of which require a line of code.

| # | What | How to use it tomorrow |
|---|---|---|
| 1 | **The email path already exists end to end.** `os_draft_email` writes a GREEN draft into Churlish OS; `os_send_pending_email` sends it only after a hash-matched confirm card. | Ask EVE in chat: *"draft an email to [client] about [topic]."* Approve the card. It sends. What's missing is not the capability — it's the single screen that shows you it happened. |
| 2 | **Four real background workers.** `research`, `justice-league`, `jsa`, `suicide-squad` run as actual Claude subagents with capped turns, budget and minutes; they write a real deliverable into approvals and push you when done. | *"Dispatch research on [topic]."* Come back in minutes. This is real today and mostly unused. |
| 3 | **28 tools are live** — Gmail read/search/draft/send, Calendar read/create, Churlish OS board, clients, deals, invoices, proposals, Friday Five, sprint, goals, KPIs, work items, notes, habits, texts, notifications. | Most OS bookkeeping you do by hand in a browser tab, she can already do by sentence. |
| 4 | **The confirm gate is real and solid.** Nothing external fires without a hash-matched approval, and the OS enforces it a second time server-side, independently of the brain. | You can trust the send path today. That is not a promise — it's two independent checks in shipping code. |
| 5 | **KATANA works.** 18 of 20 Premiere operations verified. Non-destructive by construction — the master sequence is never touched; every mode makes new sequences or a `_KATANA-CLEAN` duplicate. Every run logs a folder next to the project. | Cut trailers today, by hand, in the panel. The only thing missing is the *queue*, not the engine. |
| 6 | **Churlish OS already has EVE's door.** A bearer-gated tool endpoint with a documented tool list. The brain already reads and writes the OS through it. | The "local slice of Churlish OS" you asked for is a **view** problem, not an integration problem. The data is already reachable. |
| 7 | **Meta Ads and YouTube/IG/TikTok toolkits are already authorized to your Claude Code account on this machine.** They are *not* wired to EVE — different host, different consent — but they are live where you sit. | You can pull ad numbers and channel stats **today** by asking in Claude Code. You just can't ask EVE yet. |
| 8 | **5 skill folders on disk, 49 units in the roster manifest.** Skills run by a live agent session reading the file and following it. | In Claude Code: *"run Jimmy on these notes,"* *"Miracle pass on this file."* Works now. |
| 9 | **SMS sends from your phone, not the brain.** Queued centrally, transmitted by the handset on approval. | Already law-compliant, already working. |

**The honest summary of today:** the machinery is good and the screen is missing. You are paying the cost of three surfaces to get the value of one.

---

## 3. THE PHASES

Ordered by value-per-build-day, not by dependency. P1 and P2 are independent and can be built in parallel by two workers.

---

### P0 — THE TRUTH PASS
**Effort: 1–2 build-days. Ships this week.**

Seven small fixes, all of which are bugs against your own laws.

1. **Delete the silent substitution.** Today an unknown unit key runs as a generic worker. Make it an error the model must speak out loud.
2. **A failed job produces an attention item.** Today `failed` writes a server log and nothing else — you never find out. This is a live bug.
3. **Widen the job list to a 24-hour window.** Today the hub query returns only queued/running/in-approvals, so **a job vanishes from your screen the instant it completes** — the exact opposite of "tell me it's done."
4. **Move the fleet strip off `/health`.** `/health` is unauthenticated. Publishing 51 unit names and their live jobs there hands your org chart to anyone who can reach the URL. Read from the bearer-gated state endpoint instead. Same pixels, correct door.
5. **Confirm the Railway brain token is not still the literal placeholder string** shipped in the example env file.
6. **Revoke Notion, Slack and Stripe at the provider.** Those modules were retired 2026-07-17 and nothing imports them, but the env slots still exist. If any key is populated, that's live read access to your business data that no code calls.
7. **Inventory what your Claude Code account has OAuth'd** (Meta, vidIQ/YouTube/IG/TikTok) so nobody later assumes EVE has that reach.

**Must be true first:** nothing.
**What you can do at the end that you can't now:** see a job that failed instead of watching it disappear, and see a job that finished. Plus you stop leaking a roster on a public URL.

---

### P1 — THE DISPATCHER (V0.1)
**Effort: 4–6 build-days. The core of the whole ask.**

**Ships:**
- One migration widening the existing jobs table (host, unit, spec, result, awaiting, parent/step, cost, desk id, conversation id).
- A **capability registry** joined onto the fleet roster you already read from the OS — capability as one more field on a merge that already happens.
- A new `dispatch_unit` tool with **no enum** (today the tool literally cannot say "pennyworth" — the parameter is locked to 5 values) and **no silent fallback**. Registered in the tool-names list, or the model can't see it.
- One ambient line (~55 tokens) in her context every turn: who exists, who is runnable, who isn't. This is the piece that makes "send Pennyworth" work at all instead of costing a tool call and a guess.
- **Confirm-to-job linkage** — approving the card closes the job. This is the seam that makes *"she told me it sent"* true rather than hopeful.
- A live push frame so the hub row appears within a second.
- The hub: fleet strip bound to real state, four counters (RUNNING / WAITING / HELD / FAILED), the session log as a job event feed, and a job detail panel showing your sentence verbatim, who she picked and why, the next action's tier, and the confirm card inline.

**Registry contents on day one: 5 runnable units** — the 4 existing personas plus Pennyworth's draft/send pair. Not 51. Everything else is badged honestly.

**Must be true first:** P0's substitution fix; a Supabase migration and a Railway redeploy; one reviewed column added to the OS's fleet roster.

**What you can do at the end:** say *"send Pennyworth to email Acacia about pushing the shoot to the 12th"* in the hub, watch a row go RUNNING → card → DONE with the sent copy inline, **without opening Churlish OS to check the draft exists, without opening your phone to approve it, and without asking her again whether it went.** That's two screens collapsed into a row that was already on your hub.

---

### P2 — THE NUMBERS (YouTube, then Meta Ads)
**Effort: YouTube 2–3 days. Meta Ads 4–6 days. Facebook Pages +1–2 days on the same app. Independent of P1.**

Nothing exists today. Zero hits for youtube/instagram/tiktok/facebook/meta anywhere in the brain. No module, no tool, no cached table, no env slot.

Each connector needs three parts, and the third is not optional: a module following the existing Google pattern with honest not-connected states, read-only tools, and a **scheduled fetch that caches last-known values with a fetched-at timestamp**. None of these platforms tolerates a live call on every chat turn, so the tool serves a cached row and shows its age.

**Order and why:**
1. **YouTube** — cheapest, may extend the Google OAuth client you already have. Add the read-only scope, re-consent once.
2. **Meta Ads reporting** — highest value, closest to money. Needs a Business Manager System User (not a personal token — those orphan on password/2FA changes) scoped read-only.
3. **Facebook Pages** — cheap once the Meta app exists.
4. **Instagram** — gated by a non-code prerequisite: the IG account must already be Business/Creator and linked to a Page.
5. **TikTok** — **not in this roadmap.** App review, short-lived tokens needing active rotation, narrowest free analytics. Approval is the real milestone, not the code.

**The honesty bar, non-negotiable:** every figure traces to a real successful API response, carries a fetched-at timestamp, names the account it belongs to, and shows an explicit not-connected state rather than a blank chart or a zero. No interpolation to fill a failed call.

**Must be true first:** the credentials in §5. You are the only person who can create them.

**What you can do at the end:** open the hub and see yesterday's ad spend, results and cost-per-result, and this week's channel numbers, with the time they were fetched — instead of opening Ads Manager and YouTube Studio to look up numbers you then retype somewhere.

---

### P3 — MULTI-STEP AND THE HANDOFF (V0.2)
**Effort: 3–4 build-days. Requires P1.**

The podcast-guest case is three things: **research → a choice you make → a send.**

**Ships:**
- Steps as child jobs under a parent. The hub shows one row that expands into three.
- A **pause that costs nothing.** A worker that needs an answer *ends its step* and writes the question to the row. It does not hold a session open or burn budget waiting. A job can sit for three days for free, then resume as a fresh step.
- Anti-nagging rules that matter more than they sound: one ask per step and it must be complete (every option found, in one question, no drip); **two asks per job, lifetime**; quiet hours hold every ask; one push per job on terminal state only, never per step; answering in chat works identically to clicking.
- The **`handoff` terminal state.** Your entire outbound surface today is three sends: Gmail, SMS from your phone, and OS client email. There is **no social DM tool, no contact-form tool, no LinkedIn, nothing**. So when the best route is an Instagram DM, the job ends *"here's the exact message, here's the link, one click to copy"* and closes as done-handed-to-you. That is a truthful outcome and it still saves you the thinking. A hub that says "I can't reach Instagram, here's the DM" is trustworthy. One that quietly drops the step is not.

**Must be true first:** P1 shipped and used for a couple of weeks, so the job list is something you trust before it starts asking you questions.

**What you can do at the end:** *"reach out to Dr. X about the podcast"* → minutes later a row says WAITING with three routes and what each costs → you pick → she drafts → one confirm card → sent, or handed to you with the message written.

---

### P4 — THE KATANA DOOR
**Effort: ~1 day inside KATANA's repo + 4–5 build-days in EVE. Requires P1.**

This is the one that makes the trailer example real, and **the cheap half of it is not in EVE.**

**Ships (KATANA side, ~1 day):** the panel gains a watcher on a queue folder and a "run the queued job" path. That is the entire difference between "no trigger surface at all" and "EVE can hand it work."

**Ships (EVE side):** a work-order envelope shared with the filing build already in flight (claim-or-conflict, bound to one desk install, expiring); a generic **command-line adapter** that covers every future local tool as a config row with zero new desktop code; a bespoke KATANA adapter; local worker registration as non-secret config; and **readiness probing** so the hub can honestly say *"katana — Premiere not open"* instead of dispatching into a wall.

Long-job handling is different from filing: the 10-minute expiry governs only the **claim**; after that the clock is the job's own budget with a heartbeat every 30 seconds. Three missed beats = *"your desk went quiet"* — honest, and honestly ambiguous, because a crashed Premiere and a closed laptop lid look identical.

**Must be true first:** Premiere Beta 26.2.x installed (stable 26.0 has no plugin host at all — this is a hard environment requirement); the KATANA queue watcher merged; a decision on where the queue folder lives.

**What you can do at the end:** say *"cut the True North interview into a trailer"* from the hub. The job queues. You open Premiere with the project; the panel picks the job up and applies it; the hub row flips to DONE with the sequences created, the clip count, and an OPEN FOLDER button. **You still have to have Premiere open — that never changes.** What goes away is the round trip of remembering, opening the panel, picking client and mode, and clicking through.

---

### P5 — THE CHURLISH MEDIA SLICE
**Effort: 2–3 build-days. Requires P1. Pure UI.**

Churlish OS is not a local program — it's a hosted app over Supabase, and the brain already reads and writes it wholesale. So "a local slice" cannot mean new access; it means **a filtered view**: board, pipeline, clients, invoices, rendered in the hub's own panel instead of a browser tab.

Be clear about what this is: it duplicates a subset of what a tab already shows. The only thing genuinely local about it is presentation.

**What you can do at the end:** stop opening the OS tab for the daily check. You'll still open it for anything you *edit* there.

---

### P6 — MACHINE CONTROL, THE PART THAT CAN SHIP
**Effort: 3–4 weeks minimum, and the first week has no hands in it at all. Requires everything above, plus two prerequisite fixes.**

You chose "full control" after being shown the risk. The security review's finding is that the top tier of that choice **is not a risk that can be priced down with better rules** — see §4. What can ship is real and useful, and it is not "full control."

**Two prerequisite fixes, before a single line of input code is written:**
- **The kill hotkey is currently Ctrl+Shift+Esc — that's Windows' Task Manager chord**, which a non-elevated app cannot reliably claim. When registration fails, the code prints a console warning nobody will ever see and falls back to "click the tray icon," which you'd have to do *while an automation holds your focus*. Pick a chord Windows doesn't own, verify registration at run start, refuse to start a run without it.
- **The journal is append-only and flushed, but it is not hash-chained.** The design's whole audit-integrity claim describes a property that doesn't exist yet. For control, evidence is the only product — fix this first.

**P6a — Sight, no hands (1 week).** Read window structure only by default; screenshots available but constrained. The entire privacy stack ships here: per-window capture (not screen-region grabs, which would pull in an overlapping password-manager popup or a 2FA toast), local redaction before anything transmits, a capture ledger you can browse, weekly counters, 30-day auto-purge, a monthly digest that tells you in plain numbers how often she looked and how many pictures left the machine.

**P6b — Launch and activate (1 day).** She can open an enrolled app and bring it forward. Genuinely low risk.

**P6c — Targeted invoke (1 week).** Drive a *named element* through the accessibility layer — "press the button whose id is `btn_export` in window H." If it moved or is gone, it fails loudly instead of clicking whatever is now at those pixels. This is the tier that should exist.

**P6d — Recorded recipes (1 week).** You record yourself doing a thing once; she replays the exact step list. No screenshots at replay. This is the only shape where the approval card is completely honest, because the step list is literally what you did.

**Must be true first:** kill switch and journal fixed; per-app enrolment ceremony where you physically point at the window (you never type a path, so you can't be talked into typing the wrong one); grants that expire (90 days, 30 with typing); an always-on-top halt bar whose visibility is *verified*, not assumed.

**What you can do at the end:** a handful of rehearsed multi-click sequences in one or two desktop apps, run from the hub, with a scrub-through recording of exactly what happened. Not "EVE uses my computer." Considerably less than that, and safe.

---

### The order, at a glance

| Phase | Days | Kills a screen? | Depends on |
|---|---|---|---|
| P0 Truth pass | 1–2 | No (fixes lies) | — |
| P1 Dispatcher V0.1 | 4–6 | **Yes — 2** | P0 |
| P2 Numbers | 7–11 total | **Yes — 2** | Your credentials |
| P3 Multi-step + handoff | 3–4 | No (adds capability) | P1 |
| P4 KATANA door | 5–6 | Partial | P1 + KATANA repo work |
| P5 OS slice | 2–3 | **Yes — 1** | P1 |
| P6 Control (a–d) | 15–20 | No | P0–P5 + 2 fixes |

**P0 through P5 is roughly 22–32 build-days.** P6 alone is about as much again, for less.

---

## 4. THE HONEST NOs

### Will not be built, at any phase

**1. Synthetic mouse clicking as a general capability (the tier that would drive Premiere by clicks).** The security review is unambiguous. Four reasons, in order of weight:
- The one mitigation that makes clicking safe — resolving a coordinate to a real, named UI element before pressing it — **requires an accessibility surface, and Premiere's timeline is a custom-drawn canvas that has none.** So it is safe exactly where it is unnecessary and unsafe exactly where it is wanted.
- A misplaced drag in a timeline doesn't fail loudly. It moves media, overwrites a neighbouring clip, or ripple-deletes — in the master sequence, which KATANA is careful never to touch and raw clicking has no such property about. You find out when you next open the sequence.
- Two structural escapes are open and neither is fixable by better rules: **the common file dialog** (a path typed into a Save As box writes anywhere you can write, including a network share, launders ~30 filing guard rules, and is the termination of a real exfiltration chain) and **embedded web views** (the "no browsers" rule is keyed on process name; Slack, Teams, Notion and — decisively — **Adobe's own plugin panels, including KATANA's** are browsers living inside signed non-browser apps).
- **It buys a capability that one day of work deletes.** Build KATANA's door instead.

**2. "Figure out how to do X in an app you've never driven."** That's what "full machine control" implies in ordinary speech, and there is no approval card that makes it honest. The replacement: you do it once with the recorder on, and it becomes a recipe.

**3. Pixel or keyboard control of browsers, embedded web views, and file dialogs.** Three structural exclusions. Your bank, your password vault, your payment dashboards and every checkout live behind the first one; arbitrary filesystem writes live behind the third.

**4. Driving Premiere by scripted clicks as a stopgap while the door is built.** It is indistinguishable from unattended action, it's fragile, and you haven't authorized screen reading. If anyone tells you the trailer example works today, they are describing this.

**5. Typing arbitrary keystrokes.** The finding that surprised me most: every safety check in the control design examines a *pointer event against a labelled element*. **A keystroke has no label.** In Slack, Teams, Discord and most comment boxes the Send button *is the Return key*; Ctrl+S overwrites; Del deletes; a typed path in a Save As box writes anywhere. If typing ever ships it is narrowed to *printable characters into a resolved text field*, with Return, Tab, Escape, Delete, Backspace, every modifier chord and every function key denied outright — which should be called "filling in a field," not "typing," so nobody assumes more.

**6. EVE writing to your ad accounts.** Reporting is read-only. Budgets, bids and campaign activation are spending money by another name and stay on the Ads Manager, done by you.

**7. Approving a control action from your phone.** The approval is bound to what's on the screen at that moment. On a phone you can't see the screen, the app, or the staged state, and you can't reach the kill switch. The phone shows *"1 waiting at your desk"* and nothing more.

**8. Anything on a timer.** She may *propose* a job. She may never *queue* one. No schedule starts work. The desktop's periodic snapshot refreshes perception only.

### Not yet — deferred with a reason

**9. TikTok stats.** Developer app review, short-lived tokens needing rotation, thinnest free analytics. Revisit when the other four are live and boring.

**10. RLS-OS in the hub.** It is a different customer's system, on its own database with its own voice rules. It is not one of your screens.

**11. Quill in the hub.** Its data lives in your browser's local storage and it has no server routes at all — there is nothing to call into. If you want it in the hub, the real move is to redeploy it like its siblings, which is its own project.

**12. The other 47 roster units becoming runnable.** Adding one is a data row *when a runner already exists*. Most have no runner and shouldn't get one on spec. Grow the list when a specific job repeats.

### One design decision to push back on

**The roster row supplies a worker's system prompt, and the roster is written by a different system.** That means the OS can change what a worker believes it is. Capability stays code-side and workers hold no send tools at all, so the worst case is a bad document rather than a bad action — but make the OS-side write path a reviewed one, not an open column.

---

## 5. CREDENTIAL AND ACCESS CHECKLIST

Only you can supply these. Values are never printed here — "present" is the maximum detail.

**Before P0 (security hygiene, ~30 minutes total)**
- [ ] Confirm the Railway brain token is a real generated secret, not the placeholder string from the example env file.
- [ ] Revoke and delete Notion, Slack and Stripe credentials at each provider. Those integrations were retired 2026-07-17; nothing calls them; any populated key is unused live access to your data.
- [ ] Write down which connectors your Claude Code / claude.ai account has granted (Meta, YouTube/IG/TikTok toolkits, Google, Slack). These are **not** EVE's and shouldn't be assumed to be.

**Before P1**
- [ ] Supabase: apply one additive migration to the jobs table.
- [ ] Railway: redeploy the brain.
- [ ] Churlish OS: add a capability field to the fleet roster rows, behind a reviewed write path. Confirm the OS token is present.

**Before P2 — YouTube**
- [ ] Re-run the Google OAuth consent once with the read-only YouTube scope added to the client you already use for Gmail/Calendar. ~5 minutes.

**Before P2 — Meta Ads**
- [ ] In Business Manager, create a **System User** (not a personal token) with read-only ads access.
- [ ] Generate its long-lived token; store it brain-side on Railway only.
- [ ] Note the ad account IDs to report on.

**Before P2 — Facebook Pages** (same app, after Ads)
- [ ] Add page read/insights permissions; generate a Page token.

**Before P2 — Instagram**
- [ ] Confirm in Business Suite that the IG account is Business or Creator **and** already linked to a Facebook Page. This is a prerequisite, not a key — if it isn't true, no amount of code helps.

**Before P4**
- [ ] Premiere Pro **Beta 26.2.x** installed. Stable 26.0 has no plugin host and returns "host application not available."
- [ ] KATANA's shared token present; queue folder location decided.
- [ ] Approve the ~1 day of work inside the KATANA repo. This is the dependency the whole local half rests on.

**Before P6 — decisions only you can make**
- [ ] Whether pictures of your screen may leave this machine at all. If the answer is no, control is recipe-replay only and permanently smaller — which is a legitimate choice.
- [ ] Whether you accept that you are a media agency: what's on your screen is largely **your clients' confidential material** under contract, and transmitting a window image is a disclosure of it. Any app that displays client footage should be flagged structure-only, permanently.
- [ ] Whether to run control under a **separate Windows account** with no signed-in sessions, no password manager and no saved payment methods. The review is blunt: this is the only containment aimed at the real threat, because she never needs your password to act as you — your apps are already signed in. If the friction is unacceptable, the correct response is that typing and clicking don't ship.

---

## 6. THE SCREEN-KILL SCORECARD

You said you have too many screens. Here they are, honestly scored. **A phase only "kills" a screen if you stop opening it.**

| Screen | What you use it for | Killed by | Honest verdict |
|---|---|---|---|
| **Churlish OS tab — approvals & pending email** | Checking a draft exists, sending it | **P1** | **KILLED.** The draft, the card and the sent copy all land in the job row. |
| **Phone app — approving sends** | Tapping approve when away from the desk | **P1** | **DEMOTED, not killed.** At the desk you approve in the hub. The phone stays for when you're out — and that's correct. |
| **Churlish OS tab — board, pipeline, clients, invoices** | The daily look | **P5** | **KILLED for reading.** You'll still open it to edit. |
| **Meta Ads Manager — daily numbers** | Spend, results, cost per result | **P2** | **KILLED for reading.** Campaign edits stay there permanently, by design. |
| **YouTube Studio — channel numbers** | Views, subs, recent performance | **P2** | **KILLED for reading.** Uploads and comments stay there. |
| **Instagram / Facebook stats** | Reach, engagement | **P2** (IG gated on the Page-link prerequisite) | **KILLED for reading.** |
| **TikTok stats** | Same | **Nothing on this roadmap** | **NOT KILLED.** Deferred on purpose. |
| **Gmail tab** | Reading and triaging your own mail | **Nothing** | **NOT KILLED.** She reads unread, searches, drafts and sends — but reading your own inbox is your job, not a screen to automate away. |
| **Premiere** | Actual editing | **Nothing, ever** | **NOT KILLED.** P4 removes the *panel round trip* (remember → open panel → pick client and mode → click), not Premiere. You still open it. |
| **Claude Code terminal** | Running skills — Jimmy, Miracle, Perry White, the war rooms | **Nothing** | **NOT KILLED.** 47 of 51 units stay workspace-only. The hub will *name* them and hand you the trigger phrase; it won't run them. Say so on the card or the hub is lying. |
| **Churlish OS — proposals, invoices, diagnostics** | Creating and editing them | **Nothing** | **NOT KILLED.** She can draft them by sentence today; final editing lives in the OS. |
| **Notion / Slack / Stripe** | — | Already gone (retired 2026-07-17) | **ALREADY DEAD.** Revoke the keys (§5) and delete the modules. |
| **Discord #eve-notes** | Where her notes land | — | **Stays.** Write-only sink, one line of code, no cost to you. |
| **Quill** | Novel drafting | **Nothing** | **NOT KILLED.** Out of scope; see §4 item 11. |
| **RLS-OS** | Client's system | **Nothing** | **NOT YOURS.** Out of scope. |

**Score: P0–P5 removes 4–5 screens from your daily loop and demotes 1.** It does not remove Premiere, your inbox, or Claude Code, and any roadmap that claims otherwise is selling you something.

---

## 7. THE ONE THING TO DO FIRST

**Greenlight P0 + P1 as a single week of work — nothing else — and while it builds, spend 20 minutes creating the Meta System User token and re-consenting the Google OAuth with the YouTube scope, so P2 isn't waiting on you.**

**What it buys:** within a week, *"send Pennyworth to email Acacia about pushing the shoot to the 12th"* becomes one sentence, one row, one card, done — with the sent copy sitting in the row. Two screens collapse into a rail that's already on your hub, the fleet strip finally tells the truth about which 5 of 51 units can actually run, and a job that fails stops disappearing without telling you.

---

*Ground truth in `G-FLEET.md`, `G-LOCAL.md`, `G-CONNECTORS.md`. Designs in `D-DISPATCH.md`, `D-CONTROL.md`. Security findings in `D-CONTROL-ATTACK.md` — its CRITICAL and HIGH findings are treated as hard constraints throughout, not recommendations.*
