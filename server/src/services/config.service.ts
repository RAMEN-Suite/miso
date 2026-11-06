import fs from "fs/promises";
import path from "path";
import { RamenModel } from "@ramen-suite/core";
import { IMisoConfig } from "../models/IMisoConfig.js";
import ExternalServiceError from "../errors/externalService.error.js";
import { CONFIG_DIR } from "../constants.js";
import { isValidConfigFile, isValidHttpUrl } from "../utils/helper.js";
import { collectConfigWarnings, createModelContext } from "../utils/modelHelper.js";
import { ModelContext } from "../models/types.js";
import logger from "../logger.js";

/**
 * The config (as JSON string) whose warnings were logged last. The config is loaded on every call, so its warnings are
 * only logged again when the content changes.
 */
let lastWarnedConfig: string | null = null;

export default class ConfigService {
  /**
   * Retrieves the Miso config as stored. Used to serve it to the client.
   *
   * @throws {ExternalServiceError} If the config can not be loaded or is invalid.
   * @return {Promise<IMisoConfig>} The Miso config.
   */
  public async getConfig(): Promise<IMisoConfig> {
    return (await this.load()).config;
  }

  /**
   * Retrieves the model of the Miso config and its settings, for the accessors in `utils/modelHelper.ts`.
   * Fetched once per request and passed on, since a batch of nodes is checked against it before saving.
   *
   * @throws {ExternalServiceError} If the config can not be loaded or is invalid.
   * @return {Promise<ModelContext>} The model context.
   */
  public async getModelContext(): Promise<ModelContext> {
    return this.load();
  }

  /**
   * Loads the Miso config from the URL in the GUIDELINES_URL environment variable (a remote location or a file in the
   * config directory) and validates its model. Loaded anew on every call, so changes take effect immediately.
   *
   * @throws {ExternalServiceError} If the URL is not provided, the config can not be loaded, or it is invalid.
   * @return {Promise<ModelContext>} The model context of the loaded config.
   */
  private async load(): Promise<ModelContext> {
    // TODO: Improve error handling...technically a local file read error is not a external service error
    const url: string | undefined = process.env.GUIDELINES_URL;

    if (!url) {
      throw new ExternalServiceError(`URL to the config is not provided`);
    }

    if (isValidHttpUrl(url)) {
      return this.prepare(await this.fetchRemote(url));
    }

    if (!isValidConfigFile(url)) {
      throw new ExternalServiceError(`Provided config URL is not a valid file name.`);
    }

    return this.prepare(await this.readLocal(path.join(CONFIG_DIR, url)));
  }

  private async fetchRemote(url: string): Promise<unknown> {
    try {
      const response: Response = await fetch(url);

      if (!response.ok) {
        throw new ExternalServiceError(`Config could not be loaded from remote url`);
      }

      return await response.json();
    } catch {
      throw new ExternalServiceError(`Config could not be loaded from remote url`);
    }
  }

  private async readLocal(filePath: string): Promise<unknown> {
    let fileContent: string;

    try {
      fileContent = await fs.readFile(filePath, "utf-8");
    } catch {
      throw new ExternalServiceError(`Failed to read the config from the provided file`);
    }

    try {
      return JSON.parse(fileContent);
    } catch {
      throw new ExternalServiceError(`Invalid JSON in the provided config file`);
    }
  }

  /**
   * Checks that the data is a Miso config with a valid model, creates its model context and logs the problems the
   * name lookups can't handle (only when the config differs from the one they were last logged for).
   *
   * @param {unknown} data - The parsed JSON.
   * @throws {ExternalServiceError} If the data is no Miso config (e.g. a file in the old guidelines format) or its
   * model is invalid.
   * @return {ModelContext} The model context of the config.
   */
  private prepare(data: unknown): ModelContext {
    const candidate = data as Partial<IMisoConfig> | null;

    if (!candidate?.$schema || !candidate.id || !candidate.model || !candidate.miso || !candidate.meta) {
      throw new ExternalServiceError(
        `The config file is no Miso config (old guidelines format or missing $schema/id?). Generate one with scripts/generate-miso-config.mjs`,
      );
    }

    const config = candidate as IMisoConfig;
    let model: RamenModel;

    try {
      model = RamenModel.import(structuredClone(config.model));
    } catch (error: unknown) {
      throw new ExternalServiceError(`The model in the config is invalid: ${(error as Error).message}`);
    }

    const context: ModelContext = createModelContext(config, model);
    const content: string = JSON.stringify(config);

    if (content !== lastWarnedConfig) {
      collectConfigWarnings(context).forEach((warning) => logger.warn(`Miso config: ${warning}`));
      lastWarnedConfig = content;
    }

    return context;
  }
}
