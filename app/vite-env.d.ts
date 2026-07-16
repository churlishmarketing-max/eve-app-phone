/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRAIN_URL?: string;
  readonly VITE_BRAIN_TOKEN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
