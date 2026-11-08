import { z } from "zod";
import { envSchema, type Env } from "./schemas/env.schema.js";

/**
 * The server's environment variables (schema: `schemas/env.schema.ts`), parsed on first import at startup. If one is
 * missing or invalid, the server prints all problems and exits. All `process.env` reads go through here.
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
