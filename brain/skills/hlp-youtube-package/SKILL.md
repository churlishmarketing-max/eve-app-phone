---
name: hlp-youtube-package
description: Generates the complete YouTube publishing package for a High Level Pros (HLP) podcast episode — title, description, thumbnail subtitle, and thumbnail prompt — from an episode transcript. Trigger whenever the user wants YouTube metadata, a title, a description, a thumbnail subtitle, or a thumbnail prompt for a High Level Pros / HLP episode, or pastes an HLP transcript and asks to package, publish, or "do the YouTube stuff" for it. Also trigger on "HLP package", "title and description for this episode", "thumbnail text/subtitle for HLP", "thumbnail prompt for the [guest] episode", "metadata for High Level Pros", or any request to prep an HLP episode for upload. This skill is specific to the High Level Pros channel (host Brandon King, Churlish Media). Use it even if the user only asks for one of the four pieces — produce that piece to the HLP standard rather than a generic answer. Always read churlish-voice-guard first.
---

# High Level Pros — YouTube Package

Turn an episode transcript into a consistent, publish-ready package for the **High Level Pros** channel: **title, description, thumbnail subtitle, and thumbnail prompt** (plus chapters inside the description, and a tag block). One request in, the full package out, every time.

## Before anything: read the voice guard

Read `churlish-voice-guard` first. HLP is Brandon King's channel under Churlish Media, so every word carries the Churlish voice — direct, anti-corporate, no banned phrases (leverage, synergy, move the needle, best-in-class, cutting-edge, thought leader, holistic approach). If that skill is unavailable, still hold the line: operator-to-operator, Midwest substance, zero motivational fluff.

## Who the channel is for (this shapes every choice)

High Level Pros is a podcast for **Midwest service-based business owners** — tradesmen, contractors, gym owners, med spa operators, agency leads, anyone running a real-world business with overhead, payroll, and customer pressure. The audience is **anti-guru and allergic to motivational fluff**. They want operators talking to operators: hard numbers, hard-won lessons, tactical systems they can run Monday. Tone closer to two owners in a barbershop than a polished interview.

They tune in for three things. Lead the package with whichever the episode delivers hardest:
1. **Counter-intuitive truths** — a guest flips conventional advice or reveals what actually works vs. what gurus say.
2. **Specific tactical wins** — real numbers (revenue, cost saves, hires, conversion, time saved) and the exact mechanism.
3. **Honest failure stories** — the screw-up, the rebuild, what they'd do differently.

## Workflow

1. **Read the transcript** end to end. Pull: the guest's name + one-line identity, the single sharpest hook, every hard number, the biggest counter-intuitive line, the failure story, the "homework"/CTA, and any links/handles the guest gives.
2. **Pick the spine.** Decide which of the three audience pulls is strongest — that becomes the title angle, the thumbnail concept, and the description's THE LESSON.
3. **Read the references** for the exact formats:
   - `references/titles-and-subtitles.md` — title formulas + thumbnail subtitle formulas + A/B rules.
   - `references/description-blueprint.md` — the locked description structure with annotated example.
   - `references/thumbnail-system.md` — the Deep End-inspired look + the Higgsfield prompt library (Nano Banana 2 / Pro), reference-photo and text-to-image variants.
4. **Produce the package** in the output order below.
5. **Run the honest-flags checklist** before delivering.

## Output contract (always this order)

Deliver these, clearly labeled, in one response:

1. **TITLE** — one recommended (under ~60 chars) + 3–4 alternates, each tagged with its angle. If the user is A/B testing, keep variants in **parallel sentence structure** so the test isolates the angle, not the grammar.
2. **THUMBNAIL SUBTITLE** — one recommended (2–4 words) + 2–3 alternates. Note which word goes red if using the accent treatment.
3. **THUMBNAIL PROMPT** — a Higgsfield-ready prompt with settings (model, aspect, resolution, reference image yes/no). Default to no baked-in text and a clear lower-third for the headline.
4. **DESCRIPTION** — the full block in the locked HLP structure (cold-open hook → Welcome → THE LESSON → THE HOMEWORK → CHAPTERS → LINKS → CONNECT → SUBSCRIBE).
5. **TAGS** — 15–25, primary keyword first, no single-word tags.

If the user asks for only one piece, produce just that piece — but to this standard, not a generic version.

## Standing rules and honest flags

- **Chapters are near-verbatim and hook-style.** First chapter is always `00:00`. Pull real spoken beats, write them as curiosity hooks, sort chronologically. Auto-transcripts drift — tell the user to confirm in-points by ear if the source looks garbled.
- **Frame the guest's claims as the guest's claims.** If a guest says they "helped create" a product or quotes an acquisition figure, write it as their story ("the marketing principle behind X," "a company that exited to Y"), not as verified fact in the channel's voice.
- **No fabricated URLs or placeholders presented as final.** If a handle or site is unclear in the transcript, leave an obvious `[fill in: …]` marker and call it out — never invent a link.
- **Copyright on quotes.** Any verbatim quote stays short (under 15 words) and rare; paraphrase by default.
- **Thumbnail honesty.** A representative/AI figure is fine for a concept scene, but if the thumbnail needs the real guest's face, say so — that requires the guest's actual photo as a reference, which the user supplies on their end.
- **Yellow is the click, brand is the thread.** HLP thumbnails optimize for the click (bold headline, one red accent word), so they may lean louder than the core brand palette. Keep brand color only on the logo so there's a thread back to HLP.

## Default channel facts

- Channel: **High Level Pros (HLP)** · Host: **Brandon King** · Studio: **Churlish Media** (churlishmedia.com)
- Host socials: **@BrandonKing** (LinkedIn, Instagram, YouTube)
- Every episode ends with **homework** — surface it; it's a signature of the show.
- Thumbnail look: **Deep End-inspired** — bold condensed headline, yellow highlight, one red accent word, cinematic background. Generated in **Higgsfield (Nano Banana 2 / Pro)**.
