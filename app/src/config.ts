// WHAT SHIPS IN THE BUNDLE, AND WHAT NO LONGER DOES (2026-09-06).
//
// The URL stays baked. It is not a secret — it is the public address of her
// brain, it answers 401 to anyone without the token, and hardcoding it is what
// lets him install and pair without typing a hostname on a phone keyboard.
//
// THE TOKEN IS GONE FROM HERE. `BRAIN_TOKEN = import.meta.env.VITE_BRAIN_TOKEN`
// compiled his live bearer token into index-*.js as a plaintext literal, which
// made the APK itself a credential. It now lives on the device, pasted once —
// see tokenStore.ts for the store and why it is that one, and eveApi.ts's
// `verifyBrainToken` for the check that has to pass before it is kept.
// Nothing in src/ may read VITE_BRAIN_TOKEN again.
export const BRAIN_URL = import.meta.env.VITE_BRAIN_URL ?? "http://localhost:8787";
