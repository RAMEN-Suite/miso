import { z } from "zod";
import { envSchema, type Env } from "./schemas/env.schema.js";

/**
 * The environment variables of the server, parsed once when this module is first imported (at startup). If one is
 * missing or invalid, the server prints all problems and exits, instead of failing on the first request.
 *
 * Every read of `process.env` goes through this module. The schema is in `schemas/env.schema.ts`, the variables are
 * documented in `.env.example`.
 *
 * @packageDocumentation
 */

/**
 * Parses the environment variables, or exits the process with the problems.
 *
 * @returns {Env} The parsed environment variables.
 */
function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }

  return result.data;
}

export const env: Env = parseEnv();
