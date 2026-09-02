# PLAN — Animation taxonomy & the plan table

The second editor skill. Every flagged moment from ANALYZE gets turned into a concrete on-screen plan: *what kind* of animation, and *exactly what's on screen*. The kind follows from the reason it was flagged.

## The taxonomy (reason → animation type)

| Flag reason | Animation type | What it does on screen |
|-------------|---------------|------------------------|
| New concept / term | **Reveal / introduce** | The term animates in big and centered the moment it's spoken — owns the frame. |
| Framework / model | **Build-up** | Each part appears as it's named, assembling the whole (e.g. rings of a model, nodes of a system). |
| Steps / process | **Sequential flow** | Steps advance left-to-right or top-down, current step highlighted. |
| Number / stat / price | **Stat emphasis** | The number scales/counts in, oversized, with a label; everything else recedes. |
| Comparison / "vs" | **Contrast reveal** | Two halves staged in opposition; the favored side resolves/wins. |
| List | **Sequential list** | Items appear one at a time, synced to the VO. |
| Named entity | **Name card / logo / image** | Clean identifier — logo lockup, name plate, or sourced image. |
| Claim needing proof | **Proof card** | Testimonial, screenshot, result, or receipt framed as evidence. |
| Retention (stale frame) | **B-roll / text overlay / kicker / accent motion** | Light refresh — keeps the frame alive without heavy build. |

When a moment fits two types, pick the one that serves *understanding* first, retention second.

## Writing the "What's On Screen" cell

This is the instruction a builder (or Remotion) executes. Be concrete and visual, not vague.

- ❌ "Animation explaining the framework."
- ✅ "Compass Model assembles center-out: 'VALUES' fades into the center first (~0.5s), then 'PURPOSE' ring draws around it, then 'ACTION' outer ring, then the north arrow snaps up with 'LEAD WITH HEART'. Hold assembled for the last 2s."

Include: what appears, in what order, timed to the VO, and how it exits (cut, hold, or carry into the next beat).

## Duration discipline

If the transcript is timestamped, each animation's duration = the time the corresponding line is spoken. Build the animation to *fill* that window — not so fast it's done in 1s of a 6s line (dead air), not so slow it's still building when the VO moves on. If you only have a plain script, estimate at ~150 words/min spoken (~2.5 words/sec) and label durations as estimates.

## Carrying vs. cutting

Decide for each animation whether it:
- **Cuts** — replaced by the next beat's visual, or
- **Carries** — stays and gets added to (common in build-ups and lists), or
- **Returns** — a recurring motif (e.g., the Compass reappears each time the method is referenced).

Recurring motifs are a retention superpower in long-form — they make the video feel authored, not assembled.

## The plan table (the deliverable)

One row per animation. This *is* the Premiere placement table — the human reads it top to bottom and drops each rendered clip at its timestamp.

| Column | Contents |
|--------|----------|
| **ID** | A01, A02, … (matches the Remotion component name and the rendered file name) |
| **Timestamp In** | When the animation starts (from transcript) |
| **Timestamp Out** | When it ends |
| **Duration** | Out − In (or estimate) |
| **Script Line** | The exact VO line it covers |
| **Type** | From the taxonomy above |
| **What's On Screen** | The concrete build instruction |
| **Branding Notes** | Any palette/type/motion specifics for this one |
| **Carry?** | Cut / Carry / Return |

Build this as `.xlsx` (use the xlsx skill). Freeze the header row, color the header in the client's primary, and keep "What's On Screen" wide.

## Sanity checks before handing off

- Every flagged moment has a row; no orphans.
- IDs are sequential and unique (they'll become file names).
- Total animation count lands in the density range for the runtime.
- No two heavy build-ups back to back with no breather between.
- At least one recurring motif if the video has a central framework.
