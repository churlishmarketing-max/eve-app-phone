# Section Templates

Templates for writing the content of each Master Plan section. Each template includes structure, example content, and component-from-style-skill mapping.

Use these as starting points. The exact prose adapts to the business — but the structure and component choices are consistent across all Master Plans.

---

## 01 — The Strategic Bet

**Structure:**
- 3-5 sentences
- Open with the market reality
- Name the prevailing approach
- State the contrarian position
- Name who that position serves

**Component:** `.callout` (teal variant) OR opening prose under section header.

**Template:**
```
[Market category] [common state of affairs]. [What everyone in the space does]. 
[This business does the opposite/different thing]. We work with [specific customer] 
who [specific situation] — [what they need that the market isn't providing].
```

**Example (filled):**
```
Service-based businesses don't have a lead problem. They have an authority problem. 
Lead-gen agencies sell volume. Churlish sells the position from which volume becomes 
inevitable. We work with founders who have already won — they need a media operation 
that makes them un-ignorable, not a marketer who'll try to make them likable.
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">01 / STRATEGY</div>
    <div class="section-title">The Strategic Bet</div>
  </div>
  <div class="callout" style="background: var(--teal-light); border-left-color: var(--teal);">
    <div class="callout-title" style="color: var(--teal);">The Position</div>
    <div class="callout-body">
      [The Strategic Bet paragraph]
    </div>
  </div>
</div>
```

---

## 02 — The Operating Model

**Structure:**
- 1-2 sentences of framing
- 3-5 pillar cards
- Each card: pillar name, role label, one-line pitch, pricing tag

**Component:** `.grid-3` or `.grid-4` of `.card` blocks.

**Template:**
For each pillar:
- **Name** — 1-3 words, evocative
- **Role label** — "CASH FLOW" / "ANCHOR" / "SCALE" / "BRAND" / "GROWTH"
- **One-line pitch** — what this pillar does, in plain English
- **Pricing tag** — the monthly or per-engagement price range
- **Status tag** — "Live" / "Beta" / "Phase 2" / "Future"

**Example (filled — Churlish):**
```
Pillar 01: Authority Engine
Role: ANCHOR
Pitch: Story-driven video and direct-response advertising that builds market authority for service businesses.
Pricing: $3,000–$5,000/mo retainer
Status: Live

Pillar 02: Cutting Room Floor
Role: CASH FLOW
Pitch: Subscription editing service. Long-form, short-form, and brand content on retainer.
Pricing: $1,250–$3,500/mo subscription
Status: Live

Pillar 03: High-Level Pros
Role: SCALE
Pitch: Paid community for service-business operators in Health, Wealth, and Relationships.
Pricing: $47–$197/mo (post free tier)
Status: Phase 2

Pillar 04: MindCTRL Studios
Role: BRAND + FUTURE
Pitch: Original content, branded shows, and IP development.
Pricing: Project-based / TBD
Status: Phase 3
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">02 / OPERATING MODEL</div>
    <div class="section-title">The Four Pillars</div>
  </div>
  <p>[Framing sentence — what the operating model is and why these four.]</p>

  <div class="grid-4">
    <div class="card">
      <div class="card-label">PILLAR 01 — ANCHOR</div>
      <h3>Authority Engine</h3>
      <p>[Pitch]</p>
      <span class="tag" style="background: var(--teal-light); color: var(--teal);">Retainer</span>
      <span class="tag" style="background: var(--gold-light); color: var(--gold);">$3,000–$5,000/mo</span>
    </div>
    <!-- repeat for each pillar -->
  </div>
</div>
```

---

## 03 — Pricing Architecture

**Structure:**
- 1-2 sentence framing (why these tiers, what filter they perform)
- 3 pricing cards (one per tier)
- Middle tier marked "POPULAR" / "RECOMMENDED"
- Each card: tier name, tagline, features, price, commitment

**Component:** `.grid-3` of `.pricing-dark` (dark theme) OR `.ae-card` (light theme).

**Template:**
For each tier:
- **Name** — 1-2 words (e.g., "Starter," "Growth," "Bespoke")
- **Tagline** — what this tier IS FOR (1 line)
- **Sub** — who buys it (1-2 lines)
- **Features** — 4-6 deliverables with `+` prefix
- **Price** — monthly retainer or project flat
- **Commitment** — minimum term

**Example (filled — CRF):**
```
Tier 1: Starter — $1,250/mo, 3-month minimum
"Get the engine running"
For founders ready to commit to a content rhythm without going full studio.
+ 4 long-form edits per month
+ 12 short-form clips
+ 72-hour turnaround
+ 1 revision round

Tier 2: Growth — $2,400/mo, 6-month minimum [POPULAR]
"The compound work begins"
The middle of the road that proves itself fast. Most clients land here.
+ 8 long-form edits per month
+ 24 short-form clips
+ 48-hour turnaround
+ 2 revision rounds
+ Monthly strategy call

Tier 3: Bespoke — $3,500+/mo, 6-month minimum
"Studio-level treatment"
For operators with a full content engine — original podcast, branded ads, recurring series.
+ Unlimited long-form
+ Custom short-form schedule
+ 24-hour turnaround
+ Unlimited revisions
+ Weekly strategy
+ Brand kit + asset library
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">03 / PRICING</div>
    <div class="section-title">Three Tiers, One Path</div>
  </div>
  <p>[Framing — what these tiers do strategically.]</p>

  <div class="grid-3">
    <div class="pricing-dark">
      <div class="pricing-dark-name">Starter</div>
      <div class="pricing-dark-tag">Get the engine running</div>
      <div class="pricing-dark-sub">[For who]</div>
      <hr>
      <div class="pricing-dark-feature"><span class="plus">+</span> [Feature]</div>
      <!-- more features -->
      <div class="pricing-dark-price">
        <div class="amount"><sup>$</sup>1,250<sub>/mo</sub></div>
        <div class="commitment">3-month minimum</div>
      </div>
    </div>
    <div class="pricing-dark popular">
      <!-- middle tier with POPULAR ribbon -->
    </div>
    <div class="pricing-dark">
      <!-- top tier -->
    </div>
  </div>
</div>
```

---

## 04 — Service Ladder

**Structure:**
- 1 sentence framing
- 3 ladder steps in horizontal row, each with arrow between
- Each step: number, name, one-line description

**Component:** Horizontal `.ladder-step` chain with `.ladder-arrow-h` between.

**Template:**
```
Step 01: [Pre-qualifier name]
Description: [Paid filter, 1 line about what it does]

→

Step 02: [Core offer name]
Description: [Subscription/retainer, 1 line]

→

Step 03: [Premium offer name]
Description: [Top tier, 1 line]
```

**Example (filled — Churlish):**
```
Step 01: $497 Content Audit
A paid diagnostic that pre-qualifies. They show their content; we show what's broken.

→

Step 02: CRF Subscription
$1,250–$3,500/mo editing subscription. The content engine runs without thinking.

→

Step 03: Authority Engine
$3,000–$5,000/mo full retainer. Strategy, production, distribution, paid amplification.
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">04 / LADDER</div>
    <div class="section-title">The Path</div>
  </div>
  <p>[Framing sentence.]</p>

  <div style="display: flex; align-items: center; gap: 8px;">
    <div class="ladder-step" style="background: var(--teal-light); flex: 1;">
      <div class="ladder-step-num" style="color: var(--teal);">01</div>
      <div class="ladder-step-title">$497 Audit</div>
      <div class="ladder-step-body">A paid diagnostic that pre-qualifies.</div>
    </div>
    <div class="ladder-arrow-h">→</div>
    <div class="ladder-step" style="background: var(--gold-light); flex: 1;">
      <div class="ladder-step-num" style="color: var(--gold);">02</div>
      <div class="ladder-step-title">CRF Subscription</div>
      <div class="ladder-step-body">$1,250–$3,500/mo editing subscription.</div>
    </div>
    <div class="ladder-arrow-h">→</div>
    <div class="ladder-step" style="background: var(--red-light); flex: 1;">
      <div class="ladder-step-num" style="color: var(--red);">03</div>
      <div class="ladder-step-title">Authority Engine</div>
      <div class="ladder-step-body">$3,000–$5,000/mo full retainer.</div>
    </div>
  </div>
</div>
```

---

## 05 — Revenue Model

**Structure:**
- `cash-hero` block with the target stated as a clean number
- `metric-table` showing the math broken down
- Total line at the bottom

**Component:** `.cash-hero` for the headline, `.metric-table` for the breakdown.

**Template:**
```
Headline: $X by [date]
Subhead: [Brief sentence explaining what hits this number]

Breakdown:
- [Pillar 1 calculation]: $X
- [Pillar 2 calculation]: $X
- [Pillar 3 calculation]: $X
- [Other revenue]: $X
- Total: $X
```

**Example (filled — Churlish):**
```
Headline: $200K total revenue by Dec 2026
Subhead: Not heroic. Just the math working.

Breakdown:
- 10 CRF clients × $1,250 × 9 months = $112,500
- 3 AE clients × $3,500 × 6 months = $63,000
- Project work (blended) = $25,000
- Total = $200,500
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">05 / REVENUE MODEL</div>
    <div class="section-title">The Math</div>
  </div>

  <div class="cash-hero">
    <div class="cash-hero-label">2026 TARGET</div>
    <div class="cash-hero-title">$200K total revenue</div>
    <div class="cash-hero-body">[Subhead sentence.]</div>
  </div>

  <table class="metric-table" style="margin-top: 24px;">
    <tr><td>CRF clients @ $1,250</td><td>10 × $1,250 × 9 = $112,500</td></tr>
    <tr><td>AE retainers @ $3,500</td><td>3 × $3,500 × 6 = $63,000</td></tr>
    <tr><td>Project work blended</td><td>$25,000</td></tr>
    <tr><td><strong>Total 2026</strong></td><td><strong>$200,500</strong></td></tr>
  </table>
</div>
```

---

## 06 — KPIs and Tracking

**Structure:**
- 1 sentence framing
- 6-12 KPIs organized in 2-3 categories (revenue / operations / marketing)
- Each KPI: name, current value, target, review cadence

**Component:** Multiple `.metric-table` blocks OR `.compare-table` with category headers.

**Template:**
Group KPIs into:
- **Revenue & Pipeline** — MRR, AOV, retention, churn, new revenue/mo
- **Operations** — delivery time, capacity utilization, error rate
- **Marketing & Acquisition** — CPL, conversion rate, channel mix

For each KPI: name | current value | target | review cadence

**Example (filled):**
```
Revenue & Pipeline:
- MRR: $14,500 current → $22,500 target by Q4 (weekly review)
- Retention: ~70% qualitative → 85% by year-end (monthly review)
- New revenue/month: $2,000 average → $4,500 average (weekly review)

Operations:
- Edit turnaround: 4-5 days → 2-3 days (weekly review)
- Capacity used: ~70% → 85% (weekly review)
- Revision rate: TBD → <15% (monthly review)

Marketing & Acquisition:
- Audit conversion to retainer: TBD → 30% (monthly review)
- CPL on paid: TBD → $50-$120 (weekly review)
- Referral % of new business: ~60% → <40% (quarterly review — referrals stay, paid grows)
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">06 / KPIs</div>
    <div class="section-title">What Gets Measured</div>
  </div>
  <p>[Framing.]</p>

  <h4 style="margin-top: 24px; color: var(--teal); font-family: 'Barlow Condensed', sans-serif;">REVENUE & PIPELINE</h4>
  <table class="metric-table">
    <tr><td>MRR</td><td>$14,500 → $22,500 by Q4 (weekly)</td></tr>
    <tr><td>Retention</td><td>~70% → 85% (monthly)</td></tr>
    <!-- more rows -->
  </table>

  <h4 style="margin-top: 20px; color: var(--teal); font-family: 'Barlow Condensed', sans-serif;">OPERATIONS</h4>
  <table class="metric-table">
    <!-- ops KPIs -->
  </table>

  <h4 style="margin-top: 20px; color: var(--teal); font-family: 'Barlow Condensed', sans-serif;">MARKETING & ACQUISITION</h4>
  <table class="metric-table">
    <!-- marketing KPIs -->
  </table>
</div>
```

---

## 07 — Gap Analysis

**Structure:**
- 1 sentence framing
- 5-10 gaps, each with severity color (red/gold/teal)
- Each gap: title (the gap), body (1-2 sentences on the impact)

**Component:** `.gap-pattern` with colored `.gap-swatch`.

**Template:**
For each gap:
- **Title** — short noun phrase ("No documented sales process")
- **Body** — 1-2 sentences on impact
- **Severity** — red (bleeding) / gold (friction) / teal (noted)

**Example (filled):**
```
🟥 No paid acquisition system
60% of new business is referral. When referrals slow, revenue stops. No measurable channel to scale.

🟥 Owner-dependent delivery
All client communication and creative direction routes through Brandon. No second seat in any function. Capacity caps at ~$25K/mo without burnout.

🟨 Inconsistent project pricing
Same scope quoted at $1,500, $2,500, and $3,500 in the past year. No pricing floor. Buyers train themselves to negotiate.

🟨 No documented sales process
Discovery calls run differently every time. Close rate is unmeasurable.

🟦 No CRM
HoneyBook is invoicing only. Lead tracking lives in a spreadsheet. Slows pipeline review.

🟦 Brand inconsistency on social
Voice drifts between platforms. Hurts authority on long timelines.
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">07 / GAP ANALYSIS</div>
    <div class="section-title">Where We're Leaking</div>
  </div>
  <p>[Framing sentence — usually one line about being honest.]</p>

  <div style="display: flex; flex-direction: column; gap: 12px;">
    <div class="gap-pattern">
      <div class="gap-swatch" style="background: var(--red);"></div>
      <div>
        <div class="gap-title">No paid acquisition system</div>
        <div class="gap-body">60% of new business is referral. When referrals slow, revenue stops.</div>
      </div>
    </div>
    <!-- repeat for each gap -->
  </div>
</div>
```

---

## 08 — Roadmap / Phases

**Structure:**
- 1 sentence framing
- 3 phase cards (rev-now / rev-growing / rev-future)
- Each card: phase name, time horizon, 3-5 outcomes

**Component:** `.grid-3` of `.card` with `.rev-now` / `.rev-growing` / `.rev-future` modifiers.

**Template:**
For each phase:
- **Phase name** — short label
- **Time horizon** — 0-90 days / 90-365 days / year 2-3
- **3-5 outcomes** — what will be true at the end of this phase (not tasks — outcomes)

**Example (filled):**
```
Right Now (0-90 days):
- Audit + CRF onboarding system live
- First 3 net-new CRF clients on retainer
- Pricing floors enforced — no project under $1,500
- Weekly KPI review locked in

Growing (90-365 days):
- 10 CRF clients on retainer
- 3 AE retainers at $3,500+
- Paid acquisition channel proven (CPL < $120)
- Brandon's content rhythm hits 4 long-form/month

Future (year 2-3):
- HLP paid tier launched after free tier hits 500
- MindCTRL first branded show in production
- Second seat hired (Studio Lead)
- $30K+/mo MRR baseline
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">08 / ROADMAP</div>
    <div class="section-title">Three Horizons</div>
  </div>

  <div class="grid-3">
    <div class="card rev-now">
      <div class="card-label">RIGHT NOW · 0-90 DAYS</div>
      <h3>Cash Flow & Systems</h3>
      <p>Audit + CRF onboarding system live. First 3 net-new CRF clients on retainer. Pricing floors enforced. Weekly KPI review locked in.</p>
    </div>
    <div class="card rev-growing">
      <div class="card-label">GROWING · 90-365 DAYS</div>
      <h3>Scale the Anchor</h3>
      <p>10 CRF clients on retainer. 3 AE retainers at $3,500+. Paid acquisition channel proven. Content rhythm hits 4 long-form/month.</p>
    </div>
    <div class="card rev-future">
      <div class="card-label">FUTURE · YEAR 2-3</div>
      <h3>IP & Community</h3>
      <p>HLP paid tier launched. MindCTRL first branded show in production. Second seat hired. $30K+/mo MRR baseline.</p>
    </div>
  </div>
</div>
```

---

## 09 — The Endgame

**Structure:**
- `endgame-hero` dark block
- Label + title (with one word highlighted in gold) + body sentence
- Optional 2-pillar grid showing the supporting pillars of the future state

**Component:** `.endgame-hero` with `.endgame-grid` of `.endgame-pillar` cards.

**Template:**
- **Label** — "THE ENDGAME" or "2028 VISION"
- **Title** — short evocative phrase, one word highlighted
- **Body** — one declarative sentence stating the future state, specific and visual
- **Pillars** (optional) — 2 supporting elements of the future state

**Example (filled — Churlish):**
```
Label: THE ENDGAME
Title: A studio that compounds
Body: By 2028, Churlish operates as a full-service story-performance studio in Omaha with original IP through MindCTRL, a paid community through HLP, and a roster of authority-tier clients across Health, Wealth, and Relationships — the Hub of the Midwest's creative economy.

Supporting pillars:
- The Hub (Physical studio + brand presence)
- MindCTRL (Original IP, branded shows)
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">09 / ENDGAME</div>
    <div class="section-title">The Vision</div>
  </div>

  <div class="endgame-hero">
    <div class="endgame-hero-label">THE ENDGAME</div>
    <div class="endgame-hero-title">A studio that <span>compounds</span></div>
    <div class="endgame-hero-body">
      [The endgame sentence.]
    </div>
    <div class="endgame-grid">
      <div class="endgame-pillar" style="background: var(--teal); color: white;">
        The Hub
        <div class="endgame-pillar-sub">Physical studio + brand</div>
      </div>
      <div class="endgame-pillar" style="background: var(--gold); color: white;">
        MindCTRL
        <div class="endgame-pillar-sub">Original IP, branded shows</div>
      </div>
    </div>
  </div>
</div>
```

---

## 10 — Q&A / Internal Notes

**Structure:**
- 5-8 anticipated questions
- Each with a direct 2-4 sentence answer

**Component:** `.qa-block` with `.qa-q` and `.qa-a`.

**Template:**
Each Q&A:
- **Q:** the anticipated objection or question
- **A:** direct strategist answer

Common questions to pre-empt:
- "Why this pricing?"
- "Why these minimums?"
- "Why not [common competitor approach]?"
- "How do we afford [growth investment]?"
- "What if [risk] happens?"
- "When do we revisit this plan?"

**Example (filled):**
```
Q: Why 6-month minimum on Engine?
A: Content authority compounds. Three months covers ramp; six covers optimization. Buyers who won't commit to six aren't the right buyers for this tier.

Q: Why not lower the entry price to win more clients?
A: Lower prices attract clients who treat the work as discretionary. Higher minimums filter for clients who treat it as essential. The math works on retention, not volume.

Q: What happens if we miss Q1 numbers?
A: We re-examine the offer and the channel — not the price. The plan assumes the offer is correct; if Q1 misses by >30%, the offer is wrong, not the pricing.

Q: When does HLP launch paid?
A: When free tier hits 500 active members. Not before. Pre-launch revenue from a community that doesn't exist yet is the most common mistake operators make in this category.
```

**HTML pattern:**
```html
<div class="section">
  <div class="section-header">
    <div class="section-num">10 / Q&A</div>
    <div class="section-title">Internal Notes</div>
  </div>
  <p>Questions this plan will raise, answered up front.</p>

  <div class="qa-block">
    <div class="qa-q">Why 6-month minimum on Engine?</div>
    <div class="qa-a">Content authority compounds. Three months covers ramp; six covers optimization. Buyers who won't commit to six aren't the right buyers for this tier.</div>
  </div>
  <!-- repeat for each Q&A -->
</div>
```

---

## Cross-section consistency

When writing all 10 sections, maintain consistency:

- **Numbers used in Revenue Model must match the Pricing Architecture** — if pricing tiers are $1,250 / $2,400 / $3,500, revenue math uses those exact numbers
- **Gap Analysis must address weaknesses that the Roadmap solves** — every red gap should have a corresponding Right Now or Growing item that addresses it
- **The Endgame must be reachable via the Roadmap** — Year 2-3 outcomes must compound toward the Endgame state
- **The Strategic Bet (01) must align with the Endgame (09)** — they're the bookends. Same thesis, different time horizons.
