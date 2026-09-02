# THE BOTTLED WORLDS — Per-Model Profiles

**Profiled July 2026 against Anthropic's docs. Every profile carries a "last verified" date. A profile older than the model's latest docs update is stale — run self-update.md before trusting it.**

Shared foundation first, then the four overlays. The overlay always wins where it conflicts with the foundation.

---

## FOUNDATION — true on every current Claude model

- **Clear and direct.** Golden rule: if a colleague with minimal context would be confused by the prompt, so will the model. Want above-and-beyond? Ask for it explicitly.
- **Context + motivation.** Give the *why* ("this will be read aloud by TTS, so no ellipses") — models generalize from reasons better than from bare rules.
- **Examples:** 3–5 max, wrapped in `<example>`/`<examples>` tags, diverse enough that the model doesn't latch onto an accidental pattern. (Haiku overlay cuts this to 1–2.)
- **XML tags** (`<instructions>`, `<context>`, `<input>`) whenever a prompt mixes instructions, context, examples, and variable data.
- **Role via system prompt** to set tone and posture.
- **Long documents at the TOP, query at the END** — up to ~30% quality gain on multi-document inputs. Wrap docs in `<document>`/`<document_content>`/`<source>` tags; ask for relevant quotes first on extraction-heavy jobs.
- **Tell it what TO do, not what not to do.** Prompt style leaks into output style — a markdown-free prompt yields markdown-lighter output.
- **Prefill is DEAD on 4.6+/5-generation models** (returns a 400). Format control = Structured Outputs (`output_config.format`) or strict tool use.
- **Newer generations follow instructions more literally** than 3.x-era models. Precision in, precision out; vagueness in, literal vagueness out.

---

## FABLE 5 — the frontier seat (planner · spec-writer · judge)

`claude-fable-5` · $10 in / $50 out per MTok · 1M context · 128K max output · thinking always on (adaptive only) · Last verified: July 2026

**Prompt style — SUBTRACTIVE:**
- One short steering principle beats an enumerated checklist. Anthropic's own example: "Lead with the outcome" outperforms a full list of banned verbose patterns.
- Shape: **goal + reason + boundaries + a way to self-verify.** State the outcome and success criteria, give room to plan, hand it verification tools (tests, file reads, search) — its reliability comes from self-checking, not from your step list.
- Skills/prompts written for prior models are usually TOO PRESCRIPTIVE for Fable 5 and degrade output. When porting up: strip.
- The main *additions* worth making: an anti-overplanning line ("do the simplest thing that works well; don't survey options you won't pursue") and a grounding line ("audit each progress claim against a tool result from this session" — near-eliminates fabricated status reports).

**Dials:**
- `effort`: high default · xhigh for capability-sensitive work · medium/low for routine. Lower effort on Fable 5 often still beats xhigh on prior models — **step effort DOWN before switching models.**
- Tokenizer (shared with Opus 4.7+) runs ~30% more tokens for the same text vs pre-4.7 — re-baseline `max_tokens` and any cost math.
- Longer turns by default (minutes to hours on agentic work) — widen timeouts, prefer async check-ins.

**Traps:**
- **NEVER instruct it to "show / echo / explain your reasoning"** — can trip the `reasoning_extraction` refusal classifier (`stop_reason: "refusal"`). Read the structured thinking blocks instead. Configure Opus 4.8 fallback for refusal stop reasons.
- Safety classifiers also cover cyber and bio/life-sciences domains — dual-use-adjacent client work (e.g., pharma content) may need reframing or the Opus seat.
- Supports mid-conversation system messages — append instructions without invalidating a cached prefix.

---

## OPUS 4.8 — the heavy worker (must-be-right builds)

`claude-opus-4-8` · $5 in / $25 out per MTok · 1M context · 128K max output · adaptive thinking OFF unless enabled · Last verified: July 2026

**Prompt style — LITERAL + EXPLICIT SCOPE:**
- Does not silently generalize. "Apply this formatting to every section, not just the first" — say it or lose it.
- Calibrates verbosity to task complexity; to trim, use positive instruction ("Provide concise, focused responses; skip non-essential context; keep examples minimal") — positive concision examples beat prohibition lists.
- **Strip legacy pressure language.** "CRITICAL / MUST / ALWAYS" written for older models now causes over-triggering and over-thinking. Say it once, plainly.
- Favors reasoning over tool calls — raise effort to increase tool use. Spawns fewer subagents by default (steerable if you want parallelism).
- Strong default frontend "house style" (warm cream, serif display). Any build that shouldn't look like that (dashboards, fintech, enterprise) needs an explicit alternative design spec — Churlish palette blocks count.

**Dials:**
- `effort`: **xhigh** for coding/agentic · high minimum for intelligence-sensitive work · medium/low for cost. Respects low effort strictly (scopes tightly; can under-think complex tasks — fix by raising effort, not by prompting around it).
- Set large `max_tokens` (start 64K) at xhigh — don't strangle a long build.
- Same ~30% hot tokenizer as Fable 5.

---

## SONNET 4.6 — the workhorse (volume drafting · research · daily driver)

`claude-sonnet-4-6` · $3 in / $15 out per MTok · Last verified: July 2026

**Prompt style — TIGHT STRUCTURE:**
- System prompt shape: **role → constraints → output format → stop.** Nothing after the stop.
- XML tags for output sectioning are especially effective for briefs, reports, proposals — give it the skeleton, it fills it cleanly.
- **More proactive by default** than the 4.0/4.5 era — delete anti-laziness prodding from ported prompts; it now causes overreach.
- First Sonnet with `effort` and context awareness (tracks its own remaining budget — you can reference it: "you have room; complete all ten variants in this turn").

**Dials:**
- `effort` defaults high; **Anthropic's own recommendation is `medium` as the best speed/cost/quality balance for most work** — make medium the fleet default, low for chat-grade volume, high only when the task earns it.
- Adaptive thinking available; manual `budget_tokens` deprecated on this model — don't port Haiku-style thinking config here.

---

## HAIKU 4.5 — the grunt (bulk chores · tagging · extraction · classification)

`claude-haiku-4-5` (snapshot `claude-haiku-4-5-20251001`) · $1 in / $5 out per MTok · 200K context · 64K max output · Last verified: July 2026

**THE CRITICAL BRANCH — Haiku fails both master switches:**
1. **NO `effort` support.** The dial every other seat uses doesn't exist here.
2. **Manual extended thinking only:** `thinking: {type: "enabled", budget_tokens: N}` — the old mode. Cost control = `budget_tokens` + `max_tokens` + in-prompt token targets.

**Prompt style — MAXIMUM SCAFFOLDING** (practitioner-consensus, not official doctrine — Anthropic publishes no dedicated Haiku prompting page):
- Labeled blocks: `[Context]` `[Policy]` `[Task]` `[Output]` (or XML equivalents). Short, high-signal — a long meandering prompt hurts Haiku more than any other seat.
- Bound the reasoning: "think step-by-step in 3–5 steps." Unbounded, it either skips thinking or wanders.
- 1–2 compact few-shot examples matching the EXACT output structure. Not 5 — context is expensive relative to its job.
- Explicit token budget in the prompt: "target 120–180 tokens; never exceed 220."
- Force the format: JSON schema via Structured Outputs for anything machine-read.
- Hallucination guard: "If not found in the sources, output 'unknown'." Haiku fills gaps confidently — close the gaps.
- Split multi-hop instructions into numbered single-hop steps. One sentence carrying three operations is where Haiku breaks.
- Real capability floor is high — 73.3% SWE-bench Verified, roughly Sonnet-4-class coding at 1/3 the cost and 2× the speed — so the scaffolding is about *reliability per token*, not babysitting.

**Dials:**
- `budget_tokens` for thinking (only when the chore genuinely needs it — most Haiku jobs run better with thinking off and a tighter prompt).
- Tight `max_tokens` — Haiku jobs are defined jobs; cap them.
- Highest cache minimum in the family: **4,096 tokens** — short Haiku prompts can't cache; batch-shared preambles above that line if the volume justifies it.

---

## CACHE MINIMUMS (per model, for the cache-first structuring rule)

| Model | Min cacheable prefix |
|---|---|
| Fable 5 / Opus 5 | 512 tokens |
| Opus 4.8 · Sonnet 5 · Sonnet 4.6 | 1,024 tokens |
| Haiku 4.5 | 4,096 tokens |

Changing `effort` or thinking config invalidates the cache — hold them constant across a cached run.
