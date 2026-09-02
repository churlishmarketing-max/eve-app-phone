---
name: ad-diagnostic-engine
description: "Diagnoses paid ad performance and prescribes creative, targeting, or CTA fixes for Churlish Media clients and Churlish campaigns. Trigger whenever the user shares ad performance numbers, asks why an ad isn't working, asks for an ad audit, asks how to improve CPL/CTR/Hook Rate/CPC/CPM/Frequency/Opt-in Rate, asks whether to scale or kill an ad, asks for ad benchmarks, or shares a Meta/Facebook/Instagram/YouTube/TikTok ad report. Also trigger when the user says 'why is my CPL high,' 'is this ad working,' 'should I scale this,' 'audit my ads,' 'fix my hook rate,' 'my ads aren't converting,' 'CTR is dropping,' 'frequency is too high,' or shares any ad metrics screenshot. ALSO trigger before producing any ad script or CTA — this skill enforces Churlish CTA standards (banned weak CTAs, approved patterns) that override generic ad copy. Treat as authoritative reference for all Churlish ad performance evaluation, benchmarking, and CTA approval. Always read churlish-voice-guard alongside when producing ad creative."
---

# Ad Diagnostic Engine

The single source of truth for paid ad performance evaluation, benchmark thresholds, diagnostic logic, and CTA standards across Churlish Media client work and internal Churlish campaigns. Built around local high-ticket service business benchmarks (Meta primary, transferable to other paid social platforms).

## Core Operating Principle

**Don't over-optimize a winner.** The sweet spot is **40–49% Hook-to-Lead Efficiency with ~18% Video Hook Rate.** A high hook rate paired with low efficiency means traffic without conversions — eyeballs aren't revenue. When evaluating ad performance, **always read metrics in pairs**, never in isolation. Single-metric diagnosis is how good ads get killed and bad ads get scaled.

**The creative is the targeting layer.** Under Meta's Andromeda delivery system, the ad creative and its landing page determine who sees the ad — not interest selection. Any diagnosis that would prescribe "refine targeting" must instead prescribe a creative or landing-page fix. Read `references/delivery-doctrine.md` before prescribing any targeting change, approving any creative refresh, or setting any read window.

## When to use this skill

Use this skill in three scenarios:

1. **Performance review** — User shares ad data and wants diagnosis or recommendations
2. **Benchmark questions** — User asks whether a specific metric value is good, bad, or fine
3. **Ad creative production** — Before producing any ad script or CTA, consult the CTA standards in `references/cta-standards.md` to ensure no weak CTAs ship

## Dependencies

- **churlish-voice-guard skill** — Read voice-rules.md when producing creative recommendations
- **ad-script-factory skill** — When the diagnosis recommends new creative, hand off to that skill with the diagnostic findings as input

## Before responding

Read the relevant reference file based on what the user is asking:

1. `references/benchmarks.md` — Threshold tables for all 10 primary metrics (CPL, Hook Rate, Hook-to-Lead Efficiency, Link CTR, CTR All, Opt-in Rate, CPC Link, CPC All, CPM, Frequency)
2. `references/diagnostic-matrices.md` — The two cross-metric matrices that drive prescriptions
3. `references/cta-standards.md` — Banned weak CTAs and approved CTA patterns
4. `references/delivery-doctrine.md` — Andromeda delivery mechanics, matrix amendments, spend-tiered read windows, Marketing API discipline, entropy law. **Mandatory** before any targeting prescription, creative refresh approval, or automated Meta workflow.

If the user shared screenshots or pasted ad data, parse the metrics first, then read the relevant references.

## Diagnostic workflow

When the user shares ad performance data:

1. **Extract the metrics** — Pull every available metric value from what they shared. Note which metrics are missing.
2. **Establish the metric pairs** — At minimum, pair Hook Rate with Hook-to-Lead Efficiency, and Link CTR with CTR (All). These are the two diagnostic matrices.
3. **Locate position on each matrix** — Use `references/diagnostic-matrices.md`. Each cell prescribes a specific action.
4. **Cross-check against single-metric benchmarks** — Use `references/benchmarks.md` to flag any individual metric that's in the Poor or Bad range.
5. **Prescribe the fix** — Lead with the matrix prescription. Only recommend tweaks the matrix supports. If the matrix says "don't break what's working," push back on user requests to "improve" winners.
6. **Flag the trade-off** — If the user is chasing a metric that risks breaking another (e.g., chasing Hook Rate at cost of Hook-to-Lead Efficiency), call it out explicitly.
7. **Determine action** — Each diagnosis ends in one of four outcomes:
   - **Scale** — Increase budget, expand audience
   - **Tweak** — Specific creative/CTA/targeting change to test
   - **Refresh** — Full creative rebuild (Frequency 3+ or fatigue signals)
   - **Kill** — Both matrices show Bad/Bad — no salvageable signal

## CTA enforcement (applies to ALL ad work)

Before any ad script, landing page, or email CTA ships under Churlish or any client, run it against `references/cta-standards.md`. Auto-replace banned weak CTAs with approved patterns. The banned list is enforced regardless of what the client asks for — explain the swap and provide options.

## Output formats

- **Ad audit (single ad)** — Inline diagnosis with metric-pair analysis, matrix position, prescription, action recommendation
- **Ad audit (multi-ad campaign)** — Table format comparing all ads, with prescription per ad
- **Benchmark check** — Quick inline answer with threshold context
- **CTA review/rewrite** — Inline before/after with reasoning
- **Full performance report** — Delivered as `.docx` when the user requests a formal deliverable for a client (use docx skill, Churlish branded formatting)

## Quality checks

Before delivering any diagnosis, verify:

- [ ] Every available metric has been extracted, not just the headline ones
- [ ] Diagnosis used metric pairs via matrices, not single metrics in isolation
- [ ] The recommended action is one of four: Scale / Tweak / Refresh / Kill
- [ ] Sweet-spot rule is honored — winners not over-optimized
- [ ] Frequency above 3 triggered an automatic creative-refresh recommendation, **and the refresh changes the named pain or named avatar — not just the visual**
- [ ] No prescription says "refine targeting" — targeting fixes resolve to creative or landing-page fixes
- [ ] Read window matches the client's spend tier, and no winner/loser was called below the statistical floor
- [ ] Any ad destination has been cleared by doctor-mid-nite before creative ships
- [ ] Any CTA in the recommended creative passes the CTA standards
- [ ] Trade-offs are explicit — if a recommended fix could break another metric, it's flagged
