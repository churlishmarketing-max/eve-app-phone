---
name: avatar-bible-loader
description: "Stores and serves detailed client avatar profiles for Churlish Media engagements, providing the target audience context that other skills need to produce client-specific copy. Trigger this skill whenever the user asks to create an avatar profile, build a customer avatar, define a target audience for a client, update an existing avatar, or when any other skill needs avatar context for a specific client. Also trigger when the user says 'avatar for [client]', 'who are we targeting for', 'build the avatar bible for', 'update the avatar for', 'target audience for [client]', or references needing audience context to write copy, ads, content, or strategy documents. This is a foundational skill — other skills reference avatar profiles to make their output client-specific instead of generic."
---

# Avatar Bible Loader

Creates, stores, and serves detailed avatar profiles for every Churlish Media client engagement. The avatar bible is the context layer that turns generic marketing output into client-specific copy that sounds like it was written by someone who knows the audience personally.

## Dependencies

- **churlish-voice-guard skill** — The avatar profile should capture how the client's audience talks, not how marketers describe them

## What an avatar profile contains

Every avatar profile follows this structure. Read `references/avatar-template.md` for the full template with field-by-field guidance.

### Required fields:
1. **Avatar name** — A descriptive persona name (e.g., "The $30K Craftsman," "The Overworked Contractor," "The Stuck Coach")
2. **Demographics** — Age range, gender mix, location, income range, business size
3. **Current situation** — What their day-to-day looks like. What they're doing right now for marketing/growth/the problem we solve.
4. **Pain points** — The specific frustrations they feel, stated in their language (not marketing language)
5. **Goals / aspirations** — Where they want to be. What success looks like to them.
6. **Objections** — The reasons they'll hesitate to buy. The things they'll say on a discovery call before committing.
7. **Trigger events** — What happens in their life/business that makes them ready to act NOW (slow season, lost a big client, saw a competitor growing, etc.)
8. **Media consumption** — Where they spend time online, what they watch/read/listen to, who they follow
9. **Language patterns** — How they describe their own problems. Direct quotes or representative phrasing. This is the most important field for writing copy that resonates.

### Optional fields:
10. **Competitor awareness** — Who else they might be considering (other agencies, DIY tools, freelancers)
11. **Decision-making process** — Do they decide alone or with a partner/spouse? How long does the decision take?
12. **Budget psychology** — How they think about spending money. Price-sensitive? Investment-minded? Impulse vs. deliberate?

## How other skills use avatar profiles

When another skill (proposal generator, ad script factory, content calendar engine, etc.) is producing output for a specific client, it should check whether an avatar profile exists for that client. If it does:

- **Proposal generator:** Use pain points and language patterns in the Situation section. Use objections to pre-handle in the Approach section.
- **Ad script factory:** Use pain points for call-out copy. Use language patterns for hooks. Use trigger events to time campaigns.
- **Content calendar engine:** Use goals/aspirations for TOF content themes. Use objections for MOF content. Use trigger events for seasonal content timing.
- **Email sequence writer:** Use objections for email 2-3 content. Use language patterns in every email.

## Creating a new avatar profile

### From a discovery call or client conversation:
The user may provide notes, a transcript, or a verbal summary. Extract avatar details from what they share and fill in gaps with industry knowledge and informed assumptions (always flag assumptions).

### From scratch for a new industry:
When there's no client conversation to draw from, build the avatar using industry research, the industry-angles.md reference from the proposal generator skill, and web search if available. Flag the entire profile as estimated and recommend refining it after the first discovery calls.

### From an existing Churlish engagement:
Search past conversations for any avatar-relevant details about the client's audience. Pull from proposals, strategy docs, ad scripts, and content plans already created.

## Updating an avatar profile

Avatar profiles should evolve as the engagement deepens. After the first 30-60 days of working with a client, the team learns things about the audience that the initial profile didn't capture. When the user says "update the avatar" or provides new audience insights, modify the profile and note what changed and why.

## Process

1. Determine if this is a new avatar or an update to an existing one
2. If new: gather inputs (client details, target audience description, any discovery call notes)
3. If update: search past conversations for the existing profile and the new information
4. Read references/avatar-template.md for the full template
5. Build or update the profile
6. Deliver inline for quick reference, or as .docx for the client file

## Quality checks

- [ ] Pain points are stated in the avatar's language, not marketing jargon ("I can't figure out why my ads aren't working" not "Suboptimal ROAS due to targeting inefficiencies")
- [ ] At least 3 specific objections are listed (these drive the most valuable copy)
- [ ] Language patterns include actual phrases or representative quotes
- [ ] The profile is specific enough to distinguish this avatar from a generic "small business owner"
- [ ] Assumptions are flagged as assumptions
