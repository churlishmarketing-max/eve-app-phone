# 01 — PRODUCT SPEC

## 1. What EVE is

EVE (Executive Voice Engine) is Brandon King's personal chief of staff in an
Android app. Single user, internal only, sideloaded — never app-store
distributed. She is not a work tool with a personality bolted on; she is the
system that runs the life of a solopreneur juggling Churlish Media, The
Crucible, teaching, content, clients, and a family.

**Design premise, written into everything:** a solopreneur's enemy isn't the
work, it's the remembering. **She carries the remembering; Brandon carries the
deciding.**

Reference characters Brandon anchors on: Lyla (Spider-Man 2099) and Cortana —
a present, personified assistant living in the device, not a chat window.

## 2. Surfaces

1. **Android APK** (this build) — Capacitor-wrapped React app, FCM push.
2. **G2 glasses** (Phase 5, later) — same brain, clipped register.

## 3. Screens — port from `assets/eve-app-demo.jsx`

The demo file is the approved design. Its layout, palette, type, and copy tone
are law; its scripted replies are NOT (see §6). Visual law: Churlish dark
terminal — near-black backgrounds, teal `#007A87` workhorse with `#1CB9C8`
highlights, cream `#F0EDE8` text, red `#C41E3A` used at most once per screen
(reserved for tripwires/overdue). Type: Barlow Condensed display, Barlow body,
IBM Plex Mono for data.

| Screen | Contents (all live data by Phase 2) |
|---|---|
| **Boot/Wake** | Entity + wordmark; wake → generated greeting |
| **Today** | Date/eyebrow · generated greeting line · sales-floor tracker · Today's Three · capture card · parking ledger + renewal radar minis |
| **EVE (Talk)** | State-reactive entity (idle/listening/thinking/speaking/alert) · your-message + her-message bubbles · quick chips · **text input bar** · mic · voice status · wardrobe entry |
| **Ops** | Jobs in Flight (fleet dispatch) · Approval Inbox · Client Pulse radar · Follow-ups · Tripwires · Guardian renewal radar |
| **Wire** | Connection tiles with live status · autonomy legend |
| **Wardrobe** (sheet) | Her looks: wear / approve / veto / generate |

## 4. Features by priority

**P1 (Phase 1):** streaming text conversation; morning brief push; Character
Bible as system layer; session memory.
**P2 (Phase 2):** full memory spine; context assembly; nightly distillation;
client pulse + attention engine; live Today/Ops data; capture (text + voice
note → parsed task/entry; email-forward capture may land here or P3).
**P3 (Phase 3):** MCP connectors (Gmail, Google Calendar, Notion, Slack,
Stripe read); fleet dispatch; full voice loop (Deepgram/ElevenLabs).
**P4 (Phase 4):** notification listener + SMS read; dictated SMS reply with
confirm; wardrobe pipeline + Soul training; routines with streaks.

## 5. Capture — any door in

Modeled on the reference workflow Brandon approved: (a) type in the app,
(b) speak in the app, (c) forward an email to a dedicated capture address with
"new task" in the subject — parsed, summarized, filed to the right client, with
a link back to the source thread. Unassigned items land in an **inbox that
exists to be emptied** — triage, not storage.

## 6. Conversation quality bar — HARD REQUIREMENT

Brandon's words: talking to her must feel exactly like talking to Claude on
claude.ai — conversational, reasonable, fluid. Testable conditions:

1. **Zero canned responses.** Every user-visible EVE message is generated live
   by the brain. The demo's scripted strings must not survive the port.
2. **Streaming everywhere.** Text renders token-by-token; voice begins speaking
   the first sentence while the rest composes.
3. **Full context assembly** on every exchange (`03` §4): she answers Brandon
   mid-story, never in a vacuum.
4. **No command grammar.** Rambling, half-formed input is normal input; she
   finds the ask inside it.
5. **Latency targets:** first text token ≤ ~2s; voice audio starts ≤ ~2.5s
   after end of speech (⚑VERIFY achievable with chosen host/region; tune).
6. **Tone suite:** the 6-prompt test in `06` §11 passes; two failures = fix
   before shipping the phase.

## 7. Autonomy (enforced in code — see `02` §6)

🟢 GREEN — drafts, analyses, internal docs, plans: she does fully, unprompted.
🟡 YELLOW — send-ready client-facing drafts, scheduling proposals: built to
done, assumptions flagged.
🔴 RED — anything leaving the building (email send, SMS send, publish, spend,
pricing changes): explicit Brandon confirmation, every time.

## 8. Non-goals

Multi-user support; app-store distribution; real-time lip-synced avatar
(state-reactive portraits + core overlay instead); replacing Brandon's meeting
note-takers (he has those; glasses cover it later).
