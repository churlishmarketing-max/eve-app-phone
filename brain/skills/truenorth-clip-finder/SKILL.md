---
name: truenorth-clip-finder
description: "Finds short-form (≤90s) and LinkedIn mid-form (4–6 min) clips in TrueNorth Leadership Co. (Kambi Pope) footage transcripts and outputs a publish-ready clip sheet. Trigger whenever a Kambi Pope / TrueNorth transcript, interview, coaching session, podcast, guest appearance (including episodes where Kambi is the GUEST on another show, e.g. High Level Pros), or shoot-day recording is provided with any request to find clips, pull moments, identify short-form or mid-form, or 'what should we cut from this.' Shorts ship with timestamp range, verbatim snippet, pulled quote, one-line reason, pillar + funnel tag, and on-screen notes; mid-form ships as one complete teaching segment for her LinkedIn. For guest appearances, apply the speech-first lens: clip Kambi's message, not the host's show. Pairs with the TrueNorth Clip Card system. Read churlish-voice-guard first, plus the TrueNorth Strategic Playbook / Brand One-Sheet for avatar + voice."
---

# TrueNorth Clip Finder (Kambi Pope)

Turns a raw TrueNorth transcript into a ranked, publish-ready short-form clip sheet. This is the general `transcript-clip-finder` retuned for one client — Kambi Pope — so the scoring, language, and guardrails match TrueNorth's voice and Emily Carter's pain instead of generic "clippable."

The one rule that overrides everything else: **every clip is 90 seconds or less.** If a great moment runs long, tighten the in/out to its strongest 90 seconds or split it into two clips. A 2-minute "amazing" moment is not a short-form clip.

## Dependencies (read before running)

1. **churlish-voice-guard** — voice rules + banned words. On-screen text and captions must pass it.
2. **TrueNorth Strategic Playbook V1.1** + **Brand One-Sheet** (project knowledge) — Emily Carter avatar, the Lead Without Armor™ spine, the four content pillars, the offer ladder.
3. **transcript-clip-finder** (parent skill) — the general 5-factor scoring loop this inherits.

## What a clip must earn its way past

TrueNorth is not in the leadership-tips business — it's identity reclamation for high-performing women who have outgrown the version of themselves they built to get here. A clip is only worth cutting if Emily Carter would stop scrolling for it. Score each candidate 1–5 on five factors, weighted:

1. **Hook in the first 3 seconds (highest).** Does it open on a line that stops the scroll — a vulnerable admission, a contrarian reframe, a named pain, a specific number? If the strong line is buried 20 seconds in, the clip starts there or it doesn't get made.
2. **Standalone clarity (high).** Can a stranger understand it with zero context? Coaching-session clips fail here constantly because the power line is an answer to an unheard question. Fix: put the question on a text card, or widen the in-point — but only if the setup is under ~8 seconds.
3. **Emily relevance (high).** Does it hit one of her pains (identity drift, misalignment friction, no time for herself, loneliness at her level, the fear of looking back) or one of her desires (a self she recognizes, a portable framework, quiet real confidence, leading so her daughter can see it)? A great line about something Emily doesn't carry scores low.
4. **Emotional truth (medium).** TrueNorth's edge is grounded, warm honesty. Energy peaks, voice catches, the pause before a hard sentence — mark them. Flat delivery of a good idea loses to honest delivery of a plain one.
5. **Quotability (medium).** Is there a line someone screenshots? "I came back out like nothing ever happened." is the whole brand in eight words. "I think leadership is important" is not.

## The 90-second discipline

- **Hard ceiling: 0:90.** Target the **0:20–0:60** band for most clips — it travels furthest on Reels/Shorts.
- If the moment needs setup, the setup goes **on a text card**, not in the runtime.
- If a story is genuinely 2+ minutes and can't be cut without gutting it, log it as a **"long-form / YouTube" flag**, not a short-form clip.
- Always report the actual **In → Out** and the **duration**. If you tightened the speaker's words for the on-screen quote, say so and keep the spoken VO verbatim.

## Tag every clip

- **Content pillar** (pick one): `Values Before Performance` · `The Framework` · `Real Leadership` · `Workshop & Offer`.
- **Funnel stage:** `TOF` / `MOF` / `BOF`. Across a full sheet aim for roughly **50 / 30 / 20** (the first-60-days mix). Don't ship a sheet that's all BOF.
- **Lead Without Armor™ tie-in:** note when a clip belongs to the signature spine — those are the priority cuts.

## Output — the clip sheet

Lead with a one-line summary of the source (what it is, runtime, how many clips found, the funnel spread). Then, for **each** clip, exactly these fields:

```
CLIP [N] · [Working title]
────────────────────────────────────────
Timestamp:    [IN] → [OUT]
Duration:     [M:SS]   (must be ≤ 1:30)
Pillar:       [one of the four]
Funnel:       [TOF / MOF / BOF]
Spine:        [Lead Without Armor™  | —]
Score:        [/25]

QUOTE (pull / on-screen):
"[The screenshot line. ≤ ~20 words. May be lightly tightened from the VO for the card — note if so.]"

TRANSCRIPT (verbatim, what's actually said in-clip):
"[The exact words from the transcript across the in→out range.]"

WHY (one line):
[Why Emily stops — which factor it wins on and which pain/desire it hits.]

ON-SCREEN / EDIT NOTES:
[Text-card setup if needed · where the quote burns in · trims · b-roll · whether to pair with the matching Clip Card graphic.]

CAPTION SEED:
[1–2 lines in Kambi's voice + the CTA stage. Passes voice-guard.]
```

## Reading approach (4 passes)

1. **Skip the operator chatter.** Raw shoot transcripts are full of mic checks, direction, and the coach/interviewer prompting. Those never clip. Find the moments where *Kambi* is talking.
2. **Mark the truth peaks.** Vulnerable admissions, the reframe sentences, the direct-to-camera "if I could tell that woman one thing." Flag energy and pauses.
3. **Test standalone + tighten to ≤90s.** For each peak, find the cleanest in-point (strong first line) and the cleanest out-point (the landing). Widen only for ≤8s of essential setup; otherwise use a text card.
4. **Score, rank, spread.** Apply the five factors. Select for variety across the four pillars and the funnel mix — don't pick five versions of the same beat.

## Guest appearances — the speech-first lens

When Kambi is the **guest** on another show (e.g. High Level Pros), this skill cuts for **her channels and her audience** — not the host's. Two rules change:

1. **Clip her speech, not the conversation.** Prioritize the moments where Kambi is delivering her message directly — the monologue and teaching passages, the direct-to-camera truths, the reframes, the "if I could tell that woman one thing" lines. Host questions and back-and-forth banter are setup, never the clip; use them only as a text-card context bridge.
2. **Run as a separate pass.** The host's channel will cut its own set for its own audience. Keep the sheets separate; a clip cut for business owners will not serve Emily Carter, and the reverse. Label files for her channels (e.g. `TN_[SOURCE]_SHORT_##`).

The scoring, pillars, funnel mix, sensitivity HOLD, and voice rules below all still apply unchanged.

## Mid-form for LinkedIn (4–6 min, 0–1 per source)

Emily Carter lives on LinkedIn, which makes TrueNorth a natural fit for the mid-form tier: **one complete teaching** from Kambi — a full reframe, a full framework, or a full story with its landing intact. Not a montage; not stitched shorts.

- **Selection test:** it answers one real question Emily is asking (write the question in one line); it is complete (setup → idea → landing inside the segment); it is valuable alone; the full source clearly holds more.
- **Structure:** cold open 0:00–0:20 (her strongest 10–20s pulled forward) → context bridge (the question, on a text card or in her own framing) → the body (her complete reasoning — trim repeats, keep the weighted pauses; her pauses carry the brand) → the landing (the payoff plainly, let it breathe) → bridge out (one line to the full source or her offer, per funnel stage).
- **Pace:** a visual change every 15–30 seconds — calm, not frantic; the restraint is the brand. Captions full runtime. Native LinkedIn upload, never link-only; the first three lines of the post copy do the hook job, written in her voice and passing the banned-words list.
- **Output adds per mid-form segment:** the one-line question · in→out + duration after trims · cold-open pull · context-bridge line · internal trims · landing lines · bridge-out line · the first three LinkedIn post lines · pillar + funnel tag · HOLD flag if it touches her deep story.

## Quantity

- Under 15 min of usable talk → 3–5 clips
- 15–30 min → 5–7
- 30–60 min → 7–10
- 60 min+ → 8–12

Quality over quota. If only four moments clear the bar, ship four.

## Sensitivity guardrail (do not skip)

TrueNorth content is built from Kambi's real story, and some of it is raw — abandonment, a parent's rejection, the hardest private moments. Those can be the most powerful clips *and* the ones that need her explicit, informed sign-off before they ever publish.

- Flag any clip touching deep personal trauma (e.g. a parent saying they no longer wanted her, the bathroom-floor moment) as **HOLD — confirm with Kambi before publishing.**
- Never build a clip that sexualizes, and never frame her pain as a gimmick. The job is dignity + truth, not exploitation.
- When in doubt, recommend the clip but mark it HOLD and let Kambi choose. Her story, her call.

## Voice + banned words (from voice-guard)

Grounded, warm, direct — identity before tactics. Would Kambi say it on a stage to 200 women who lead? If it sounds like a LinkedIn coach selling a 5-day challenge, rewrite. **Never** in any on-screen text or caption: empower / boss babe / hustle / manifest / crush it / slay / level up / best version of yourself / 10x / disrupt / leverage / synergy / move the needle / best-in-class / cutting-edge / thought leader / holistic approach.

## Companion graphics — TrueNorth Clip Cards

Each clip has a matching **Clip Card** (9:16, 1080×1920) generated by the TrueNorth Clip Card system. Spec, so cards stay consistent:

- **Background:** warm cream `#F3EEE6`, faint compass-rose motif centered behind the quote.
- **Type:** quote in **Spectral** (Medium, with the key phrase in Spectral Medium Italic, teal `#1E5F6B`); labels/eyebrow/lockup in **Barlow Condensed SemiBold**, tracked; attribution in **Barlow**.
- **Palette:** ink `#1C2B33` · emphasis teal `#1E5F6B` · gold `#B98A16` · muted `#7A7468` · hairline `#C4BAAA`.
- **Lockup:** gold compass mark + `TRUENORTH` top-left; content **pillar** top-right; brand signature `LEAD WITHOUT ARMOR™` bottom; footer meta bar (clip #, timestamp, duration, funnel) for the editor — **remove the footer bar for the published version.**
- One emphasis phrase per card. One gold accent family. Keep it calm; the restraint is the brand.
