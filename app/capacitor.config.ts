import type { CapacitorConfig } from "@capacitor/cli";

// appId must equal the Firebase-registered package name AND android applicationId.
// All three = com.churlish.eve (immutable once Firebase registers it).
//
// ONE ICON (One House Step 10): the app is "Churlish OS" on his home screen;
// EVE stays the name of the assistant inside it. The appId does NOT change, so
// the new APK installs over the old one and keeps its push token. Capacitor
// only writes appName into android/ on `cap add` (which must never run again),
// so `npm run os:identity` puts this name and the OS icon into the existing
// platform — see RUNBOOK_os_app.md.
const config: CapacitorConfig = {
  appId: "com.churlish.eve",
  appName: "Churlish OS",
  webDir: "dist",
  // WebView background — kills the white flash/frame before CSS paints.
  // Matches the OS reskin's --bg (src/eveStyles.ts OS.bg).
  backgroundColor: "#080809",
  server: {
    // Serve the app over http:// so calling the http:// brain isn't mixed content.
    androidScheme: "http",
    // Re-enable plaintext HTTP (blocked by default since API 28). The CLI stamps
    // usesCleartextTraffic=true into the manifest — no network_security_config needed.
    cleartext: true,
    // localhost works when the phone is USB-tethered via `adb reverse tcp:8787`.
    // The LAN entries are for Wi-Fi delivery; ⚑ swap in the brain's real IP/host.
    allowNavigation: ["localhost", "192.168.0.4", "*.local"],
  },
};

export default config;
