---
name: churlish-master-plan-formula
description: Builds complete strategic master plans for any business by ingesting a brain-dump and structuring it via the Churlish strategic formula (strategic bet, operating model, pricing architecture, service ladder, revenue model, KPIs, gap analysis, roadmap, endgame, Q&A). Always produces two paired deliverables — a full 10-section Master Plan AND a 5-section Executive Summary. Use whenever the user wants a master plan, business strategy doc, growth plan, gameplan, operating model, or strategic framework for Churlish itself, a Churlish client, or any third-party brand. Trigger on "build a master plan for [business]," "draft a strategic plan for," "structure this business," "turn this brain-dump into a plan," "build a gameplan for [client]," "apply the Churlish formula to," or pastes of business info asking for a plan. Adapts to service, product, SaaS, creator, coaching, and performance businesses. Pairs with churlish-master-plan-style for visual treatment.
---

# Churlish Master Plan Formula

## What this skill does

This skill takes a **brain-dump of business information** and structures it into a complete strategic Master Plan using Churlish Media's proven strategic formula. It always produces two paired deliverables:

1. **Full Master Plan** — 10-section strategic document (the deep version)
2. **Executive Summary** — 5-section condensed version (the share-with-stakeholders version)

Both are produced as triple-output (HTML + PDF + DOCX) using the visual style from the paired `churlish-master-plan-style` skill.

The skill works for **any business** — Churlish itself, Churlish clients, third-party brands the user wants to strategize, or hypothetical/prospective businesses. The Churlish framework is the default lens, but the skill adapts the framework to the business type (service / product / SaaS / creator / agency / etc.).

## When to trigger

Trigger this skill whenever the user wants to:
- Build a Master Plan, strategic plan, gameplan, or operating model for any business
- Structure a brain-dump of business info into a strategic document
- Apply the Churlish strategic formula to a business
- Produce a full strategic gameplan + executive summary for stakeholders

Common phrasings:
- "Build a master plan for [business name]"
- "Turn this brain-dump into a plan"
- "Strategize this business: [paste]"
- "I need a gameplan for [client/brand]"
- "Apply the Churlish formula to [business]"
- "Draft a strategic plan based on this: [paste]"

If the user is asking about visual treatment only (no strategic content needed), route to `churlish-master-plan-style` instead. If they want both — content AND visual — this skill does both and uses the style skill's references.

## Build sequence

### Step 1: Receive and parse the brain-dump

The user will paste raw information about the business. Read `references/brain-dump-parser.md` for the full parsing protocol. Extract:

- **Business identity** — name, founder, market, location, years in business
- **Current state** — revenue, team size, existing offers, current pricing
- **Channels** — how they get clients now (referral, paid ads, organic, etc.)
- **Customer profile** — who they serve, ICP if stated
- **Pain points / gaps** — what's broken, what's leaking
- **Aspirations / goals** — revenue targets, scale, vision
- **Competitive context** — competitors named, market position
- **Constraints** — team capacity, cash, time

Note what's **explicitly stated** vs **implied** vs **missing entirely**. Don't invent facts. For missing critical info, ask 1-3 targeted clarifying questions BEFORE writing the plan — but only if missing the info would lead to fabrication. Default assumptions (with explicit "Assumption" flags in the doc) are preferred over interrogation.

### Step 2: Apply the strategic formula

Read `references/churlish-formula.md` for the full methodology. The formula structures any business into 10 sections:

1. **The Strategic Bet** — one-paragraph thesis statement about the business's position
2. **The Operating Model** — 3-5 pillars (revenue streams / business units)
3. **Pricing Architecture** — tiered offers with minimum commitments
4. **Service Ladder** — the customer journey path (audit → core → premium)
5. **Revenue Model** — the math to the revenue target
6. **KPIs and Tracking** — what gets measured (`references/kpi-library.md`)
7. **Gap Analysis** — where the business is leaking (red/gold/teal severity)
8. **Roadmap / Phases** — Right Now / Growing / Future sequencing
9. **The Endgame** — 3-5 year vision statement
10. **Q&A / Internal Notes** — anticipated questions, decisions still pending

Adapt section names and content to the business type. For a product business, "Service Ladder" becomes "Product Ladder." For a creator, "Pricing Architecture" might include sponsorship tiers. Read `references/pricing-architectures.md` for business-type variants.

### Step 3: Apply the Churlish defaults

Whenever info is missing, apply Churlish defaults rather than inventing or asking. These defaults are battle-tested:

- **Minimum commitments** — always have one. 3 months on lite tier, 6 months on premium.
- **Three-tier pricing** — on-ramp / core / premium. Middle tier is the anchor and gets the POPULAR ribbon.
- **Paid pre-qualifier** — small paid offer ($297-$997) to filter buyers before retainer.
- **Ad spend separate** — never bundled into retainer. $500/mo minimum if relevant.
- **Never discount first month** — discounts on month 3+ if needed, never month 1.
- **Project work as on-ramp** — Quick Win ($997) / Sprint ($3,500) / Foundations as ladder rungs.
- **Frameworks** — Hormozi (offer construction), Brunson (hook → story → offer), Voss (negotiation), NEPQ (sales). See `references/frameworks.md`.

Flag each default assumption with a callout in the doc so the user can override.

### Step 4: Write the strategic content

Use the section templates in `references/section-templates.md`. Each template shows:
- What goes in the section
- Example content from real Master Plans
- How to adapt for different business types
- The component types from the style skill that fit best

Write content in the Churlish voice — direct, conversational authority, no corporate jargon. Apply the banned-phrase list from the user's preferences (no "leverage," "synergy," "move the needle," etc.). If unsure about voice, read the `churlish-voice-guard` skill.

### Step 5: Build the executive summary

After the full plan, build the condensed version. Read `templates/exec-summary-outline.md`. The exec summary keeps:

1. The Strategic Bet (the thesis paragraph — verbatim from full plan)
2. The Operating Model (pillars condensed — name + one-liner each)
3. Pricing Architecture (the comparison table only)
4. Revenue Model (the math — cash hero + key metric table)
5. The Endgame (the vision statement — verbatim from full plan)

Typically 1-2 pages in print. Same visual style, same triple output. This is the version the user shares with co-founders, advisors, partners, or potential investors.

### Step 6: Render via the style skill

Both deliverables are rendered using `churlish-master-plan-style`. Read that skill's references:

- `references/fonts.css` (paste into `<style>` block)
- `references/styles.css` (paste into `<style>` block)
- `references/components.md` (HTML patterns for each section)
- `references/workflow.md` (HTML → PDF → DOCX build process)

Apply the visual style to the strategic content produced in steps 2-5. The strategic formula determines *what's in the document*; the style skill determines *what it looks like*.

### Step 7: Save and present

Six files total go to `/mnt/user-data/outputs/`:

```
[Business]_Master_Plan_v1.html
[Business]_Master_Plan_v1.pdf
[Business]_Master_Plan_v1.docx
[Business]_Executive_Summary_v1.html
[Business]_Executive_Summary_v1.pdf
[Business]_Executive_Summary_v1.docx
```

Call `present_files` with all six. Order: full plan PDF first (most likely to open), then exec summary PDF, then editable docs. Keep the post-amble brief.

## The Churlish strategic formula — one-page summary

The full methodology is in `references/churlish-formula.md`. Quick reference:

**Position before promotion.** Every business is sold the wrong problem — they think they need more leads. They need a clearer position. The Master Plan starts by naming the position, not the marketing tactics.

**Pillars, not products.** A business has 3-5 revenue pillars. Each pillar has a distinct role (cash flow / brand / scale / IP). Pricing, marketing, and operations are organized by pillar.

**The ladder is the offer.** Customers don't buy the top tier first. They buy a $497 audit, see the work, buy the subscription, then buy the retainer. Every business needs three rungs: pre-qualifier → core → premium.

**Math the revenue target.** Don't just state "$200K." Show the math: X clients × Y price × Z months = target. If the math doesn't work, the offer or the price needs to change — not the goal.

**Phase the future.** Don't try to launch everything at once. Right Now (cash flow). Growing (anchor offer). Future (IP / community / scale). Three time horizons, sequenced.

**Name the gaps.** Most strategy docs paper over weakness. The Master Plan names every gap explicitly — process, pricing, positioning, capacity — and assigns severity (red = bleeding, gold = friction, teal = noted).

**End with the vision, not the to-do list.** The endgame statement is the *why this matters.* One sentence. Specific. Memorable. The whole plan exists to deliver that sentence.

## Adapting for non-service businesses

The framework is service-business-native but adapts. Quick map:

| Service business | Product business | SaaS | Creator |
|------------------|------------------|------|---------|
| Service Ladder | Product Ladder (lead magnet → entry SKU → flagship) | Free → Pro → Enterprise | Free content → low-ticket → high-ticket |
| Retainer pricing | Per-unit pricing with tiers | Subscription tiers | Sponsorship + course tiers |
| Hours / capacity | Inventory / supply chain | Active seats / usage | Audience size / engagement |
| Client retention | Repeat purchase rate | Net Revenue Retention | Subscriber retention |
| Authority Engine pillar | Brand + retail pillars | Acquisition + Expansion pillars | Audience + Monetization pillars |

When in doubt, default to the service-business framing — it's the most rigorous version and adapts cleanest.

## Quality bar

Before presenting:

- [ ] All 10 sections present in full plan
- [ ] All 5 sections present in exec summary
- [ ] Revenue model math is explicit and adds up to the stated target
- [ ] Pricing architecture has 3 tiers with stated minimums
- [ ] At least one gap named in red (the bleeding issue)
- [ ] Endgame statement is specific (a date, a number, a position — not "be the best")
- [ ] No corporate jargon (see banned phrases list)
- [ ] Every assumption is flagged with an "Assumption:" callout
- [ ] Both files (full plan + exec summary) cover the same strategic content — exec summary is a compression, not a different argument
- [ ] All 6 files saved to `/mnt/user-data/outputs/`
- [ ] Visual style matches the Master Plan reference (cream bg, teal/red/gold, Barlow Condensed headlines)

## What this skill does NOT cover

- The visual treatment / CSS / fonts — those live in `churlish-master-plan-style`
- Tactical marketing plans (specific ad campaigns, content calendars) — those are in `ad-script-factory`, `content-calendar-engine`, `email-sequence-writer`
- Client-facing proposals (pitch documents for sales) — those are in `churlish-proposal-generator`
- Pure DOCX strategy docs without HTML/PDF — those are in `strategy-doc-builder`
- Voice and copy enforcement — that's in `churlish-voice-guard`

This skill produces **the strategic content and structure**. It pairs with the style skill to produce the final visual deliverables. For anything more tactical or different in format, route to the appropriate skill above.
