import fs from "fs/promises";
import path from "path";
import { RamenModel } from "@ramen-suite/core";
import { ConfigIndex, IMisoConfig } from "../models/IMisoConfig.js";
import { PropertyConfig } from "../models/types.js";
import ExternalServiceError from "../errors/externalService.error.js";
import { CONFIG_DIR } from "../constants.js";
import { isValidConfigFile, isValidHttpUrl } from "../utils/helper.js";
import { buildConfigIndex } from "../utils/configIndex.js";
import logger from "../logger.js";

/** The loaded config and its index. `version` is the file's mtime, or `null` for remote configs (loaded once). */
interface LoadedConfig {
  url: string;
  version: number | null;
  config: IMisoConfig;
  index: ConfigIndex;
}

/** Shared by all service instances, since the lookups run on every write request */
let loaded: LoadedConfig | null = null;

export default class GuidelinesService {
  /**
   * Retrieves the field configuration of an annotation with the given type: the properties of its annotation shape.
   *
   * The method operates on the given index parameter instead of fetching from within. This is done
   * to prevent multiple requests, since the method is used to preprocess a batch of annotations before
   * saving them.
   *
   * @param {ConfigIndex} index - The lookup index to retrieve the field configuration from.
   * @param {string} type - The type of the annotation.
   * @return {PropertyConfig[]} The field configuration for the annotation type.
   */
  public getAnnotationConfigFieldsFromGuidelines(index: ConfigIndex, type: string): PropertyConfig[] {
    return index.contents.annotationTypes.find((annoConfig) => annoConfig.type === type)?.properties ?? [];
  }

  /**
   * Retrieves the field configuration of a collection with the given additional node labels: the attributes of the
   * Collection node, followed by those of the matching types.
   *
   * The method operates on the given index parameter instead of fetching from within. This is done
   * to prevent multiple requests, since the method is used to preprocess a batch of collections before
   * saving them.
   *
   * @param {ConfigIndex} index - The lookup index to retrieve the field configuration from.
   * @param {string[]} nodeLabels - The additional labels of the collection.
   * @return {PropertyConfig[]} The field configuration for the collection type.
   */
  public getCollectionConfigFieldsFromGuidelines(index: ConfigIndex, nodeLabels: string[]): PropertyConfig[] {
    const additional: PropertyConfig[] = index.collections.types
      .filter((type) => nodeLabels.includes(type.additionalLabel))
      .flatMap((type) => type.properties);

    return [...index.collections.properties, ...additional];
  }

  /**
   * Retrieves the guidelines, i.e. the Miso config, as stored. Used to serve it to the client.
   *
   * @throws {ExternalServiceError} If the config can not be loaded or is invalid.
   * @return {Promise<IMisoConfig>} The Miso config.
   */
  public async getGuidelines(): Promise<IMisoConfig> {
    return (await this.load()).config;
  }

  /**
   * Retrieves the lookup index built from the Miso config.
   *
   * @throws {ExternalServiceError} If the config can not be loaded or is invalid.
   * @return {Promise<ConfigIndex>} The lookup index.
   */
  public async getConfigIndex(): Promise<ConfigIndex> {
    return (await this.load()).index;
  }

  /**
   * Loads the Miso config from the URL in the GUIDELINES_URL environment variable (a remote location or a file in the
   * config directory), validates its model and builds the index. A local file is reloaded when it changes, a remote
   * config is loaded once per process.
   *
   * @throws {ExternalServiceError} If the URL is not provided, the config can not be loaded, or it is invalid.
   * @return {Promise<LoadedConfig>} The loaded config and its index.
   */
  private async load(): Promise<LoadedConfig> {
    // TODO: Improve error handling...technically a local file read error is not a external service error
    const url: string | undefined = process.env.GUIDELINES_URL;

    if (!url) {
      throw new ExternalServiceError(`URL to guidelines is not provided`);
    }

    if (isValidHttpUrl(url)) {
      if (loaded && loaded.url === url) {
        return loaded;
      }

      loaded = this.prepare(url, null, await this.fetchRemote(url));
      return loaded;
    }

    if (!isValidConfigFile(url)) {
      throw new ExternalServiceError(`Provided guidelines URL is not a valid file name.`);
    }

    const filePath: string = path.join(CONFIG_DIR, url);
    let version: number;

    try {
      version = (await fs.stat(filePath)).mtimeMs;
    } catch {
      throw new ExternalServiceError(`Failed to read guidelines from the provided file`);
    }

    if (loaded && loaded.url === url && loaded.version === version) {
      return loaded;
    }

    loaded = this.prepare(url, version, await this.readLocal(filePath));
    return loaded;
  }

  private async fetchRemote(url: string): Promise<unknown> {
    try {
      const response: Response = await fetch(url);

      if (!response.ok) {
        throw new ExternalServiceError(`Guidelines could not be loaded from remote url`);
      }

      return await response.json();
    } catch {
      throw new ExternalServiceError(`Guidelines could not be loaded from remote url`);
    }
  }

  private async readLocal(filePath: string): Promise<unknown> {
    let fileContent: string;

    try {
      fileContent = await fs.readFile(filePath, "utf-8");
    } catch {
      throw new ExternalServiceError(`Failed to read guidelines from the provided file`);
    }

    try {
      return JSON.parse(fileContent);
    } catch {
      throw new ExternalServiceError(`Invalid JSON in the provided guidelines file`);
    }
  }

  /**
   * Checks that the data is a Miso config with a valid model and builds its index.
   *
   * @param {string} url - Where the config was loaded from.
   * @param {number | null} version - The file's mtime, `null` for remote configs.
   * @param {unknown} data - The parsed JSON.
   * @throws {ExternalServiceError} If the data is no Miso config (e.g. an old guidelines file) or its model is invalid.
   * @return {LoadedConfig} The loaded config and its index.
   */
  private prepare(url: string, version: number | null, data: unknown): LoadedConfig {
    const candidate = data as Partial<IMisoConfig> | null;

    if (!candidate?.model || !candidate.miso || !candidate.meta) {
      throw new ExternalServiceError(
        `The guidelines file is no Miso config (old guidelines format?). Generate one with scripts/generate-miso-config.mjs`,
      );
    }

    const config = candidate as IMisoConfig;
    let model: RamenModel;

    try {
      model = RamenModel.import(structuredClone(config.model));
    } catch (error: unknown) {
      throw new ExternalServiceError(`The model in the guidelines is invalid: ${(error as Error).message}`);
    }

    const index: ConfigIndex = buildConfigIndex(config, model);

    index.warnings.forEach((warning) => logger.warn(`Miso config: ${warning}`));

    return { url, version, config, index };
  }
}
