// ONE-TIME SETUP — put the brain token into the OS-encrypted vault.
//
// Same law as electron/secrets.ts: safeStorage (DPAPI on Windows), base64 into
// userData/config.json as `tokenEnc`, atomic write, NO plaintext fallback, and
// the value is never printed. Reads it from EVE_SETUP_TOKEN in the environment.
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.setName("eve-desktop");

app.whenReady().then(() => {
  const token = (process.env.EVE_SETUP_TOKEN || "").trim();
  const fail = (m) => { console.log("LINK: FAIL — " + m); app.exit(1); };
  if (!token) return fail("no token supplied");

  // Resolve the app's real userData deterministically, not via app name luck.
  const dir = path.join(app.getPath("appData"), "eve-desktop");
  const target = path.join(dir, "config.json");

  let safe = false;
  try { safe = safeStorage.isEncryptionAvailable(); } catch { safe = false; }
  if (!safe) return fail("OS encryption unavailable — refusing to store plaintext");

  let cfg = {};
  try { if (fs.existsSync(target)) cfg = JSON.parse(fs.readFileSync(target, "utf8")); } catch { cfg = {}; }

  let enc;
  try { enc = safeStorage.encryptString(token).toString("base64"); }
  catch { return fail("could not encrypt"); }

  cfg.tokenEnc = enc;
  if (!cfg.brainUrl) cfg.brainUrl = "https://eve-app-phone-production.up.railway.app";

  try {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = target + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, target);
  } catch (e) { return fail("could not write config"); }

  // Prove it round-trips, without revealing it.
  let ok = false;
  try { ok = safeStorage.decryptString(Buffer.from(cfg.tokenEnc, "base64")) === token; } catch { ok = false; }
  console.log("LINK: " + (ok ? "OK" : "FAIL — decrypt mismatch"));
  console.log("LINK: config=" + target + " tokenEnc=" + cfg.tokenEnc.length + " chars ciphertext");
  app.exit(ok ? 0 : 1);
});
