# G — Connector Reality: Social Stats & Meta Ads

Source read: `C:\dev\eve\brain\src\{connectors,google,notion,slack,stripe,state,health}.ts`, `.env.example` (names only). Read-only pass, nothing under `C:\dev` modified.

## 1. Every connector wired today

**Live tool surface** (registered in `connectorToolNames` / `buildConnectorServer`, and shown on the status tiles via `getConnectorStatus()` in `connectors.ts`):

| Connector | File | Reads | Writes | Tier |
|---|---|---|---|---|
| Gmail | `google.ts` | unread, search | create draft (free); **send** | GREEN read/draft, **RED send** → queued confirm card |
| Google Calendar | `google.ts` | list events | create event on his own calendar; event **with attendees** | GREEN own-calendar, **RED** if attendees (invites email out) |
| Churlish OS | `os.ts` (not in this file list, referenced by `connectors.ts`) | board snapshot, client roster, proposals/invoices list | deals, clients, expenses, Friday Five, sprint, goals, KPIs, work items, logs, propose_automation, draft proposal/email/invoice | GREEN (all lands as drafts/internal writes); **RED** only on `os_send_pending_email` |
| Notebook (Discord `#eve-notes`) | `notes.ts` | — (write-only channel) | posts a note, mirrored into memory | GREEN — his own private channel |
| Deepgram | env-flag only | — | — (voice-in STT) | key-presence check only |
| ElevenLabs | env-flag only | — | — (voice-out TTS) | key-presence check only |
| Fleet roster / dispatch | `fleet.ts`, `dispatch.ts` | live roster from the OS | launches background workers (research / justice-league / jsa / suicide-squad / eve) that write documents into approvals | GREEN — documents only, nothing external |
| Texts / notifications | `senses.ts` | transient, app-forwarded, 24h window | — | GREEN read-only |
| SMS | app-native | — | queues a send; his **phone** transmits on approve, not the brain | RED, confirm card |
| Sales floor / check-ins / habits | `floor.ts`, `vitals.ts`, `ops.ts` | — | conversation log, energy/sleep/note, habit ticks | GREEN |

**"Live" depends on his real `.env`, which I did not read** (only `.env.example`, names only, per instruction). Every one of the above degrades honestly to "not connected" if its keys are absent — that pattern is consistent across `google.ts`, `notion.ts`, `slack.ts`, `stripe.ts` (each has its own `ready()` / `statusDetail()` / `explainError()`). I can confirm the *code path* exists; I cannot confirm which keys are actually populated on Railway from what I read here.

**Retired and NOT wired — dead code on disk:**

`notion.ts`, `slack.ts`, `stripe.ts` all exist, compile, and have working read functions (Notion page search, Slack channel read, Stripe revenue/MRR snapshot). But `connectors.ts` explicitly retired all three on 2026-07-17 ("the OS is the single spine now... a separate Stripe read or Slack/Notion tool is redundant surface"). Confirmed by grep: nothing outside those three files ever imports them. They are:
- **Not** in `connectorToolNames`
- **Not** in `buildConnectorServer`'s tool list
- **Not** even listed in `getConnectorStatus()` — meaning the status screen doesn't show a "Stripe: not connected" tile at all; it shows nothing, as if the connector never existed.

Practically: there is no live Stripe, Slack, or Notion read anywhere in the brain today, and none of the three would appear on a connector status pane even if you looked.

## 2. Social stats & Meta/Facebook Ads reporting — what exists today

**Nothing.** I grepped the entire `brain/src` tree for `youtube`, `instagram`, `tiktok`, `facebook`, `meta`, `social` (case-insensitive) — zero real hits. The handful of "meta" matches were all `import.meta.url` and "metadata"/"metaphors," unrelated. `.env.example` has no credential slots for any of these platforms. There is no module, no tool, no cron, no cached-stats table referenced anywhere for social platforms or ad reporting.

**What each would need, credential-wise (types, not values — none currently exist to expose):**

- **YouTube** — a Google OAuth client with the `youtube.readonly` scope (or an API key for public-only data), channel ID. Could potentially extend the *existing* Google OAuth client used for Gmail/Calendar if Brandon re-consents with the added scope, rather than standing up a second provider from scratch.
- **Instagram** — must be an Instagram **Business or Creator** account linked to a Facebook Page (a real prerequisite, not just a key) → Meta Graph API app, long-lived Page access token, `instagram_manage_insights` permission, Instagram Business Account ID.
- **Facebook (Page stats)** — same Meta Graph API app, Page access token, `pages_read_engagement` / `read_insights` permission, Page ID.
- **TikTok** — a TikTok for Developers app under Login Kit or the Business API (tier depends on whether he has a TikTok Business account), app review/approval, short-lived access tokens with rotating refresh — the most operationally fragile of the four.
- **Meta/Facebook Ads reporting** — Meta Marketing API, a **System User** on the Business Manager (not a personal user token — those expire and orphan when a person's password/2FA changes) with `ads_read`, the ad account ID(s), `ads_read`/Standard Access app review for anything beyond your own account.

**The integration work is not just "get a key."** Following the existing pattern (`google.ts` is the template), each platform needs: a connector module with honest `ready()`/`statusDetail()`/`explainError()`; new read-only tool definitions registered in `connectors.ts` and added to `connectorToolNames`; and — critically, not optional — a **scheduled fetch job** (like the existing crons in `schedule.ts`) that polls on an interval and writes last-known values + a fetched-at timestamp into the spine (Supabase), because none of these platforms tolerate being hit live on every chat turn (Meta and TikTok both rate-limit hard; YouTube runs on a daily quota-unit budget). The chat-facing tool then serves the **cached** row with its timestamp, never a live call in the hot path.

**The MCP-vs-brain distinction, stated plainly:** this Claude Code session currently has *tool schemas available* that look like a Meta Marketing API toolkit and a YouTube/Instagram/TikTok analytics toolkit (via what appears to be a vidIQ-style connector) — visible in my deferred-tools list for this chat. **That is a connector authorized to this Claude Code / claude.ai account on this machine — it has nothing to do with EVE's brain.** EVE's brain is a separate Node/Express process on Railway with its own env vars; it cannot see, call, or benefit from a connector that lives in a chat client's MCP config. Seeing Meta Ads tools available in a Claude Code session is not evidence that Brandon can ask EVE "what's my ad spend today" and get a real number — those are two unrelated wiring jobs, on two different hosts, authorized through two different consent flows. I did not invoke any of those tools for this report; flagging their existence only because it's exactly the confusion the honesty law is meant to prevent.

## 3. The honesty constraint — what a stats pane must do before showing one figure

Given "no fake data — offline says so," a social/ads stats pane must, per number:

1. **Trace to a real successful API response** — a specific platform call that returned 200, not a placeholder, not last quarter's screenshot value typed in as a starting point.
2. **Show connector state explicitly** when not connected — reuse the exact pattern already in `google.ts`/`notion.ts`/`slack.ts`/`stripe.ts`: a `NotConnectedError`-shaped message the UI renders as "not connected," never a blank chart or a "0" that could be misread as a real zero.
3. **Carry a fetched-at timestamp on every figure**, and show it. A number with no visible "as of" time is a number presented as live even when it isn't.
4. **Distinguish stale from fresh** — if the scheduled fetch job's last run failed or is older than that platform's own refresh cadence, show the last-known number *with a visible stale/failed badge*, the same way `state.ts` refuses to render a confident "online: true" snapshot when Supabase errors (`three.error || attention.error || clients.error` gates the whole response to `online: false` rather than half-rendering).
5. **Never interpolate or estimate** to fill a gap when a call errors — literal returned figure or an explicit "couldn't fetch," nothing in between.
6. **Label the source account/page/channel** on every figure — Brandon may run more than one Page/channel; an unlabeled number risks being read as authoritative for the wrong one.

## 4. Effort-to-value ranking, with a first step each

1. **YouTube — lowest effort, high value.** Well-documented API, stable quota model, and it can likely ride on the Google OAuth client that already exists for Gmail/Calendar rather than standing up a new provider. *First step:* decide whether the target channel is tied to Brandon's existing Google account — if so, re-run the one-time OAuth consent (`scripts/google-auth.mjs`) with `youtube.readonly` added to the scope list.
2. **Meta/Facebook Ads reporting — moderate-high effort, highest value.** Directly serves the ad-spend-accountability need and is closest to "money," which is the thing he's already built a spine (Churlish OS) to track honestly. *First step:* in Meta Business Settings, create a **System User** (not a personal token) scoped to the ad account(s) with `ads_read`, and generate its long-lived token — this sidesteps the personal-token-expiry trap before any code gets written.
3. **Facebook Page stats (organic) — moderate effort, moderate value, but cheap once Ads is wired.** Same Meta App/Business Manager as Ads, so the marginal setup cost is small if #2 is already done. *First step:* add `pages_read_engagement`/`read_insights` to the same Meta App used for Ads reporting rather than creating a second app.
4. **Instagram — moderate-high effort, high value, gated by a prerequisite outside any codebase.** IG must already be a Business/Creator account linked to a Facebook Page before any API key is worth requesting. *First step:* Brandon confirms in Meta Business Suite that the Instagram account is Page-linked and Business/Creator type — that link-up (his action, in Meta's UI, not code) is the actual first milestone.
5. **TikTok — highest effort, least predictable value-per-effort.** Developer app approval timelines are the least predictable of the four, tokens are short-lived and need active rotation, and the officially exposed analytics are narrower unless he qualifies for the Business API tier. *First step:* apply for the TikTok for Developers app under the tier that matches whether he has a TikTok Business account — and treat "which tier gets approved" as the real milestone, since it's not worth writing connector code before knowing that.

## 5. Credentials flagged

- **The retired Notion/Slack/Stripe modules still read their env vars** (`NOTION_TOKEN`/`NOTION_API_KEY`, `SLACK_USER_TOKEN`/`SLACK_TOKEN`, `STRIPE_KEY`/`STRIPE_API_KEY`), and those var names are still listed in `.env.example`. If any of the three is still actually populated in the real `.env` on Railway — I cannot check this, I only read `.env.example` — that is a live credential with **read access to Slack channels/DMs, Notion pages, or Stripe account data that no code path in the brain calls anymore.** A key with no caller is pure exposure for zero product benefit; it should be revoked/rotated at the provider and removed from the real `.env`, not just left unused on disk.
- **`.env.example` ships `EVE_BRAIN_TOKEN=change-me` as its literal placeholder.** Not a leaked credential by itself, but worth an explicit check that Railway's actual value isn't still the literal string "change-me" — a common real-world deploy miss.
- **Unverified by this report, flagged for a dedicated check:** the binding law states the desktop shell holds exactly one secret (its bearer token) and all provider keys live brain-side only. I was scoped to brain-side files only for this task and did not read `C:\dev\eve\desktop`, so I have not personally confirmed the desktop honors that boundary — that needs its own pass against the desktop source before the hub design assumes it's already true.
- **The Meta Ads-shaped and YouTube/Instagram/TikTok analytics tool schemas visible to this Claude Code session** imply a live OAuth grant already sitting at the Claude Code/claude.ai connector layer on this machine or account — authorized separately from anything in `eve/brain`. Not inherently a problem, but it's a credential surface EVE's brain doesn't know exists and can't reach; worth an explicit inventory so nobody assumes "we're already connected" when, brain-side, nothing is.
