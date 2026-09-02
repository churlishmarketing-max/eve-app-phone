# CREATE — Building the animations (Remotion) & handoff

Read this only when the plan and branding are approved and it's time to build. Phase 3 is the heaviest step but the most mechanical: the thinking already happened in Phase 2.

## What "build" means here

Claude can't render video directly. The pipeline the reference workflow uses is **Remotion** — a library that builds real, high-quality animations as React components, then renders them to video files. Alfred writes the components; the human renders them and places them in Premiere using the plan table.

Alfred's build outputs:
1. **One Remotion component per animation**, named to match its plan-table ID (`A01.tsx`, `A02.tsx`, …).
2. A **render/placement README** — install steps, the render command, and a restatement of the placement table so the human knows what lands where.

## Component conventions

Make every component obey the branding spec so the render matches the mockup:

- Pull palette/type from a single shared `branding.ts` constants file — never hardcode colors per component. One source of truth = consistency across 55 clips.
- Set each composition's duration (in frames) from the plan-table duration: `frames = round(seconds * fps)`, fps = 30 unless the user says otherwise.
- Use the spec's standard entrance/exit and easing as defaults so motion is uniform.
- Transparent background when the animation overlays talking-head footage; solid brand background when it's a full-frame card. The plan's "What's On Screen" cell says which.
- Comment the top of each file with its ID, the script line, and the duration so a human scanning the folder knows what it is.

## Mockups first (cheaper than building)

Before writing 55 components, confirm the look. Two ways to mock up:
- **Static preview** — render a single representative frame of 3–5 key animations as SVG/PNG so the user approves palette/type/composition. This is fast and catches branding problems before the expensive build.
- **Described mockup** — a tight paragraph per animation of exactly what the frame looks like at its peak.

Only build the full set after the user signs off on mockups. Confirming design first is the biggest time-saver in the whole workflow.

## The render command (for the README)

Standard Remotion render, per composition:

```
npx remotion render <entry> <CompositionId> out/<ID>.mov --codec=prores --prores-profile=4444
```

ProRes 4444 preserves the alpha channel for overlay animations. For full-frame cards, H.264 mp4 is fine and smaller. Tell the human which codec per clip (overlay → ProRes 4444; full-frame → H.264).

## The handoff

End the build by handing the human a clean, dumb-simple checklist — they shouldn't have to think:

1. Install + run Remotion (README has the commands).
2. Render each composition → `out/A01.mov`, `out/A02.mov`, …
3. Import all into Premiere.
4. Work down the plan table: drop `A01` at its Timestamp In, `A02` at its, and so on.
5. Anything marked **Carry** stays under the following beats; **Return** motifs get reused at each referenced timestamp.

That's it. The human's only job is render + place — every creative decision is already baked into the components and the table.

## Honesty note

Building and rendering 55 Remotion components is real work and may exceed what's practical in a single chat. When the set is large, it's often best to: deliver the full plan + branding + mockups + a *representative* batch of built components (e.g., the 5–8 that recur or carry the framework), plus the shared branding constants, and a clear pattern the human (or a follow-up build session) extends to the rest. Don't claim a finished video when what's delivered is the plan and a build starter — say exactly what's done and what remains.
