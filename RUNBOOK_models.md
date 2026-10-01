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

## When she uses Opus (chat, per turn) — the router decides
Before each chat turn a small Haiku call (`claude-haiku-4-5`) reads your new
message plus the line before it and her last reply, and answers light or heavy:
- heavy: deep multi-step reasoning, judgment with money / clients / strategy at
  stake, long-form drafting (proposal, plan, contract, strategy doc), a long or
  messy paste to analyse, or a plan that uses several tools → Opus.
- light: lookups, status, chit-chat, simple edits, scheduling, one action → Sonnet.
Order: (1) you ask — "use opus", "think hard", "go deep", "deep dive", "take
your time"; "use sonnet" / "back to sonnet" drops it — always wins; (2) short
confirmations ("ok", "thanks", "yes do it", under 40 chars, no question) skip
the call: Sonnet, unless the last turn was Opus, then that reply stays on Opus;
(3) the router's answer; (4) if it times out (2.5 s), errors or answers badly,
the old fixed rules decide (over 1,500 chars, a strategy / pricing / proposal /
contract / negotiation / master-plan request, up to 3 follow-ups after Opus).
The router sees the previous turn's tier and decides whether to stay heavy.
Nothing it reads is logged; only its ≤12-word reason.

**The switch:** `EVE_ROUTER` = `auto` (default) | `rules` (fixed rules only, no
Haiku call) | `off` (always the everyday Sonnet, even if you say "use opus").
`EVE_ROUTER_MODEL` overrides the router id (default `claude-haiku-4-5`).
**Cost:** one Haiku call per substantive message (~1–2k tokens in, ≤200 out —
a fraction of a cent), none for asks, short confirmations, `rules` or `off`.
It runs while her store reads run, so it adds little or no wait.

Fleet units on Opus: justice-league, jsa, master-plan-formula, strategy-doc-builder,
proposal-generator, ad-diagnostic-engine, doctor-mid-nite.

## Which model ran
- Now: `GET /state` → `models: { everyday, fleet, heavy, adoptedAt }`.
- Last routing call: `GET /state` → `models.router: { mode, model, last: { tier, reason, at } }`.
- Per turn: Railway logs, `[turn] <conversation> … model=opus reason=<why> id=claude-opus-5-5`,
  where reason is `router:"<why>"`, `asked`, `short` / `short:kept-heavy`, `rules:<rule>`,
  `off`, or `router-failed cause=<timeout|http-NNN|invalid-json|error|no-key> fallback=rules:<rule>`.
- Moves: logs lines starting `[models]`.
