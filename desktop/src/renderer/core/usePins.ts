// HIS PINS, AS A HOOK — owning stream: THE CORE (P1 v0.2 hub half).
//
// One module-level copy of the overrides, read from localStorage once, written
// back on every toggle, and broadcast to every mounted subscriber — so a pin
// flipped on the FLEET tab is what THE CORE draws the moment he presses 5, and
// the two screens can never hold two different answers.

import { useCallback, useEffect, useState } from "react";
import { readPins, togglePin, writePins, type PinOverrides } from "./pins";

let current: PinOverrides | null = null;
const subs = new Set<(o: PinOverrides) => void>();

function get(): PinOverrides {
  if (!current) current = readPins();
  return current;
}

function set(next: PinOverrides): void {
  current = next;
  writePins(next);
  for (const s of subs) s(next);
}

export function usePins(): { pins: PinOverrides; toggle: (key: string, brainDefault: boolean) => void } {
  const [pins, setPins] = useState<PinOverrides>(get);
  useEffect(() => {
    subs.add(setPins);
    setPins(get());
    return () => {
      subs.delete(setPins);
    };
  }, []);
  const toggle = useCallback((key: string, brainDefault: boolean) => set(togglePin(get(), key, brainDefault)), []);
  return { pins, toggle };
}
