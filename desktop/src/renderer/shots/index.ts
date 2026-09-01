// S1b — do not edit; add scenarios in your own s3/s4 file.
//
// Merges every stream's shot scenarios into one lookup keyed by the "shot"
// query param (e.g. "index.html?shot=confirm" resolves scenarios["confirm"]
// from s3-scenarios.tsx). scripts/shot.mjs + the EVE_SHOT_URL block in
// electron/main.ts are the harness; this file is just the registry + resolver.
//
// NOTE: whichever stream wires the real App shell (deck.main.tsx /
// summon.main.tsx / flyout-main.tsx) must call resolveShot(window.location.search)
// BEFORE normal routing and render that component instead of the real app
// when it returns non-null — that is what makes "index.html?shot=confirm"
// produce one isolated scenario instead of the whole deck.
import { scenarios as s2 } from "./s2-scenarios";
import { scenarios as s3 } from "./s3-scenarios";
import { scenarios as s4 } from "./s4-scenarios";

const all: Record<string, () => JSX.Element> = { ...s2, ...s3, ...s4 };

export function resolveShot(search: string): (() => JSX.Element) | null {
  const key = new URLSearchParams(search).get("shot");
  if (!key) return null;
  return all[key] ?? null;
}
