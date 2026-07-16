# 02 — ARCHITECTURE

## 1. System diagram

```
                       ┌────────────────────────────┐
   Android APK         │        EVE BRAIN            │        ┌─────────────┐
 (Capacitor+React) ───▶│  Node/TS + Claude Agent SDK │◀──────▶│  Supabase    │
   text · voice · UI   │  system layers:             │ memory │  (pg+vector) │
        ▲              │   1. Character Bible v2     │        └─────────────┘
        │ FCM push     │   2. Doctrine digest        │
        │              │   3. Context pack (03 §4)   │──MCP──▶ Gmail · Calendar
   ┌────┴─────┐        │  tools: memory, dispatch,   │         Notion · Slack
   │ Firebase │◀───────│  connectors, higgsfield,    │         Stripe · Higgsfield
   └──────────┘        │  send-with-confirm          │
        ▲              └──────────▲─────────────────┘
        │                         │ POST /job
   ┌────┴─────┐            ┌──────┴──────┐
   │  n8n     │───────────▶│  schedules  │  7:00 brief · 11:45 floor · pulse
   └──────────┘            └─────────────┘  sweep · tripwires · 17:30 close-out

 Voice: phone mic ──▶ Deepgram STT ──▶ brain ──▶ ElevenLabs TTS ──▶ phone audio
 Later: G2 glasses plugin ──▶ same /chat endpoint (clipped register)
```

## 2. The brain service

Node/TypeScript service built on the **Claude Agent SDK** (⚑VERIFY current
package name, loop API, and streaming interface against live docs before
scaffolding — do not code from memory). It owns: the agent loop, tool calls,
MCP connector clients, context assembly, and all message generation.

**System prompt layering (order matters):**
1. `06_EVE_CHARACTER_BIBLE_v2.md` verbatim — who she is.
2. Doctrine digest — a ~1-page distillation of Brandon's operating rules
   (autonomy tiers, sales-floor law, parking ledger, banned words, honesty
   clause). Draft it from the bible's §6/§12 plus `01` §7; Brandon approves it.
3. Context pack — assembled fresh per exchange (`03` §4).

## 3. HTTP interface

| Endpoint | Purpose |
|---|---|
| `POST /chat` | Main conversation. Body: `{surface, messages|message, voice?}`. Response: **SSE stream** of tokens + typed events (`state:thinking`, `token`, `tool`, `confirm_request`, `done`). Glasses-friendly: also accepts `?stream=false` for a single JSON reply. |
| `POST /job` | Scheduled work from n8n: `{job: "morning_brief"|"floor_check"|"pulse_sweep"|"closeout"|"distill"|...}`. Brain generates content, writes attention items, triggers FCM. |
| `POST /dispatch` | Fleet job: `{agent?, task, client?}` → creates `jobs` row, runs as sub-agent, deliverable to storage + approval item. |
| `POST /capture` | Inbound capture (app text/voice-note transcript, email webhook). Parses → task/entry, files it, links source. |
| `GET /health` | Uptime + last-distillation timestamp. |

Auth: single bearer token from env on every route. HTTPS only.

## 4. Hosting

The Agent SDK needs a long-lived Node runtime — use a container host
(Railway / Fly.io / Render) or a small VPS; a Cloudflare Worker is not the
right runtime for this loop (⚑VERIFY current SDK runtime requirements). The
existing `eve-brain.churlishmedia.workers.dev` worker stays untouched as the
legacy glasses proxy until Phase 5, then is pointed at the new brain.

## 5. Existing assets — reuse, don't rewrite

| Asset | Role in this build |
|---|---|
| Supabase project | The memory spine (`03`) |
| Deepgram + ElevenLabs accounts | Voice in/out (Phase 3) |
| n8n instance | Scheduler + email-capture webhook |
| `churlish-outreach-brain` repo | Reference for Brandon's Claude patterns |
| `churlish-copilot` (Even Hub) | Untouched until Phase 5 |
| LibreChat deployment | Legacy; retire once the app covers daily use |
| Higgsfield (MCP) | Wardrobe generation + Soul training |

## 6. Autonomy enforcement — in code

Tools are registered in tiers. GREEN tools execute freely. RED tools
(`send_email`, `send_sms`, `send_slack`, `publish_*`, `create_charge`, any
external side effect) **do not execute**; they emit a `confirm_request` event
carrying the exact payload, the app renders a confirm card, and only an
explicit approve round-trip (with the payload hash) executes the send. Dictated
SMS counts the dictation-then-readback-then-"send it" as the confirmation.
There is no configuration flag that disables this.

## 7. Security

- Single-user bearer token; rotate quarterly; store phone-side in Capacitor
  secure storage (⚑VERIFY plugin).
- All keys server-side in env; the APK ships only the brain URL, its token,
  and Firebase client config.
- Supabase accessed only from the brain (service key), never from the app.
- `.gitignore` covers `.env*`, keystores, `google-services.json` as needed.
- Personal-data note (Brandon has accepted this): SMS/notification content
  processed in Phase 4 transits his own brain server and the Anthropic API.
  Keep raw SMS bodies out of long-term memory unless distillation deems them
  durable facts.

## 8. Observability

Log every `/job` run and tool call (name, tier, duration, outcome) to a
`runs` table. `/health` exposes the last successful distillation and last
brief sent — WATCHTOWER-style checks can sit on this later.
