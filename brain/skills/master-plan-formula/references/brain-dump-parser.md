# Brain-Dump Parser

How to read a user's brain-dump of business information and extract the structure needed to build a Master Plan. The user will paste anything from a paragraph to multiple pages of raw text. This file teaches you what to look for and what to do when info is missing.

---

## What to extract

Read the brain-dump in one pass. Tag each piece of information into one of these buckets. **Don't invent — if it's not stated or implied, mark it MISSING.**

### Identity bucket
- **Business name** — what's it called?
- **What they do** — one-sentence description of the offering
- **Founder/owner** — who runs it?
- **Market/location** — where do they operate? (City, region, online-only?)
- **Time in business** — years operating
- **Team size** — solo, 2-5, 6-20, 20+

### Revenue bucket
- **Current annual revenue** — exact, range, or order of magnitude
- **Current MRR** — if subscription-based
- **Revenue distribution** — which offers/streams drive what %
- **Margin** — if stated
- **Cash position** — runway, reserves, debt if mentioned

### Offers bucket
- **Existing offers** — list each one named
- **Existing pricing** — for each offer
- **Pricing model** — hourly / project / retainer / subscription / per-unit
- **Minimum commitments** — if any
- **Most popular offer** — if mentioned

### Customer bucket
- **Customer profile (ICP)** — who they serve, demographics, firmographics
- **Customer count** — current active customers/clients
- **Customer acquisition source** — referral, paid, organic, partnerships
- **Retention** — if mentioned, anecdotal or quantified
- **Most valuable customer** — type or named example

### Pain bucket
- **Stated problems** — what the user says is broken
- **Implied problems** — what's broken based on what's described (e.g., "we don't really track this" implies a process gap)
- **Friction points** — what slows them down
- **Past failures** — what they tried that didn't work

### Aspiration bucket
- **Revenue target** — explicit number with timeframe if stated
- **Scale target** — team size, locations, customer count
- **Lifestyle target** — what the business should make possible for the owner
- **Exit target** — sale, succession, holding company

### Competitive bucket
- **Competitors named** — by name or category
- **Differentiation claimed** — what makes them different
- **Market position** — premium, mid-market, value, niche

### Constraint bucket
- **Capacity limits** — team, time, equipment
- **Tools/tech stack** — what they use to run the business
- **Geographic constraints** — service area
- **Regulatory constraints** — license requirements, compliance

---

## Default assumptions (when info is missing)

When the brain-dump is missing critical info, use these Churlish defaults rather than asking. Flag every assumption in the final doc with an `Assumption:` callout.

| Missing info | Default assumption |
|--------------|--------------------|
| Revenue target | 1.5× current annual revenue, achieved in 12 months |
| Pricing tier count | Three tiers (on-ramp / core / premium) |
| Minimum commitments | 3 months on lite, 6 months on core/premium |
| Pre-qualifier offer | $497 audit or paid diagnostic |
| Ad spend handling | Separate from retainer, $500/mo minimum |
| Pillar count | 3 pillars (cash flow / anchor / growth) |
| ICP | The most lucrative current customer type, scaled |
| Geographic reach | Stated market only, unless growth pillar implies expansion |
| Team scaling | Owner + 1 in critical role within 12 months if revenue target requires it |
| KPI review cadence | Weekly for revenue/pipeline, monthly for operations |
| Roadmap horizons | Right Now = 90 days, Growing = 90-365 days, Future = year 2-3 |
| Endgame timeline | 3 years out from plan date |

---

## When to ask vs assume

**Ask if missing AND high-stakes:**
- Revenue target (without one, the math has nothing to anchor to)
- Business type (service / product / SaaS / creator — changes the whole framework)
- Current revenue (without it, growth math is fabricated)
- The "one thing" the owner wants out of the plan (cash flow / authority / scale / exit)

**Assume + flag if missing AND low-stakes:**
- Specific KPI current values
- Specific competitor names
- Specific team member roles
- Tech stack details
- Margin specifics

Maximum **three** clarifying questions before writing the plan. If the brain-dump is too sparse for three questions to fill, ask once: *"This is a thin brain-dump — want to add more context, or should I work with defaults and flag assumptions throughout?"*

---

## Parsing patterns

### Pattern 1: Numbers near currency symbols
Scan for `$X`, `X dollars`, `X/mo`, `X per`, `X annually`. Tag each occurrence:
- Is it a price (offer) or a target (revenue)?
- Is it monthly or annual?
- Whose number is it — the business's or a competitor's?

### Pattern 2: Self-deprecation reveals gaps
Statements like:
- "We don't really do that well"
- "I should be tracking this"
- "We've been meaning to"
- "It's kind of all over the place"

…are gap signals. Translate into specific gap entries with appropriate severity.

### Pattern 3: "We" vs "I"
Watch pronouns:
- "I" everywhere → owner-dependent business, capacity gap likely
- "We" with named people → has team, look for role definition
- "The company" → may be aspirational framing for a solo operator

### Pattern 4: Aspirational vs current
Distinguish "we do X" from "we want to do X" from "we should do X." Aspiration goes in the Roadmap. Current state goes in the Operating Model and Revenue Model.

### Pattern 5: Buried numbers
Numbers stated in passing are often the most valuable. "Last year we did about a million, I think" is a revenue signal worth more than "we want to grow." Pull every number into the appropriate bucket even if mentioned casually.

---

## Output the parse before writing the plan

Before writing the Master Plan, briefly summarize what you parsed. Format:

```
Parsed from brain-dump:
- Business: [name] — [one-line description]
- Founder/Owner: [name]
- Market: [location/scope]
- Current revenue: [stated] (or "MISSING — assuming [default]")
- Team: [size]
- Existing offers: [list]
- Revenue target: [stated] (or "MISSING — using default 1.5×")
- Stated pain points: [list]
- Aspirations: [list]
- Key gaps inferred: [list]
- Assumptions being made: [list]
```

Confirm with the user OR proceed directly if the parse is clearly complete. For confident parses, proceed without asking. For thin parses, ask the one critical question and proceed.

---

## Edge cases

### Pre-revenue business
- Revenue Model uses projected/target numbers only, flagged as projections
- KPIs section becomes "Instrumentation Plan" — what to measure once operating
- Gap Analysis focuses on positioning and offer-build gaps
- Roadmap Right Now phase is launch milestones

### Solo creator / personal brand
- Pillars are content streams, not business units (e.g., YouTube / Newsletter / Community)
- Pricing Architecture includes sponsorship tiers + creator-product tiers
- Service Ladder is free content → low-ticket digital → high-ticket cohort/coaching
- Endgame often involves audience size + brand position, not revenue alone

### Acquisition / multi-entity
- Operating Model has one pillar per acquired/operating entity
- Pricing Architecture might be skipped (each entity has its own)
- Revenue Model rolls up entities
- Gaps section addresses integration, brand consolidation, ops harmonization

### Idea-stage / pre-launch
- Treat the whole plan as a hypothesis-test plan
- Revenue Model = "$0 today → first revenue milestone in 90 days"
- Roadmap Right Now = launch readiness items
- Gap Analysis = capabilities the founder needs to acquire/hire

---

## Don't fabricate

The single most important rule. Better to flag an assumption than invent a fact. Better to ask a question than guess at one. The Master Plan's value depends on its accuracy — the moment the user reads a fabricated number or invented competitor, the document loses authority.

When in doubt: flag, ask, or omit. Never invent.
