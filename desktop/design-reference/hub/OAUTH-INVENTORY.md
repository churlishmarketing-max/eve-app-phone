# P0.7 — What is authorized to WHOM (2026-09-01)

The roadmap's P0.7: "inventory what your Claude Code account has OAuth'd, so nobody
later assumes EVE has that reach." Written from what is actually connected to the
Claude Code session on this machine today. Names and scopes only — no tokens here.

## The distinction that matters

Two different principals hold grants:

| Principal | Where the grant lives | Who can use it |
|---|---|---|
| **Claude Code / claude.ai (Brandon's account)** | claude.ai connector settings + local MCP config on this PC | Claude in a chat or a Claude Code session, when Brandon is present |
| **EVE's brain (Railway)** | Railway env vars, brain-side only | EVE, on a schedule, unattended |

A connector authorized to the first principal is **not** reachable by EVE. Her brain
can only use what is wired in `brain/src/connectors.ts` with keys in Railway env.

## Connected to Claude Code / claude.ai on this machine (NOT EVE)

Observed as live tool servers in this session:

- **Meta / Facebook Ads** (`ads_*` tools) — campaigns, ad sets, insights, catalogs, pixels, audiences. Read *and* write capable.
- **vidIQ** (`vidiq_*`) — YouTube channel/video analytics, keyword research, Instagram/TikTok outlier search, thumbnail/title scoring, generation tools.
- **Gmail** (`get_thread`, `search_threads`, `create_draft`, `send_message`, …)
- **Google Calendar** (`list_events`, `create_event`, …)
- **Google Drive** (`search_files`, `read_file_content`, …)
- **Slack** (`slack_send_message`, `slack_read_channel`, …)
- **Bitly** (`bitly_*`)
- **Figma** (`get_design_context`, `use_figma`, …)
- **HoneyBook** (`take_action`, …)
- **Lovable** (`create_project`, …)
- **Adobe** (auth required — not live), **Canva** (auth required — not live)
- A media-generation MCP (`generate_image/video/audio`, `list_voices` — this is NOT her ElevenLabs account; its voice list is a different provider)

## Wired into EVE's brain (Railway), per `/health.connectors` on 2026-09-01

`gmail`, `gcal`, `churlish_os`, `notebook`, `deepgram`, `elevenlabs` — all connected.

## The gaps this makes explicit

- **Meta Ads and YouTube/IG/TikTok stats exist in Claude Code, not in EVE.** P2 of the
  roadmap is the brain-side integration (System User token for Meta; YouTube read scope
  on the existing Google OAuth client). Until then, a stats pane in the hub would have
  no honest source and must render as absent.
- **Slack, Drive, Bitly, Figma, HoneyBook, Lovable** are Claude-Code-only. EVE has no path
  to any of them. Do not design hub panels that assume she does.
- **Notion / Slack / Stripe brain modules** were retired 2026-07-17. `brain/.env` on this
  machine carries **no** slots for them (checked 2026-09-01). Revoking any lingering keys
  at each provider is a Brandon action; nothing local remains to remove.

## Rule going forward

Before any hub surface shows a number from a third-party service, the source must be
a brain connector reachable on Railway. "It works in Claude Code" is not a source.
