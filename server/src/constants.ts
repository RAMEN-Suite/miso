import type { Env } from "./schemas/env.schema.js";

/**
 * Path to the mounted configuration directory where the config can be stored.
 */
export const CONFIG_DIR: string = "/app/config";

/**
 * Maps the tool names used Miso-internally (e.g. by the frontend: `/api/tools/<name>/...`) to the environment
 * variable that holds that tool's base URL. The set of tool names is stable and maintained here; only
 * the URLs behind them change per deployment.
 */
export const TOOL_URL_MAPPING: Readonly<Record<string, keyof Env & `${string}_URL`>> = {
  tori: "TORI_URL",
  shoyu: "SHOYU_URL",
};
