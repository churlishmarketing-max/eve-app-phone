// Deck formatting helpers — owning stream: S2.
//
// The clock/date/week trio is copied from the shipped phone client
// (app/src/EveApp.tsx:689-697) so the desktop title bar reads exactly like the
// phone's status bar: "14:07 · SAT 29 AUG · WK 35".

export const APP_VERSION = "0.8.0";

/** localStorage key shared with S4's summon/flyout — a literal, by contract. */
export const CONV_KEY = "eve.desktop.conversationId";
/** Session counter (persisted) + its once-per-launch guard (per-window). */
const SESSION_KEY = "eve.desktop.session";
const SESSION_GUARD = "eve.desktop.session.counted";
/** Set on the first launch that is NOT a harness — the mark that the robots'
 *  boots have been swept out of the count exactly once. */
const SESSION_RESET = "eve.desktop.session.reset-v1";
/** His local portrait/core override, same precedence as the phone's plateMode. */
export const PLATE_KEY = "eve.plateMode";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

export function clockStr(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "SAT 29 AUG" — en-GB short names, uppercased (phone :691). */
export function dateStr(d: Date): string {
  const dow = d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
  const mon = d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
  return `${dow} ${pad2(d.getDate())} ${mon}`;
}

/** Week number, phone :692-697 verbatim (ISO-ish, not strict ISO-8601). */
export function weekNo(d: Date): number {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
}

/**
 * The REAL boot counter. localStorage holds the running total; sessionStorage
 * guards it so a reload inside one app launch (or React StrictMode's double
 * mount) cannot inflate it. Returns the number for this launch.
 *
 * `harness` is config.get().harness — smoke, either screenshot harness, or the
 * tray dump. Those launches READ the total and never advance it, and never set
 * the reset mark either. The first launch that is NOT a harness zeroes the
 * count before counting itself, once, so his first human launch reads SES 001
 * instead of inheriting the robots' tally.
 */
export function bootSession(harness = false): number {
  try {
    const stored = Number(localStorage.getItem(SESSION_KEY) || "0");
    const prev = Number.isFinite(stored) ? stored : 0;
    if (harness) return prev;
    if (sessionStorage.getItem(SESSION_GUARD)) return prev || 1;
    const base = localStorage.getItem(SESSION_RESET) ? prev : 0;
    localStorage.setItem(SESSION_RESET, "1");
    const next = base + 1;
    localStorage.setItem(SESSION_KEY, String(next));
    sessionStorage.setItem(SESSION_GUARD, "1");
    return next;
  } catch {
    return 1;
  }
}

/** His local plate override, or null when her worn look decides. */
export function readPlateMode(): "core" | "portrait" | null {
  try {
    const v = localStorage.getItem(PLATE_KEY);
    return v === "core" || v === "portrait" ? v : null;
  } catch {
    return null;
  }
}

/** Agent → 2-letter job code (handoff §4 Artboard A, verified map). */
const AGENT_CODES: Record<string, string> = {
  eve: "EV",
  research: "RS",
  jsa: "JS",
  "justice-league": "JL",
  "suicide-squad": "SQ",
};

export function agentCode(agent?: string | null): string {
  if (!agent) return "EV";
  return AGENT_CODES[agent] ?? agent.slice(0, 2).toUpperCase();
}

/** Attention kind → row glyph (handoff §4, verified map). */
export function kindGlyph(kind: string): string {
  if (kind === "silent_client") return "@";
  if (kind === "approval") return "▸";
  if (kind === "inbox") return "+";
  return "•";
}

/** "SILENT CLIENT" from "silent_client". */
export function kindLabel(kind: string): string {
  return kind.replace(/_/g, " ").toUpperCase();
}

export function isPast(iso?: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t < Date.now();
}

/** "DUE 15:00" from an ISO stamp, in local time. */
export function dueLabel(iso: string): string {
  const d = new Date(iso);
  return `DUE ${clockStr(d)}`;
}

let idSeq = 0;
export function newId(): string {
  idSeq += 1;
  return `m${Date.now().toString(36)}-${idSeq}`;
}
