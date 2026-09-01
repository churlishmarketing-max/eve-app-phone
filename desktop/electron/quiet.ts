// QUIET HOURS — 21:30–06:30 America/Chicago.
//
// This is an EXACT MIRROR of the brain's own law (brain/src/schedule.ts:26-33).
// It is duplicated rather than imported because the desktop must be able to
// suppress a toast with the brain unreachable, and because "the desktop never
// out-pings the brain" (handoff §8) is only true if both sides agree on the
// window to the minute. If the brain's law ever changes, change it HERE too —
// the two files are a matched pair.
//
// Pure and unit-testable on purpose: scripts/smoke.mjs asserts the four
// boundary times (21:29 false / 21:30 true / 06:29 true / 06:30 false) by
// injecting the date.
//
// Owning stream: S1.

const TZ = process.env.EVE_TZ || "America/Chicago";

function hmInTz(d: Date): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // hour12:false still yields "24" for midnight in some ICU builds.
  return { h: h === 24 ? 0 : h, m };
}

export function isQuietHours(date: Date = new Date()): boolean {
  const { h, m } = hmInTz(date);
  const afterStart = h > 21 || (h === 21 && m >= 30);
  const beforeEnd = h < 6 || (h === 6 && m < 30);
  return afterStart || beforeEnd;
}

/** The label the rail chip and the tray flyout render. Not a setting. */
export const QUIET_LABEL = "QUIET 21:30–06:30";

/** Exposed so the smoke test can report which zone it actually evaluated in. */
export function quietTimezone(): string {
  return TZ;
}
