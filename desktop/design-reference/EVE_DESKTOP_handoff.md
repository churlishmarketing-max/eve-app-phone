# EVE DESKTOP — Design Handoff

**For:** a fresh Claude Design session. This document is self-contained — produce faithful artboards from it alone.
**From:** Brandon King, Churlish Media (churlishmarketing@gmail.com).
**Date:** 2026-08-29.
**Grounding:** every claim below was verified against `C:\dev\eve\app` (the shipped phone client), `C:\dev\eve\brain` (the live Railway brain), and the installed Jarvis desktop app + its June 2026 backups. File:line citations are for Brandon's later audits — Claude Design needs only the values.

---

## 1. WHAT THIS IS

EVE Desktop is **one brain, second surface**. EVE already exists: a Node/TS brain on Railway (Claude Agent SDK, Express, SSE chat, Supabase memory spine) holding her personality (Character Bible v3 + doctrine), her memory, her wardrobe (88 looks she picks herself), the sales floor, the fleet, the OS board, and Brandon's vitals — plus a React/Capacitor phone app that is a thin, honest client on that brain. The desktop is the same brain given **a room instead of a pocket**: a three-column **COMMAND DECK** (her presence rail / the conversation / the live day-ops stack, all visible at once), a **SUMMON overlay** on a global push-to-talk hotkey so she's reachable mid-Premiere, and a **TRAY presence** that stays resident, state-colored, and dark during quiet hours. The desktop shell holds zero intelligence, zero canned lines, and exactly one secret (the brain bearer token). Everything it shows comes off the brain's existing HTTP + SSE contract.

---

## 2. THE TWO PARENTS

**Parent 1 — Jarvis (installed Electron assistant, `C:\Users\mrkin\AppData\Local\Programs\jarvis`).** A voice-first desktop companion: orb UI, open-mic conversation, local Kokoro TTS + Whisper STT, Gmail hands, a browser agent, six user-authored business agents (Terrific, Helena, Oracle, Cyborg, Clocktower, Kid Flash) with real run logs, and ~23.9M input tokens burned in three June days. **Brandon already renamed it EVE** — the June backup holds `kv.name:"EVE"`, `kv.wakePhrase:"Eve"`, `kv.armMode:"wake"`, and the current install's settings show `assistantName:"EVE"`. **This is a reunification, not a mashup**: the desktop body Brandon actually lived in already answered to her name. What carries over from Jarvis is its **role and its desk-craft**, not its code: always-on residency, the summon idea, the tray, the wake-phrase intent, the never-mute voice-fallback discipline, and the lesson of its worst failure (four live credentials sitting in plaintext backups — see §10). What dies: its local agents (the brain's fleet owns that now), its local model calls, its amber accent, its credential-holding, its open mic.

**Parent 2 — the EVE phone app (`C:\dev\eve\app`, live against `https://eve-app-phone-production.up.railway.app`).** Five tabs — TODAY / EVE / OPS / WIRE / BODY — in a terminal-noir design language whose stylesheet literally declares itself law ("Its layout, palette, type scale and motion are law", eveStyles.ts:2-4). The phone contributes **everything visible**: the tokens, the atmosphere, the component vocabulary, the confirm-card contract, the honesty states, the wardrobe presence, and the entire brain data contract. The phone's tab-at-a-time layout, thumb targets, and push-to-talk-only mic are **phone compromises** the desktop deliberately undoes.

Division rule: **everything that expresses who she is and what she's allowed to do survives; everything that expresses the shape of a 6-inch touchscreen is replaced.**

---

## 3. DESIGN LANGUAGE

### 3.1 Tokens — verbatim (eveStyles.ts:13-19, verified)

```css
:root{
  --bg:#070B0C; --panel:#0C1417; --panel2:#0F191D;
  --hair:rgba(240,237,232,.07); --hair2:rgba(240,237,232,.09);
  --teal:#007A87; --tealHi:#1CB9C8; --ice:#9BEFF7;
  --cream:#F0EDE8; --dim:rgba(240,237,232,.62); --faint:rgba(240,237,232,.4);
  --gold:#C9A54A; --red:#C41E3A; --green:#3EA26E;
}
```

- Page ground behind the frame: `#030506` (`.eve-root`). The frame itself is `--bg` #070B0C.
- **Color meanings are law:** teal = her/alive/done; ice #9BEFF7 = highlights and thinking; gold #C9A54A = YELLOW autonomy tier + hot streaks + "KEY NEEDED"; red #C41E3A = RED tier ONLY (confirms, tripwires, alerts, overdue); **green #3EA26E is reserved exclusively for the GREEN autonomy tier dot** — done-states are teal, never green (code comment: "Teal for done, never --green").
- Cream-alpha ladder (de facto text-opacity scale, all `rgba(240,237,232,x)`): .92 bubble text · .7/.65 · .62 (--dim) · .55 · .5 · .45 · .42 nav labels · .4 (--faint) · .38 · .35 · .3 · .28 footnotes · .26 footline · .22 empty cells.
- Teal-alpha ladder `rgba(28,185,200,x)`: .85 eyebrows · .8 · .7 · .6 selected borders · .45 accent rails/ripples · .4 · .35 · .28 chip borders · .22 · .16/.14 button fills · .08 · .05 chip fill · .04 card inner glow.
- Selection: `::selection{ background:rgba(28,185,200,.35); }`.
- Orb gradients (EveApp.tsx:70-79, verified):
  - `ORB_BG: radial-gradient(circle at 34% 30%, #C9F7FB 0%, #1CB9C8 30%, #007A87 58%, #06272C 100%)`
  - `ORB_BG_RED: radial-gradient(circle at 34% 30%, #F7C9D2 0%, #E0526E 30%, #C41E3A 58%, #2C060D 100%)`
  - `ORB_GLOW: 0 0 36px rgba(28,185,200,.5), 0 0 90px rgba(0,122,135,.35), inset 0 0 20px rgba(201,247,251,.35)`
  - Boot core `CORE_BG: radial-gradient(circle at 50% 38%, rgba(240,237,232,.85), #1CB9C8 40%, #063A42 80%)`; alert `#C41E3A 42% → #4A0E1A 78%`.

### 3.2 Fonts (Google Fonts, loaded in index.html)

- **Body:** `Barlow, system-ui, sans-serif` (400/500/600 + italic 400). Bubble text 13.5px/1.48, ledes 14px/1.5, row titles 13.5–14.5px/600, inputs 14px.
- **Display:** `'Barlow Condensed', sans-serif` (500/600/700). H1 700/44px/.98; floor number 700/42px; mini-stat numerals 700/34px; sheet titles 700/27px; boot wordmark 700/54px letter-spacing .14em; week-cell digits 700/19px.
- **Mono:** `'IBM Plex Mono', monospace` (400/500/600). This is the system's voice for ALL machine chrome: status bar 9.5px/.18em, eyebrows 9.5px/.22em, badges, chips, buttons, footnotes, error lines, nav labels 8.5px/.2em. Micro-type runs 8–10.5px with letter-spacing .04em–.3em. **Tiny mono + wide tracking IS the aesthetic.**

Type-scale summary: display 54/44/42/34/27/22/19 · body 14/13.5/13/12.5/12 · mono 8–11 heavy-tracked.

### 3.3 Atmosphere (the room she lives in)

Stacked layers inside the frame, in z-order — all gradients and 1px lines, no image textures:

1. **Aura** (z:0): 560x420px radial teal glow bleeding off the top — `radial-gradient(closest-side, rgba(0,122,135,.26), rgba(0,122,135,.07) 55%, transparent 72%)`, breathing 6s (opacity .7↔1).
2. **Motes** (z:0): six 2–3px teal dots (`rgba(28,185,200,.45)`, `rgba(155,239,247,.35–.45)`) drifting upward on 11–19s loops.
3. Content (z:1), status bar (z:2).
4. **Scanlines** (z:5): `repeating-linear-gradient(0deg, rgba(240,237,232,.022) 0 1px, transparent 1px 3px)` drifting (background-position 0→240px).
5. **Vignette** (z:5): `box-shadow:inset 0 0 60px rgba(3,5,6,.55)`.

**Desktop dosing:** scanlines + vignette cover the full 1440px frame (slow drift to 24s); **aura + motes live ONLY inside the presence rail** — six motes over a 616px data column reads as noise; over her portrait it reads as presence.

### 3.4 Radii, borders, shadows

- Radii: cards 12px · rows/nodes 10px · inputs/bubbles/capture 8px · chips/pills 5–6px · tags 4px · sheet/panel tops 16px · bars 2px.
- Borders: 1px hairlines everywhere (`--hair`/`--hair2`); accent left-rails 2px teal on EVE bubbles and list rows; **3px red left-rail on confirm/tripwire cards**; dashed 1px `rgba(240,237,232,.14)` for phase-gated/future elements.
- Card shadow recipe: `inset 0 1px 0 rgba(240,237,232,.04), inset 0 0 26px rgba(28,185,200,.04), 0 10px 26px rgba(0,0,0,.35)` — top bevel + interior teal wash + drop.
- Glow recipe: `0 0 12px rgba(28,185,200,.45)` on filled floor bars; `0 0 30px rgba(28,185,200,.55)` on the live mic.

### 3.5 Component vocabulary — verbatim CSS (verified from eveStyles.ts)

```css
/* card */
.card{ background:var(--panel); border:1px solid var(--hair); border-radius:12px; padding:16px;
  box-shadow:inset 0 1px 0 rgba(240,237,232,.04), inset 0 0 26px rgba(28,185,200,.04), 0 10px 26px rgba(0,0,0,.35); }

/* eyebrow row — left label convention: prefixed "▸" */
.eyeb{ display:flex; align-items:baseline; justify-content:space-between;
  font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.22em; color:rgba(28,185,200,.85); }
.eyeb .r{ color:rgba(240,237,232,.35); }

/* section divider: mono teal label + hairline rule + right-aligned counter */
.divrow{ display:flex; align-items:center; gap:10px; margin:24px 0 12px; }
.divrow .l{ font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.22em; color:rgba(28,185,200,.85); }
.divrow .rule{ flex:1; height:1px; background:var(--hair); }
.divrow .r{ font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.16em; color:rgba(240,237,232,.35); }

/* headline + lede */
.h1v6{ font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:44px; line-height:.98; color:var(--cream); }
.ledev6{ font-size:14px; line-height:1.5; color:var(--dim); }

/* sales floor */
.floorbig{ font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:42px; line-height:1; color:var(--cream); }
.floorbig em{ font-style:normal; color:rgba(240,237,232,.3); }   /* the "/3" */
.fbars span{ flex:1; height:7px; border-radius:2px; background:rgba(240,237,232,.06); border:1px solid rgba(240,237,232,.07); }
.fbars span.on{ background:linear-gradient(90deg,#007A87,#1CB9C8); border:none; box-shadow:0 0 12px rgba(28,185,200,.45); }

/* list row (Today's Three etc.) */
.t3row{ display:flex; align-items:center; gap:14px; background:var(--panel2); border:1px solid var(--hair);
  border-left:2px solid rgba(28,185,200,.45); border-radius:10px; padding:13px 14px; }
.t3row.due{ border-left-color:var(--red); }
.t3row .idx{ font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:17px; color:var(--tealHi); }
.t3row .tt{ font-weight:600; font-size:14.5px; color:var(--cream); }
.t3row .tm{ font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.14em; color:rgba(240,237,232,.4); }

/* mini stat tile */
.mini{ background:var(--panel); border:1px solid var(--hair); border-radius:12px; padding:14px; }
.mini .k{ font-family:'IBM Plex Mono',monospace; font-size:8.5px; letter-spacing:.2em; color:rgba(28,185,200,.8); }
.mini .n{ font-family:'Barlow Condensed',sans-serif; font-weight:700; font-size:34px; line-height:1; color:var(--cream); }
.mini .n em{ font-style:normal; font-size:20px; color:rgba(240,237,232,.4); }

/* chat bubbles */
.bub{ max-width:84%; border-radius:8px; padding:9px 12px 8px; }
.bub.eve{ background:var(--panel); border:1px solid rgba(240,237,232,.06); border-left:2px solid var(--tealHi); }
.bub.you{ background:rgba(0,122,135,.15); border:1px solid rgba(28,185,200,.2); }   /* right-aligned */
.bname{ font-family:'IBM Plex Mono',monospace; font-size:8.5px; letter-spacing:.18em; }  /* EVE teal .8 / YOU cream .38 */
.btext{ font-size:13.5px; line-height:1.48; color:rgba(240,237,232,.92); white-space:pre-wrap; }
/* typing indicator: three 4px teal dots, 1.1s stagger .18s */

/* RED confirm card */
.confirmv6{ background:linear-gradient(180deg, rgba(196,30,58,.09), rgba(12,20,23,0));
  border:1px solid rgba(196,30,58,.3); border-left:3px solid var(--red); border-radius:10px; padding:12px 14px; }
.confirmv6 .hd{ font-family:'IBM Plex Mono',monospace; font-size:9px; letter-spacing:.18em; color:var(--red); }
.confirmv6 .sum{ font-weight:600; font-size:13.5px; color:var(--cream); }
.confirmv6 .field{ font-size:12px; line-height:1.45; color:rgba(240,237,232,.6); word-break:break-word; }
.confirmv6 .field b{ font-family:'IBM Plex Mono',monospace; font-size:8.5px; letter-spacing:.12em;
  color:rgba(240,237,232,.4); display:block; }   /* block field-label above each value */

/* buttons */
.cbtn{ font-family:'IBM Plex Mono',monospace; font-size:8.5px; letter-spacing:.12em; border-radius:5px; padding:8px 11px; }
.cbtn.ok{ color:var(--ice); background:rgba(28,185,200,.16); border:1px solid rgba(28,185,200,.45); }
.cbtn.gh{ color:rgba(240,237,232,.55); background:none; border:1px solid rgba(240,237,232,.16); }
.chipv6{ font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.12em; text-transform:uppercase;
  color:rgba(240,237,232,.7); padding:7px 11px; border:1px solid rgba(28,185,200,.28); border-radius:6px;
  background:rgba(28,185,200,.05); }

/* status bar */
.sbar{ font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.18em; color:rgba(240,237,232,.5);
  border-bottom:1px solid rgba(240,237,232,.06); }
/* link dot: teal ● pulsing 3s + label "LINK" (teal .8); offline: red static ● + "DOWN" */

/* portrait plate */
.pcard{ width:188px; height:218px; }                    /* phone size; desktop rail = 232x356 */
.pc{ width:20px; height:20px; }                          /* 4 corner brackets, 2px solid var(--tealHi), offset -7px */
.pfr{ inset:3px; border-radius:8px; border:1px solid rgba(28,185,200,.3); background:var(--panel); }
.pfr img{ object-fit:cover; object-position:50% 12%; }   /* the crop law — keeps her face framed */
.pfr .sheen{ background:linear-gradient(180deg, rgba(28,185,200,.1), rgba(7,11,12,0) 38%, rgba(0,122,135,.16));
  mix-blend-mode:screen; }
.pfr.alert img{ opacity:.6; }
.pbadge{ padding:7px 13px; background:var(--panel); border:1px solid var(--hair2); border-radius:6px; }
/* badge contents: "EVE" wordmark (Barlow Condensed 700/17px) · 1x14px divider · look name (mono 8px .22em) · 22px mode-orb */

/* job row + agent code chip */
.jcode{ width:28px; height:28px; border-radius:6px; background:rgba(28,185,200,.08);
  border:1px solid rgba(28,185,200,.22); font-family:'IBM Plex Mono',monospace; font-size:9.5px;
  font-weight:600; color:var(--tealHi); }

/* mic orb (62px), sense buttons, wire pills, footline */
.micv6{ width:62px; height:62px; border-radius:50%; border:1px solid rgba(28,185,200,.4);
  background:radial-gradient(circle at 50% 38%, rgba(28,185,200,.16), rgba(12,20,23,.9) 75%); }
.micv6.on{ border-color:var(--tealHi); box-shadow:0 0 30px rgba(28,185,200,.55); }
.micv6.rec{ border-color:var(--red); box-shadow:0 0 30px rgba(196,30,58,.5); }
.footline{ font-family:'IBM Plex Mono',monospace; font-size:8.5px; letter-spacing:.1em; color:rgba(240,237,232,.26); }
```

Entity animation grammar (verified): orbit rings `rotateX(67°)` 172px spinning 15s + `rotateX(72°)` 128px counter-spinning 9.5s; thinking = 112px ice arc at .85s; listening = 104px ripple rings 2.4s staggered .8s; speaking = 5 waveform bars (3px wide, heights 12/18/15/18/11, .65–.95s); breathe scale 1↔1.05 at 4.6s.

Motion inventory: ospin/ospinrev · breathe · aurabreathe · ripple · wavebar · dotpulse (3s) · blinkc (terminal cursor 1s step-end) · scandrift · floatup · typedot · simslide (indeterminate 8%↔86%) · bootOut (fade + scale 1.04).

### 3.6 Desktop adaptations (density, pointer, keyboard)

- **hit44 dies** (touch law): pointer targets floor at 28px height; buttons `padding:6px 10px`; list rows 44px → 36px.
- Eyebrow/mono labels 9.5px → **10px**, tracking .22em → .18em (reads better at monitor distance). Body 13.5 → 13px/1.45 in data columns; **chat bubbles stay 13.5/1.48**.
- H1 44px appears ONLY on full-pane states; the deck itself has no billboard headlines — panes are headed by eyebrows. **Numbers stay huge** (floor 42px, minis 34px) — the numeric hierarchy is the brand.
- 8px spacing grid; pane padding 16px; columns separated by 1px `--hair` hairlines, not gutters — terminal panes, not floating cards.
- **Hover exists now:** rows lift `rgba(28,185,200,.04)`, borders brighten, 250ms ease.
- **Keyboard first-class:** visible 1px ice focus rings; `⏎ / ESC` chips on confirm cards; `?` opens a shortcut sheet.
- Scrollbars: phone hides them entirely; desktop shows a 6px thumb `rgba(240,237,232,.12)` on hover.
- Max bubble width 84% → **70%** in the 560px talk column.

---

## 4. THE ARTBOARDS

**Global window rules:** main window default **1440x900**, min 1120x720, resizable, remembers geometry. Frameless; custom 32px title bar restyles the phone status bar: left `14:07 · SAT 29 AUG · WK 35`, right `EVE//OS 0.8.0-DESKTOP  ● LINK` (teal dot pulsing 3s; red static `● DOWN` when `/state` fails). Note: the phone ships `EVE//OS 0.7.0` (APP_VERSION, EveApp.tsx:74/837 — verified); the desktop carries its own version string with a `-DESKTOP` suffix.
Grid: 8px base. Three columns at 1440: **RAIL 264 / TALK 560 / DATA 616**, separated by 1px hairlines. Below 1240px width the DATA column collapses to a 48px icon strip with an attention-count badge; below 900px the RAIL collapses to the 40px orb in the title bar. Never horizontal scroll.
Mock date everywhere: **SAT 29 AUG · WK 35**. All mock copy below is real system data or brain-shaped copy — use it verbatim.

### Artboard A — `DECK/DEFAULT` — 1440x900 (the hero)

**Title bar (1440x32):** as above. Feed: local clock + `GET /state.online`.

**PRESENCE RAIL (264x868, left):**
- Portrait card **232x356**, 16px inset: worn look **AUTHORITY** (a real file — 88 PNGs on disk, serving size **768x1376 measured**; note for asset prep, NOT 1536x2048). Crop: `object-fit:cover; object-position:50% 12%`. Four 20px teal corner brackets offset -7px; inner frame r8 with 1px `rgba(28,185,200,.3)` border; teal sheen overlay `mix-blend-mode:screen`.
- Badge row: `EVE` wordmark · 1px divider · `AUTHORITY` (mono 8px .22em) · 22px mode-orb (ORB_BG).
- State line: `○ IDLE — HOLDING THE ROOM` mono 10px .26em, color per §5 state table.
- Voice block: two mono lines `DEEPGRAM ● LIVE` / `VOICE: RACHEL` + a `[ SILENT AT THE DESK ]` toggle pill (see §6). (Voice name must render from `GET /voice/voices` / connector detail — the phone hardcodes "LARA" but the brain default is Rachel unless `ELEVENLABS_VOICE_ID` is set. Never bake a name.)
- Quiet-hours chip: `QUIET 21:30–06:30` — dim cream by day; gold moon-notch treatment when inside the window.
- Wire micro-row (rail bottom): 10 status dots + `8/10 LIVE` mono label; click → Artboard F. Feed: `/state.connectors`.
- Aura + 6 motes render inside this rail only.

**TALK column (560x868, center) — the spine of the deck:**
- Header 40px: `EVE // EXECUTIVE VOICE ENGINE` (mono 8.5px .3em, centered).
- Conversation (flex-fill): phone bubble anatomy unchanged; EVE left with teal rail, YOU right in teal wash; names `EVE` / `YOU` in mono 8.5px. Mock exchange:
  - YOU: `Who's gone quiet?`
  - EVE: `Rustic Lumber — 12 days, cadence is 7. I drafted Zach an update yesterday; it's sitting in approvals. Creative Impact is inside the window at 3 days.` (streaming cursor `▌` on last line to show mid-stream state)
- Typing state: three 4px teal dots in an empty EVE bubble.
- Error state: `LINK: brain unreachable` mono 10px red.
- Chips row (the four real chips, verbatim, EveApp.tsx:59): `RUN MY DAY` `WHAT'S ON THE BOARD?` `WHO'S GONE QUIET?` `WHAT'S SLIPPING?` — disabled unless idle.
- Input row 56px: grow-to-fit textarea (42→124px max, teal caret), 42px send button, mic button with `CTRL+SPACE` engraved beneath (mono 8px .14em), and a drag-over state: dashed 1px teal inner border + `DROP TEXT — SHE FILES IT` centered mono.
- Footer: `push-to-talk only. she never listens uninvited.` (verbatim; EveApp.tsx:1130 — verified. Report conflict resolved: :1145 was wrong).
- Feed: `POST /chat` SSE (frames in §7), `POST /voice/transcribe`, `POST /voice/speak`.

**DATA column (616x868, right), three stacked panes:**

*TODAY pane (616x~380):*
- Eyebrow: `▸ EVE//BRIEF — SAT 29 AUG · WK 35` right `REFRESHED 14:07`.
- Brief lede (from `/state.latestBrief.text`, ≤25 words by law): `Floor sits at 2 of 3. Zach's renewal call is the day; everything else is drafts waiting on your thumb.`
- **SALES FLOOR tile:** `2<em>/3</em>` at 42px Barlow Condensed + 3 segmented bars (2 filled teal-gradient + glow) + mono line `> 1 to go — real conversations, not drafts.` Offline variant: `> offline — the count lands when her brain answers.` (Goal is hard law: `FLOOR_GOAL = 3`, floor.ts:25 — verified. Week window = Monday 00:00 America/Chicago. Count = max(OS, brain); the live OS is the authority.)
- **TODAY'S THREE** divider (right slot `SHE SET THE ORDER`) + three t3rows:
  - `01  CALL ZACH — RLS RENEWAL` / `DUE 15:00` (red `.due` state if past)
  - `02  SHIP THE VSL CUT` / `CHURLISH FUNNEL`
  - `03  INVOICE FOLLOW-UP` / `DRAFT READY`
- **CLOCKS strip** (mono, one line, brain cron day — verified verbatim from schedule.ts:127): `07:00 BRIEF · 11:45 FLOOR · 12:30 PULSE · 17:30 CLOSEOUT · 20:00 ROUTINES` (also real: Sun 19:00 week preview, 02:00 distill, wardrobe rotation 07:14/18:22/22:43). ⚑BUILD NOTE: `/state` carries **no calendar field** (state.ts return object — verified); v1 CLOCKS shows the cron schedule only. A `/state.calendar` block is v2 server work.

*OPS pane (616x~340):*
- `WAITING ON YOUR THUMB — RED` strip with count badge when `pendingConfirms` non-empty (mock: 1).
- **APPROVAL INBOX** rows: kind glyph (`@` silent_client / `▸` approval / `+` inbox / `•` else — verified map) + message + mono sub-line + `APPROVE / HOLD / ✕` buttons. Mocks:
  - `@  Rustic Lumber has gone quiet — update drafted.` / `SILENT CLIENT · N2 · DRAFT READY`
  - `▸  Perry White email to Zach ready for review.` / `APPROVAL · N1`
- **JOBS IN FLIGHT** rows (28px agent-code chip; verified map: eve→EV, research→RS, jsa→JS, justice-league→JL, suicide-squad→SQ):
  - `RS  RESEARCH — COMPETITOR TEARDOWN` `● RUNNING` (teal)
  - `JS  JSA — THUMBNAIL TRIBUNAL` `IN APPROVALS` (gold)
  - Empty state: `Nothing in flight. Give her the job — by name or just the outcome.`
- **CLIENT PULSE** condensed rows: `RUSTIC LUMBER STORE` `12D QUIET` (gold `.hot`) `cadence 7d — past it. update drafted.` / `CREATIVE IMPACT` `3D QUIET` `— inside the window.`
- Feed: `/state.attentionItems`, `/state.jobs`, `/state.clients`; actions → `POST /attention/:id/action`, `POST /confirm`, `POST /dispatch`.

*BODY strip (616x~88, bottom):*
- One line: `BODY — ENERGY 4/5 · SLEEP 7H · HABITS 4/6 · FLOOR 2/3` + micro-checkboxes for the three seeded check-in boxes (verified in sql/003_body.sql:70-74): **TRAINED ✓ · DEEP-WORK BLOCK ✓ · ATE RIGHT ○**. Click anywhere → Artboard D. Feed: `GET /vitals` — fetched only on expand (the brain deliberately keeps /vitals out of /state).

Footnote (bottom of DATA column, centered mono 9px cream-28%): `the fleet works. you sign.`

### Artboard B — `SUMMON/OVERLAY` — 1440x900 (in-situ)

Background: darkened, blurred neutral editing-suite mock (NO Adobe trade dress). Centered horizontally, top edge y=140: **Summon panel 680w**, auto-height (mock ~300px):
- Chrome: `#0C1417`, 1px `rgba(28,185,200,.45)` border, r12, heavy drop shadow, backdrop blur.
- Row 1: 48px orb (mode-colored) + `● LISTENING — GO AHEAD` + `ESC` chip right.
- Row 2: live transcript, cream italic Barlow: `"eve, log a call with the rustic lumber guys"`.
- Row 3: her reply streaming with cursor `▌`, 2px teal left rail: `Logged. That's 3 of 3 — floor's closed for the week.▌`
- Row 4 (conditional): compact confirm card (Artboard C anatomy) — Summon can carry a RED card; approve round-trips `POST /confirm` like anywhere else.
- Footer mono 9px: `HOLD CTRL+SPACE TO TALK · TYPE TO SWITCH · ↵ SEND`.
- Behavior notes on the board: always-on-top; Esc or click-outside dismisses; a reply in flight keeps streaming into the deck's TALK column (same conversationId) — nothing is lost on dismiss.

### Artboard C — `DECK/CONFIRM` — 1440x900 (RED state)

Deck as in A, dimmed 40%; the confirm card clones to a centered modal **480w x ~400h**:
- Header (mono 9px .18em red): `▲ RED TIER · GMAIL SEND — NOTHING SENDS WITHOUT YOU` (anatomy verbatim from the phone).
- Summary: `Renewal email to Zach — the numbers you approved on the call.`
- Payload fields (block-label over value, each value clamped 240 chars):
  - `TO` → `zach@rusticlumberstore.com`
  - `SUBJECT` → `Renewal — the numbers we talked about`
  - `BODY` → `Zach — here's the renewal exactly as we scoped it: same retainer, the Chisel launch folded in, first invoice lands Sept 1. Say the word and…` (truncated)
- Expiry line: `expires 15:42` (from `PendingConfirm.expiresAt`).
- Buttons: `APPROVE — SEND IT` (.ok) / `CANCEL` (.gh) + keyboard chips `⏎` `ESC`.
- Resolution states to draw as variants: `SENT — logged to the thread` (teal) / `CANCELLED` / `FAILED — {detail}` (red).
- Law annotation on the board: this is the ONE place desktop may steal focus, and only when the main window already has focus; otherwise it's a Windows toast that opens here. Mechanics: approve echoes the card's exact `{id, hash}`; single-use; hash-matched; expiring.

### Artboard D — `DECK/BODY` — 1440x900 (full-pane state)

RAIL and TALK unchanged; DATA column becomes full BODY:
- Eyebrow `▸ BODY // THE ENGINE` right `LOGGED LIVE` (offline: `OFFLINE`).
- **TODAY'S CHECK-IN card:** ENERGY segmented 1–5 (4 selected); SLEEP (HRS) segmented **4–9** (7 selected — the scale starting at 4 is deliberate); THE BOXES: `TRAINED ✓ · DEEP-WORK BLOCK ✓ · ATE RIGHT ○` as toggle rows with optimistic echo.
- **ONE LINE card** (`SAVES WHEN YOU LOOK AWAY`): input placeholder `how's the head today?`; hint `SHE READS IT. SHE DOESN'T PERFORM IT BACK.` Saved on blur only.
- **LAST 14 DAYS strip** (desktop widens from the phone's 7 — `/vitals?days=` accepts up to 31): cells of mono dow + condensed energy digit (dim `·` when null) + two dots (trained / calls_ok); today ringed teal.
- **NON-NEGOTIABLE HABITS:** rows with ✓ box, `DONE TODAY` / `NOT YET TODAY`, streak chip (gold at ≥7). Mocks: `MORNING PAGES — 23d` (gold) / `MOVE MY BODY — 6d` / `CAMERA ON SOMETHING — 2d`. ⚑These three names are runtime Supabase rows, not seeded code — canonical mocks, may drift from the live DB. `+ ADD HABIT` inline row.
- **SALES FLOOR mini — READ ONLY:** `2/3` + `the floor owns this one. tell her, and it moves.` (one-owner law rendered).
- **GOALS — EMPTY BY DESIGN:** `Your goals live in the Churlish OS. She can write one there, but nothing can read them back yet — so this panel stays empty rather than showing you a copy that might already be wrong.` (verbatim honesty-state copy).
- Footnote: `she counts the days so you don't have to.`
- Feed: `GET /vitals`, `POST /checkin`, `POST /routine`, `POST /routine/:id/tick|untick`.

### Artboard E — `TRAY/STATES` — 800x600 (component sheet)

- **Tray icon** at 16px and 32px, four states: idle = teal orb (ORB_BG) · thinking = orb + ice arc · alert = red orb (ORB_BG_RED) with white count badge · quiet = dimmed orb with a gold moon notch.
- **Tray flyout 360x480:** mini portrait strip (worn look, 56px) + state line; top 3 attention items with inline APPROVE/HOLD; floor `2/3` mini; buttons `OPEN DECK` / `SUMMON — CTRL+SPACE` / `OPEN THE OS →` (deep link to the Churlish OS web app); footer during quiet hours: `QUIET HOURS — SHE HOLDS EVERYTHING UNTIL 06:30`.
- **Quiet-hours behavior spec (annotate on the board):** 21:30–06:30 America/Chicago (verified schedule.ts:26/127): no toasts, no sounds, no animating badges; everything queues into the deck's OPS pane; only the tray icon dims. The desktop never out-pings the brain.

### Artboard F — `SETTINGS/WIRE` — 1440x900

The phone's WIRE tab grown up + desktop-only sections:
- **Node grid (10 tiles, 5x2)** — codes, names, roles, and states verbatim (verified in EveApp.tsx:740-751):
  | code | name | role | mock state |
  |---|---|---|---|
  | EV | EVE Brain | reasoning core | ● LIVE |
  | SB | Supabase | memory · ledgers | ● LIVE |
  | GM | Gmail | read · draft · send | ● LIVE |
  | CL | Calendar | clocks · windows | ● KEY NEEDED (gold) |
  | OS | Churlish OS | board · pennyworth | ● LIVE |
  | DG | Deepgram | her ears | ● LIVE |
  | 11 | ElevenLabs | her voice | ● LIVE |
  | FL | EVE Fleet | research · tribunals | ● LIVE |
  | WB | Live Web | search · sources | ● LIVE |
  | G2 | G2 Glasses | her eyes · someday | ◌ PHASE 5 (dashed border) |
- **AUTONOMY — HOUSE RULES card** (appears on every surface; dots #3EA26E / #C9A54A / #C41E3A):
  - `GREEN — Acts, then tells you. Filing, drafts, research, the OS board.`
  - `YELLOW — Drafts, then waits. Anything a client will read.`
  - `RED — Never without you. Money out, sends, anything public.`
- **VOICE & SUMMON:** hotkey recorder (default `CTRL+SPACE`), PTT mode toggle (HOLD / TAP-TOGGLE), SILENT AT THE DESK default, output device picker, and one visibly-locked dashed row: `WAKE WORD "EVE" — V2 · CHANGES THE LISTENING LAW · REQUIRES YOUR SIGN-OFF`.
- **NOTIFICATIONS:** policy matrix `RED CONFIRMS: TOAST · TRIPWIRES: TOAST · EVERYTHING ELSE: DECK ONLY`; read-only row `QUIET 21:30–06:30 — HER LAW, NOT A SETTING`.
- **CONNECTION:** brain URL `https://eve-app-phone-production.up.railway.app`; token row `BEARER — SET · STORED IN WINDOWS CREDENTIAL VAULT` (value never displayed); `/health` readout chips (phase, voiceReady stt/tts, fleet ready·live·count, lastBrief).
- Footer: `she only sees what you hand her. keys stay in your vault.` (verbatim).

### Artboard G — `RAIL/PRESENCE-STATES` — 900x560 (component sheet)

Six rail cards side by side: the five states from §5 + the collapsed 40px title-bar orb. Each card = full 232x356 portrait treatment with its state's chrome (ripples / arc / waveform / red flip) and the state line beneath.

### Artboard H — `SUMMON/STATES` — 720x1000 (component sheet)

The 680w Summon panel in four stacked states:
1. LISTENING — ripple rings + live transcript filling.
2. THINKING — ice arc + `◐ WORKING THE PROBLEM` + tool suffix ` · PULSE SWEEP` (live tool name from the SSE `tool` frame).
3. STREAMING — reply tokens with `▌` cursor.
4. CONFIRM-CARRYING — compact RED card docked in row 4.

---

## 5. HER PRESENCE

She is a **permanent rail, never a window you visit.**

**The five states** — glyph, label, color (verbatim, verified EveApp.tsx:61-68):

| mode | dot | label | color |
|---|---|---|---|
| idle | ○ | `IDLE — HOLDING THE ROOM` | rgba(28,185,200,.8) |
| listening | ● | `LISTENING — GO AHEAD` | #1CB9C8 |
| thinking | ◐ | `WORKING THE PROBLEM` | #9BEFF7 |
| speaking | ● | `SPEAKING` | #1CB9C8 |
| alert | ▲ | `ALERT — NEEDS YOUR EYES` | #C41E3A |

While a tool runs, the thinking label gains a live suffix: `◐ WORKING THE PROBLEM · GMAIL SEARCH`.

**State chrome on the rail card:** idle = breathing aura (6s) + sheen drift · listening = teal ripple rings from the card edge · thinking = thin fast ice arc orbiting the corners (**the chrome works, not the face — the portrait never changes expression**) · speaking = 5-bar waveform under the badge · alert = brackets + badge-orb flip red (ORB_BG_RED), portrait dims to 60%.

**Portrait duality:** portrait (worn look) vs core (the orb). Her worn look decides by default; Brandon's local toggle wins (`plateMode` precedence, same as the phone). Collapsed/narrow state = 40px orb in the title bar with a mode ring.

**Wardrobe law (binding):** the closet is HERS. 88 looks on disk (verified count; real names to mock: AUTHORITY, COMMANDER, AFTER HOURS, BASE, 2AM/3AM/4AM, AFTER DARK, AGENT, BLACK CAT, BLACKHEART, BEACH DAY, 117 MK2…). Serving renders are **768x1376 PNG** (verified on AUTHORITY.png — do not design against 1536x2048); a 232x356 card at 2x needs 464x712, so headroom is ample. She rotates herself server-side 3x/day at 07:14 / 18:22 / 22:43 (verified crons); when she changes, the rail cross-fades 600ms with a one-line mono caption `SHE CHANGED — AFTER HOURS`. The desktop only displays `GET /wardrobe.wearing`. Clicking the portrait opens a 480px right-side wardrobe panel (the phone's bottom sheet reflowed): CORE/PORTRAIT toggle, `HER CLOSET — 88 LOOKS, HERS TO CHOOSE` 5-across grid of 3:4-cropped thumbs, presence-check pills (3.6s auto-revert, never during a live turn), footer `ACCENT — TEAL / locked. she chose it herself.` A manual pick posts `POST /wardrobe/wear` — the same single truth her own `wear_look` tool writes. His veto gates only what ENTERS the closet, never what she picks from it.

---

## 6. VOICE + SUMMON

Three inputs, one loop behind them (`/voice/transcribe` → `/chat` → `/voice/speak`):

- **Typed** — the desk default. Enter sends, Shift+Enter newlines.
- **Push-to-talk** — global hotkey `CTRL+SPACE` (configurable), two modes: **hold-to-talk** (release = send; the natural desk gesture, default) and **tap-toggle** (the phone's tap-record/tap-send). Works deck-focused or via Summon from inside any app.
- **Wake word "Eve" — v2, opt-in only.** The Jarvis backup proves the intent (`armMode:"wake"`, `wakePhrase:"Eve"`) but no wake-word engine ever shipped — and the phone's standing law is `push-to-talk only. she never listens uninvited.` Shipping an always-open mic in v1 silently reverses a stated law. v1 draws ONLY the locked settings row (Artboard F). The law that survives is *consent made visible*: when wake-word ships, it gets its own consent screen and a permanent armed/disarmed indicator in the title bar.

**Overlay behavior:** Summon is a 680w always-on-top panel (Artboard B). Esc/click-outside dismisses; in-flight replies keep streaming into the deck (same conversationId). Summon can carry RED confirm cards.

**Interruption:** hotkey press or mic click while she speaks stops audio instantly and flips to LISTENING (client abort; SSE close already halts the brain's agent loop server-side).

**The editor rule (audio-out at a desk — Brandon cuts video):** voice out ONLY when the turn came in by voice (the phone's `lastInputWasVoice` gate) AND `SILENT AT THE DESK` is off. Typed turns never speak. RED confirms never auto-speak. When she would have spoken but was silenced, the state line shows `SPEECH HELD — DESK IS SILENT` for 3s. v2 may add auto-silence when a configured app list owns the foreground; v1 keeps one honest toggle.

**Cost gate (the Jarvis lesson):** open-mic burned ~23.9M input tokens in ~2 June days. PTT-only input IS the attention gate; the desktop never picks models (model routing is the brain's).

---

## 7. DATA CONTRACT

Base: `https://eve-app-phone-production.up.railway.app`. Auth: `Authorization: Bearer <token>` on **every route except** `GET /health`, `GET /console`, `GET /wardrobe*` (img tags can't send headers). Timing-safe compare server-side. The desktop sends `surface:"desktop"` on /chat.

### 7.1 Endpoint table

| method + path | auth | shape (essentials) | desktop consumer |
|---|---|---|---|
| POST `/chat` | ✓ | body `{message, conversationId?, surface?}` → SSE stream (frames below); `?stream=false` → `{conversationId, reply}` | TALK column, Summon |
| GET `/state` | ✓ | `{online, latestBrief{text,at}?, todaysThree[{id,title,detail?,priority,due_at?}], floor{count,goal}, attentionItems[{id,kind,message,nudge_level,ref?,created_at}], clients[{id,name,cadence_days,days_quiet}], jobs[{id,agent?,title,status}], routines[{id,name,streak,last_done_on?}], pendingConfirms[], connectors[{key,name,connected,detail}]}` (verified — **no calendar field**) | TODAY + OPS panes, rail wire-row, tray. Poll 30s (phone uses 60s) |
| POST `/confirm` | ✓ | `{id, hash, approve}` → `{ok, executed?, detail?, error?, clientAction?}` — single-use, hash-matched | Confirm modal, Summon, tray |
| POST `/attention/:id/action` | ✓ | `{action: approve\|hold\|dismiss}` → `{ok, outcome?}` | OPS approval inbox |
| GET `/vitals?days=N` | ✓ | N 1–31; `{online, checkin{energy,sleep_hours,note}?, week[{on_date,dow,energy,trained,calls_ok}], habits[{id,name,cadence,slot:"habit"\|"checkin",done_today,streak,days[]}], floor}` — all dates brain-stamped, client never computes a day | BODY strip + full pane (lazy fetch on expand) |
| POST `/checkin` | ✓ | partial `{energy?, sleepHours?, note?}` | BODY check-in |
| POST `/routine` · `/routine/:id/tick\|untick` · `/routine/:id/archive` | ✓ | tick idempotent per local day, back-date ≤7d; archive never deletes | BODY habits |
| POST `/job` | ✓ | `{job, force?, message?, data?}`; jobs: morning_brief, distill, pulse_sweep, floor_check, closeout, week_preview, routine_risk, tripwire, embed_backfill, wardrobe_rotate | "Run her day" play button (`{job:"morning_brief", force:true}`) |
| POST `/dispatch` | ✓ | `{task, agent?, client?}` — returns immediately; worker reports via jobs row + approval | OPS (implicit via chat) |
| POST `/capture` | ✓ | `{text, sourceLink?}` — **text only**; file upload does not exist | drag-text-drop |
| GET `/wardrobe` | — | `{wearing, looks[{file,name,url}]}` (Supabase CDN URLs) | rail portrait + wardrobe panel |
| POST `/wardrobe/wear` | ✓ | `{file}` | wardrobe panel pick |
| POST `/voice/transcribe` | ✓ | raw audio body ≤25MB → `{ok, transcript?}` (Deepgram) | PTT |
| POST `/voice/speak` | ✓ | `{text}` ≤4000 chars → streamed mp3; failure degrades to text silently | voice-out |
| GET `/voice/voices` | ✓ | live voice list | settings, rail voice label |
| GET `/health` | — | `{ok, phase, pushReady, pushAllowed, memoryReady, voiceReady{stt,tts}, osBoardWarm, fleet{ready,live,count}, connectors, lastBrief}` | settings CONNECTION readout |
| POST `/register-push` | ✓ | phone FCM only — **desktop does NOT register in v1** | — |

### 7.2 SSE frames on POST /chat (`event: <name>\ndata: <json>`)

| frame | payload | UI effect |
|---|---|---|
| `state` | `{state:"thinking"\|"speaking"\|"idle"}` | rail/summon mode flip |
| `token` | `{text}` | append to current EVE bubble |
| `tool` | `{name}` | live suffix on the thinking label |
| `confirm_request` | full `PendingConfirm {id, kind, summary, payload, hash, createdAt, expiresAt}` | inline card + modal + toast if unfocused |
| `done` | `{conversationId, fullText}` | persist conversationId (desktop keeps its OWN id, like the phone's `eve.conversationId`) |
| `error` | `{message}` | `LINK: {message}` mono red; delete the empty EVE bubble so failure never reads as her silence |

Closing the SSE socket aborts the brain's agent loop — interruption is free.

### 7.3 Deeplinks and phone-only gaps

- Phone deeplinks `eve://today|ops|body` become desktop pane-focus commands; toast clicks focus the deck on the item.
- **Phone-only, desktop must NOT fake:** SMS/notification senses forwarding (no senses card on desktop); **`clientAction: send_sms` on confirm resolution — the approving client transmits from its SIM.** Until the brain grows a surface-aware guard, any `send_sms`-kind confirm on desktop renders its APPROVE disabled with `APPROVE ON YOUR PHONE — THIS ONE SENDS FROM YOUR SIM`. (Approving it on desktop today would silently never send.)
- Push: FCM goes to the phone only. Desktop derives everything from its /state poll + SSE; Windows toasts fire ONLY for new RED confirms and tripwires, only when unfocused, deduped by item id, suppressed entirely in quiet hours.

---

## 8. THE LAWS (binding constraints on the design)

1. **RED confirms — nothing sends without him.** Anything that leaves the building (email send, SMS, publish, spend, pricing) only ever QUEUES a confirm card: red gradient + 3px red rail, exact payload fields shown, `▲ RED TIER · {KIND} — NOTHING SENDS WITHOUT YOU`, approve echoes `{id, hash}`, single-use, expiring. She never simulates or claims a RED action happened. The desktop, with MORE reach, needs this MORE.
2. **No canned personality lines.** Every user-visible EVE sentence is generated by the brain. Chips send real messages; the session greeting is a hidden system seed through the normal pipe; the manual brief button fires the real job. Shell copy (empty states, footnotes, labels) is chrome, not her voice — the strings in this document marked verbatim are chrome.
3. **Honesty states — offline says so, never fake zeros.** Every pane ships day-one with distinct online-empty vs offline copy. Canonical: `Her brain is unreachable, so this screen is a shell. It fills in the moment she answers.` The floor shows `> offline — …` rather than 0. Only wired connectors read LIVE. GOALS stays EMPTY BY DESIGN. The title-bar dot flips LINK→DOWN red.
4. **Quiet hours 21:30–06:30** (America/Chicago; brain-enforced for push, desktop-mirrored for its own toasts/sounds): nothing pings, work queues in the deck, the tray dims. Her law, not a setting.
5. **One owner per fact.** The sales floor moves only via `log_conversation` — every other surface renders it READ ONLY. Vitals dates arrive brain-stamped; no client computes a day. `wearing` has one writer. New panes read; they never grow second writers.
6. **Compression by surface.** The desktop sends `surface:"desktop"` and lets the brain set register. Deck chat = full personality; toasts ≤25 words substance-first; tray lines ≤10 words.
7. **Consent made visible.** `push-to-talk only. she never listens uninvited.` stands until Brandon signs a v2 law change with its own consent screen and a permanent armed indicator. No ambient clipboard reading (the `PASTE TO EVE` chip reads nothing until clicked). No screen watching in v1–v2. `she only sees what you hand her. keys stay in your vault.`
8. **Nudges escalate in usefulness, never volume.** N1/N2/N3 render as mono sub-labels; higher nudge = more prepared (draft attached), never louder.
9. **Failure never reads as her silence.** A failed turn removes the empty bubble and shows a mono red `LINK:` line. Errors are chrome, not personality.

---

## 9. V1 / V2 / V3 — SCOPE WALLS

**V1 (draw everything here):** Command Deck (A, C, D) · Summon PTT overlay (B, H) · tray + quiet hours (E) · settings/wire (F) · presence rail + wardrobe panel (G) · toast policy · drag-TEXT capture → `/capture` · deep links out (Churlish OS, Gmail) · SILENT AT THE DESK · 30s /state poll · Windows Credential Vault token storage. **Zero new brain endpoints.**

**V2 (locked rows / annotations only, do not draw as live UI):** wake word "Eve" (opt-in law change + consent screen + engine choice) · file upload endpoint + true file drag-drop · auto-silence on foreground app list · presence-aware push routing (brain holds phone pushes while desktop is live) · `/state.calendar` block feeding a real CLOCKS strip · clipboard quick-action polish · 31-day BODY views.

**V3 (do not draw at all):** screen context / computer control (a separate security conversation with tier-law implications) · full-duplex voice (Deepgram Flux — the brain's own roadmap note) · G2 glasses surface (`?stream=false` JSON chat already exists for it; the G2 tile stays dashed PHASE 5).

**Never (from either parent):** Jarvis-style local agents or schedulers (one brain — a client-side scheduler is a second brain and forbidden) · local model calls · vendor license client / auto-update feeds · camera/face features · desktop senses cards.

---

## 10. SECURITY NOTE

**All secrets live in the brain.** Deepgram, ElevenLabs, Gmail, Supabase, Anthropic — every provider key stays server-side on Railway. The desktop shell stores exactly **two config values**: the brain URL and the bearer token — the token in the OS keychain (Windows Credential Vault), never in renderer-reachable code, never displayed in settings (show `SET — STORED LOCALLY` only). This is the Jarvis lesson: its June backups put four live plaintext credentials (an Anthropic API key, an ElevenLabs key, a Gmail app password, a Meta access token) into OneDrive- and Google-Drive-synced folders, and they must be rotated before that archive is touched again. What Jarvis got RIGHT — DPAPI-encrypted key files, booleans-only across the process bridge, refuse-to-store over degrade-to-plaintext — is the pattern for holding the one bearer token. No auto-update feed from any third party. Brain calls stay in the main process; the renderer never holds the token. **This document contains no secret values, and no design artifact ever should.**

---

## 11. OPEN QUESTIONS FOR BRANDON

1. **Wake word at v1 or v2?** The phone's shipped law says `push-to-talk only. she never listens uninvited.`; the Jarvis backup proves you configured wake="Eve" in June. **Recommendation: v2, opt-in, with its own consent screen and a permanent armed/disarmed indicator — v1 draws only the locked settings row.** If you want it at v1 launch, say so now; it changes Artboards A, F, and the laws section.
2. **`send_sms` confirms on desktop.** The /confirm contract hands `clientAction: send_sms` to whichever client approves — a desktop has no SIM, so approving there would silently never send. **Recommendation: v1 renders those cards with APPROVE disabled (`APPROVE ON YOUR PHONE`) and you add a surface-aware guard to the brain before desktop approve ships for that kind.**
3. **Framework: Electron or Tauri?** Geometry and behavior specs are framework-agnostic, but tray/global-hotkey/toast APIs differ. **Recommendation: Electron — the safeStorage secret pattern and every desk-craft pattern worth porting from Jarvis maps 1:1, and you already live with its footprint.**
4. **Salvage the June archive?** The 266-message history and 5 memories (including EVE's recorded visual identity) exist only in the backups. **Recommendation: rotate the four credentials first, then run a one-time import into the Supabase spine via the existing import-memory path — a build task, not a design element.**
5. **Add `surface:"desktop"` to the Character Bible §11 compression table?** The brain compresses by surface string; reusing `"app"` inherits phone register. **Recommendation: yes — one doctrine edit before build.**
6. **Double-ping until v2.** The brain keeps pushing FCM to your phone while you sit at the deck; desktop-side dedup can't stop the phone buzzing. **Recommendation: accept for v1; presence-aware routing is v2 server work.**
7. **The unauthenticated `/wardrobe` route.** Her closet and current look are world-readable on public Railway today. **Recommendation: accept for v1 (low sensitivity, single user), fix brain-side with signed URLs later — the desktop should not deepen reliance on it.**
8. **Fleet count on screen.** The bundled roster holds 51 units (verified); the live OS is the authority and may differ. **Recommendation: every fleet count renders from `/health.fleet.count` — never hardcode 51 or 52 into an artboard.**

---

*Conflict resolutions made in this synthesis (for the record): footline verified at EveApp.tsx:1130 (one report said :1145); ENT table verified at :61-68; phone version verified as `EVE//OS 0.7.0` — the desktop string `0.8.0-DESKTOP` is a new proposal, not an existing value; wardrobe count verified at 88 files, serving size verified 768x1376 (not 1536x2048); fleet roster verified at 51 bundled units with live-OS authority; seeded check-in boxes verified as Trained / Deep-work block / Ate right — the three habit-slot names are runtime rows; the voice label renders from the brain (phone's "LARA" is hardcoded copy; brain default is Rachel); wake word resolved to v2 opt-in per the phone's standing law, flagged as open question #1.*
