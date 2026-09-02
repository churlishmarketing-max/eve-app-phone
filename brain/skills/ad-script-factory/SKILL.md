---
name: ad-script-factory
description: "Generates direct-response ad scripts, video scripts, and ad creative copy in the Churlish Media call-out style. Trigger this skill whenever the user asks for ad copy, ad scripts, video ad scripts, Meta ad creative, Facebook ad copy, Instagram ad copy, YouTube ad scripts, CTV scripts, UGC scripts, carousel ad copy, static ad copy, retargeting ad copy, or any paid advertising creative for a Churlish Media client or for Churlish itself. Also trigger when the user says 'write an ad for', 'call-out ad', 'ad creative for', 'script for a Meta ad', 'Facebook ad for', 'write me a hook', 'pattern interrupt for', or references writing advertising content in the Churlish direct-response style. This skill produces platform-ready ad scripts with hooks, pain call-outs, proof stacking, offers, and CTAs — all in the Churlish voice. Always read the churlish-voice-guard skill first."
---

# Ad Script Factory

Generates complete, platform-ready ad scripts and creative copy for Churlish Media clients. Every ad follows the Churlish direct-response methodology: pattern interrupt → pain call-out → pivot → proof → offer → CTA.

## Dependencies

- **churlish-voice-guard skill** — Read voice-rules.md before writing any ad copy. The call-out style section is especially critical here.
- **docx skill** — Use when the user wants the output as a formatted document.

## Before generating

Read these reference files:
1. `references/ad-formats.md` — Every supported format with structure, timing, and platform specs
2. `references/hook-library.md` — Hook formulas and pattern interrupt techniques by category

## Required inputs

Gather these from the user (ask if not provided):

1. **Client name** — Who is this for?
2. **Product or service** — What are we selling / promoting?
3. **Target avatar** — Who is this speaking to? (If a Churlish client with an existing avatar bible, reference it)
4. **Primary pain point** — The central tension the ad exploits
5. **Proof / social proof** — Specific numbers, results, testimonials, or credentials to reference
6. **The offer** — What the viewer gets and what it costs (or what the next step is)
7. **Platform(s)** — Meta (Facebook/Instagram), YouTube, CTV, TikTok, LinkedIn, or multi-platform
8. **Format(s)** — Video script, static ad copy, carousel, UGC brief, or full creative package

If the user provides a URL (client website, product page, competitor), fetch it first to extract details.

## Output formats

Depending on what the user requests:

- **Single ad script** — Delivered inline in the conversation with clear section labels
- **Ad creative package** — Multiple formats for the same campaign, delivered as a .docx
- **Hook variations** — 3–5 alternative hooks for A/B testing
- **Full campaign package** — Multiple ads across formats and funnel stages (TOF/MOF/BOF), delivered as a .docx

## Process

1. Read voice guard references
2. Read this skill's references (ad-formats.md, hook-library.md)
3. If URLs provided, fetch and analyze
4. Gather missing inputs
5. Determine the right format(s) based on platform and objective
6. Write the ad(s) using the call-out formula
7. If multiple formats requested, build as .docx with clear sections
8. Present to user

## Quality checks

Before delivering, verify:
- [ ] The hook earns the first 3 seconds (video) or stops the scroll (static). If the opening is deletable, rewrite it.
- [ ] Pain language mirrors how the avatar actually talks about their problem — not how a marketer describes it
- [ ] Specific proof is included (numbers, names, timelines — not vague claims)
- [ ] The offer is crystal clear — what they get, what it costs, what to do
- [ ] One CTA, not three
- [ ] No banned phrases from the voice guard
- [ ] Script length matches platform (15s/30s/60s for video, character limits for static)
- [ ] The ad could run tomorrow — no placeholder text, no "[INSERT TESTIMONIAL]"
