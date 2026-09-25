# RUNBOOK — EVE moves into Churlish OS (One House Step 4, brain side)

Goal: the OS's chat tab is EVE, her alerts open OS pages, her approval cards
show in the OS Inbox, and she can read the Inbox and Ledger and act on one
item at a time through the OS's door. The OS side is on the OS repo's branch
`claude/getting-started-7625m0`; this branch (`claude/os-step4`) is the brain's
side. Both are code-complete and verified. What follows is your part.

## Step 1 — merge this branch (1 minute)

In PowerShell, one line at a time, from `C:\dev\eve`:

```
git pull
git merge origin/claude/os-step4
git push
```

Railway deploys from `main`. If it doesn't start on its own: Railway → the
brain service → **Deploy**.

## Step 2 — check two Railway variables (1 minute)

Railway → the brain service → Variables. Nothing new to add. Confirm:

- `CHURLISH_OS_URL` is `https://churlishos.app` (no trailing slash)
- `CHURLISH_OS_TOKEN` equals the OS's `EVE_OS_TOKEN` (Vercel → churlish-os →
  Settings → Environment Variables)

Do NOT set `EVE_SCHEDULERS` here. Railway sets `RAILWAY_ENVIRONMENT` itself,
and that alone turns her 07:00 / 17:30 crons on. `EVE_SCHEDULERS=on` is only
for deliberately running the crons from a laptop.

## Step 3 — the OS's two new variables (2 minutes)

Vercel → churlish-os → Settings → Environment Variables, both server-only:

- `EVE_BRAIN_URL` = her Railway URL, e.g. `https://<service>.up.railway.app`,
  no trailing path
- `EVE_BRAIN_TOKEN` = the value of `EVE_BRAIN_TOKEN` in Railway's variables

Redeploy the OS after saving.

## Step 4 — prove it (2 minutes)

1. Railway → the brain service → the latest deploy log: it says
   `[schedulers] ON — hosted (RAILWAY_ENVIRONMENT set)`.
2. Open the OS cockpit → the chat tab. The header reads **EVE**, not Rookie.
   Ask her "what's on the board?" Attach a receipt with 📎: that still goes to
   Rookie.
3. Ask her "what's in my inbox?" She answers from the OS Inbox, each item with
   its key. Ask her to approve one by name: a RED card appears; approve it
   from the OS Inbox (one tap, one card) or from her app. Nothing sends
   without that tap.
4. Tomorrow's 07:00 brief has one more line under TODAY'S SHAPE:
   "OS sweep: ran HH:MM — N open items need you in the OS", or "OS sweep
   pending" until the OS's 06:30 sweep has written its Ledger line.

## What changed in the brain (for the record)

- `push.ts`: every push whose kind has an OS page carries `data.link`
  (brief / closeout → `/today`; tripwire, silent_client, approval,
  routine_risk → `/inbox`). The `eve://` deeplink is unchanged.
- `schedule.ts`, `index.ts`: crons and the unit clock start only when
  `EVE_SCHEDULERS=on` or `RAILWAY_ENVIRONMENT` is set; the boot log says which.
- `os.ts`, `brief.ts`, `briefing.ts`: `osSweep()` reads the OS's
  `/api/eve/sweep`; the brief prints the line above, a blind spot when the
  read fails, nothing when the OS isn't wired.
- `connectors.ts`, `authority.ts`: six `os_*` house tools. `os_inbox_summary`
  and `os_house_status` are GREEN reads, and `os_pause_sends` is GREEN (it can
  pause sends, never resume them). `os_mark_paid_offline` and
  `os_move_client_stage` are latched: a conversation that has read someone
  else's words can't use them. `os_approve_inbox_item` is RED: one confirm card
  per item, and the OS independently refuses an approve that didn't come
  through your tap. No bulk approve exists on either side. (Corrected in 4c:
  this list used to name four tools that were never built.)

---

# Step 4c — EVE through the front door (brain side)

The OS's browser can now talk to EVE directly without holding her key, the
brain only answers pages it knows, the OS's events reach your phone, and the
client pulse asks the OS who's gone quiet. The OS half (the ticket minting, the
`/api/eve/events` feed and the `quiet_clients` tool) is being built on the OS
repo at the same time. Until it deploys, the pull and the pulse fail with a
reason in the brain's log, and nothing is pushed.

## What you do

1. **Merge.** Same as Step 1 above: `git pull`, then
   `git merge origin/claude/os-step4`, then `git push` from `C:\dev\eve`.
2. **Railway variables.** There's nothing new to add and no new secret.
   - `EVE_ALLOWED_ORIGINS` is new and optional. **Leave it unset.** Unset, the
     brain answers `https://churlishos.app`, `https://www.churlishos.app`, the
     phone app and the Vite dev server. Set it only to change that list
     (comma-separated origins, which replace the default). `*` opens it to every
     origin and is for a laptop test only.
   - `NOTION_TOKEN` and `STRIPE_KEY`: if either is still in Railway's
     variables, you can delete it. Nothing reads them (see Housekeeping).
3. **Prove it (2 minutes).** In the latest Railway deploy log:
   - `[cors] allow-list (default): https://churlishos.app, …`
   - `[os_events] armed: every minute, …`. If it says
     `[os_events] OFF — CHURLISH_OS_TOKEN not set`, then `CHURLISH_OS_TOKEN` is
     missing (Step 2 above).
   - After the OS side deploys, the first minute primes the feed silently. The
     next lead, payment or booking arrives on your phone as one push,
     "N things happened in the OS: …". Tapping it opens that page in the OS.

## The OS ticket (4.1): the brain accepts an OS credential

- **What it is.** It's a pass the OS signs for a signed-in browser. The browser
  never sees `EVE_BRAIN_TOKEN`. The format is fixed with the OS:
  `Authorization: Bearer os1.<exp>.<nonce>.<sig>`.
  - `exp` is unix seconds.
  - `nonce` is 16 lowercase hex characters.
  - `sig` is the lowercase hex HMAC-SHA256 of `os1.<exp>.<nonce>`, keyed with
    `EVE_BRAIN_TOKEN`.
- **No new secret.** Both sides already hold the key.
- **Where it works.** A ticket is valid only while `now < exp` and
  `exp − now ≤ 900` s, so it lives at most 15 minutes. It opens exactly four
  routes: `POST /chat`, `GET /state`, `POST /confirm` and `GET /confirm/:id`.
  Every other route stays bearer-only (the phone, the desk, `/job`,
  `/dispatch`, `/wardrobe/*` …), and a ticket there gets a 401.
- **What it can't do.** It isn't one-time: it works for any number of calls to
  those four routes until it expires, and 15 minutes is the whole bound on a
  replay. Nothing about a ticket is logged.
- **Code.** `brain/src/os-ticket.ts` and `brain/src/index.ts`, with
  `verify/os-ticket-harness.ts` as proof.

## CORS (4.1): an allow-list, not a mirror

- **Allowed.** An origin on the list gets its own origin back in
  `Access-Control-Allow-Origin`.
- **Refused.** Any other origin gets no ACAO header (never `*`) and one log
  line, `[cors] refused origin <origin>`, once per origin.
- **No Origin header.** Requests without one are unaffected: the OS's
  server-side routes, curl, and the desktop, which calls the brain from
  Electron's main process.
- **Preflight and same-origin.** Preflight `OPTIONS` still answers 204 before
  auth. The brain's own `/console` page is same-origin and always allowed.
- **Where the default list came from.**
  - `app/capacitor.config.ts` sets `androidScheme: "http"`, so the phone's
    WebView origin is `http://localhost`.
  - `https://localhost` and `capacitor://localhost` are Capacitor's defaults,
    kept so a config change can't cut her off.
  - `app/vite.config.ts` serves on port 5173, which is also electron-vite's
    renderer dev port.
- **Not covered.** A phone hitting the Vite dev server over Wi-Fi
  (`http://<LAN-IP>:5173`) isn't on the default list. Add it with
  `EVE_ALLOWED_ORIGINS` when you need it.

## The OS events feed and the minute push (4.3, 4.4)

- **The read.** `os.ts osEventsSince(cursor, limit)` calls
  `GET ${CHURLISH_OS_URL}/api/eve/events?since=<cursor>&limit=<n>` with the
  OS bearer (`CHURLISH_OS_TOKEN`).
  - `since` is omitted on the first read, and the OS answers with the last
    24 hours.
  - The answer is
    `{ ok, cursor, events: [{ id, at, kind, title, detail, link, needs_you, client_id }] }`.
  - The cursor is opaque and passed back verbatim.
  - A malformed event is dropped and counted.
- **Her tool.** `os_events_since { since? }` is a GREEN reader. It returns
  lines like `HH:MM · title (kind)` (with `· needs you` when flagged), then
  `cursor: …`.
  - Titles are other people's words, so calling it closes the latch for that
    conversation, like `os_inbox_summary`.
- **The pull.**
  - **When it runs.** Every minute, only where the crons run (Railway). It's
    armed inside `startSchedulers()`.
  - **Where the cursor lives.** In `app_state` under `os.events_cursor`, so it
    needs no migration.
  - **What pushes.** It sends **one** push per pull, and only when something in
    it has `needs_you`, or a kind starting with `lead.`, `invoice.paid`,
    `booking.`, `hlp.`, `email.held`, `email.failed` or `sequence.stalled`.
    Everything else just moves the cursor.
  - **The push itself.** The body is "N things happened in the OS: <first
    titles>", at most 25 words, with no AI call. The tap opens
    `CHURLISH_OS_URL` + the first such event's link, and `data.kind` is
    `os_event`.
- **Quiet hours: the cursor is held.** From 21:30 to 06:30 the pull doesn't
  run at all. The first minute after 06:30 reads the whole night and sends it as
  **one** push. The alternative, moving the cursor at night and skipping the
  push, would lose "a lead came in at 23:10" for good, because nothing else
  carries OS events to you.
- **First run primes and doesn't push.** The last 24 hours are history, and the
  brief covers them. The same applies if the cursor can't be read after a
  restart: a missing cursor stays quiet, and yesterday never replays on your
  lock screen.
- **If a push fails.** The cursor is held and the same batch is retried next
  minute. After 3 failures in a row the batch is dropped, so a dead phone token
  can't stall the feed.
- **Logged.** Counts only. Titles, bodies and cursors are never logged.
- **By hand.** `POST /job {"job":"os_events","force":true}` (bearer) runs one
  pull.
- **Code.** `brain/src/os-events.ts`, with `verify/os-events-harness.ts` as
  proof.

## The quiet-client pulse reads the OS (4.6)

- **The source.** When `CHURLISH_OS_TOKEN` is set, the 12:30 pulse asks the OS
  who has gone quiet, using the house tool `quiet_clients`:
  `{ ok, result, data: { clients: [{ id, name, cadence_days, days_quiet, last_touch_at }] } }`.
  - It then runs the same flow as before for each one: a drafted update, an N1
    attention item, escalation, and one push.
  - `days_quiet` is the count, and the brain's own `clients` table isn't read.
- **Unwired.** It uses the brain's own table, exactly as before.
- **Wired but failing.** The sweep fails and logs the reason. It doesn't fall
  back to the brain's stale table, because a nudge drafted from an out-of-date
  copy is a wrong nudge.
- **The switchover.** An item already open under the brain's client id is found
  by the client's name, so it escalates instead of doubling.
- **Known gap.** Touch history is still read from the brain's tables, keyed on
  the brain's ids, so drafts on the OS branch say "(no logged touches)" until
  the OS contract carries touch history. The nudge is right about **who** and
  thinner about **what**.
- **Code.** `os.ts osToolData()` returns `{ result, data }`, and `osTool()` is
  unchanged for every existing caller. Proof is `verify/pulse-harness.ts`.

## Rookie parity (4.7)

Every Rookie tool in the OS (`lib/rookie-tools.ts`, 23 tools) already reaches
EVE through the same OS door (`POST /api/eve`). This step found **nothing
missing**, so no subcommand was added.

| Rookie tool | EVE | Tier on EVE |
|---|---|---|
| `get_board` | `os_board` (plus the warm board line in every context pack) | GREEN read |
| `list_clients` | `os_clients` | GREEN read |
| `list_proposals` | `os_command {tool:"list_proposals"}` | GREEN read |
| `list_invoices` | `os_command {tool:"list_invoices"}` | GREEN read |
| `add_client` | `os_command {tool:"add_client"}` | latched write |
| `update_client` | `os_command {tool:"update_client"}` | latched write |
| `add_deal` | `os_command {tool:"add_deal"}` | latched write |
| `update_deal_stage` | `os_command {tool:"update_deal_stage"}` | latched write |
| `add_expense` | `os_command {tool:"add_expense"}` | latched write |
| `add_expenses_bulk` | `os_command {tool:"add_expenses_bulk"}` | latched write |
| `log_friday_five` | `os_command {tool:"log_friday_five"}` | latched write |
| `set_sprint` | `os_command {tool:"set_sprint"}` | latched write |
| `add_goal` | `os_command {tool:"add_goal"}` | latched write |
| `complete_goal` | `os_command {tool:"complete_goal"}` | latched write |
| `set_strategy` | `os_command {tool:"set_strategy"}` | latched write |
| `set_kpi` | `os_command {tool:"set_kpi"}` | latched write |
| `add_work_item` | `os_command {tool:"add_work_item"}` | latched write |
| `add_log` | `os_command {tool:"add_log"}` | latched write |
| `propose_automation` | `os_command {tool:"propose_automation"}` (created disabled) | latched write |
| `create_invoice` | `os_create_invoice` (always a draft) | latched write |
| `draft_proposal` | `os_draft_proposal` (a draft in Proposals) | GREEN draft |
| `draft_client_email` | `os_draft_email` (queued in COMMS) | GREEN draft |
| `send_pending_email` | `os_send_pending_email` | RED: a confirm card; your tap sends |

**One deliberate difference.** `draft_client_email`'s `send_now` flag isn't
exposed on EVE. A draft from her never sends itself. Sending is
`os_send_pending_email`, which is a confirm card.

**EVE has more than Rookie.** She also has the house tools (`os_inbox_summary`,
`os_house_status`, `os_pause_sends`, `os_approve_inbox_item`,
`os_mark_paid_offline`, `os_move_client_stage`) and now `os_events_since`.

**The one thing she can't do from the OS chat tab** is read an attached
receipt. The 📎 still goes to Rookie (Step 4 above).

**The Rookie chat tab can retire once you've used EVE there for a week** and
haven't had to fall back to Rookie for anything but a receipt. Retiring it is
an OS change for a later step, not this one.

## Housekeeping (4.8, 4.10)

- **The SDK pin.** `@anthropic-ai/claude-agent-sdk` is pinned to `0.3.211`, the
  version the lockfile already resolved, so there's no upgrade. The lockfile
  change is that one line. `npm ci --dry-run` is clean.
  - Found in passing: the lockfile still lists the retired `@notionhq/client`,
    `@slack/web-api` and `stripe`, and still treats `tsx` as a dev dependency.
    Any `npm install` prunes those, with or without the pin. That's left for
    its own commit.
- **The unused keys.** `NOTION_TOKEN` and `STRIPE_KEY` are read nowhere in
  `brain/src`, so they're removed from `.env.example`.
  - `scripts/make-railway-env.mjs` has no key list; it copies your `.env`.
    Delete those two lines from your own `.env` and from Railway if you like;
    nothing reads them.
  - `SLACK_USER_TOKEN` is also unread, but it's left in place because this step
    didn't cover it.

## Checked (4c)

- `npx tsc --noEmit` is clean.
- Harnesses:
  - os-ticket 62/62 (new)
  - os-events 37/37 (new)
  - pulse 21/21 (new)
  - authority 119/119 (with E17, which drives `os_events_since`)
  - clock 152/152
  - brief 165/165
  - reader 63/63
  - corpus 75/75
  - dispatch 112/112
  - fleet 14/14
  - honesty 61/61
  - desk 135/135
  - image 137/137
  - intake 78/78
  - audit5 73/73
  - audit6 82/85, with the same three distiller failures (g4.2, g4b.6, g4b.7)
    as before this step
- A local boot with `EVE_BRAIN_TOKEN=test`, no `CHURLISH_OS_TOKEN` and no
  schedulers:
  - Preflight from `https://churlishos.app` got ACAO; from
    `https://evil.example` it got none, plus one `[cors] refused origin` line.
  - A good ticket on `POST /chat` reached the route (400 "message required").
    It also opened `GET /state` (200) and `GET /confirm/:id` (404, no such
    card).
  - Expired and 20-minute tickets got 401.
  - A good ticket on `POST /wardrobe/wear` got 401, while the bearer there got
    400.
  - `/job os_events` answered `not-wired`.
- **Not exercised:** the live OS round trip (`/api/eve/events`,
  `quiet_clients` and the OS's ticket minting are being built on the OS side
  now) and a real push to the phone.
