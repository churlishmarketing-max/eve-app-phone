# 05 — APP SHELL (Android)

## 1. Stack

React + Vite, wrapped with **Capacitor** into a native Android APK. ⚑VERIFY
current Capacitor init/build commands and the push-notifications plugin
against live Capacitor docs before scaffolding.

**Design source:** `assets/eve-app-demo.jsx` is the approved v0.5 design —
port its structure, CSS, entity SVG, screens, and interactions faithfully.
Then delete every scripted reply and wire the real brain (`01` §6, rule 1).
The `DEMO DATA` badge dies with the port.

## 2. Chat — streaming UI

- `POST /chat` over SSE. Map stream events → entity states:
  request sent → `thinking` · first token → `speaking` · stream end → `idle`.
  Voice input adds `listening` while the mic is hot.
- Optimistic user bubble on send (text bar already built in the demo — Enter
  sends; never use an HTML `<form>`).
- Render tokens as they arrive; keep the last exchange pinned above the input.
- `confirm_request` events (RED-tier sends) render a confirm card with the
  exact payload and Approve / Cancel — approval round-trips the payload hash.
- Persist conversation id locally so an app restart resumes the thread.

## 3. Voice loop (Phase 3)

- Mic capture → **Deepgram** streaming STT (⚑VERIFY current streaming API) →
  interim transcript shown live → final transcript posts to `/chat`.
- Reply: brain streams text; server (or app) feeds sentences to **ElevenLabs**
  streaming TTS with EVE's imprinted voice ID; playback starts on the first
  sentence while the rest composes. Target: audio starts ≤ ~2.5s after end of
  speech.
- Entity runs `speaking` with the waveform while audio plays.
- Voice spec + audition lines: Character Bible §9.

## 4. Today / Ops — live data

Screens read from Supabase **through the brain** (thin `GET /state` endpoint
or included in `/job` outputs — the app never holds a Supabase key). Approvals
and pulse actions (`approve`, `hold`, `send draft`) POST back through the
brain so tier rules apply. Ops cards map 1:1 to tables: `jobs`,
`attention_items`, `clients`, approvals.

## 5. Wardrobe pipeline (Phase 4)

- `looks` table: `id, name, image_url, status('candidate'|'approved'|'wearing'), created_at`.
- **Generate:** wardrobe "generate" → `/dispatch {agent:'wardrobe'}` → brain
  calls Higgsfield via MCP with the standing style direction Brandon supplies
  (his stylized-look code/mood set) → renders land as candidates.
- **Approve / veto / wear** update the row; the Talk screen shows the worn
  look's portrait behind/above the core; the core remains the universal
  fallback and the speaking indicator.
- **Founding look:** once Brandon locks one, train a Higgsfield **Soul**
  character on it so all future generations are the same identity. Store
  `soul_id` in config.
- Her choice, his veto: EVE may auto-wear from `approved` looks (GREEN);
  adding to `approved` requires Brandon (his veto stands).

## 6. Notifications

- FCM registration on first launch; token posted to the brain.
- Three channels (`brief`, `nudge`, `tripwire`) so Android settings can tune
  sound/priority per class.
- `data.deeplink` routes into the right tab/card on tap.
- Test path in Phase 1: manual `POST /job {job:"morning_brief"}` must land on
  a locked phone with the app killed.

## 7. Android permissions roadmap

| Phase | Permission | Use |
|---|---|---|
| 1 | `POST_NOTIFICATIONS` | push |
| 1 | `RECORD_AUDIO` | mic (used in P3, request early) |
| 4 | Notification listener (special access) | read/triage all phone notifications |
| 4 | `READ_SMS` | read + summarize texts |
| 4 | `SEND_SMS` | dictated replies — **always behind the confirm flow** |

Sideloading is what makes P4 possible — no store review. Each permission gets
a one-line in-app explainer before the system prompt. Raw SMS bodies stay out
of long-term memory (`02` §7).

## 8. Build & deploy (internal)

- Debug keystore is fine to start; create a consistent release keystore by
  P2 so updates install over the top (⚑VERIFY signing steps). Back the
  keystore up — losing it means reinstall-from-scratch.
- Build: Vite build → Capacitor sync → Android Studio / Gradle assemble →
  `eve-<version>.apk` → install via USB or file transfer ("install unknown
  apps" enabled for the file manager).
- Version scheme `0.PHASE.PATCH` (e.g. `0.1.0` = Phase 1 first ship).
- Keep an `apk/` folder of shipped builds with a one-line changelog.

## 9. Quality floor

Responsive to small screens; visible keyboard focus; `prefers-reduced-motion`
respected (already in the demo CSS — keep it); app usable one-handed; every
tap target ≥ 44px; survives rotation and process death without losing the
conversation.
