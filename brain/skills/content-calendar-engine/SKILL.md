---
name: content-calendar-engine
description: "Generates monthly content calendars with funnel-stage tagging, platform cadence, hooks, and CTAs for Churlish Media clients or for Churlish itself. Trigger this skill whenever the user asks for a content calendar, content plan, monthly content strategy, posting schedule, social media plan, content schedule, or any organized content output plan. Also trigger when the user says 'plan out content for', 'what should we post this month', 'content calendar for [client]', 'build a posting schedule', 'social plan for', or asks for a content strategy document that includes specific post-by-post planning. This skill produces either a .docx playbook or .xlsx spreadsheet (or both) with weekly breakdowns, funnel mix, hooks, CTAs, and platform-specific formatting notes. Always read the churlish-voice-guard skill first."
---

# Content Calendar Engine

Generates complete monthly content calendars for Churlish Media clients. Every calendar follows the Churlish funnel-mix methodology with platform-specific cadence, hook formulas, and CTA patterns.

## Dependencies

- **churlish-voice-guard skill** — Read voice-rules.md for caption tone and CTA style
- **ad-script-factory skill** — Reference hook-library.md when generating hooks for organic content (same formulas apply)
- **docx skill** — Use for playbook-style calendar documents
- **xlsx skill** — Use for spreadsheet-format calendars

## Before generating

Read these reference files:
1. `references/calendar-framework.md` — Funnel mix ratios, posting rhythms, and platform cadence rules
2. `references/content-formats.md` — Post types, story strategies, and format specs by platform

## Required inputs

Gather these from the user (ask if not provided):

1. **Client name** — Who is this for?
2. **Content pillars** — 3–5 topic categories (if not provided, propose pillars based on the client's industry and goals)
3. **Platforms** — Which platforms to plan for (Facebook, Instagram, YouTube, TikTok, LinkedIn, etc.)
4. **Posting frequency** — How many posts per week? (If not specified, default to the cadence rules in calendar-framework.md)
5. **Month/timeframe** — Which month or time period to plan
6. **Existing content assets** — Any videos, photos, transcripts, or blog posts to repurpose?
7. **Output format** — Spreadsheet (.xlsx), playbook (.docx), or both

## Output

Depending on user preference:

### Spreadsheet (.xlsx)
- Tab 1: Monthly calendar grid with date, platform, post type, funnel stage, hook, CTA, content pillar, and notes
- Tab 2: Content bank with additional post ideas organized by funnel stage
- Tab 3: Posting rhythm guide (weekly schedule breakdown)

### Playbook (.docx)
- Cover page with client name, month, and Churlish branding
- Weekly breakdowns with every post's hook, CTA, platform, format, and pillar tag
- Story strategy section
- Content mix ratios and funnel key
- Batch creation framework (how to produce a month of content in concentrated sessions)

### Both
- Generate both formats with consistent content across them

## Process

1. Read voice guard references
2. Read this skill's references (calendar-framework.md, content-formats.md)
3. Gather missing inputs
4. Propose content pillars if not provided (based on industry and client goals)
5. Generate the calendar following the funnel mix ratios
6. Write hooks and CTAs for every post using the voice guard style
7. Build the output file(s)
8. Present to user

## Quality checks

Before delivering, verify:
- [ ] Funnel mix is roughly correct (see calendar-framework.md for ratios)
- [ ] Every post has a specific hook — not "Post about [topic]" but the actual hook text
- [ ] Every post has a CTA appropriate to its funnel stage
- [ ] Platform cadence matches the rules (not 3 YouTube videos in one week, etc.)
- [ ] Content pillars are evenly distributed across the month
- [ ] No two consecutive posts hit the same funnel stage (variety keeps the feed interesting)
- [ ] Story content is planned separately from feed content
- [ ] The calendar is actionable — someone could hand this to an editor and they'd know exactly what to produce
