# skills-overrides — Churlish rulings layered over the plugin's method

## What this directory is

`brain/skills/` is **generated**. `scripts/sync-skills.mjs` deletes every
`skills/<key>/` and re-copies it from two upstream sources: the marketplace
plugin cache under `AppData\Roaming\Claude\...\skills-plugin\...\skills` and
`C:\Users\mrkin\.claude\skills`. Nothing edited in `skills/` survives that.

This directory is the version-controlled overlay the sync applies **after** the
upstream copy and **before** the byte cap. A file at

```
skills-overrides/<key>/<relative path>
```

is copied over `skills/<key>/<relative path>` on every sync, and the manifest
row for `<key>` records it under `overrides: [...]`, next to the trim record,
so the evidence travels with the bundle in `skills/MANIFEST.json`.

`<key>` is the **roster key** — the directory name under `skills/` — not the
upstream directory name. `master-plan-formula`, not
`churlish-master-plan-formula`; `proposal-generator`, not
`churlish-proposal-generator`; `alfred`, not `alfred-editor`.

## Why it exists

Two facts, and the gap between them:

1. The plugin cache is **not ours to edit.** It is a marketplace install; the
   next plugin update rewrites it, and a hand-edit there is invisible to git.
2. A correction that lives only in generated output is a correction the next
   sync deletes. Nothing records that it existed except `git diff`, and the
   sync does not read `git diff`.

So a Churlish ruling that contradicts a plugin file — a retired price, a dead
offer, a term Brandon has not ruled on — needs a home that is (a) under version
control and (b) read by the sync. This is that home.

**These are Churlish rulings layered over the plugin's method.** The plugin
supplies the skill's method; the override supplies the facts as Brandon has
ruled them. When the two disagree, the override wins on every sync.

## The rule: whole-file replacement, same path

A file here **must be a complete, whole-file replacement** of the upstream file
at the same relative path. Not a patch, not a diff, not a fragment — the
entire file, with the corrections applied. The sync copies it over the
destination byte-for-byte; it does not merge.

Consequence you must know: **a plugin update to one of these paths is silently
masked** until someone re-reviews the override. If upstream improves the method
in `proposal-generator/references/pricing-engine.md`, she never sees it — she
sees this directory's copy. Every override is a standing obligation to
re-review it against upstream when the plugin updates. `git diff --no-index
skills-overrides/<key>/<path> <upstream>/<dir>/<path>` shows what is being
masked.

Two more consequences of the mechanics:

- The override's bytes, not the upstream file's, count toward the 400 KB cap.
  If an override is the largest reference and the skill is over the cap, the
  sync **trims it and says so loudly** — the ruling then does not reach her.
- An override whose path has **no upstream counterpart** is still bundled (it
  may be a genuinely new reference) but is logged as
  `override with no upstream counterpart` and recorded on the manifest row as
  `overridesWithoutUpstream`. If you meant to replace an upstream file and see
  that line, the path is a typo.

An override for a `<key>` that is not in `RUNNABLE` **aborts the sync** (exit
3). A correction to a skill she cannot dispatch is a correction to nothing;
the sync refuses to pretend otherwise.

Only text references are allowed (`.md .txt .json .csv`, plus `SKILL.md`) —
the bundle is text-only by design, and a binary here is also an abort.

## How to add one

1. Find the upstream file (the sync's `DEFAULT_SOURCES` in
   `scripts/sync-skills.mjs`; `skills/MANIFEST.json` names each unit's
   `source` and `sourceDir`). Confirm the dead fact is upstream, not just in
   `skills/` — if it is only in `skills/`, someone hand-edited generated output
   and this directory is where that edit has to move.
2. Copy the **whole file** to `skills-overrides/<key>/<relative path>`, using
   the roster key. Keep the upstream line-ending style (the plugin files are
   CRLF) so the override diff stays readable.
3. Make the correction in the override. Follow the sweep's law: a dead number
   is replaced by a prohibition or by `NEEDS NUMBER` (or a flagged open
   question when the choice is his), never by a guessed replacement.
4. Add a row to the register below: path, the ruling it carries, the date.
5. `node scripts/sync-skills.mjs --dry` — the DRIFT section should show your
   file as `changed [override]` (or `added`) and nothing you did not intend.
6. `node scripts/sync-skills.mjs` — then prove it held:
   `git diff --no-index --ignore-cr-at-eol skills-overrides/<key>/<path> skills/<key>/<path>`
   must be empty, and the unit's row in `skills/MANIFEST.json` must list the
   path under `overrides`.

To retire an override (upstream caught up, or the ruling changed): delete the
file here, re-sync, and remove its register row.

## Register — what is overridden and why

All rulings below date from the Sept 21, 2026 pivot (Crucible-level strategy
work is Kelly Bromley's lane; Authority Lite is retired), the Sept 22 dead-fact
sweep, and Brandon's Sept 22 rulings (Engine is 4 months, System is 6; the
grandfathered Lite rate exists only for Transparency and GE Outdoors, everyone
else moved to the Launchpad or the Tournament at $2,500). All 14 upstream
originals are in the plugin cache and still carry the dead facts.

| Override (roster key / path) | Ruling it carries |
|---|---|
| `ad-diagnostic-engine/references/cta-standards.md` | No approved CTA with a "call" as the ask ("grab a free call", "book your free call", "apply for a quick call", "15-min fix call", "15-min call" replaced). |
| `avatar-bible-loader/references/active-avatars.md` | The Crucible avatar is Kelly's lane; survives as an ICP for recognising the owner, never an offer to sell, scope or price. Revenue X-Ray, Crucible Core and Performance Partnership are dead. |
| `blue-beetle/SKILL.md` | Service-track ICP is `[NEEDS: …]` — the Crucible avatars retired to Kelly; Brandon names the replacement. |
| `fable-mind/references/proven-calls.md` | The Tournament ($2,500) took Lite's slot; the Launchpad is a separate rung and did not replace Lite. |
| `guardian/SKILL.md` | Lite's grandfathered rate is `NEEDS NUMBER` and belongs to Transparency and GE Outdoors only; the Engine row carries the 4-month term and its clock (Day 75 / Day 85). |
| `kid-flash/SKILL.md` | Same service-track ICP `[NEEDS: …]` as blue-beetle. |
| `master-plan-formula/SKILL.md` | "3 months on lite tier" → "3 months on entry tier" (Lite is not a tier name). |
| `master-plan-formula/references/brain-dump-parser.md` | Same: "entry tier", not "lite". |
| `master-plan-formula/references/churlish-formula.md` | No performance partnership / revenue share as a Churlish rung; the AE example runs at the 4-month Engine term (3 × $3,500 × 4 = $42,000; total $179,500, stated as short of the $200K target rather than fudged). |
| `master-plan-formula/references/pricing-architectures.md` | No $1,750 Starter rung (that was Lite, retired); Churlish's own ladder stated; "Tournament / Engine / System", never "Lite / Engine / System". |
| `master-plan-formula/references/section-templates.md` | AE example math at the 4-month Engine term ($42,000 / $179,500) and the Q&A reads "Why a 4-month minimum on Engine?". |
| `proposal-generator/references/industry-angles.md` | The Crucible / Dynamic Edge is not a Churlish proof point; `[NEEDS: …]` a Churlish-owned one. |
| `proposal-generator/references/pricing-engine.md` | Lite has no price on the page and its grandfathered rate belongs to Transparency and GE Outdoors only; Engine and Organic Engine are 4-month minimums; no Crucible tier, no Crucible price — the line is "That's not a video problem. I know who fixes that." |
| `proposal-generator/references/proposal-architecture.md` | Engine and Organic Engine minimum terms are 4 months; System is 6; the Launchpad has no term. |
