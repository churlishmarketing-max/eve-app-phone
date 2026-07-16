// Shared health stamps — written by BOTH the /job route and the in-process
// crons, so /health monitoring isn't blind to scheduled runs (review C9/C24).

export interface Stamp {
  at: string;
  detail?: Record<string, unknown>;
}

const stamps = new Map<string, Stamp>();

export function stamp(name: string, detail?: Record<string, unknown>): void {
  stamps.set(name, { at: new Date().toISOString(), detail });
}

export function getStamp(name: string): Stamp | null {
  return stamps.get(name) ?? null;
}
