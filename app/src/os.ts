import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

// THE OS, INSIDE THE APP (One House Step 10, "One icon", phase 1).
//
// The Churlish OS is a Next.js site behind a Supabase cookie login. Three ways
// to show it inside this Capacitor 6 app were weighed:
//
//  1. An <iframe> in the deck. REFUSED. The app is served from
//     http://localhost, so churlishos.app in a frame is a THIRD-PARTY context.
//     Capacitor does turn third-party cookies on for its WebView, but the OS's
//     Supabase SSR cookies are SameSite=Lax: Chromium blocks a Lax cookie from
//     being set by, or sent to, a cross-site frame. The login would "work" and
//     the very next request would bounce to /login. Not reliable, by design.
//  2. Navigating the Capacitor WebView itself to the OS. REFUSED. The deck,
//     her chat stream and the push listeners would be torn down on every
//     visit, and the only way home is the back button.
//  3. @capacitor/browser — an Android Custom Tab on top of the app. CHOSEN.
//     It is the official Capacitor plugin (Java, minSdk 22, no Kotlin, no
//     manifest edits; `npx cap sync android` wires it). The tab uses the
//     phone's browser cookie jar, which is persistent, so he signs in to the
//     OS ONCE and stays signed in across opens — and if he is already signed
//     in to churlishos.app in Chrome, he is already signed in here. Back (or
//     the ✕) returns to the app exactly where he left it.
//
// @capacitor/inappbrowser (a WebView overlay) was the runner-up: it needs
// minSdk 26 and the Kotlin gradle plugin, which means editing the hand-kept
// android/ project this repo does not carry. Phase 2 material, not phase 1.

const RAW_OS_URL = (import.meta.env.VITE_CHURLISH_OS_URL ?? "").trim();

/** The OS base URL, no trailing slash. VITE_CHURLISH_OS_URL overrides it. */
export const OS_URL = (RAW_OS_URL || "https://churlishos.app").replace(/\/+$/, "");

const OS_ORIGIN = (() => {
  try {
    return new URL(OS_URL);
  } catch {
    return new URL("https://churlishos.app");
  }
})();

/** Just the host, for the chrome ("churlishos.app"). */
export const OS_HOST = OS_ORIGIN.host;

export type OsPage = "inbox" | "today" | "ledger" | "team" | "eve";

/** The quick links, in the order they sit on the OS screen. */
export const OS_PAGES: ReadonlyArray<{ key: OsPage; label: string; path: string; line: string }> = [
  { key: "inbox", label: "INBOX", path: "/inbox", line: "The one approval surface. One tap, one item." },
  { key: "today", label: "TODAY", path: "/today", line: "The day as the OS sees it." },
  { key: "ledger", label: "LEDGER", path: "/ledger", line: "Every event, one line each." },
  { key: "team", label: "TEAM", path: "/team", line: "The fleet and who is on what." },
  { key: "eve", label: "EVE FULL SCREEN", path: "/eve", line: "Her chat, on the OS." },
];

export const osPageUrl = (page: OsPage): string =>
  `${OS_URL}${OS_PAGES.find((p) => p.key === page)?.path ?? "/inbox"}`;

/** The default landing page when the OS tab opens. */
export const OS_HOME = osPageUrl("inbox");

/**
 * Is this a link into the OS? Same host as OS_URL, and https — or http only
 * when the configured base itself is http (a local dev OS). Anything else is
 * not ours to open in the OS view.
 */
export function isOsUrl(link: unknown): link is string {
  if (typeof link !== "string" || !link) return false;
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return false;
  }
  if (u.host !== OS_ORIGIN.host) return false;
  return u.protocol === "https:" || (u.protocol === "http:" && OS_ORIGIN.protocol === "http:");
}

/** The OS path a URL points at ("/inbox"), for the "last opened" line. */
export function osPathOf(link: string): string {
  try {
    const u = new URL(link);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return "/";
  }
}

/**
 * Where a tapped push goes. Pure, so the routing can be read in one place:
 *
 *  - `data.link` that is an OS URL  -> the OS tab, opened at that URL.
 *  - otherwise the in-app route     -> `n.link ?? n.data.deeplink`, as before
 *                                      (eve://today, eve://ops, eve://body).
 *
 * The brain sets data.link beside deeplink (brain/src/push.ts): brief and
 * close-out -> /today, attention items -> /inbox, an os_event -> the event's
 * own page. A link on any other host is ignored and the deeplink wins.
 */
export type PushTarget = { to: "os"; url: string } | { to: "app"; deeplink: string } | null;

export function pushTarget(n: { link?: string; data?: Record<string, unknown> | null }): PushTarget {
  const data = n.data ?? {};
  const osLink = [data.link, n.link].find(isOsUrl);
  if (osLink) return { to: "os", url: osLink };
  const deeplink = n.link ?? (typeof data.deeplink === "string" ? data.deeplink : undefined);
  return deeplink ? { to: "app", deeplink } : null;
}

/**
 * Open an OS URL inside the app. On the phone that is the Custom Tab; in a
 * desktop browser (dev, preview) the plugin's web half opens a new tab.
 * Refuses anything that is not an OS URL — this is not a general browser.
 */
export async function openOs(url: string = OS_HOME): Promise<boolean> {
  if (!isOsUrl(url)) return false;
  try {
    await Browser.open({
      url,
      // Her near-black, so the tab's toolbar reads as part of the app.
      toolbarColor: "#070B0C",
      presentationStyle: "fullscreen",
    });
    return true;
  } catch (e) {
    console.warn("[os] could not open the OS view", e);
    return false;
  }
}

export const osIsNative = (): boolean => Capacitor.isNativePlatform();
