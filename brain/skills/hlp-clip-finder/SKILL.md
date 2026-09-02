---
name: hlp-clip-finder
description: "The HLP Content Engine — builds podcast trailers, short-form clips (≤90s), and mid-form clips (4–7 min, YouTube/LinkedIn) from High Level Pros episodes using the Alfred Editing Method. Trigger whenever an HLP / High Level Pros transcript is provided with ANY request to find clips, pull moments, identify shorts, cut Reels/Shorts/TikTok, build a clip sheet, make a trailer, or cut mid-form clips. Also trigger on 'HLP clips', 'clip this episode', 'run the clip system / content engine', 'Alfred clip pass', 'episode trailer', 'mid-form for LinkedIn', or any request to prep editor briefs for an HLP episode. Prefer over the general transcript-clip-finder for anything HLP. Trailers ship as open-loop build sheets; shorts as full editing briefs (Stop/Ride/Button, 5-factor score, on-screen plan); mid-form as complete-idea segments with cold open, landing, and bridge-out CTA. Read churlish-voice-guard first; editor-facing briefs live in assets/."
---

# HLP Clip Finder — The Content Engine (v3)

Turns one HLP episode into a full content ladder: **trailer (60–90s) → short-form clips (≤90s) → mid-form clips (4–7 min) → full episode.** Each format has one job: the trailer announces, shorts reach (TOF), mid-form earns trust (MOF), the full episode is the product (BOF). Every piece must be valuable on its own — we earn the click, we never hold value hostage.

This is **not a "find good moments" task — it's an editing brief.** Three decisions per clip: what earns the clip, how the clip is built, and what's on screen at every beat. By the time the sheets are done, the cut should be mechanical, not interpretive. Built on the Alfred Editing Method (see `alfred-editor`).

**Which format(s) to produce:** if the user doesn't specify, default to the full ladder for a new episode (1 trailer + shorts per quantity table + 1–3 mid-form). If they name a format, produce that format to this standard.

## Dependencies

- **churlish-voice-guard** — read before writing any hook, overlay, or caption copy. HLP carries the Churlish voice.
- **alfred-editor** — the parent editing brain. This skill is its short-form application.
- **hlp-youtube-package** — the long-form sibling (title/description/thumbnail). Pair them when packaging a full episode.
- **assets/HLP-Content-Engine-v3.pdf/.docx** — the editor-facing master workflow (all three formats, with copy-paste Claude prompts, written in clear international English for the global editor team). **assets/HLP-Clip-System-v2.pdf/.docx** — the short-form deep-dive brief. When the user wants to hand the system to a human editor, deliver these files rather than re-generating.

## Who you're cutting for (drives every decision)

High Level Pros is a podcast for **Midwest service-based business owners** — tradesmen, contractors, gym owners, med spa operators, agency leads. People with overhead, payroll, and customer pressure. Host: Brandon King. Studio: Churlish Media.

The audience is **anti-guru and allergic to motivational fluff.** Operators talking to operators: hard numbers, hard-won lessons, systems they can run Monday. Two owners in a barbershop, not a polished interview.

Every clip must deliver at least one of the **three audience pulls** — tag which one on every clip:

| Pull | What it looks like in footage |
|---|---|
| **Counter-intuitive truth** | Guest flips conventional advice, or reveals what actually works vs. what gurus say |
| **Specific tactical win** | Real numbers (revenue, cost saves, hires, conversion, time saved) plus the exact mechanism |
| **Honest failure story** | The screw-up, the rebuild, what they'd do differently |

**The disqualifier:** a moment can be interesting and still not earn a spot in a business owner's feed. If it doesn't connect to their **pain, money, crew, time, or identity**, skip it — no matter how good the energy is.

## The Editor's Two Questions

Run every segment through both filters:

**Q1 — Does this earn the stop?** Is there a line that would freeze a thumb mid-scroll — bold claim, specific number, contrarian take, vulnerable admission, unexpected reveal? If the stopping line is buried 8 seconds in, the clip needs a recut so it opens *on* that line.

**Q2 — Does this earn the next 5 seconds, every 5 seconds?** Short-form retention dies in stretches. After the hook, does the segment keep paying — escalating tension, a number landing, a turn, a payoff? A great hook on a flat 60-second explanation is a great hook on a dead clip.

Passes Q1, fails Q2 → cut shorter. Passes Q2, fails Q1 → find or write a stronger entry point. Fails both → not a clip.

## The Four-Pass Read

1. **Scan for energy peaks.** Read the full transcript fast. Mark every intensity spike: stronger words, specific numbers, emotional weight, humor, conviction, a confession, an interruption ("wait, say that again"). Don't evaluate yet — flag.
2. **Test standalone clarity.** Does each flagged moment make sense with zero prior context? If it needs setup, widen the clip slightly — but **if required setup runs more than ~10 seconds, the clip loses its punch**: recut, re-hook with an overlay that does the setup's job, or kill it.
3. **Score, rank, and spread.** Apply the 5-factor scoring below. Select to quantity targets. Check the spread: vary across the three audience pulls, across topics, and across funnel stages (TOF/MOF/BOF). Never five clips on one idea.
4. **Build each clip.** Write the full anatomy and the on-screen plan. This pass turns a "moment" into an editable clip.

## Scoring (rate every candidate 1–5 on all five; total /25)

| # | Criterion | Weight | What a 5 looks like |
|---|---|---|---|
| 1 | Hook strength | Highest | Opening line stops the scroll cold. No warm-up needed. |
| 2 | Standalone clarity | High | Fully self-contained — its own beginning and payoff. |
| 3 | Avatar relevance | High | A Midwest service-business owner sees their own problem, money, crew, or identity within seconds. |
| 4 | Emotional resonance | Medium | Conviction, frustration, humor, or vulnerability you can feel. Passionate decent info beats flat great info. |
| 5 | Quotability | Medium | A line someone would screenshot or repeat to a friend. |

Anything under ~15/25 doesn't ship unless the episode is genuinely thin — and then say so rather than padding.

## Clip Anatomy — every clip is built in three acts

90 seconds hard max; most clips land **30–60s**.

- **ACT 1 — The Stop (0:00–0:03).** Strongest line first, even mid-sentence. Cold opens work. If the spoken opening is weak but the moment is strong, the text-overlay hook does the stopping.
- **ACT 2 — The Ride.** Tension holds or escalates. Cut every breath, tangent, and re-statement that doesn't move it forward. If the speaker circles, keep the best lap; note internal trims with timestamps.
- **ACT 3 — The Button (last 3–5s).** End on the payoff line, the laugh, the number landing, or the mic-drop — never on a trail-off, a transition, or "...so yeah." A clip that ends one sentence too late feels 20% weaker.

### Hook formulas (for the suggested hook / text overlay)

Use the speaker's verbatim opening if it's strong. Otherwise write the overlay from these patterns (full library in `ad-script-factory/references/hook-library.md`):

| Formula | Structure |
|---|---|
| Direct call-out | "You're [specific behavior] and [uncomfortable consequence]." |
| Uncomfortable truth | "[Thing everyone believes] is [actually wrong / costing them]." |
| Specific result | "[Number/outcome]. [Short context]." |
| Provocative question | A question they can't scroll past — never one answerable with "no." |
| Stop command | "Stop [the thing that's hurting them]." |
| If/then conditional | "If you're [specific situation], [what's actually happening]." |

**Hook rules:** specificity beats cleverness ($60K beats "massive savings") · one breath, one thought · never open with a brand name · run the "so what?" test as a skeptical stranger.

## The On-Screen Plan (what makes this a brief, not a list)

In short-form **the screen can never sit still** — a visual beat every few seconds. Specify per clip:

1. **Captions:** burned-in, word-by-word or short-phrase, full runtime. Most short-form is watched muted — captions are the audio.
2. **Hook overlay (0:00–0:03):** bold text in the safe zone. State verbatim vs. written, and which formula.
3. **Emphasis beats:** every number, named tool/brand, or key phrase gets a visual punch the moment it's spoken. Spoken numbers don't stick; shown numbers do.
4. **Energy edits:** punch-ins/outs, speed ramps, cam switches matched to the speaker's intensity.
5. **Dead-air kills:** timestamp every internal trim.
6. **Format:** 9:16 vertical default; 1:1 or 16:9 only if LinkedIn is the named primary target. Faces and text in platform safe zones.

**Alfred's one unbreakable rule — consistency beats cleverness.** Every clip from the episode uses the same caption style, overlay treatment, and emphasis system. One visual system looks more expensive than five brilliant mismatched clips.

## Output format (one block per clip — every field, every time)

```
CLIP [N]: [Working title]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Timestamp:       [START] → [END]   (+ internal trims: [list, or "none"])
Duration:        [Xs] after trims   (90s hard max; 30–60s sweet spot)
Speaker(s):      [Who's on screen]
Platform:        [Reels / Shorts / TikTok / LinkedIn / All]
Audience pull:   [Counter-intuitive truth / Tactical win / Failure story]
Funnel stage:    [TOF / MOF / BOF]
Score:           [X/25]  (Hook _ · Standalone _ · Avatar _ · Emotion _ · Quote _)

THE STOP (Act 1):
Opening line/frame: "[exact first words or visual]"
Hook overlay: "[text]" — [verbatim / written — formula used]

THE RIDE (Act 2):
[1–2 sentences: how tension holds — and what gets trimmed to keep it tight]

THE BUTTON (Act 3):
Final line/frame: "[exact last words]" — cut at [timestamp]

WHY THIS WORKS:
[1–2 sentences — top-scoring criteria and why it lands for the HLP avatar]

ON-SCREEN PLAN:
- Emphasis beats: [timestamp — what pops on screen]
- Energy edits: [punch-ins, cam switches, speed ramps]
- Captions: [house style note]

PULLED QUOTE:
"[The screenshot line — for the caption/graphic]"
```

Close the sheet with a **3-line episode summary**: strongest theme, recommended posting order (lead with the highest TOF score), and footage-level flags (audio issues, garbled transcript zones, `[confirm by ear]` sections).

## Quantity targets

| Episode length | Clips |
|---|---|
| Under 15 min | 3–5 |
| 15–30 min | 5–7 |
| 30–60 min | 7–10 |
| 60+ min | 8–12 |

Quality over quantity. Four genuinely strong clips beat ten padded ones — deliver four and say why.

## Voice guardrails (non-negotiable)

- Operator-to-operator, anti-corporate, zero motivational fluff. Litmus test: *would Brandon say it on a podcast, leaning forward?*
- Banned in any hook/overlay/caption: leverage (verb), synergy, move the needle, best-in-class, cutting-edge, thought leader, holistic approach, disrupt, "take your business to the next level."
- Frame the guest's claims as the guest's claims — never as verified fact in the channel's voice.
- No fabricated numbers, names, or quotes. Unclear in transcript → `[confirm by ear]`.
- Verbatim on-screen quotes stay short (under 15 words) and rare; paraphrase by default.

## Transcript handling

- `HH:MM:SS` or `HH;MM;SS;FF` timestamps → use directly for in/out points.
- Speaker-labeled → note who's talking in every clip block.
- No timestamps → approximate position (beginning/middle/end or paragraph #), flag that in-points get pulled from footage.
- Auto-generated (YouTube/Otter/Premiere) → read for intent, not literal accuracy; flag garbled in-points `[confirm by ear]`.

## Pre-delivery checklist

- [ ] Every clip opens on its strongest line — no warm-up frames
- [ ] Every clip ends on a button, not a trail-off
- [ ] No required setup longer than 10 seconds anywhere
- [ ] All three audience pulls represented (where the episode allows)
- [ ] No two clips covering the same idea
- [ ] Every number/name beat has an on-screen emphasis note
- [ ] All hooks pass the "so what?" test; zero banned words
- [ ] All timestamps verified; garbled zones flagged
- [ ] One consistent visual system across the whole set

## Format: The Episode Trailer (60–90s, 1 per episode)

**Job: announce the episode and create open questions. Never give answers.** Built from **open loops** — moments cut *before* the payoff arrives. The viewer hears the question, the claim, or the start of the story; the full episode is the ending.

Structure, in order: **(1) Cold hook** 0:00–0:08 — the single most surprising line of the episode, cut before its explanation. **(2) Who this is** 0:08–0:18 — guest identity in one line, proof not titles (what they built, what they did, a number). **(3) Tension stack** — 3–5 short moments, each a *different* open loop, ordered strong to strongest, fast cuts. **(4) The cliffhanger** — the biggest open loop last; stop mid-thought if needed. **(5) Title card** — episode title + "Full episode out now" + where to watch.

Trailer build sheet output: each candidate moment with timestamp in→out (cut before the payoff), exact spoken words, and the question it plants; then the final running order with estimated runtime and title card text. Checks: zero payoffs anywhere; each moment a different topic; cut speed rises toward the cliffhanger; captions full runtime.

## Format: Mid-Form Clips (4–7 min, 1–3 per episode, YouTube + LinkedIn)

**Job: trust.** One complete, valuable idea for high-level professionals — then an invitation into the full episode. A mid-form clip is **one complete answer to one question** a business owner is actually asking. Never a montage, never stitched shorts. One idea — a full story, framework, or debate — beginning, middle, end intact.

**Selection test (all four must pass):**
1. **It answers one real question** you can write in one line ("How do I price without competing on price?"). Can't name the question → not a mid-form clip.
2. **It is complete** — setup, idea, landing all inside the segment. The viewer never feels they walked in halfway.
3. **It is valuable alone** — a method, number, decision rule, or usable lesson even if they never click through.
4. **It opens a bigger door** — the full episode clearly contains more.

**Structure:** Cold open 0:00–0:20 (strongest 10–20s of the segment pulled forward) → Context bridge 0:20–1:00 (the question + one line of speaker proof; a text card or host framing) → The body (the complete idea in order — keep the reasoning, trim repeats/false starts/asides) → The landing (the payoff stated plainly; let it breathe) → Bridge out, final 10–15s (one line + end card: what the full episode adds, where to find it).

**Retention at mid-form pace:** a visual change every **15–30 seconds** (punch-in, second cam, b-roll, graphic, chapter card) — slower than shorts, but the screen never sits still for a full minute. Every framework, list, or number gets on-screen text the moment it's spoken. Keep weighted pauses — mid-form has room for honest silence; shorts don't.

**Titles & platforms:** title as the question or the payoff, never a description ("Why cheap clients cost the most" beats "Guest talks about pricing"). YouTube: 16:9, end card with episode link, youtube-metadata standards. LinkedIn: native upload (never link-only), captions burned in, first three lines of post copy do the hook job, one closing line to the full episode.

**Mid-form output per segment:** the one-line question · timestamp in→out + duration after trims · cold-open pull with timestamp · context-bridge lines · internal trims with timestamps · the exact landing lines · bridge-out end-card line · graphics list (every number/framework with timestamps) · YouTube title · first three LinkedIn post lines.

## Quantity per episode (full ladder)

| Episode length | Shorts | Mid-form | Trailer |
|---|---|---|---|
| Under 15 min | 3–5 | 1 | 1 |
| 15–30 min | 5–7 | 1–2 | 1 |
| 30–60 min | 7–10 | 2 | 1 |
| 60+ min | 8–12 | 2–3 | 1 |

## Hand-off mode

If the user asks to **send this system to an editor** (rather than run it on a transcript), deliver `assets/HLP-Content-Engine-v3.pdf` (the master workflow — all three formats with copy-paste Claude prompts) and/or `assets/HLP-Clip-System-v2.pdf` (the short-form deep dive). DOCX versions ship alongside when the user wants editable copies. Don't regenerate the briefs from scratch.
