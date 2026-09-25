/// <reference types="vite/client" />

// VITE_BRAIN_TOKEN IS DELIBERATELY ABSENT (2026-09-06). It was declared here
// and read in config.ts, which baked his live brain token into the bundle.
// Leaving the declaration behind would invite the next hand to reach for it;
// with it gone, `import.meta.env.VITE_BRAIN_TOKEN` is a type error. The token
// lives on the device now (src/tokenStore.ts).
interface ImportMetaEnv {
  readonly VITE_BRAIN_URL?: string;
  // The Churlish OS base URL for the OS tab and OS push links (One House
  // Step 10). Not a secret — the OS is behind its own login. Defaults to
  // https://churlishos.app when unset (src/os.ts).
  readonly VITE_CHURLISH_OS_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build-time define from vite.config.ts, sourced from package.json "version".
// Declared, not defaulted: if the define is ever removed the build fails loudly
// rather than shipping a header that quietly says the wrong version.
declare const __APP_VERSION__: string;
