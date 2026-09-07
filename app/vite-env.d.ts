/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRAIN_URL?: string;
  readonly VITE_BRAIN_TOKEN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build-time define from vite.config.ts, sourced from package.json "version".
// Declared, not defaulted: if the define is ever removed the build fails loudly
// rather than shipping a header that quietly says the wrong version.
declare const __APP_VERSION__: string;
