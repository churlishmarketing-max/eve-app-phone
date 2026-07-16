// Single-user, sideloaded app: these ship in the bundle by design (02 §7).
export const BRAIN_URL = import.meta.env.VITE_BRAIN_URL ?? "http://localhost:8787";
export const BRAIN_TOKEN = import.meta.env.VITE_BRAIN_TOKEN ?? "";
