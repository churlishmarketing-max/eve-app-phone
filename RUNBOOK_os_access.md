# RUNBOOK — Give EVE the OS + fix cloud voice (two pastes, ~4 minutes)

Everything is built, tested locally, and pushed. Both deploys are automatic.
What's left needs your logins — these two pastes turn it all on.

## 1. Vercel — let EVE through the OS's door

The OS now has an endpoint just for her (`/api/eve`). It answers to a token,
and only you can set it.

1. Open **vercel.com → churlish-os project → Settings → Environment Variables**
2. Add ONE variable:
   - Name: `EVE_OS_TOKEN`
   - Value: open `C:\dev\eve\brain\.env`, copy the value of `CHURLISH_OS_TOKEN`
     (the line near the bottom). Same value on both sides — that's the handshake.
   - Environment: Production ✓
3. **Deployments tab → ⋯ on the latest deployment → Redeploy** (env changes
   need a redeploy to take).

## 2. Railway — her brain's new keys (this ALSO fixes voice)

The paste file needs regenerating because two new variables were added
(`CHURLISH_OS_URL`, `CHURLISH_OS_TOKEN`) — and the paste still carries the
repaired Deepgram key, which is why voice is broken in the cloud until you
do this.

1. In a terminal:
   ```
   cd C:\dev\eve\brain
   node scripts\make-railway-env.mjs
   ```
   → `RAILWAY-ENV-PASTE-THIS.txt` lands on your Desktop.
2. **railway.app → eve-app-phone → Variables → Raw Editor** → select-all,
   delete, paste the file's contents → **Save/Deploy**.
3. **Delete the txt file from your Desktop.**

## 3. Prove it (1 minute, from your phone)

Open EVE and ask her, in any words:
- **"What's on the OS board?"** → she should answer with the real war-board
  numbers (goal $150K, your 3 clients).
- **"Have Pennyworth draft an invoice for Box Store — one line, test setup,
  $100."** → a draft INV-#### should appear in the cockpit's Invoices panel.
  (Delete it after — it's a draft; nothing sends.)
- Tap the mic → talk → your words should appear and she should answer.
  That's the Deepgram fix landing.

## What she can do once this is live

- **Read + run the OS**: war board, roster, deals, expenses, goals, KPIs,
  Friday Five — same tool surface Rookie uses in the cockpit.
- **Pennyworth on her order**: proposals from your notes (the pricing law
  stays in the OS), client emails, invoices — ALL land as drafts you approve
  inside the OS. The single "send a pending draft" path throws a RED confirm
  card in her app first, and the OS independently refuses sends that didn't
  come through your approval. Two locks, both yours.
- **Live internet in conversation** — she searches and reads sources, with
  dates.
- **The fleet**: say "put the JSA on it" / "deep research this" /
  "justice-league this" / "suicide-squad my offer page" — a worker runs in
  the background and the deliverable lands in her approvals with a ping.
  Deep research needs NO extra key — her existing Anthropic key covers it.

## Model economy note

Fable 5 built this session's judgment work. Day-to-day EVE runs Sonnet 5 —
no change, no extra spend. Fleet workers also run Sonnet 5 with hard budget
caps ($1.50/job, $3 for deep research).
