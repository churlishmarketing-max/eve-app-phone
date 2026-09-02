# TOKEN CONSERVATION — Ranked Tactics With The Math

**Verified against Anthropic pricing/docs July 2026.** These stack multiplicatively: a cached + batched + Haiku-routed request runs at roughly 5% of a naive Opus call. Numbers over adjectives — here are the numbers.

## Current price sheet (per MTok, in/out)

| Seat | Input | Output |
|---|---|---|
| Fable 5 | $10 | $50 |
| Opus 4.8 | $5 | $25 |
| Sonnet 4.6 | $3 | $15 |
| Haiku 4.5 | $1 | $5 |

Fable output is **10× Haiku input's entire job.** That ratio is why Barda's law exists and why Brainiac enforces it at the prompt level.

## 1 · Prompt caching (the dominant lever)

- Cache READ: **0.1× base input.** Write: 1.25× (5-min TTL) or 2× (1-hr TTL).
- **Break-even: exactly 2 reads** on the 5-min TTL. 2 hits ≈ 0.675× average cost · 3 ≈ 0.48× · 5 ≈ 0.33× · steady state → 0.10×.
- Structuring law: stable content FIRST, in order **tools → system → context/examples**, volatile content last. `cache_control` breakpoint on the **last block identical across requests.** Never a timestamp, request ID, or per-job variable inside the cacheable region — one volatile token kills the whole prefix.
- ≤4 breakpoints; 20-block lookback; **changing `effort` or thinking config invalidates the cache** — hold them constant across a run.
- Minimums: Fable 5 / Opus 5 = 512 tokens · Opus 4.8 / Sonnet = 1,024 · **Haiku = 4,096** (short Haiku prompts can't cache).
- Pre-warm a big shared prefix with a `max_tokens: 0` call before a parallel worker launch.
- Fable 5 / Opus 4.8 / Opus 5 support mid-conversation system messages — append instructions WITHOUT invalidating the cached prefix.

**Brainiac's move:** any prompt that runs ≥3 times gets restructured cache-first before anything else. That alone outweighs every wording trick below.

## 2 · Right seat (Barda's law, enforced in the prompt)

Brainiac never gold-plates: a tagging job gets a Haiku-shaped prompt, not an Opus essay. If the prompt he's writing needs frontier judgment to even phrase, the seat is wrong — flag to Barda.

## 3 · Effort dial (Fable / Opus / Sonnet — NOT Haiku)

Lower effort cuts tokens across text, tool calls, AND thinking. Fable at medium often beats prior-gen xhigh — **step the dial down before stepping the model down.** Sonnet fleet default: `medium` (Anthropic's own recommendation for most work). Haiku: no dial — use `budget_tokens` + `max_tokens` + in-prompt targets.

## 4 · Batch API (flat 50%)

50% off input AND output, up to 100K requests/batch, results within 24h. Stacks with caching. Brainiac flags any job as batchable when: volume ≥ ~20 similar calls AND nobody's waiting on it today. Fleet candidates: bulk tagging, transcript sweeps, roster-wide content resizes, Apollo list enrichment passes.

## 5 · Output control

- `max_tokens` as a hard cap on every defined job.
- Positive concision instruction + one concise example (beats "don't be verbose").
- Structured Outputs to make rambling structurally impossible.
- Thinking tokens bill as OUTPUT — adaptive thinking spends only when needed; on manual (Haiku), budget it or turn it off.

## 6 · Context hygiene (browser + Code both)

- Front-load files and constraints once; drip-fed context is re-paid every turn.
- Edit artifacts, never regenerate ("rewrite the whole thing with one line changed" is the most expensive sentence in the app — Barda's line, Brainiac's enforcement).
- Long chats: close with a handoff brief, open fresh. A 40-turn chat re-reads 40 turns per message.
- The ~30% tokenizer inflation on Fable 5 / Opus 4.7+ means old `max_tokens` values and cost estimates are wrong by a third — re-baseline.

## The real leak (same as Barda's)

Rework. A mistuned prompt that produces a wrong draft costs double; shipped unverified, triple. Tier-tuned prompts are conservation tools first and quality tools second — one clean pass beats two cheap ones.
