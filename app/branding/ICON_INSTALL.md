# EVE launcher icon — how it's installed

Brandon's "Option A · The Core" icon (the teal orb + orbit rings on near-black,
matching her Talk-screen entity). Source art lives in `eve-icon/` here; the
generated Android resources live in the **gitignored** native project
(`app/android/`), so this folder is the durable source of truth. If the Android
project is ever regenerated (`npx cap add android`), re-run the recipe below.

## What's wired (2026-07-17, app 0.6.1 / versionCode 10)

Adaptive icon (Android 8+), two composited layers the launcher masks per device:

- `eve-icon/adaptive/ic_launcher_foreground.png` (1024², core + rings, transparent)
  → resized into `android/.../res/mipmap-{mdpi..xxxhdpi}/ic_launcher_foreground.png`
  at 108 / 162 / 216 / 324 / 432 px.
- `eve-icon/adaptive/ic_launcher_background.png` (1024², black + teal bloom)
  → same buckets as `ic_launcher_background.png`, same sizes.
- Legacy (pre-API-26) square + round from `eve_icon_1024.png` /
  `eve_icon_rounded_512.png` → `ic_launcher.png` / `ic_launcher_round.png`
  at 48 / 72 / 96 / 144 / 192 px.

XML wiring:
- `res/mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_round.xml`:
  `<background @mipmap/ic_launcher_background/>` + `<foreground @mipmap/ic_launcher_foreground/>`
  (changed from the Capacitor default `@color/ic_launcher_background`).
- `res/values/ic_launcher_background.xml`: color set to `#070B0C` (her near-black,
  the fallback for any color-background path).
- `AndroidManifest.xml` already uses `@mipmap/ic_launcher` + `@mipmap/ic_launcher_round`.

## Re-run recipe (PowerShell, no extra tools)

Resize each layer into the five density buckets with `System.Drawing`
(`InterpolationMode.HighQualityBicubic`, clear to `Transparent` to keep alpha).
Density → (adaptive px, legacy px): mdpi 108/48 · hdpi 162/72 · xhdpi 216/96 ·
xxhdpi 324/144 · xxxhdpi 432/192. Then set the two anydpi-v26 XMLs to the mipmap
background, rebuild `gradlew assembleDebug`, `adb install -r`.

## Still TODO (optional, cosmetic — README §3)

Notification **status-bar** icon wants a flat WHITE silhouette on transparent
(`res/drawable/ic_stat_eve.png`) — the full-color core silhouettes to a white
blob otherwise. Not blocking; only affects the small monochrome status-bar mark,
not the launcher icon or the notification's large icon.

## Launcher cache note

Android launchers cache icons hard. The versionCode bump (→10) usually forces a
refresh on reinstall; if the old icon lingers, restart the launcher (or reboot).
