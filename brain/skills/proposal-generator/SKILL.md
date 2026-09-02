---
name: churlish-proposal-generator
description: "Generates complete client proposals for Churlish Media using the Authority Engine methodology and tiered pricing structure. Trigger this skill whenever the user asks to create a proposal, pitch, quote, scope of work, or engagement document for a prospective or existing Churlish Media client. Also trigger when the user mentions 'proposal for [client name]', 'draft a pitch', 'build out a scope', 'put together pricing for', 'proposal in our style', or references any new prospect who needs a Churlish engagement document. This skill produces ready-to-send .docx proposals with Churlish branding, tiered pricing, avatar-specific pain language, and the Authority Engine framework. Always read the churlish-voice-guard skill first if available, then read this skill's references before generating."
---

# Churlish Proposal Generator

Generates complete, branded .docx proposals for Churlish Media client engagements. Every proposal follows the same structural DNA but adapts language, pricing, and positioning to the specific prospect's industry, business size, and pain points.

## Dependencies

- **churlish-voice-guard skill** — Read the voice rules before writing any proposal copy. The proposal should sound like Brandon diagnosing a situation, not a marketing agency pitching services.
- **docx skill** — Use for document creation. Follow the docx skill's technical instructions for building the .docx file.

## Before generating

Read these reference files in order:
1. `references/proposal-architecture.md` — The structural template and section-by-section instructions
2. `references/pricing-engine.md` — Tier logic, pricing ranges, and what's included at each level
3. `references/industry-angles.md` — Vertical-specific pain points and positioning hooks

## Required inputs

Before building a proposal, gather these from the user (ask if not provided):

1. **Prospect name** — Business name and contact name
2. **Industry / vertical** — What kind of business (roofing, fitness, woodworking, coaching, etc.)
3. **Estimated revenue** — Annual revenue range or business size indicator
4. **Current marketing situation** — What they're doing now (nothing, basic social, had an agency, DIY)
5. **Primary pain point** — What brought them to the conversation (no leads, inconsistent content, no authority, competing on price)
6. **Pricing range** — Which tiers to include and any custom pricing the user specifies
7. **Special elements** — Mini content calendar? Ad creative samples? Competitor analysis?

If the user provides a Facebook page URL, website, or other link, fetch it first to extract business details and current marketing state before building the proposal.

## Output

A complete .docx file saved to `/mnt/user-data/outputs/` with:
- Churlish Media branded formatting (cream background, teal/gold/red accents, Arial/Arial Black typography)
- All proposal sections populated with prospect-specific copy
- Tiered pricing table with side-by-side comparison
- Optional mini content calendar
- Ready to send — no placeholder text, no "[INSERT X]" fields

## Process

1. Read voice guard references (voice-rules.md, visual-identity.md)
2. Read this skill's references (proposal-architecture.md, pricing-engine.md, industry-angles.md)
3. If URLs provided, fetch and analyze the prospect's current digital presence
4. Gather any missing required inputs from the user
5. Generate all proposal copy using the voice guard rules
6. Build the .docx using the docx skill
7. Validate and present to the user

## Quality checks

Before delivering, verify:
- [ ] The opening section names the prospect's specific pain, not generic marketing problems
- [ ] Every tier has specific deliverables with quantities (not "content creation" but "8–12 short-form pieces")
- [ ] Proof/social proof is included (reference real Churlish results where relevant)
- [ ] The pricing table makes the middle tier the obvious choice (anchoring)
- [ ] The CTA is one clear next step, not multiple options
- [ ] No banned phrases from the voice guard
- [ ] The document reads like a diagnosis, not a sales pitch
