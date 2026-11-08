import { z } from "zod";
import { isValidConfigFile, isValidHttpUrl } from "../utils/url.js";

/**
 * An optional variable: empty values count as not set, since compose passes unset variables as empty strings.
 *
 * @param {T} schema - The schema of a set value.
 * @returns The schema accepting a missing or empty value.
 */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value: unknown) => (value === "" ? undefined : value), schema.optional());
}

/** A required variable that must not be empty */
const requiredString = z.string().min(1);

/** An HTTP(S) URL */
const httpUrl = z.string().refine(isValidHttpUrl, "Must be an http(s) URL.");

/** The environment variables of the server, documented in `.env.example`. Parsed at startup by `env.ts`. */
export const envSchema = z.object({
  APP_HOST: optional(requiredString).default("localhost"),
  APP_PORT: z.coerce.number().int().positive(),
  DATABASE_NAME: optional(requiredString).default("neo4j"),
  FAVICON_URL: optional(httpUrl),
  GUIDELINES_URL: requiredString.refine(
    (value: string) => isValidHttpUrl(value) || isValidConfigFile(value),
    "Must be an http(s) URL or the name of a JSON file in the config directory.",
  ),
  LOG_LEVEL: optional(z.enum(["fatal", "error", "warn", "info", "http", "debug"])).default("debug"),
  NEO4J_PW: requiredString,
  NEO4J_URI: requiredString,
  NEO4J_USER: requiredString,
  NODE_ENV: optional(z.enum(["development", "production"])),
  PROTOCOL: optional(z.enum(["http", "https"])).default("http"),
  SHOYU_URL: optional(httpUrl),
  TORI_URL: optional(httpUrl),
  VALIDATION_MODE: optional(z.enum(["report", "enforce"])).default("report"),
});

/** The parsed environment variables */
export type Env = z.infer<typeof envSchema>;
