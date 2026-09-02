---
name: youtube-metadata
description: "Generates optimized YouTube titles, descriptions, tags, thumbnail concepts, and chapter markers for Churlish Media client channels and Brandon's own channel. Trigger this skill whenever the user asks for YouTube titles, video descriptions, YouTube tags, thumbnail ideas, video SEO, YouTube metadata, chapter timestamps, or any YouTube publishing optimization. Also trigger when the user says 'title options for this video', 'write a YouTube description', 'tags for this video', 'thumbnail concept for', 'optimize this for YouTube', or references any YouTube content that needs metadata before publishing. This skill produces search-optimized, click-worthy metadata that balances discoverability with the Churlish authority positioning style."
---

# YouTube Metadata Optimizer

Generates complete YouTube metadata packages — titles, descriptions, tags, thumbnail concepts, and chapter markers — optimized for both search discoverability and click-through rate.

## Dependencies

- **churlish-voice-guard skill** — Read voice-rules.md for headline tone (titles should feel Churlish, not generic clickbait)

## Before generating

Read the reference file:
1. `references/metadata-formulas.md` — Title formulas, description templates, tag strategy, and thumbnail principles

## Required inputs

Gather from the user (ask if not provided):

1. **Video topic / content summary** — What the video is about (a transcript, outline, or brief description)
2. **Channel** — Which channel this is for (Brandon King, a client channel, etc.)
3. **Target audience** — Who should find and click this video
4. **Primary keyword** — The main search term this video should rank for (if the user doesn't know, suggest options based on the topic)
5. **Video length** — For chapter marker planning

## Output

A complete metadata package:

### Titles (3–5 options)
Ranked by approach (curiosity-driven, keyword-forward, contrarian, etc.) so the user can pick based on their priority (SEO vs. CTR vs. brand positioning).

### Description
Full YouTube description with:
- Hook paragraph (first 2 lines — visible above the fold in search results)
- Video summary with natural keyword integration
- Chapter markers / timestamps (if video is 5+ minutes)
- CTA section (subscribe, links, next video)
- Tags section (embedded naturally, not keyword-stuffed)

### Tags (15–25)
Mix of broad, medium, and long-tail keywords. Include the primary keyword, variations, related topics, and channel-specific tags.

### Thumbnail concept
A text description of what the thumbnail should look like — composition, text overlay (3–5 words max), expression/emotion, color treatment. Following the Churlish visual style (bold text, high contrast, teal/red accent).

### Chapter markers
Timestamped chapters for videos over 5 minutes. Each chapter gets a descriptive title (not just "Introduction" / "Main Point" — use hooks).

## Process

1. Read voice guard references
2. Read this skill's metadata-formulas.md reference
3. Analyze the video topic / transcript for key moments and searchable angles
4. Research the primary keyword (if web search available, check what's currently ranking)
5. Generate the full metadata package
6. Present to user

## Quality checks

- [ ] Title is under 60 characters (doesn't get truncated in search)
- [ ] Title contains the primary keyword naturally (not forced)
- [ ] First 2 lines of description work as a standalone hook in search results
- [ ] Tags include the primary keyword as the first tag
- [ ] Thumbnail concept uses 5 words or fewer as text overlay
- [ ] Chapter markers have hook-style titles, not generic labels
- [ ] The metadata package could be copy-pasted directly into YouTube Studio
