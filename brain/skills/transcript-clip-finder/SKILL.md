---
name: transcript-clip-finder
description: "Analyzes video/podcast transcripts to identify the strongest short-form clip opportunities for Churlish Media clients. Trigger this skill whenever the user uploads a transcript and asks to find clips, pull highlights, identify short-form moments, find the best parts, extract video clips, or select content for Reels/Shorts/TikTok. Also trigger when the user says 'find clips from this', 'what should we cut from this', 'pull the best moments', 'short-form from this transcript', 'which parts should we clip', or provides a transcript with any request to identify content worth cutting into standalone short-form pieces. This skill reads transcripts, scores moments by hook strength and standalone clarity, and outputs timestamped clip recommendations with suggested hooks and platform targets."
---

# Transcript Clip Finder

Analyzes long-form video or podcast transcripts and identifies the 5–10 strongest moments for short-form content. Every recommendation includes the timestamp range, a suggested hook, the target platform, and why it works as a standalone piece.

## Dependencies

- **churlish-voice-guard skill** — Reference for evaluating whether a clip's language matches the client's voice
- **ad-script-factory skill** — Reference hook-library.md when crafting suggested hooks for clips

## How to use

1. User uploads or pastes a transcript (usually with timestamps in format `HH;MM;SS;FF` or `HH:MM:SS`)
2. Read the full transcript
3. Score every distinct segment against the clip criteria below
4. Rank and select the top 5–10 moments
5. Output the clip sheet

## Clip selection criteria

Score each potential clip on these 5 factors (each 1–5):

### 1. Hook strength (weight: highest)
Does the segment open with or contain a line that would stop someone scrolling? Look for: bold claims, specific numbers, emotional statements, contrarian takes, vulnerable admissions, or unexpected revelations. A clip with a weak opening needs a recut — note this in the recommendation.

### 2. Standalone clarity (weight: high)
Can someone who hasn't watched the full video understand this clip without context? Clips that require setup from earlier in the conversation score low. The best clips are self-contained stories or insights.

### 3. Avatar relevance (weight: high)
Would the target audience's avatar care about this specific moment? A technically interesting tangent that doesn't connect to the viewer's pain, aspiration, or identity scores low. The clip must earn its spot in someone's feed.

### 4. Emotional resonance (weight: medium)
Does the moment carry energy — excitement, frustration, conviction, humor, vulnerability? Flat delivery of good information is less clippable than passionate delivery of decent information. Note energy peaks.

### 5. Quotability (weight: medium)
Does the segment contain a line someone would screenshot, share, or remember? "That's not a business — that's a really expensive hobby you haven't figured out how to quit yet" is quotable. A 45-second explanation of CRM features is not.

## Output format

For each recommended clip, provide:

```
CLIP [N]: [Suggested title]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Timestamp:     [START] → [END]
Duration:      [Xs]
Platform:      [Best fit — Reels/Shorts/TikTok/LinkedIn/All]
Funnel stage:  [TOF/MOF/BOF]
Score:         [Total /25]

SUGGESTED HOOK:
"[The opening line for the clip — may be the speaker's actual words or a rewritten hook for text overlay]"

WHY THIS WORKS:
[1–2 sentences explaining why this moment is clippable — which criteria it scores highest on]

EDITING NOTES:
[Any specific instructions — trim the first 3 seconds, add text overlay at X point, cut before the tangent at Y, use b-roll over the slow section, etc.]
```

## Transcript reading approach

### Pass 1: Scan for energy peaks
Read through quickly looking for moments where the speaker's language intensifies — stronger words, specific numbers, emotional weight, humor, or conviction. Mark these.

### Pass 2: Evaluate standalone quality
For each marked moment, check: does it make sense without the preceding context? If not, can the clip be widened slightly to include the necessary setup? If the setup is more than 10 seconds, the clip loses its punch.

### Pass 3: Score and rank
Apply the 5 criteria. Select the top 5–10. Ensure variety — don't select 5 clips that all hit the same topic. Spread across funnel stages and content pillars where possible.

### Pass 4: Craft hooks and notes
For each selected clip, write the suggested hook (which may be the speaker's actual opening line if it's strong enough, or a rewritten text overlay if the clip needs a stronger entry point). Add editing notes for anything that requires trimming, reordering, or enhancement.

## Common transcript formats

Transcripts may arrive in various formats:
- **Timestamped (HH;MM;SS;FF or HH:MM:SS):** Most common. Use timestamps directly.
- **Speaker-labeled:** May have "Speaker 1:" or actual names. Note who's speaking in clip recommendations.
- **Raw text (no timestamps):** Note approximate position (beginning/middle/end of conversation, or paragraph number) and flag that exact timestamps will need to be pulled from the video.
- **Auto-generated (YouTube, Otter.ai, etc.):** May have errors. Read for intent, not literal accuracy.

## Quantity guidance

- **For a 15–30 minute video:** Recommend 5–7 clips
- **For a 30–60 minute video:** Recommend 7–10 clips
- **For a 60+ minute video or podcast:** Recommend 8–12 clips
- **For a short interview or testimonial (under 15 min):** Recommend 3–5 clips

Always prioritize quality over quantity. If a transcript only has 3 genuinely strong moments, recommend 3 — don't pad the list with mediocre clips.
