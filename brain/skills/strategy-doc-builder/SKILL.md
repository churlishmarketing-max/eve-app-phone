---
name: strategy-doc-builder
description: "Generates comprehensive strategy documents, gameplans, playbooks, KPI trackers, and business infrastructure docs for Churlish Media clients. Trigger this skill whenever the user asks for a strategy document, marketing gameplan, business playbook, revenue plan, KPI tracker, content strategy, marketing strategy, growth plan, strategic gameplan, or any structured business planning document for a Churlish client. Also trigger when the user says 'build a gameplan for', 'strategy doc for', 'playbook for', 'KPI tracker', 'revenue model for', 'marketing plan for', or references creating comprehensive strategic documents. This skill produces branded .docx or .xlsx deliverables with Churlish formatting, revenue models, content strategy frameworks, deliverable breakdowns, and KPI structures. Always read the churlish-voice-guard skill first."
---

# Strategy Document Builder

Generates comprehensive strategy documents for Churlish Media client engagements. These are the big-picture planning docs that follow the sale — gameplans, playbooks, KPI trackers, and business infrastructure documents.

## Dependencies

- **churlish-voice-guard skill** — Read voice-rules.md and visual-identity.md before building any strategy doc
- **docx skill** — Use for playbook and gameplan documents
- **xlsx skill** — Use for KPI trackers, revenue models, and data-heavy documents

## Before generating

Read these reference files:
1. `references/doc-templates.md` — Structure templates for each strategy document type
2. `references/kpi-frameworks.md` — KPI structures, revenue modeling approaches, and tracker formats

## Required inputs

Gather from the user (ask if not provided):

1. **Client name** — Who is this for?
2. **Document type** — Gameplan, playbook, KPI tracker, content strategy, revenue model, or custom
3. **Client's business model** — What they sell, how they make money, what their revenue looks like
4. **Goals / targets** — Revenue target, lead target, growth rate, or other measurable outcomes
5. **Current state** — What marketing/content/systems exist now
6. **Timeframe** — Monthly, quarterly, annual, or engagement-specific
7. **Other vendors or partners** — Anyone else in the picture (other agencies, internal team, etc.)

## Output

A complete .docx and/or .xlsx delivered to `/mnt/user-data/outputs/` with:
- Churlish branding and formatting
- All sections populated with client-specific content
- Revenue models using real or estimated numbers (flagged when estimated)
- Actionable deliverables with timelines
- Clear responsibility assignments

## Document types this skill produces

### Strategic gameplan
The master roadmap document. Covers situation analysis, revenue model, content strategy, monthly deliverables, marketing calendar, budget framework, and responsibility matrix. Example: the GE Outdoors 2026 Strategic Gameplan.

### KPI tracker
Monthly or quarterly tracking document. Covers social metrics, paid ad performance, CTV/radio attribution (if applicable), website/SEO, and revenue attribution. Includes monthly review questions. Usually .xlsx format.

### Content strategy / playbook
Deep-dive into the content approach for a specific client. Covers brand voice, content pillars, platform priority, posting rhythm, video strategy, repurposing framework, and batch production plan. More detailed than a content calendar — this is the "why" behind the "what."

### Revenue model
Financial projection document. Breaks down revenue targets by service type, estimates ticket sizes from market data, maps seasonal patterns, and shows how marketing investments connect to revenue outcomes. Always flag estimates vs. actual numbers.

### Master plan / business infrastructure
Comprehensive operational document covering multiple business pillars, pricing architecture, product definitions, automation systems, and growth timelines. Example: the Churlish Media Master Plan.

## Process

1. Read voice guard references
2. Read this skill's references
3. Gather missing inputs
4. Research the client's market if needed (web search for industry data, competitor context)
5. Build the document structure based on doc type
6. Populate all sections with client-specific content
7. Build as .docx and/or .xlsx using the appropriate skill
8. Present to user

## Quality checks

- [ ] Revenue numbers are sourced or flagged as estimates
- [ ] Every section has specific, actionable content — no placeholder text
- [ ] Responsibility matrix clearly shows who does what (Churlish vs. client vs. other vendors)
- [ ] Deliverables have quantities and timelines, not vague descriptions
- [ ] The document could be handed to the client and make sense without a verbal walkthrough
- [ ] Churlish branding and formatting applied consistently
