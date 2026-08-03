// Local-day arithmetic, in ONE place. Extracted from floor.ts (which had the
// only DST-safe implementation, module-private) so ops.ts and vitals.ts stop
// re-deriving it wrongly. Same doctrine as the note at proactive.ts:26-27.
export const TZ = process.env.EVE_TZ || "America/Chicago";

// How far the given instant's wall-clock in `tz` sits from UTC, in ms.
// MOVED VERBATIM from floor.ts:27-37 — no behaviour change.
export function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value])) as Record<string, string>;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - date.getTime();
}

// MOVED VERBATIM from floor.ts:42-47 — no behaviour change.
export function zonedToUtc(y: number, m: number, d: number, hh: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, 0, 0);
  const off1 = tzOffsetMs(new Date(guess), tz);
  const off2 = tzOffsetMs(new Date(guess - off1), tz);
  return new Date(guess - off2);
}

// YYYY-MM-DD in King's timezone. Identical to ops.ts:5-7 / proactive.ts:16-18.
export function localDay(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

// Day arithmetic anchored at NOON local, so a ±1h DST shift can never move the
// answer across a date boundary. This is the fix for the live bug in
// ops.ts:9-11, which returns Saturday on the Monday after spring-forward
// (00:00–01:00 local) and returns TODAY on fall-back Sunday (23:00–24:00 local).
export function addLocalDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const noon = zonedToUtc(y, m, d, 12, TZ);
  return localDay(new Date(noon.getTime() + n * 86400_000));
}

export function lastNDays(n: number, today = localDay()): string[] {
  return Array.from({ length: n }, (_, i) => addLocalDays(today, i - (n - 1)));
}

// "MON".."SUN" for a YYYY-MM-DD local day, for the 7-day strip.
export function dowLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return zonedToUtc(y, m, d, 12, TZ)
    .toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" })
    .toUpperCase();
}
