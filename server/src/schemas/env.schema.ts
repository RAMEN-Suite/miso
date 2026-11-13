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

/** A non-empty string */
const nonEmptyString = z.string().min(1);

/** An HTTP(S) URL */
const httpUrl = z.string().refine(isValidHttpUrl, "Must be an http(s) URL.");

/** The environment variables of the server, documented in `.env.example`. Parsed at startup by `env.ts`. */
export const envSchema = z.object({
  APP_HOST: optional(z.string()).default("localhost"),
  APP_PORT: z.coerce.number().int().positive(),
  DATABASE_NAME: optional(z.string()).default("neo4j"),
  FAVICON_URL: optional(httpUrl),
  GUIDELINES_URL: nonEmptyString.refine(
    (value: string) => isValidHttpUrl(value) || isValidConfigFile(value),
    "Must be an http(s) URL or the name of a JSON file in the config directory.",
  ),
  LOG_LEVEL: optional(z.enum(["fatal", "error", "warn", "info", "http", "debug"])).default("debug"),
  NEO4J_PW: nonEmptyString,
  NEO4J_URI: nonEmptyString,
  NEO4J_USER: nonEmptyString,
  NODE_ENV: optional(z.enum(["development", "production"])),
  PROTOCOL: optional(z.enum(["http", "https"])).default("http"),
  SHOYU_URL: optional(httpUrl),
  TORI_URL: optional(httpUrl),});

/** The parsed environment variables */
export type Env = z.infer<typeof envSchema>;
