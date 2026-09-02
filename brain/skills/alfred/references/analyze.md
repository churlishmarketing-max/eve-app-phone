# ANALYZE — Flagging what needs a visual

This is the first editor skill. You read the script the way a high-level editor reads it: not "what's said" but "what does the viewer need to *see* to understand this, and where is the screen about to go stale?"

## The two questions

Run every line of the script through two filters:

1. **Clarity:** *Is this line crucial for the viewer to understand?* New concepts, definitions, frameworks, numbers, processes, comparisons, named things — these are hard to absorb by audio alone. If understanding suffers without a visual, flag it.
2. **Retention:** *Has the screen sat still too long?* Even when a line isn't conceptually critical, a talking head with no visual change for 15+ seconds bleeds retention. Flag a visual to refresh the frame.

A line can be flagged for clarity, retention, or both. Tag the reason — it tells the PLAN step what *kind* of animation to choose.

## What gets flagged (clarity)

- **New concept / term being introduced** → it needs to appear on screen the moment it's named.
- **A framework, model, or set of steps** → it needs to build visually as it's described.
- **A number, stat, price, or metric** → it needs emphasis; spoken numbers don't stick.
- **A comparison ("X vs Y", "old way vs new way")** → side-by-side.
- **A process or sequence ("first… then… finally")** → a flow that advances.
- **A named entity (tool, brand, person, place)** → logo / name card / image.
- **A list** → items that appear one at a time as they're spoken.
- **A claim that needs proof** → testimonial, screenshot, result, receipt.

## What gets flagged (retention only)

When the line isn't critical but the frame is stale, the lighter touch:

- **B-roll** that matches the topic
- **Text overlay** pulling the key phrase from the line
- **Lower-third / kicker** to re-anchor the section
- **Subtle motion** (zoom, parallax, accent reveal) just to keep the frame alive

These are cheaper than full concept animations — use them to fill gaps, not to do heavy lifting.

## What does NOT get flagged

- Transitional/filler lines ("so anyway", "let's get into it") — let the talking head breathe.
- Lines already covered by the visual still on screen from the previous beat.
- Back-to-back flags closer than ~3 seconds apart — combine or let one ride.

## Density math

Target roughly **one visual moment every 8–12 seconds** for premium long-form. Quick check:

- 10-min video ≈ 600 sec ÷ 10 ≈ **~60 animations** (the reference benchmark was 55 for a 10-min video).
- If your flag count is way under, you've got stale stretches — add retention visuals.
- If it's way over (every 2–3 sec), you'll exhaust the viewer and blow up the build — consolidate.

Density is a *guide*, not a quota. A dense framework explanation might earn five animations in 30 seconds; a personal story might earn one in 60. Let the content lead.

## Output of this step

A pass through the full script where every line is either left alone or flagged with:
- the **reason** (clarity / retention / both)
- a one-line note on **what the viewer needs to see**
- the **timestamp** (in–out) if the transcript is timestamped

This flagged script feeds directly into PLAN. Don't choose specific animation types here — just identify *that* a moment needs a visual and *why*. The "what kind" decision lives in `animation-plan.md`.

## Worked micro-example

Script line (timestamped):
> `[00:01:12–00:01:19]` "Most leadership programs add performance. TrueNorth removes armor."

Flag:
- **Reason:** clarity + retention (the wedge — the single most important positioning line in the video)
- **What the viewer needs to see:** the contrast — "add performance" vs "remove armor" — staged as opposition so the wedge lands visually.
- **Duration:** ~7 sec — long enough for a two-part reveal.

That moment is now ready for PLAN to assign it a **comparison / contrast reveal** animation.
