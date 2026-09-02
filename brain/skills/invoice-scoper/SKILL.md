---
name: invoice-scoper
description: "Generates formatted invoice scope documents and line-item breakdowns from campaign descriptions for Churlish Media client engagements. Trigger this skill whenever the user asks to create an invoice, scope line items, build a billing document, format a scope of work for billing, turn deliverables into invoice format, or generate any document that translates campaign scope into billable line items. Also trigger when the user says 'invoice for [client]', 'scope this as an invoice', 'line items for', 'billing for this campaign', 'what should I charge for', or references translating a campaign plan into a financial document. This skill produces clean, professional scope documents ready for HoneyBook, QuickBooks, or any invoicing platform."
---

# Invoice Scoper

Translates campaign scope and deliverables into clean, professional invoice line items for Churlish Media engagements. Turns the "here's what we're doing" into the "here's what it costs" document.

## Dependencies

- **churlish-proposal-generator skill** — Reference pricing-engine.md for standard tier pricing and deliverable mapping

## Required inputs

Gather from the user (ask if not provided):

1. **Client name** — Who is this invoice for?
2. **Campaign / engagement description** — What are we delivering? (Can be a detailed list or a general description like "the Woodaddy social campaign")
3. **Pricing** — Total amount, per-item pricing, or "use our standard rates"
4. **Billing type** — One-time, monthly retainer, project-based, or milestone-based
5. **Invoice period** — What dates does this cover?
6. **Platform** — Where is this being sent from? (HoneyBook, QuickBooks, manual — affects formatting)

If the user references an existing campaign or client engagement, search past conversations for the scope details before asking them to repeat it.

## Output format

### Simple scope (inline)
For quick invoices, deliver the line items directly in the conversation:

```
INVOICE SCOPE — [Client Name]
Period: [Date range]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Line item 1]                              $X,XXX
  [Brief description of what's included]

[Line item 2]                              $X,XXX
  [Brief description]

[Line item 3]                              $X,XXX
  [Brief description]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBTOTAL                                   $X,XXX
[Tax/discount if applicable]
TOTAL                                      $X,XXX

Payment terms: [Net 15 / Due on receipt / etc.]
```

### Detailed scope (.docx)
For larger engagements, build a formatted document with:
- Client name and invoice period
- Itemized deliverables table (item, description, quantity, unit price, total)
- Subtotal, tax (if applicable), total
- Payment terms
- Churlish Media contact info

## Line item naming conventions

Use clear, professional names that the client can understand and that map to specific deliverables. Avoid vague categories.

**Good line items:**
- "Monthly Video Production — 1 shoot day, 8-12 short-form clips"
- "Brand Photography Session — 15-20 edited images"
- "Meta Ad Management — Campaign setup, optimization, monthly reporting"
- "Content Strategy & Calendar — Monthly content plan with hooks and CTAs"
- "CRM Buildout — Lead capture, automated sequences, pipeline setup"

**Bad line items:**
- "Marketing services"
- "Content creation"
- "Social media"
- "Strategy"

Every line item should answer "what exactly am I paying for?" at a glance.

## Pricing logic

When the user says "use our standard rates," map deliverables to pricing from the pricing engine:

- Authority Launchpad scope → $2,500 one-time
- Authority Engine scope → $3,500/mo
- Authority System scope → $5,000/mo
- CRF Starter → $1,250/mo
- CRF Growth → $2,400/mo
- Custom scope → Calculate based on deliverable components

For à la carte or project-based pricing, use these benchmarks (adjust based on user input):
- Single shoot day: $750–$1,500
- Short-form clip editing (per clip): $75–$150
- Brand photography session: $500–$1,000
- Ad creative package (3–5 ads): $500–$1,000
- Strategy document: $500–$1,500
- CRM buildout (one-time): $1,500–$3,000
- Email sequence writing (per sequence): $300–$750

These are internal benchmarks. Always defer to what the user specifies.

## Process

1. Gather inputs
2. If referencing an existing campaign, search past conversations for scope details
3. Map deliverables to line items using the naming conventions
4. Apply pricing (user-specified or standard rates)
5. Format as inline scope or .docx
6. Present to user

## Quality checks

- [ ] Every deliverable has a specific line item — nothing lumped into vague categories
- [ ] Quantities are included where applicable (12 clips, 20 photos, 1 shoot day)
- [ ] Total adds up correctly
- [ ] Payment terms are specified
- [ ] The client can read this and know exactly what they're paying for
