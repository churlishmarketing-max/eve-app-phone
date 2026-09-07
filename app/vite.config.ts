import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// THE SHARED CORE (S1, 2026-09-06). `@shared/*` resolves to the SAME directory
// the desktop renderer aliases — desktop/src/shared — so the job truth, the
// counters and the fleet roster are compiled from ONE source by both builds.
// There is no copy. The desktop declares this alias in electron.vite.config.ts
// (frozen, and untouched: the shared root did not move); this is the phone's
// half of the same bridge, and it must be kept in step with tsconfig.json's
// `paths`, which is the type-side of the identical mapping.
//
// `server.fs.allow` is required because the target sits ABOVE this Vite root;
// without it `vite dev` refuses to serve the file it is happy to bundle.
//
// import.meta.url, not __dirname: this package is "type": "module".
const HERE = fileURLToPath(new URL(".", import.meta.url));
const SHARED = fileURLToPath(new URL("../desktop/src/shared", import.meta.url));

// THE ONE VERSION (D3, 2026-09-06). package.json's "version" is the single
// source; it is read here at config time and substituted into the bundle as a
// string literal, so the header on his screen is the version of the package
// that produced it and cannot drift. src/version.ts is the only consumer.
//
// THE ANDROID HALF IS NOT WIRED — app/android belongs to the packaging stream
// and this stream may not touch it. To close the loop, that stream replaces
// the hardcoded `versionName "1.0"` in android/app/build.gradle with:
//
//   def evePkg = new groovy.json.JsonSlurper().parseText(
//       file("../../package.json").getText("UTF-8"))
//   ...
//   versionName evePkg.version
//
// Until that line lands, package.json drives the SCREEN only; the APK's
// versionName is still the gradle literal. Flagged, not silently assumed.
const PKG_VERSION: string = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(PKG_VERSION) },
  resolve: { alias: { "@shared": SHARED } },
  server: { port: 5173, host: true, fs: { allow: [HERE, SHARED] } },
});
