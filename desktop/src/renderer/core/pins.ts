// THE PINS — owning stream: THE CORE (P1 v0.2 hub half).
//
// Which units THE CORE shows as cards. The brain ships a default (v0.2
// `fleet.units[].pinned`, the manifest's pinned set); he may pin and unpin
// from the FLEET tab, and that choice is HIS and LOCAL — it lives in this
// window's localStorage, never on the wire, never in the brain.
//
// STORED AS OVERRIDES, NOT AS A LIST. If the store held the whole pinned list,
// a re-sync that pins a new unit brain-side would be silently hidden by a
// stale local list. Instead the store carries only the two deltas — keys he
// pinned that the brain did not, and keys he unpinned that the brain did — so
// the brain's default still flows through everything he never touched.
//
// Pure functions first, so the harness can prove the rule without a DOM; the
// storage pair below is the only place that touches localStorage, and it is
// wrapped: a blocked store reads as "no overrides", never as an error.

export const PINS_KEY = "eve.core.pins.v1";

export interface PinOverrides {
  /** Keys pinned locally that the brain's default does not pin. */
  on: string[];
  /** Keys unpinned locally that the brain's default does pin. */
  off: string[];
}

export const NO_PINS: PinOverrides = { on: [], off: [] };

/** The effective pin for one unit: the brain's default, then his override. */
export function isPinned(key: string, brainDefault: boolean, o: PinOverrides): boolean {
  if (o.off.includes(key)) return false;
  if (o.on.includes(key)) return true;
  return brainDefault;
}

/** Flip a unit's pin. The result stores only what DIFFERS from the brain's default. */
export function togglePin(o: PinOverrides, key: string, brainDefault: boolean): PinOverrides {
  const next = !isPinned(key, brainDefault, o);
  const on = o.on.filter((k) => k !== key);
  const off = o.off.filter((k) => k !== key);
  if (next && !brainDefault) on.push(key);
  if (!next && brainDefault) off.push(key);
  return { on, off };
}

function cleanList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && k.length > 0) : [];
}

/** Parse a stored value. Anything malformed reads as "no overrides". */
export function parsePins(raw: string | null | undefined): PinOverrides {
  if (!raw) return NO_PINS;
  try {
    const j = JSON.parse(raw) as { on?: unknown; off?: unknown };
    if (!j || typeof j !== "object") return NO_PINS;
    return { on: cleanList(j.on), off: cleanList(j.off) };
  } catch {
    return NO_PINS;
  }
}

type Store = Pick<Storage, "getItem" | "setItem">;

function store(): Store | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readPins(s: Store | null = store()): PinOverrides {
  if (!s) return NO_PINS;
  try {
    return parsePins(s.getItem(PINS_KEY));
  } catch {
    return NO_PINS;
  }
}

export function writePins(o: PinOverrides, s: Store | null = store()): void {
  if (!s) return;
  try {
    s.setItem(PINS_KEY, JSON.stringify({ on: o.on, off: o.off }));
  } catch {
    /* a blocked store loses the pin for next launch; the screen still reflects it now */
  }
}
