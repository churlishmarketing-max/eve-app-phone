// THE ONE SECRET, AND WHERE IT LIVES (2026-09-06).
//
// It used to live in the bundle. `config.ts` read VITE_BRAIN_TOKEN at build
// time, so every APK this project has ever produced — 0.7.0 and 0.8.0 both —
// carried his live brain bearer token as a plaintext string literal inside
// index-*.js. That made the APK itself a credential: anyone holding the file
// could read the token out of it in seconds and talk to her brain as him. It
// could never be shared, mailed to himself, or backed up anywhere.
//
// Now he pastes it ONCE, on the phone, and it is never in the bundle again.
// This module is the only thing that knows where it is kept.
//
// ---------------------------------------------------------------------------
// WHAT STORE THIS IS, AND WHY IT IS THIS ONE
// ---------------------------------------------------------------------------
// Investigated on this project, 2026-09-06. The stack in front of us:
//
//   installed Capacitor plugins  @capacitor/core, @capacitor/android,
//                                @capacitor/push-notifications  (package.json)
//                                + three hand-written Java plugins in
//                                android/app/src/main/java/.../plugins
//   NOT installed                @capacitor/preferences
//   NOT installed                any EncryptedSharedPreferences / Keystore
//                                bridge (capacitor-secure-storage-plugin etc.)
//
// So the ladder, strongest first:
//
//   1. Android Keystore-backed EncryptedSharedPreferences — key material held
//      by the TEE/StrongBox, ciphertext at rest even to a root shell that has
//      not also broken the Keystore. REQUIRES A NATIVE PLUGIN THIS PROJECT
//      DOES NOT HAVE (either a new npm dependency or new Java in android/,
//      plus a `cap sync` and an APK build to prove a single line of it works).
//   2. @capacitor/preferences -> Android SharedPreferences XML. Also not
//      installed, and — worth saying plainly — an XML file in the app's
//      private data dir is NOT cryptographically stronger than what we use
//      below. It is the same sandbox, in a different file format.
//   3. THE WEBVIEW'S OWN localStorage. App-private
//      (/data/data/com.churlish.eve/app_webview/...), unreadable by any other
//      installed app under the Android sandbox, encrypted at rest with the
//      device under file-based encryption, and it survives an app UPDATE
//      (same package + same signing key) so he pairs once, not once per build.
//
// WE USE 3. Per the brief: use the strongest thing available today rather than
// adding a plugin, and name what a later pass should switch to. A later pass
// should switch to 1 — EncryptedSharedPreferences via a native plugin — and
// it only has to reimplement the four async functions below.
//
// WHAT THIS ACTUALLY PROTECTS AGAINST — stated honestly, because a security
// note that overclaims is worse than none:
//   PROTECTED  the APK is no longer a credential. Build it, mail it, back it
//              up, hand it to anyone: it contains no token. This is the whole
//              bug, and it is closed.
//   PROTECTED  another installed app reading the value. Android's per-uid
//              sandbox; there is no shared-storage copy and no world-readable
//              file.
//   PROTECTED  the value on a lost/stolen locked phone, to the strength of his
//              lockscreen + file-based encryption.
//   NOT PROTECTED  a rooted phone or a physical image of the userdata
//              partition. A root shell reads the leveldb file directly. Only
//              tier 1 above raises that bar, and only somewhat.
//   NOT PROTECTED  `allowBackup="true"` is still set in AndroidManifest.xml
//              (android/app/src/main/AndroidManifest.xml:5), so a device
//              backup can carry this value off the phone. That manifest
//              belongs to the packaging stream and was NOT touched here; it is
//              flagged, not silently assumed away.
//
// ---------------------------------------------------------------------------
// THE SHAPE IS ASYNC ON PURPOSE
// ---------------------------------------------------------------------------
// localStorage is synchronous; Preferences and any Keystore bridge are not.
// The load/save/clear surface is async so the swap in a later pass is a change
// to THIS FILE ONLY. The read on the request path (`brainToken()`) is sync
// against an in-memory cache that `loadToken()` warms before a single screen
// renders — twenty fetch call sites in eveApi.ts do not become async for this.

const TOKEN_KEY = "eve.brainToken";

// EVIDENCE OF A PREVIOUS INSTALL (the migration question, P5). These are keys
// the 0.7/0.8 app wrote itself: the conversation id, his plate choice, his
// worn look. If any of them exist and the token does not, this is not a fresh
// install — it is his phone, after the update that took the baked token away.
// See MIGRATION in Pairing.tsx for what we do about it and why.
const PRIOR_INSTALL_KEYS = ["eve.conversationId", "eve.plateMode", "eve.wearing"];

let cached: string | null = null;
let loaded = false;

/** Warm the cache from the store. Call once, before anything renders. */
export async function loadToken(): Promise<string | null> {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    cached = raw && raw.trim() ? raw.trim() : null;
  } catch {
    // A WebView with storage disabled. Not fatal: he can still pair for this
    // session, and the pairing screen will simply come back next launch.
    cached = null;
  }
  loaded = true;
  return cached;
}

/**
 * THE REQUEST PATH. Sync, cached, and never anything but the token — callers
 * put this in an Authorization header and nowhere else. Returns "" when
 * unpaired, which the brain answers with a 401 rather than a crash.
 */
export function brainToken(): string {
  return cached ?? "";
}

/** True once loadToken() has run — the gate uses it, nothing else should. */
export function tokenLoaded(): boolean {
  return loaded;
}

/** Is one stored at all? Never returns the value. */
export function hasToken(): boolean {
  return !!cached;
}

/**
 * THE MASKED CONFIRMATION (P4). The desktop's discipline — "present, N chars"
 * — is the whole of what any screen is allowed to know. There is deliberately
 * no accessor that hands the value to a component.
 */
export function tokenFingerprint(): { present: boolean; chars: number } {
  return { present: !!cached, chars: cached?.length ?? 0 };
}

/** Store it. Only ever called with a token the brain has already accepted. */
export async function saveToken(token: string): Promise<void> {
  const t = token.trim();
  cached = t || null;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage refused — the in-memory copy still carries this session */
  }
}

/**
 * ERASE IT (P4). removeItem, not setItem(""): the key is gone from the store,
 * not blanked. Verified by reading the store back, not by trusting this
 * function — see the sign-out check in the verification notes.
 */
export async function clearToken(): Promise<void> {
  cached = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to remove */
  }
}

/** Did a previous version of this app run on this device? (P5) */
export function hasPriorInstall(): boolean {
  try {
    return PRIOR_INSTALL_KEYS.some((k) => localStorage.getItem(k) !== null);
  } catch {
    return false;
  }
}
