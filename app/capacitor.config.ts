import type { CapacitorConfig } from "@capacitor/cli";

// appId must equal the Firebase-registered package name AND android applicationId.
// All three = com.churlish.eve (immutable once Firebase registers it).
const config: CapacitorConfig = {
  appId: "com.churlish.eve",
  appName: "EVE",
  webDir: "dist",
  // WebView background — kills the white flash/frame before CSS paints.
  backgroundColor: "#070B0C",
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
