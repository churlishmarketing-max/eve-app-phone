// ONE ICON (One House Step 10) — put the "Churlish OS" name and the OS icon
// into the hand-kept Android project, WITHOUT regenerating it.
//
// WHY THIS SCRIPT EXISTS. app/android/ is gitignored and hand-customised (six
// native classes, SMS/mic permissions, google-services.json — see
// RUNBOOK_push_and_apk.md, Part B's HAZARD). Capacitor writes `appName` into
// res/values/strings.xml ONLY during `npx cap add android`, which must never
// run again; `npx cap sync android` does not touch the name or the icon. So the
// rename and the icon are applied here, surgically:
//
//   - res/values/strings.xml: app_name and title_activity_main become the
//     appName in capacitor.config.ts. package_name and custom_url_scheme are
//     NOT touched — the package id stays com.churlish.eve, so the update
//     installs over the existing app and keeps its push token.
//   - res/mipmap-*/ic_launcher*.png: replaced with app/branding/os-icon/res/*
//     (the OS's own C/OS icon, pre-sized for every density).
//   - If the adaptive icon XML still points at a flat colour instead of the
//     background PNG, that colour is set to the OS icon's ground (#080809).
//
// Every file it changes is copied first to android/.os-identity-backup/<stamp>/
// so the old EVE name and icon can be put back by copying that folder over.
//
// Usage (from app/):   node scripts/install-os-identity.mjs            apply
//                      node scripts/install-os-identity.mjs --dry      show, change nothing
//                      node scripts/install-os-identity.mjs --android <dir>   another platform dir
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const ai = args.indexOf("--android");
const ANDROID = ai >= 0 && args[ai + 1] ? path.resolve(args[ai + 1]) : path.join(APP, "android");
const RES = path.join(ANDROID, "app", "src", "main", "res");
const ICONS = path.join(APP, "branding", "os-icon", "res");
const OS_GROUND = "#080809";

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!existsSync(RES)) {
  fail(
    `No Android project at ${ANDROID}.\n` +
      "  app/android is gitignored — COPY it out of C:\\dev\\eve\\app\\android.\n" +
      "  NEVER run `npx cap add android` to make one: it wipes the mic, SMS, push and native plugins.",
  );
}

const cfg = readFileSync(path.join(APP, "capacitor.config.ts"), "utf8");
const appName = /appName:\s*"([^"]+)"/.exec(cfg)?.[1];
const appId = /appId:\s*"([^"]+)"/.exec(cfg)?.[1];
if (!appName || !appId) fail("Could not read appName/appId from capacitor.config.ts.");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const BACKUP = path.join(ANDROID, ".os-identity-backup", stamp);
const changed = [];

function backup(file) {
  if (dry || !existsSync(file)) return;
  const to = path.join(BACKUP, path.relative(ANDROID, file));
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(file, to);
}

function write(file, content) {
  backup(file);
  if (!dry) writeFileSync(file, content);
  changed.push(path.relative(ANDROID, file));
}

// 1. The name.
const xmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "\\'").replace(/"/g, '\\"');
const stringsPath = path.join(RES, "values", "strings.xml");
if (!existsSync(stringsPath)) fail(`Missing ${stringsPath}.`);
const strings = readFileSync(stringsPath, "utf8");
const pkg = /<string name="package_name">([^<]*)<\/string>/.exec(strings)?.[1];
if (pkg && pkg !== appId) fail(`strings.xml package_name is ${pkg}, capacitor.config.ts appId is ${appId}. Stopping — the ids must match.`);
let nextStrings = strings;
for (const key of ["app_name", "title_activity_main"]) {
  const re = new RegExp(`(<string name="${key}">)[^<]*(</string>)`);
  if (re.test(nextStrings)) nextStrings = nextStrings.replace(re, `$1${xmlEscape(appName)}$2`);
  else console.warn(`! strings.xml has no ${key} — left as is.`);
}
if (nextStrings !== strings) write(stringsPath, nextStrings);

// 2. The icon.
if (!existsSync(ICONS)) fail(`Missing ${ICONS} — the OS icon set is not in this checkout.`);
for (const dir of readdirSync(ICONS)) {
  const target = path.join(RES, dir);
  if (!existsSync(target)) {
    console.warn(`! ${path.relative(ANDROID, target)} does not exist — skipped.`);
    continue;
  }
  for (const f of readdirSync(path.join(ICONS, dir))) {
    const dest = path.join(target, f);
    backup(dest);
    if (!dry) copyFileSync(path.join(ICONS, dir, f), dest);
    changed.push(path.relative(ANDROID, dest));
  }
}

// 3. The adaptive icon's background, if it is a flat colour.
const adaptive = path.join(RES, "mipmap-anydpi-v26", "ic_launcher.xml");
if (existsSync(adaptive) && /@color\/ic_launcher_background/.test(readFileSync(adaptive, "utf8"))) {
  const colorPath = path.join(RES, "values", "ic_launcher_background.xml");
  if (existsSync(colorPath)) {
    const c = readFileSync(colorPath, "utf8");
    const n = c.replace(/(<color name="ic_launcher_background">)[^<]*(<\/color>)/, `$1${OS_GROUND}$2`);
    if (n !== c) write(colorPath, n);
  }
}

console.log(`${dry ? "[dry run] would change" : "Changed"} ${changed.length} file(s) under ${ANDROID}:`);
for (const c of changed) console.log(`  ${c}`);
console.log(`\nApp name -> "${appName}"   package id -> ${appId} (unchanged)`);
if (!dry && changed.length) console.log(`Backup of the old files: ${BACKUP}`);
console.log("\nNext: npm run build, npx cap sync android, then build the APK (RUNBOOK_os_app.md).");
