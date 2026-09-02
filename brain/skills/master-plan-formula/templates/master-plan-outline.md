# Master Plan Outline

The 10-section structure of every full Master Plan. Use this as the build order. Each section's content is in `references/section-templates.md`; the formula behind each is in `references/churlish-formula.md`.

---

## Standard build order

```
Doc Header
├── Title (last word in teal)
├── Subtitle (Churlish Media · Strategic Document or [Business Name] · Strategic Plan)
├── Meta (prepared for / version / date)
└── Optional: draft badge

Table of Contents (optional but recommended for 7+ sections)

Section 01 — The Strategic Bet
├── The Position (callout)
└── 3-5 sentence thesis paragraph

Section 02 — The Operating Model
├── 1-2 sentence framing
└── Grid of 3-5 pillar cards
    └── Each: name | role | pitch | pricing tag | status tag

Section 03 — Pricing Architecture
├── 1-2 sentence framing
└── 3-tier pricing grid (dark or light cards)
    └── Each: name | tagline | sub | features | price | commitment

Section 04 — Service Ladder
├── 1 sentence framing
└── Horizontal 3-rung ladder
    └── Each: number | name | description

Section 05 — Revenue Model
├── Cash-hero headline (target + date)
├── Subhead sentence
└── Metric table with math breakdown

Section 06 — KPIs and Tracking
├── 1 sentence framing
├── Revenue & Pipeline KPIs (table)
├── Operations KPIs (table)
└── Marketing & Acquisition KPIs (table)

Section 07 — Gap Analysis
├── 1 sentence framing
└── 5-10 gaps with colored swatches (red/gold/teal)
    └── Each: title | body | severity

Section 08 — Roadmap / Phases
├── 1 sentence framing
└── 3 phase cards (rev-now / rev-growing / rev-future)
    └── Each: phase name | horizon | 3-5 outcomes

Section 09 — The Endgame
├── Endgame hero (dark block)
│   ├── Label
│   ├── Title (with one word in gold)
│   └── Vision sentence
└── Optional: 2-pillar grid showing supporting elements

Section 10 — Q&A / Internal Notes
├── 1 sentence framing
└── 5-8 Q&A blocks

Page Footer
```

---

## Section length guide

For a "standard" Master Plan, target these section lengths (approximate, in HTML render):

| Section | Length |
|---------|--------|
| 01 — Strategic Bet | 1 callout + 1 paragraph |
| 02 — Operating Model | 1 paragraph + grid (3-5 cards) |
| 03 — Pricing Architecture | 1 paragraph + 3-card grid |
| 04 — Service Ladder | 1 paragraph + ladder row |
| 05 — Revenue Model | Cash hero + metric table (8-12 rows) |
| 06 — KPIs | 3 metric tables (6-12 KPIs total) |
| 07 — Gap Analysis | 1 paragraph + 5-10 gap-pattern blocks |
| 08 — Roadmap | 1 paragraph + 3-card grid (with detailed body text) |
| 09 — Endgame | Endgame hero + optional 2-pillar grid |
| 10 — Q&A | 1 paragraph + 5-8 qa-blocks |

Total document: typically 8-15 printed pages, 15-30 minutes to read carefully.

---

## When to deviate

The 10-section structure is the standard, but real plans collapse or expand based on the business:

**Collapse when:**
- Pre-revenue startup: collapse Revenue Model (05) and Roadmap (08) into "Revenue Plan & Phases"
- Solo creator: collapse Operating Model (02) and Service Ladder (04) into "The Content Ecosystem"
- Single-product business: collapse Pricing Architecture (03) and Service Ladder (04) into "Pricing & Path"

**Expand when:**
- Multi-entity / acquisition business: split Operating Model (02) into one section per entity
- High-complexity gap analysis: split Gap Analysis (07) into separate sections by category (Process / Pricing / Positioning)
- Multi-market business: add a "Market Strategy" section between 01 and 02

Never go below 6 sections (becomes a summary, not a plan). Never go above 14 (becomes unreadable).

---

## File naming convention

```
[Business_Name]_Master_Plan_v[N].html
[Business_Name]_Master_Plan_v[N].pdf
[Business_Name]_Master_Plan_v[N].docx
```

Use underscores. PascalCase or snake_case both fine. Match the business name to how the brain-dump references it.

Examples:
- `Churlish_Media_Master_Plan_v1.html`
- `Roof_Tulsa_Master_Plan_v2.pdf`
- `Elite_Sales_Training_Master_Plan_v1.docx`
