---
name: email-sequence-writer
description: "Generates email sequences, nurture flows, follow-up campaigns, and automated email copy using the NEPQ and Chris Voss methodologies for Churlish Media clients or for Churlish itself. Trigger this skill whenever the user asks for email sequences, nurture emails, follow-up emails, drip campaigns, email automation copy, welcome sequences, onboarding emails, re-engagement emails, or any automated email flow. Also trigger when the user says 'write a nurture sequence for', 'follow-up emails for', 'email flow for', 'sequence for people who', 'write the emails for our automation', or references any email copy that will be used in an automation platform (HoneyBook, GoHighLevel, ActiveCampaign, Mailchimp, etc.). This skill produces ready-to-load email sequences with subject lines, body copy, send timing, and trigger logic. Always read the churlish-voice-guard skill first."
---

# Email Sequence Writer

Generates complete email sequences for Churlish Media clients and for Churlish itself. Every sequence follows the NEPQ questioning methodology and Chris Voss negotiation principles — emails that feel like conversations, not marketing.

## Dependencies

- **churlish-voice-guard skill** — Read voice-rules.md. Emails should sound like Brandon talking, not a marketing funnel.

## Before generating

Read the reference file:
1. `references/sequence-blueprints.md` — Proven sequence structures with timing, objectives, and email-by-email breakdowns

## Required inputs

Gather from the user (ask if not provided):

1. **Sequence type** — What trigger starts this sequence? (Opt-in, no-show, open proposal, post-purchase, nurture, re-engagement, etc.)
2. **Client / brand** — Who sends these emails? (Churlish Media, a client's brand, etc.)
3. **Avatar** — Who receives them? (What's their situation, what do they care about?)
4. **The offer** — What are we ultimately leading them toward? (Booking a call, purchasing a product, joining a community, etc.)
5. **Proof / case studies** — Specific results to reference in proof emails
6. **Sending platform** — Where will these be loaded? (Affects formatting — HoneyBook is more personal, GoHighLevel supports more automation, etc.)
7. **Number of emails** — If the user has a preference (otherwise default to the blueprint recommendation)

## Output format

For each email in the sequence:

```
EMAIL [N] — [Internal label for the automation]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Trigger:      [When this sends — e.g., "Day 0 / Immediately after opt-in" or "2 days after Email 1"]
Subject line: [The subject line]
Preview text: [The preview/preheader text — first 40-90 characters visible in inbox]

---

[Full email body copy]

---

CTA:          [The one action this email asks for]
Internal note: [Any notes for the person building the automation — merge fields, conditional logic, manual steps]
```

## Sequence design principles

### The Voss method in email
- **Mirror their situation** before asking for anything. The first line of every email should acknowledge where they are mentally — not where you want them to be.
- **Label the feeling.** "It seems like you're weighing whether this is the right investment" is more powerful than "I wanted to follow up on our proposal."
- **Calibrated questions.** Instead of "Are you ready to move forward?" use "What would need to be true for this to make sense for you?" Questions that start with "how" and "what" keep the conversation open.
- **The "that's right" moment.** The goal of objection-handling emails is to describe the prospect's situation so accurately that they think "that's right — this person gets it." That moment is when resistance drops.

### The NEPQ method in email
- **Never push.** Every email should feel like it's pulling the reader toward their own conclusion, not pushing them toward yours.
- **Questions over statements.** Frame insights as questions when possible. "What would it mean for your business if you had 40 leads a month instead of 4?" lands harder than "We can get you 40 leads a month."
- **Situational awareness.** Each email should reference where the reader is in the journey (they just opted in, they missed a call, they've seen the proposal, they've been quiet for a month).

### Email voice rules
- **From a person, not a company.** Emails sign off from "Brandon" not "The Churlish Media Team."
- **One CTA per email.** Not three links and a P.S. with a fourth. One thing to do.
- **Short paragraphs.** 1–3 sentences max. Email is read on phones. Long paragraphs get skipped.
- **No images in nurture emails.** Plain text (or minimal formatting) outperforms designed emails in nurture sequences. HTML templates are for newsletters and announcements.
- **Subject lines under 50 characters.** Shorter subjects get opened more. No clickbait — the subject should honestly preview the email's value.

## Process

1. Read voice guard references
2. Read this skill's sequence-blueprints.md reference
3. Gather missing inputs
4. Select the appropriate blueprint based on sequence type
5. Write all emails with Churlish voice and Voss/NEPQ methodology
6. Include timing and trigger logic for each email
7. Deliver inline or as .docx depending on sequence length

## Quality checks

- [ ] Every email has one clear CTA — not multiple competing asks
- [ ] Subject lines are under 50 characters
- [ ] First line of every email acknowledges the reader's current situation
- [ ] Proof emails contain specific numbers, names, or timelines
- [ ] The sequence has a clear exit ramp for people who aren't ready (graceful close, not an abrupt stop)
- [ ] Send timing feels natural, not aggressive (no 3 emails in 24 hours)
- [ ] Each email could be copy-pasted directly into the sending platform
- [ ] No banned phrases from the voice guard
