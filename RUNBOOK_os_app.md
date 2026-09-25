# Churlish OS app — phase 1 of "One icon" (One House Step 10)

Brandon's ask: the phone app should run the way the EVE app runs, not like a
web shortcut; he can tell her what to do, she can run the fleet, and she can
reach him by notification (Discord is the brain stream's job; see the end of
this file). Phase 1 turns the EVE app into the **Churlish OS app**. You still
sideload it (Play Store is phase 2).

---

## What changed

**Phone (`app/`)**

| | |
|---|---|
| Name on the home screen | **Churlish OS**. EVE is still the assistant's name inside the app. |
| Launcher icon | The OS's own **C/OS** mark (from the OS repo `public/icons/`), pre-sized in `app/branding/os-icon/`. |
| Package id | **Unchanged: `com.churlish.eve`.** The new APK installs over the old one and keeps her push token, the pairing token, the wardrobe pick and the conversation. |
| New **OS** tab | Sits beside EVE in the bottom bar. Tapping it opens the OS **Inbox** inside the app. The screen underneath has quick links: Inbox, Today, Ledger, Team and EVE full screen. |
| OS push links | A push whose `data.link` is an OS URL opens the OS tab **at that page**: the morning brief and close-out go to `/today`, attention items to `/inbox`, an OS event to its own page. `eve://` deeplinks work as before. |
| Fleet chips on her deck | **What's in my inbox?** and **Who's gone quiet?** send straight away. **Dispatch a unit…** only fills in "Dispatch " so you name the unit and the job. Anything she queues still comes back as a confirm card, as today. |

How the OS shows inside the app: an **in-app browser tab** (Android Custom
Tab, the official `@capacitor/browser` plugin). You sign in to the OS **once**
and it stays signed in, because the tab keeps its login in your phone
browser's saved cookies. If you're already signed in to churlishos.app in
Chrome, you're already signed in here. Back (or the tab's ✕) takes you back
to the app. An in-page iframe was ruled out: the OS login cookie would be
refused inside it and you'd be sent back to `/login` every time (reasoning
in `app/src/os.ts`).

**Desktop (`desktop/`)**

- **Tray right-click → "Churlish OS"** opens a dedicated window on the OS
  Inbox. It uses its own saved session (`persist:churlish-os`), so the OS
  login survives restarts and never mixes with the deck.
- A **CHURLISH OS** button in the deck's title bar does the same. It shows
  when the deck is **1440px or wider** (the default). Narrower than that, the
  bar is already full, so use the tray item.
- The OS window only browses the OS. Links to anywhere else open in your
  normal browser. It has no access to EVE's bridge or token.
- Every existing window works as before.

---

## The one new setting

| name | where | default | secret? |
|---|---|---|---|
| `VITE_CHURLISH_OS_URL` | `app/.env.local` (baked in at build) | `https://churlishos.app` | no |

You only need it if the OS moves. The desktop already has the same setting:
Settings' **OS URL** field, or the `CHURLISH_OS_URL` env var. If neither is
set it uses `https://churlishos.app`.

---

## Build and sideload the phone app (Windows PowerShell 5.1, one line at a time)

> ⚠ **The two rules from RUNBOOK_push_and_apk.md still hold.** NEVER run
> `npx cap add android`: `app\android` is hand-built and not in git, and
> re-adding it wipes the mic, SMS, push and native plugins. And **do not
> uninstall the old app first**: `adb install -r` over the top is what keeps
> her push token and the pairing token.

1. Get the code:
   ```
   cd C:\dev\eve
   git pull
   ```
2. Install the web dependencies (this adds `@capacitor/browser`):
   ```
   cd C:\dev\eve\app
   npm ci
   ```
3. Build the web layer:
   ```
   npm run build
   ```
4. Put the new name and icon into the Android project. Capacitor only writes
   the app name on `cap add`, so a script does it in place. Preview first,
   then apply:
   ```
   npm run os:identity -- --dry
   npm run os:identity
   ```
   It changes `app_name` and `title_activity_main` in `res\values\strings.xml`
   (the package name is untouched) and copies the C/OS icon PNGs over the
   launcher icons. Every file it replaces is backed up to
   `app\android\.os-identity-backup\<time>\`. To go back to EVE's name and
   icon, copy that folder's contents back over `app\android`.
5. Wire in the new plugin. This is safe and required:
   ```
   npx cap sync android
   ```
   The output must list **2 plugins: `@capacitor/browser@6.0.6` and
   `@capacitor/push-notifications@6.0.5`**.
6. Bump the Android version so the launcher picks up the new icon. In
   `app\android\app\build.gradle`, raise `versionCode` by 1 and set
   `versionName "0.11.0"`. Never lower `versionCode`, or the install is
   refused.
7. Build the APK with the **same signing key as the one on the phone**:
   ```
   cd C:\dev\eve\app\android
   .\gradlew.bat assembleDebug
   ```
   If the phone has a **release** build, use `.\gradlew.bat assembleRelease`
   and its APK path below. A different key gets `INSTALL_FAILED_UPDATE_INCOMPATIBLE`;
   if that happens, rebuild with the right key. Do not uninstall.
8. Install over the top:
   ```
   adb install -r app\build\outputs\apk\debug\app-debug.apk
   ```

### Check it on the phone (about 3 minutes)

1. The home screen shows **Churlish OS** with the C/OS icon. If the old icon
   sticks, restart the launcher or reboot. Launchers cache icons.
2. Open it. There should be **no pairing screen** (same package, same
   storage). The header reads **0.11.0**.
3. Tap **OS** in the bottom bar. The Inbox opens inside the app. Sign in
   once. Press Back, tap OS again, and you should still be signed in. Force-close
   the app, reopen it, tap OS: still signed in.
4. On the EVE tab, tap **Dispatch a unit…**. The box should read "Dispatch "
   with the cursor after it. Tap **What's in my inbox?** and she should answer
   from the OS.
5. Push test, with the brain on Railway and the app closed:
   ```
   curl.exe -s -X POST https://<brain>/job -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d "{\"job\":\"morning_brief\",\"force\":true}"
   ```
   Tap the notification. The app should open on the **OS tab** with the OS
   **Today** page on top.

## Rebuild the desktop

Quit EVE from the tray first (right-click → Quit EVE). Then:
```
cd C:\dev\eve\desktop
npm ci
npm run build
npm run smoke
```
`npm run smoke` should end with `ALL PASS (9 checks)`. Relaunch with
`start-eve.bat`. `start-eve.bat` only builds when there's no build at all, so
after a pull always run `npm run build` yourself. Then right-click the tray:
**Churlish OS** should be in the menu. Sign in to the OS in that window once
and it stays signed in.

---

## What could not be proven without the device

These were checked in the browser, on a throwaway Android project and headless
Electron. The phone itself still has to prove:

- That the Custom Tab keeps the OS login across app restarts on *your* phone.
  It uses the default browser's cookies; if your default browser clears
  cookies on exit, you'll be asked to sign in again.
- That tapping a push opens the OS page on both a cold start and a warm start.
  On a cold start the OS page opens over the "WAKE HER UP" screen, and closing
  it lands on that screen.
- The launcher icon on your launcher's mask shape.
- The Gradle build itself (there's no Android SDK here). `cap sync` did wire
  the plugin into a throwaway `cap add` project, and the name/icon script ran
  against it.

## Behaviour changes worth knowing

- The **morning brief** push used to open EVE's Today tab, or Body when the
  check-in wasn't logged yet. The brain now sends an OS link with every brief
  (`/today`), so it opens the **OS Today page**. If you'd rather the Body nudge
  win, the fix is in the brain: don't set `link` when the deeplink is
  `eve://body`.
- **Silent-client, approval and tripwire** pushes now open the OS **Inbox**,
  not EVE's Ops tab.
- On the desktop, toasts (RED confirms and tripwires) still open the deck. A
  toast only opens the OS window when the item carries an OS link, and none do
  today.

---

## Phase 2 (not in this build)

- **Play Store listing.** An AAB signed with the release keystore, a store
  listing, Data safety, content rating. ⚑ Her SMS permissions (`READ_SMS`,
  `SEND_SMS`, `RECEIVE_SMS`) and the notification listener are
  Play-restricted permissions. They need a permissions declaration Google may
  refuse for an app that isn't the default SMS app. Plan for a Play build
  without the SMS senses, or stay on sideload for them.
- **The desktop as the one icon.** Rename EVE Desktop to Churlish OS (product
  name, installer, tray tooltip, the C/OS icon) and give the OS a pane inside
  the deck instead of a second window.
- **The OS without browser chrome on the phone.** `@capacitor/inappbrowser`
  (a WebView overlay) needs minSdk 26 and the Kotlin Gradle plugin in the
  hand-built `android/` project. That's worth doing once the Android project is
  in git.
- **Offline.** Cache the last Inbox/Today read in the app so the OS tab shows
  something with no signal, and queue taps until the link returns. Today the
  OS tab needs a connection, like the OS itself.
- **Discord.** Her Discord messages come from the brain (`brain/src/discord.ts`,
  another stream), not from this app build. Phone push and Discord both come
  from the brain; the app only receives.
