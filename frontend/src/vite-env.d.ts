/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base path for WindLens API calls, for example "/api". */
  readonly VITE_API_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
