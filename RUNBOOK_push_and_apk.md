# EVE — Firebase + APK Runbook (Phase 1)

Everything the code already does, and the exact steps only **you** can do (Firebase
console, Android Studio, a physical phone). Verified against live docs 2026-07-15
(Capacitor 6, @capacitor/push-notifications 6.0.5, firebase-admin, FCM HTTP v1).

Pinned versions: **JDK 17** (Android Studio bundles it — do NOT install 21),
Capacitor 6.x, push plugin 6.0.5, Android Studio Hedgehog 2023.1.1+, SDK Platform 34,
`appId` = `com.churlish.eve` (immutable once Firebase registers it).

---

## What's already wired (no action needed)

- **App:** `capacitor.config.ts` (cleartext LAN http), `src/push.ts` (registers with
  FCM, creates the `brief`/`nudge`/`tripwire` channels, posts the token to the brain,
  routes the `eve://today` deeplink). Native-guarded — the browser build is unaffected.
- **Brain:** `firebase.ts` (inits Admin SDK from env, degrades gracefully if unset),
  `push.ts` (`sendPush` + JSON token store), `brief.ts` (generates the ≤25-word brief
  **in character**, enforces the cap), `schedule.ts` (node-cron 07:00 + quiet-hours
  21:30–06:30 guard). Routes: `POST /register-push`, `POST /job {morning_brief}`.
- **Verified working now:** `POST /job {job:"morning_brief","force":true}` returns a
  generated in-character brief (`"…Coffee, then dial. Sorted."`). It reports
  `push-not-configured` until you finish Part A.

---

## Part A — Firebase (you, in the console, ~10 min)

Two files come out of two different console locations. **Do not swap them.**

1. **Create project** — [console.firebase.google.com](https://console.firebase.google.com)
   → *Create a new Firebase project* → name it (e.g. "EVE") → accept terms → Continue →
   Analytics optional → *Create project*.
2. **Register the Android app** — Project overview → Android icon / *Add app* →
   **Android package name = `com.churlish.eve`** (case-sensitive; **cannot be changed
   later**) → optional nickname → *Register app*.
3. **Download `google-services.json`** → **ARTIFACT #1 → the APP.** Save it; in Part B it
   goes to `app/android/app/google-services.json`.
4. **Generate the server key** — gear icon → *Project settings* → **Service accounts**
   tab → *Generate new private key* → confirm. A JSON downloads → **ARTIFACT #2 → the
   BRAIN.** Save it somewhere **outside** the repo (e.g. `C:\dev\eve-secrets\`).
5. **Point the brain at it** — in `brain/.env` set:
   ```
   FIREBASE_SERVICE_ACCOUNT_PATH=C:\dev\eve-secrets\eve-service-account.json
   EVE_TZ=America/New_York        # ← set to your real timezone
   ```
   Restart the brain. `/health` should now show `"pushReady": true`.

No SHA-1 is needed for plain FCM. The device needs Google Play services present.

---

## Part B — APK build (needs Android Studio; ~30 min first time)

This machine has **no Android toolchain** — Android Studio installs the whole thing
(JDK 17 + SDK). Run from `C:\dev\eve\app`.

**Step 0 — Install Android Studio** Hedgehog 2023.1.1 or newer. In its SDK Manager,
install **SDK Platform 34**. That's the entire toolchain — no separate JDK.

**Step 1 — Add the Android platform + Firebase config**
```
cd C:\dev\eve\app
npm run build
npx cap add android          # scaffolds app/android once
# copy Firebase ARTIFACT #1 to: app/android/app/google-services.json
npx cap sync android         # copies dist/ + wires native plugins
```
After `cap add android`, confirm the google-services plugin is wired (Capacitor's
template usually does it). In `android/build.gradle` there should be a
`classpath 'com.google.gms:google-services:...'`, and at the bottom of
`android/app/build.gradle` an `apply plugin: 'com.google.gms.google-services'`.
Do **not** add firebase-bom or firebase-messaging by hand — the push plugin includes
messaging already.

**Step 2 — Set the brain's LAN address** so the phone can reach it off-`localhost`.
Find your PC's LAN IP (`ipconfig`), then in `app/.env.local`:
```
VITE_BRAIN_URL=http://192.168.x.x:8787
VITE_BRAIN_TOKEN=<same as brain EVE_BRAIN_TOKEN>
```
and add that IP to `allowNavigation` in `capacitor.config.ts`. Rebuild
(`npm run build && npx cap sync android`). *(Better long-term: host the brain so the
phone reaches it anywhere — see "Hosting" below.)*

**Step 3 — Debug APK first (quickest path to a phone)**
```
cd android
.\gradlew.bat assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

**Step 4 — Sideload.** On the phone: Settings → About → tap Build number 7× to enable
Developer options → enable USB debugging. Plug in, then:
```
adb install android/app/build/outputs/apk/debug/app-debug.apk
```
Launch EVE, tap "Wake her up", accept the notification permission.

**Step 5 — Prove the morning brief (the Phase 1 DoD).** With the brain running and
`pushReady:true`, and the app installed + permission granted:
```
curl -s -X POST http://localhost:8787/job -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" -d "{\"job\":\"morning_brief\",\"force\":true}"
```
A push should land on the phone's lock screen (kill the app first to prove background
delivery). Tapping it should open EVE to the Today tab.

---

## Part C — Release keystore (before real daily use)

Debug builds are fine to start, but **the first key that installs on a device governs
all future updates** — switch to a release keystore early and **back it up forever**
(lose it and you can't update over the top).

```
cd C:\dev\eve\app\android
keytool -genkey -v -keystore eve-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias eve
```
`android/keystore.properties` (git-ignored):
```
storePassword=...
keyPassword=...
keyAlias=eve
storeFile=eve-release.jks
```
Add a `signingConfigs.release` block reading those props into `android/app/build.gradle`
(see the synthesis guide §6 for the exact Groovy snippet), then:
```
.\gradlew.bat assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

---

## Still ⚑VERIFY (only confirmable on-device)

- FCM token actually arrives and `/register-push` stores it (`data/push-tokens.json`).
- Channel importance renders right: heads-up for `tripwire`, silent for `nudge`.
- Android 13+ permission prompt appears; denial correctly skips registration.
- Cleartext LAN reach: the WebView loads `http://<LAN>:8787` (a changed IP silently
  breaks it — prefer hosting or an mDNS `*.local` name).
- Deeplink opens Today on both cold and warm start.
- 07:00 cron fires at 07:00 local across a DST boundary (`EVE_TZ` set correctly).

## Hosting (removes the LAN-IP fragility)

For the brain to reach the phone anywhere and survive IP changes, host it (Railway /
Fly / Render — 02_ARCHITECTURE §4). Then `VITE_BRAIN_URL` is a stable https URL, you can
drop `cleartext`, and n8n can hit `/job` on schedule instead of node-cron. That's a
Phase 1-polish / Phase 2 step.
