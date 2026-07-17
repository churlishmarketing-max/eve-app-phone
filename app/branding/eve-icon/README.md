# EVE — App Icon (Option A · The Core)

The constant beneath the wardrobe. Her looks change; this doesn't. The core is
her resting form — the same shape that greets you on the Talk screen, distilled
to a glyph. Churlish teal (#1CB9C8 → #007A87) on near-black (#070B0C).

## Files

| File | Use |
|---|---|
| `eve_icon_1024.png` | Master, full-bleed square. Play Store listing, general use. |
| `eve_icon_rounded_512.png` / `_192.png` | Pre-rounded launcher icon (fallback for non-adaptive). |
| `adaptive/ic_launcher_foreground.png` | Adaptive **foreground** (core + ring, safe-zone scaled). |
| `adaptive/ic_launcher_background.png` | Adaptive **background** (black field + teal bloom). |
| `adaptive/preview_circle.png` / `preview_squircle.png` | How launchers render it. Reference only. |
| `legibility/` | Small-size checks (48–144px) + contact sheet. |
| `eve_icon_master.svg`, `eve_fg.svg`, `eve_bg.svg` | Editable vector sources. |

## Wiring into the Capacitor / Android APK

Android adaptive icons use two layers composited by the launcher (it masks to
circle/squircle/teardrop per device).

1. Drop the two adaptive PNGs into the density buckets under
   `android/app/src/main/res/` (`mipmap-mdpi` … `mipmap-xxxhdpi`), or generate
   them from the SVGs at each density. Easiest path: **Android Studio →
   right-click `res` → New → Image Asset → Launcher Icons (Adaptive)**, set
   foreground = `ic_launcher_foreground.png`, background = `ic_launcher_background.png`.
   ⚑VERIFY the current Image Asset flow in your Android Studio version.
2. That produces `ic_launcher.xml` / `ic_launcher_round.xml` in `mipmap-anydpi-v26`
   referencing the two layers. Confirm `AndroidManifest.xml`'s `<application>`
   uses `android:icon="@mipmap/ic_launcher"` and `android:roundIcon="@mipmap/ic_launcher_round"`.
3. For the notification small-icon (status bar), Android wants a **flat white
   silhouette** on transparent — the full-color core won't render there. Make a
   simple white ring+dot glyph separately and set it as the FCM notification
   icon (`res/drawable/ic_stat_eve.png`, white on transparent). ⚑VERIFY in the
   Capacitor push plugin config.

## Notes

- Keep it teal everywhere. Her GHOST IN BLUE look is the one intentional
  departure from the house palette — the icon never follows it there.
- If you ever want the animated version (core breathing) for a splash screen,
  the Talk-screen entity SVG in the app already does it; reuse that, not this.
