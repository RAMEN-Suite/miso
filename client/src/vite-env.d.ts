/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_HOST: string;
  readonly VITE_PROTOCOL: "http" | "https";
  /** Minimum level of the client logger (`debug`, `info`, `warn`, `error`). */
  readonly VITE_LOG_LEVEL?: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
