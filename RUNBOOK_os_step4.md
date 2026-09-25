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
- `connectors.ts`, `authority.ts`: six `os_*` house tools. Reads
  (`os_inbox_summary`, `os_inbox_item`, `os_ledger_today`, `os_needs_you`)
  are GREEN. `os_inbox_approve` and `os_send_email` are RED: one confirm card
  per item, and the OS independently refuses a send that didn't come through
  your approval. No bulk approve exists on either side.
