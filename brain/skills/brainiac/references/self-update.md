# SELF-UPDATE PROTOCOL — Bottling An Unknown World

**Trigger: any model string not profiled in `model-profiles.md`, any new Claude launch, or any profile whose "last verified" date predates a known docs change. NEVER prompt an unprofiled model on tier-guess alone — a wrong-tier prompt costs twice.**

Model-agnostic principles (the FOUNDATION block) survive generations. Per-model quirks do not. This protocol rebuilds the overlay.

## The 8 canonical sources (fetch in this order)

All on docs.claude.com / platform.claude.com — check both mirrors if one 404s:

1. **Prompting best practices** — `/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices` — lists all current models and links each dedicated per-model page. THE registry map.
2. **The per-model page** — `/docs/en/build-with-claude/prompt-engineering/prompting-claude-<model>` — behavioral deltas. **If this page exists, its guidance overrides tier defaults. Its existence is itself the signal** (Anthropic ships dedicated pages for frontier/large/mid models, not small ones).
3. **Models overview** — `/docs/en/about-claude/models/overview` — tier, pricing, context window, output limits, model strings.
4. **Effort** — `/docs/en/build-with-claude/effort` — whether the model supports `effort` and the recommended levels. **The single most important field.**
5. **Migration guide** — `/docs/en/about-claude/models/migration-guide` — breaking changes (prefill removals, deprecated params, tokenizer shifts).
6. **Prompt caching** — `/docs/en/build-with-claude/prompt-caching` — the model's minimum cacheable prefix.
7. **Release notes** — `/docs/en/release-notes/overview` (and the "Introducing Claude X" page) — launch-day facts and quirks.
8. **Model IDs and versioning** — dated IDs are fixed snapshots; aliases move. Pin snapshots for anything scheduled.

## The profile schema (what gets bottled)

Every new overlay in `model-profiles.md` fills ALL of these — an empty field means the research isn't done:

```
Model string + snapshot ID · Tier · Price in/out · Context · Max output
Effort: supported? default? recommended levels?
Thinking: adaptive / manual budget_tokens / always-on?
Prefill: supported or 400?
Cache minimum · Sampling params accepted?
Tokenizer generation (re-baseline needed?)
Verbosity default · Instruction-literalness · Proactivity
Refusal categories / classifier traps
Prompt style verdict: subtractive ←→ scaffolded (place it on the line)
Last verified: DATE
```

## Threshold triggers (facts that change the whole plan)

- **Dedicated prompting page exists** → build a full behavioral overlay; treat the page as law.
- **No `effort` support** → treat as Haiku-class: manual thinking, heavier scaffolding, spend controlled via `budget_tokens`/`max_tokens`/in-prompt targets.
- **Prefill returns 400** → strip every prefill pattern; Structured Outputs everywhere.
- **New tokenizer** → re-baseline every `max_tokens` value and cost estimate in the fleet (~30% swings are real).
- **New refusal/classifier categories** → add to the traps list; configure a fallback seat.
- **A model Barda routes to gets deprecated** → flag to Barda AND update her seat table; the two skills stay in lockstep.

## After bottling

1. Write the overlay into `model-profiles.md` with today's date.
2. Update the Quick Tier Card in SKILL.md if the fleet's seat lineup changed.
3. Repackage the .skill and hand Brandon the file to re-save — the installed copy is the only one that persists.
4. If seat economics changed (new price points), ping the big-barda routing table too.

## Standing verification cadence

Any Churlish session that touches model choice + a profile older than 60 days → spot-check source #3 (models overview) and #4 (effort). Two fetches, thirty seconds, prevents a stale bottle from mispricing a build day.
