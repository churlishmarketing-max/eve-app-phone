// ONE HOUSE STEP 4c · 4.1 — CORS IS AN ALLOW-LIST NOW, NOT A MIRROR.
//
// Until this step the brain reflected ANY Origin back in
// Access-Control-Allow-Origin, on the argument that "the bearer token is the
// real gate". That was true while the only browser that ever held a credential
// was his own app. It stops being enough the day the OS's browser holds an OS
// TICKET (src/os-ticket.ts): a ticket is a credential a web page carries, and a
// page on any other origin must not be able to read what the brain answers to
// it. So the brain names the origins it answers, and every other origin gets NO
// Access-Control-Allow-Origin header at all — never `*`.
//
// WHERE THE LIST COMES FROM:
//   · EVE_ALLOWED_ORIGINS (Railway variable, comma-separated) when it is set —
//     it REPLACES the default list, it does not add to it.
//   · EVE_ALLOWED_ORIGINS=*  → the old reflect-any behaviour, for a laptop test.
//     The boot log then says `[cors] OPEN (*)` so it cannot ship unnoticed.
//   · otherwise DEFAULT_ALLOWED_ORIGINS below — every origin this repo's own
//     clients were found to use (grep of app/ and desktop/, 2026-09-25).
//
// WHAT CORS DOES NOT TOUCH: a request with no Origin header — the OS's server
// routes on Vercel, curl, the Electron MAIN process (desktop/electron/api.ts
// does every brain call from main; the renderer only talks IPC), n8n. Those
// never had CORS and still don't. Same-origin calls (the /console page served
// by the brain itself) are allowed by Host match.
//
// Pure except for the refusal log, which is once per origin per process and
// prints the ORIGIN ONLY — never a header, a token, a path or a body.

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  // The OS — the reason this list exists.
  "https://churlishos.app",
  "https://www.churlishos.app",
  // The phone app's WebView (app/capacitor.config.ts sets androidScheme "http",
  // so the Android WebView's origin is http://localhost). https://localhost is
  // Capacitor's DEFAULT Android scheme — kept so dropping that line in the
  // config does not silently cut her off. capacitor://localhost is Capacitor iOS.
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  // Vite dev for app/ (vite.config.ts server.port 5173), which is also
  // electron-vite's default renderer dev port. A phone hitting the dev server
  // over Wi-Fi (http://<LAN-IP>:5173) is NOT here — set EVE_ALLOWED_ORIGINS for that.
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export type CorsPolicy = { open: true } | { open: false; origins: ReadonlySet<string> };

/** `https://X.app/` and `HTTPS://x.app` are the same origin; the header never carries a path. */
function norm(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

export function corsPolicy(envValue: string | undefined): CorsPolicy {
  const raw = (envValue ?? "").trim();
  if (raw === "*") return { open: true };
  const list = raw ? raw.split(",").map(norm).filter((o) => o && o !== "*") : DEFAULT_ALLOWED_ORIGINS.map(norm);
  return { open: false, origins: new Set(list) };
}

export function corsBanner(p: CorsPolicy, fromEnv: boolean): string {
  if (p.open) return "[cors] OPEN (*) — EVE_ALLOWED_ORIGINS=* reflects every origin. Laptop tests only.";
  return `[cors] allow-list${fromEnv ? " (EVE_ALLOWED_ORIGINS)" : " (default)"}: ${[...p.origins].join(", ")}`;
}

/**
 * Should this Origin get Access-Control-Allow-Origin? `host` is the request's
 * Host header: a page the brain served itself (/console) is same-origin and is
 * always allowed, whatever the list says.
 */
export function corsAllows(origin: string, p: CorsPolicy, host?: string): boolean {
  if (p.open) return true;
  const o = norm(origin);
  if (p.origins.has(o)) return true;
  if (host) {
    try {
      if (new URL(o).host === host.toLowerCase()) return true;
    } catch {
      /* "null" (file://, sandboxed frames) and garbage are not URLs — refused */
    }
  }
  return false;
}

// Once per origin per process, and bounded, so a scanner cycling origins
// cannot turn this into a log flood.
const warned = new Set<string>();
const MAX_WARNED = 50;
export function noteRefusedOrigin(origin: string, warn: (line: string) => void = console.warn): void {
  const o = norm(origin).slice(0, 200);
  if (warned.has(o)) return;
  if (warned.size === MAX_WARNED) {
    warned.add(o);
    warn(`[cors] refused ${MAX_WARNED}+ distinct origins; further refusals are not logged`);
    return;
  }
  if (warned.size > MAX_WARNED) return;
  warned.add(o);
  warn(`[cors] refused origin ${o}`);
}
