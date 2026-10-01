# RUNBOOK — which model EVE runs (brain/src/models.ts)

Sonnet 5.5 everywhere by default, Opus 5.5 when a turn really needs it, and a
daily watch that moves her to a newer Sonnet only after it passes a test.

## The env vars (Railway → eve brain → Variables)
| Var | Unset / `latest-sonnet` | Set to an id |
|---|---|---|
| `EVE_MODEL` | chat, brief, capture, distill, proactive, pulse follow the adopted Sonnet | pinned to that id; never auto-updates |
| `EVE_FLEET_MODEL` | fleet workers follow the adopted Sonnet | pinned to that id |
| `EVE_HEAVY_MODEL` | `claude-opus-5-5` | the Opus seat for escalated turns + heavy units |

**Do this once:** DELETE `EVE_MODEL` and `EVE_FLEET_MODEL` in Railway (or set
both to `latest-sonnet`). While they say `claude-sonnet-5` she stays pinned
there and the auto-update can't move her. `EVE_HEAVY_MODEL` is optional.
`ANTHROPIC_API_KEY` must be set — the watch lists models with it.
If you set `DISCORD_ALERT_KINDS` by hand, add `model` so the notes reach #eve-alerts.

## The Sonnet watch (Railway only, same gate as the crons)
At boot and 09:47 Central daily: list models, take the `claude-sonnet-*` with
the newest `created_at`, smoke-test it through the same Agent SDK path chat
uses, adopt it only on a pass (saved in Supabase `app_state`, key `eve.models`,
so a restart keeps it). Never moves to an older model. You get one push + Discord
note per move, and one per model that fails its test. If Sonnet 5.5 fails its
boot test she runs on `claude-sonnet-5`; if Opus fails, heavy turns run on Sonnet.

## When she uses Opus (chat, per turn)
- You ask: "use opus", "think hard", "go deep", "deep dive", "take your time".
- The message is over 1,500 characters.
- A strategy / pricing / proposal / contract / negotiation / master-plan request
  (the word plus an ask like draft, review, help me, what should).
- Follow-ups: up to 3 turns after an Opus turn stay on Opus. "use sonnet" drops it.
Fleet units on Opus: justice-league, jsa, master-plan-formula, strategy-doc-builder,
proposal-generator, ad-diagnostic-engine, doctor-mid-nite.

## Which model ran
- Now: `GET /state` → `models: { everyday, fleet, heavy, adoptedAt }`.
- Per turn: Railway logs, `[turn] <conversation> … model=opus reason=asked id=claude-opus-5-5`.
- Moves: logs lines starting `[models]`.
