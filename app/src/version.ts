// THE ONE VERSION (D3, 2026-09-06).
//
// The screen said 0.7.0 and the package said 1.0, and neither had any relation
// to the other or to the truth. In a build that exists BECAUSE his phone was
// five weeks stale, the header is how he tells whether the update took — so it
// cannot be a literal typed into a component.
//
// THE SINGLE SOURCE IS app/package.json's "version" field. Nothing else may
// declare a version:
//
//   package.json "version"
//     |
//     +-- vite.config.ts  define: __APP_VERSION__   -> this module -> the header
//     +-- android/app/build.gradle versionName      -> the APK
//
// __APP_VERSION__ is a build-time define (vite.config.ts), declared for the
// type-checker in vite-env.d.ts. It is substituted as a string literal at
// build AND at dev, so there is no runtime read and no way for the bundle to
// carry a different number than the package.json it was built from.
//
// THE ANDROID HALF IS NOT WIRED HERE. app/android belongs to the packaging
// stream and this stream is forbidden to touch it; see the note in
// vite.config.ts for the exact gradle lines that close the loop.
export const APP_VERSION: string = __APP_VERSION__;
