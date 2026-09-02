# TASK STYLES — Category Templates Per Tier

How Brainiac shapes a prompt once he knows the task category AND the seat. Rule of use: pick the category, pick the seat, merge with the seat's overlay in `model-profiles.md`. The overlay wins on conflicts.

Templates use `{braces}` for slots Brainiac fills. These are skeletons — Brainiac cuts any block the specific job doesn't need. Every unneeded block is paid-for tokens.

---

## 1 · COPY / CREATIVE (ads, scripts, captions, email, fiction-adjacent)

**All seats:** role + explicit tone constraints + audience + a voice sample beats adjectives. Churlish/client work: churlish-voice-guard (and the client voice file, per martian-manhunter) ride along as the constraint block — that block is stable, so it goes FIRST for caching.

**Fable seat (rare — judging copy, not drafting it):**
```
You are judging {N} ad variants for {client} against {avatar}.
Success: the winner would stop {avatar} mid-scroll and survive the {benchmark} bar.
Kill anything that wouldn't. Verdict per variant: keep/kill + one receipt each.
```

**Sonnet seat (the default copy drafter):**
```
Role: {client} copywriter. Voice: <voice>{voice file / 3-line sample}</voice>
Constraints: <constraints>{banned words, banned CTAs, platform, length}</constraints>
Task: write {N} variants of {asset}. Hook patterns to cover: {list}.
Output: <variants> numbered, hook bolded, CTA last line each.</variants>
```

**Haiku seat (resizes, adaptations, caption stubs):**
```
[Context] {1-2 lines: brand, platform}
[Policy] {banned words}. Match this example's structure exactly:
[Example] {one finished caption}
[Task] Adapt the source post for {platform}. 3 steps: extract hook → resize body → append CTA.
[Output] One caption. Target 60-90 tokens, never exceed 120.
```

## 2 · CODE

**All seats:** explicit action verbs ("implement", "change" — never "can you suggest"). Investigate-before-answering block for existing codebases. Tests or a runnable check = the self-verify handle.

**Fable seat (architecture, judging worker builds):** goal + constraints + "simplest thing that works well; don't survey options you won't pursue" + verification path. No step lists.

**Opus seat (must-be-right builds):** explicit scope ("every endpoint, not just the first"), `effort: xhigh`, `max_tokens` ≥ 64K, tests-first for long runs, explicit design spec if frontend (or it defaults to its cream-and-serif house style).

**Sonnet seat (routine code, scripts, refactors):** role → constraints → format → stop; name the files and the done-condition.

**Haiku seat (mechanical: renames, boilerplate, format conversions):** numbered single-hop steps + one input/output example pair + "output only the code, no commentary."

## 3 · STRUCTURED DATA / JSON

Every seat: **Structured Outputs (`output_config.format`) or strict tool use — never prefill** (400 on 4.6+/5). Schema with `additionalProperties: false`. Value ranges and regex constraints get post-validated — the grammar can't enforce them, so don't pretend the schema is the whole guard.

Haiku owns most of this category: schema + 1 worked example + "unknown" fallback for missing fields.

## 4 · SUMMARIZATION / TRANSCRIPTS

- Long input at TOP, instructions and query at BOTTOM (up to ~30% quality gain).
- Extraction step first: "pull the quotes relevant to {X}, then summarize from the quotes" — kills drift and gives receipts per claim.
- Specify: sections, length cap, audience, attribution rule.
- Big transcripts (HLP episodes, client shoots): two-stage — Haiku/Sonnet pass 1 topics+timestamps, pass 2 targeted summary. Cheaper AND better than one giant pass.
- Every claim carries a supporting quote when the summary feeds a decision.

## 5 · ANALYSIS / STRATEGY (Fable seat, high/xhigh effort)

The fable-mind doctrine IS the prompt style here — the ten laws ride in as the stable system block. Add: competing-hypotheses framing, confidence per finding, one self-critique pass before the verdict. Never ask Fable to *show* the reasoning (refusal trap) — ask for findings + receipts.

## 6 · CLASSIFICATION / TAGGING (Haiku's home turf)

Enum via structured output or tool schema. Decision rubric in the prompt (one line per label: "label X when {condition}"). 1–2 few-shot rows. "unknown" as an explicit label. Batch API when volume >100 and same-day isn't needed — flat 50% off.

---

## The porting rule (restated because it's where mistakes happen)

A prompt is written FOR a seat, not for the fleet. Moving DOWN a tier: add labels, bounds, examples, budgets. Moving UP: strip scaffolding to goal/reason/boundaries/verify. A Sonnet prompt run on Fable wastes quality; a Fable prompt run on Haiku produces confident garbage. Both are Brainiac failures.
