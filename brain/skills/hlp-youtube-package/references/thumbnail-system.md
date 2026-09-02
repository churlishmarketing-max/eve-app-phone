# HLP Thumbnail System

The HLP thumbnail look is **Deep End-inspired**: a strong subject, a cinematic background that tells the story, a bold condensed headline with a yellow highlight and one red accent word, logo bottom-corner, runtime badge. Generated in **Higgsfield** using **Nano Banana 2 (Pro)** — Google's model, best of the set at 4K, photoreal, and image-to-image.

The thumbnail prompt this skill produces is for the **image only** — text is added in post (Canva/PS) for crispness, because even the best models smear baked-in headline text. Always leave a clean lower third for it.

## Concept selection

Match the thumbnail concept to the episode's spine — and when the user is A/B testing, pick two concepts that pull **different levers** (e.g. emotional transformation vs. contradiction) so the test means something.

- **Transformation / underdog** → before-and-after composite: the past on one side (dissolving into shadow), the subject centered and settled, the payoff on the other side (skyline, cash). Expression = the *outcome* (calm, grounded, "made it"), not neutral or intense.
- **Contradiction** → two-world split: the unlikely origin (e.g. cop world — cruiser light bars in haze, cold blue) vs. the outcome (warm gold, wealth). The mismatch is the curiosity gap.
- **Single-subject authority** → subject in a suit, direct eye contact, one warm cinematic world behind, shallow depth of field. Cleanest, most premium read.

## Settings (always state these)

- Model: **Nano Banana 2** (Pro)
- Aspect: **16:9**
- Resolution: **4K**
- Reference image: **yes** when the real guest's face must appear (user uploads their keyed-out cutout or a prior render); **no** for a purely conceptual scene.

## Prompt templates

### A) Real guest, composite (reference image attached)

```
Using the exact man in the reference image — preserve his real face, likeness,
[mustache/cap/tattoos/build as applicable] with zero alteration — [adjust expression
to fit the angle: calm grounded confidence / direct steady eye contact / faint
knowing half-smile]. Composite him into a cinematic YouTube thumbnail with
[two-world split / before-and-after / single warm world] composition. Light him from
the front with a clean rim light so he pops off the background; shallow depth of
field so he is razor sharp and the background falls into soft bokeh.

[LEFT/PAST]: [the origin world — e.g. dim lonely home dissolving into shadow, cold
muted blue-grey, heavy quiet; OR gritty pre-dawn street with police cruiser light
bars in haze. Atmosphere only — no people, no weapons, no violence.]

[RIGHT/OUTCOME]: [warm gold light, blurred luxury skyline at golden hour, subtle
wealth and arrival cues, soft bokeh.]

[Transition: cold shadow eases into warm light behind him, suggesting the journey.]
Naturalistic cinematic color grade, [filmic/soft] contrast, fine grain, true-to-life
skin tones with natural texture, photorealistic, shot on a fast prime lens, editorial
portrait quality, 4k. Keep one side and the lower third darker and uncluttered for
headline text added later.
```

### B) Conceptual scene (no reference, representative figure)

```
Cinematic, high-contrast YouTube thumbnail, no text. [Describe the representative
subject + the story scene per the concept above]. [Background worlds]. Deep cinematic
shadows, [filmic/soft] contrast, photorealistic, ultra sharp, 4k. Keep the bottom
third darker and clear for a headline to be added later.
```

## Load-bearing lines (keep these in every prompt)

- **"no text"** + **"keep the [lower third / one side] darker and uncluttered for headline text added later"** → guarantees clean space for the yellow headline.
- **"shot on a fast prime lens, shallow depth of field, fine grain, natural skin texture, editorial portrait quality"** → this is the lever that pulls the image away from the over-saturated MrBeast/poster look toward *cinematic*. If skin still looks plasticky, add: **"natural skin texture with visible pores, no over-smoothing."**
- **"preserve his real face, likeness… with zero alteration"** → protects the guest's likeness when using a reference.
- Tune expression deliberately: **calm/settled** reads "made it" (best for transformation/authority); **direct eye contact** is most magnetic at small size; **mid-gesture/brows-up** is louder/more MrBeast. State which you chose and why.

## Dramatic vs. cinematic

"Cinematic" = restrained, naturalistic light, soft contrast, depth, grain — a documentary still, not a poster. "Dramatic" = punchy HDR, hard rim light, saturated split. The HLP/anti-guru audience usually rewards cinematic + credibility; a quiet, real image can out-click a loud one *with the right headline*, so the text does more work. Default cinematic unless the user asks for punch.

## Delivery notes

- Tell the user to **run it 2–3 times** — suit drape, collars, and split seams are where these models get fiddly; pick the cleanest fabric/composition.
- Pair the prompt with the thumbnail subtitle from `titles-and-subtitles.md` and note the red word.
- If the thumbnail needs the real guest and no reference photo is available, say so plainly — the user supplies the cutout on their end (Higgsfield uploads work from their browser even when a sandbox can't push the file).
