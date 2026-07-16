# EVE Phase 3 — Key Runbook (Brandon's clicks, ~30 min total)

Every connector degrades gracefully — do these in ANY order, whenever.
After each one: save `brain/.env`, restart the brain, and the Wire tile flips to LIVE.
**Never paste any of these keys into chat.** They go straight into `C:\dev\eve\brain\.env`.

---

## 1. Google — Gmail + Calendar (~15 min, the big one)

1. [console.cloud.google.com](https://console.cloud.google.com) → create project (name: `eve-hands`) — any Google account, but consent must be granted BY the account whose mail she reads (churlishmarketing@gmail.com).
2. **APIs & Services → Library** → enable **Gmail API** and **Google Calendar API**.
3. **OAuth consent screen** → External → app name `EVE`, your support email → save through the steps (no scopes needed here).
4. ⚠ **CRITICAL: set Publishing status to "In production"** (button on the consent screen page). Leave it in "Testing" and the token dies every 7 days. The "unverified app" warning during consent is expected — it's your own app; click Advanced → continue.
5. **Credentials → Create credentials → OAuth client ID** → type **Desktop app** → note the Client ID + Client secret.
6. On this PC: `node C:\dev\eve\scripts\google-auth.mjs <CLIENT_ID> <CLIENT_SECRET>` → browser opens → sign in as churlishmarketing@gmail.com → **tick ALL the scope checkboxes** → it prints 3 lines → paste them into `brain/.env`.
7. Gotcha for later: the refresh token dies if you **change your Google password** — re-run step 6 if Gmail ever goes dead.

## 2. Deepgram — her ears (~3 min)

1. [console.deepgram.com](https://console.deepgram.com) → sign in (new accounts get free credits).
2. Create API key → `.env`: `DEEPGRAM_API_KEY=…`

## 3. ElevenLabs — her voice (~5 min)

1. [elevenlabs.io](https://elevenlabs.io) → Settings → API Keys → create key with **Text-to-Speech + Voices** permissions.
2. `.env`: `ELEVENLABS_API_KEY=…`
3. Voice choice (her imprint — Character Bible §9):
   - Default is "Rachel" (premade) until you pick.
   - Browse options: `GET /voice/voices` on the brain lists every voice + id → `.env`: `ELEVENLABS_VOICE_ID=…`
   - **Her own voice**: needs Starter plan ($6/mo)+. Record 1–3 min of clean solo speech of the voice you want and I'll clone it via API — this is part of the wardrobe/identity conversation.

## 4. Slack — read what you see (~5 min)

1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch → name `EVE` → your workspace.
2. **OAuth & Permissions** → under **User Token Scopes** (NOT Bot):
   `channels:read, channels:history, groups:read, groups:history, im:read, im:history, mpim:read, mpim:history, search:read, users:read`
3. **Install to Workspace** → Allow → copy the **User OAuth Token** (`xoxp-…`) → `.env`: `SLACK_USER_TOKEN=…`
4. Do NOT enable public distribution (keeps you exempt from the 2025 rate-limit crackdown).

## 5. Notion (~3 min)

1. [notion.so/my-integrations](https://notion.so/my-integrations) → New integration (Internal) → workspace → name `EVE` → copy the `ntn_…` token → `.env`: `NOTION_TOKEN=…`
2. **She sees NOTHING until you share pages:** on each top-level page/database EVE should read → `•••` → Connections → add `EVE`. Children inherit.

## 6. Stripe (~5 min)

1. [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) → **Create restricted key** ("Building your own integration").
2. Name `EVE read-only` → set **Read** on: Charges, Customers, Subscriptions, Invoices, Balance transactions → everything else None.
3. Copy the `rk_live_…` → `.env`: `STRIPE_KEY=…`

---

## After any key lands

```
# restart the brain, then:
curl -H "Authorization: Bearer <EVE_BRAIN_TOKEN>" http://localhost:8787/health
```
The connector's entry flips `"connected": true`, and the app's Wire tile reads LIVE on its next refresh.

## Phase 3 DoD tests that unlock per key

| Key | Test |
|---|---|
| Google | "Put X on my calendar Thursday at 2" → real event; "Summarize my unread email" |
| Deepgram + ElevenLabs | Full voice loop: speak → transcript → reply audio in her voice |
| (none needed) | Dispatch ✅ already proven · RED confirm ✅ already proven |
