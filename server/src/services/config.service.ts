import fs from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { RamenModel } from "@ramen-suite/core";
import { IMisoConfig } from "../models/IMisoConfig.js";
import ExternalServiceError from "../errors/externalService.error.js";
import { CONFIG_DIR } from "../constants.js";
import { isValidHttpUrl } from "../utils/url.js";
import { env } from "../env.js";
import { collectConfigWarnings, createModelContext } from "../utils/modelHelper.js";
import { ModelContext } from "../models/types.js";
import logger from "../logger.js";
import { checkExtBlocks, checkMappings } from "../schemas/configBlocks.schema.js";

/** A built config, by the version of the config it was built from */
interface ConfigCacheEntry {
  /**
   * The version of the config: `mtime:<ms>:size:<bytes>` of a local file, `etag:<ETag>` of a remote one, or
   * `sha256:<hash>` of its content if the remote server sends no `ETag`.
   */
  version: string;
  /** The model context, or the error of an invalid config */
  result: { context: ModelContext } | { error: Error };
}

/** The current version of the config, and how to get its content if it has to be built */
interface ConfigSnapshot {
  version: string;
  /** Reads the content (a remote config already fetched to find its version is returned as is) */
  read: () => Promise<string>;
}

/**
 * Loads the Miso config and caches its model context.
 *
 * @remarks
 * Building the model context is expensive (`RamenModel.import` validates the whole model, complex models take a long time),
 * and while it runs no other request can continue. So the context is built once per version of the config and
 * shared by all requests. Every request still checks whether the config changed, so a change takes effect with the next
 * request, without a restart:
 *
 * - Local file (`GUIDELINES_URL` is a file name): `fs.stat`, the version is the modification time and size. Saving or
 *   replacing the file changes it.
 *
 * - Remote URL: a conditional request with the `ETag` of the cached version (`If-None-Match`). The remote server answers
 *   `304 Not Modified` without a body while the config is unchanged. Without an `ETag`, the config is downloaded on
 *   every request and its SHA-256 hash is the version; only the import is skipped then.
 *
 * An invalid config is cached as well: its error is thrown on every request until the config changes, without importing
 * it again. Failures to read or fetch the config are not cached, the next request tries again. Requests that arrive
 * while a version is being built wait for that build instead of starting their own.
 *
 * To force a rebuild of a local config, change its modification time (`touch config/<file>.json`); for a remote one,
 * change the file there. A restart clears the cache as well.
 *
 * The cached context is shared, so code must never change it (or the model and config objects in it).
 *
 * There is one config per process, so the class is used statically (`ConfigService.getModelContext()`), never
 * instantiated.
 */
export default class ConfigService {
  /** The last built config */
  private static cache: ConfigCacheEntry | null = null;

  /** The build in progress, shared by the requests that arrive meanwhile */
  private static pendingBuild: { version: string; promise: Promise<ConfigCacheEntry> } | null = null;

  /**
   * Retrieves the Miso config as stored. Used to serve it to the client.
   *
   * @throws {ExternalServiceError} If the config can not be loaded or is invalid.
   * @return {Promise<IMisoConfig>} The Miso config.
   */
  public static async getConfig(): Promise<IMisoConfig> {
    return (await ConfigService.load()).config;
  }

  /**
   * Retrieves the model of the Miso config and its settings, for the accessors in `utils/modelHelper.ts`.
   * Fetched once per request and passed on, since a batch of nodes is checked against it before saving.
   *
   * @throws {ExternalServiceError} If the config can not be loaded or is invalid.
   * @return {Promise<ModelContext>} The model context.
   */
  public static async getModelContext(): Promise<ModelContext> {
    return ConfigService.load();
  }

  /**
   * Returns the model context of the Miso config at `GUIDELINES_URL` (a remote location or a file in the config
   * directory, checked at startup). Built once per version of the config and cached (see the class documentation).
   *
   * @throws {ExternalServiceError} If the config can not be loaded or is invalid.
   * @return {Promise<ModelContext>} The model context of the current config.
   */
  private static async load(): Promise<ModelContext> {
    // TODO: Improve error handling...technically a local file read error is not a external service error
    const url: string = env.GUIDELINES_URL;
    const snapshot: ConfigSnapshot = isValidHttpUrl(url)
      ? await ConfigService.snapshotRemote(url)
      : await ConfigService.snapshotLocal(path.join(CONFIG_DIR, url));
    const { cache, pendingBuild } = ConfigService;
    let entry: ConfigCacheEntry;

    if (cache?.version === snapshot.version) {
      entry = cache;
    } else if (pendingBuild?.version === snapshot.version) {
      entry = await pendingBuild.promise;
    } else {
      entry = await ConfigService.buildOnce(snapshot);
    }

    if ("error" in entry.result) {
      throw entry.result.error;
    }

    return entry.result.context;
  }

  /**
   * Builds a version of the config and registers the build, so requests that arrive meanwhile wait for it.
   *
   * @param {ConfigSnapshot} snapshot - The version to build.
   * @throws {ExternalServiceError} If the config can not be read.
   * @returns {Promise<ConfigCacheEntry>} The cache entry of that version.
   */
  private static async buildOnce(snapshot: ConfigSnapshot): Promise<ConfigCacheEntry> {
    const promise: Promise<ConfigCacheEntry> = ConfigService.build(snapshot);

    ConfigService.pendingBuild = { version: snapshot.version, promise };

    try {
      return await promise;
    } finally {
      if (ConfigService.pendingBuild?.promise === promise) {
        ConfigService.pendingBuild = null;
      }
    }
  }

  /**
   * Reads, parses and prepares a version of the config and caches the result. An invalid config is cached with its
   * error; a failure to read it is thrown without caching.
   *
   * @param {ConfigSnapshot} snapshot - The version to build.
   * @throws {ExternalServiceError} If the config can not be read.
   * @returns {Promise<ConfigCacheEntry>} The new cache entry.
   */
  private static async build(snapshot: ConfigSnapshot): Promise<ConfigCacheEntry> {
    const content: string = await snapshot.read();
    let result: ConfigCacheEntry["result"];

    try {
      result = { context: ConfigService.validate(ConfigService.parse(content)) };
    } catch (error: unknown) {
      result = { error: error instanceof Error ? error : new ExternalServiceError(String(error)) };
    }

    ConfigService.cache = { version: snapshot.version, result };

    return ConfigService.cache;
  }

  /**
   * The version of a local config: its modification time and size.
   *
   * @param {string} filePath - Path of the config file.
   * @throws {ExternalServiceError} If the file can not be accessed.
   * @returns {Promise<ConfigSnapshot>} The version, and how to read the file.
   */
  private static async snapshotLocal(filePath: string): Promise<ConfigSnapshot> {
    const read = async (): Promise<string> => {
      try {
        return await fs.readFile(filePath, "utf-8");
      } catch {
        throw new ExternalServiceError(`Failed to read the config from the provided file`);
      }
    };

    try {
      const stats = await fs.stat(filePath);

      return { version: `mtime:${stats.mtimeMs}:size:${stats.size}`, read };
    } catch {
      throw new ExternalServiceError(`Failed to read the config from the provided file`);
    }
  }

  /**
   * The version of a remote config: a conditional request with the `ETag` of the cached version. Unchanged (`304`),
   * the cached version is returned; changed, or without an `ETag`, the fetched content comes with the snapshot.
   *
   * @param {string} url - The config URL.
   * @throws {ExternalServiceError} If the config can not be fetched.
   * @returns {Promise<ConfigSnapshot>} The version, and the content if it was fetched.
   */
  private static async snapshotRemote(url: string): Promise<ConfigSnapshot> {
    const { cache } = ConfigService;
    const cachedEtag: string | undefined = cache?.version.startsWith("etag:") ? cache.version.slice("etag:".length) : undefined;
    let response: Response;
    let content: string;

    try {
      response = await fetch(url, { headers: cachedEtag ? { "If-None-Match": cachedEtag } : {} });

      if (response.status === 304 && cache) {
        const version: string = cache.version;

        return {
          version,
          read: () => Promise.reject(new ExternalServiceError(`Config version ${version} is cached, but not its content`)),
        };
      }

      if (!response.ok) {
        throw new ExternalServiceError(`Config could not be loaded from remote url`);
      }

      content = await response.text();
    } catch {
      throw new ExternalServiceError(`Config could not be loaded from remote url`);
    }

    const etag: string | null = response.headers.get("ETag");
    const version: string = etag ? `etag:${etag}` : `sha256:${createHash("sha256").update(content).digest("hex")}`;

    return { version, read: () => Promise.resolve(content) };
  }

  /**
   * Parses the content of the config.
   *
   * @param {string} content - The content as read.
   * @throws {ExternalServiceError} If the content is no valid JSON.
   * @returns {unknown} The parsed JSON.
   */
  private static parse(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      throw new ExternalServiceError(`Invalid JSON in the provided config file`);
    }
  }

  /**
   * Checks that the data is a Miso config with a valid model and valid Miso settings (`ext.miso` blocks, mappings),
   * creates its model context and logs the problems the name lookups can't handle. Runs once per version of the config.
   *
   * @param {unknown} data - The parsed JSON.
   * @throws {ExternalServiceError} If the data is no Miso config (e.g. a file in the old guidelines format), its model
   * is invalid, an `ext.miso` block is invalid or misplaced, or a mapping is invalid.
   * @return {ModelContext} The model context of the config.
   */
  private static validate(data: unknown): ModelContext {
    const candidate = data as Partial<IMisoConfig> | null;

    if (!candidate?.$schema || !candidate.id || !candidate.model || !candidate.miso) {
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

    const problems: string[] = [
      ...checkExtBlocks(config.model, config.miso.base ?? []),
      ...checkMappings(config.model, config.miso.editors.text.mappings),
    ];

    if (problems.length > 0) {
      throw new ExternalServiceError(`The Miso settings in the config are invalid:\n${problems.join("\n")}`);
    }

    const context: ModelContext = createModelContext(config, model);

    collectConfigWarnings(context).forEach((warning) => logger.warn(`Miso config: ${warning}`));

    return context;
  }
}
