import fs from "fs/promises";
import path from "path";
import { IGuidelines } from "../models/IGuidelines.js";
import { PropertyConfig } from "../models/types.js";
import ExternalServiceError from "../errors/externalService.error.js";
import { CONFIG_DIR } from "../constants.js";
import { isValidConfigFile, isValidHttpUrl } from "../utils/helper.js";

export default class GuidelinesService {
  /**
   * Retrieves the field configuration of an annotation with the given type.
   *
   * The method operates on the given guidelines parameter instead of fetching from within. This is done
   * to prevent multiple requests, since the method is used to preprocess a batch of annotations before
   * saving them.
   *
   * @param {IGuidelines} guidelines - The guidelines to retrieve the field configuration from.
   * @param {string} type - The type of the annotation.
   * @return {PropertyConfig[]} The field configuration for the annotation type.
   */
  public getAnnotationConfigFieldsFromGuidelines(guidelines: IGuidelines, type: string): PropertyConfig[] {
    const system: PropertyConfig[] = guidelines.annotations.properties.system;
    const base: PropertyConfig[] = guidelines.annotations.properties.base;
    const additional: PropertyConfig[] =
      guidelines.annotations.types.find((annoConfig) => annoConfig.type === type)?.properties ?? [];

    return [...system, ...base, ...additional];
  }

  /**
   * Retrieves the field configuration of a collection with the given additional node labels.
   *
   * The method operates on the given guidelines parameter instead of fetching from within. This is done
   * to prevent multiple requests, since the method is used to preprocess a batch of collections before
   * saving them.
   *
   * @param {IGuidelines} guidelines - The guidelines to retrieve the field configuration from.
   * @param {string[]} nodeLabels - The additional labels of the collection.
   * @return {PropertyConfig[]} The field configuration for the collection type.
   */
  public getCollectionConfigFieldsFromGuidelines(guidelines: IGuidelines, nodeLabels: string[]): PropertyConfig[] {
    const system: PropertyConfig[] = guidelines.collections.properties.system;
    const base: PropertyConfig[] = guidelines.collections.properties.base;
    const additional: PropertyConfig[] = guidelines.collections.types.reduce((total: PropertyConfig[], curr) => {
      if (nodeLabels.includes(curr.additionalLabel)) {
        total.push(...curr.properties);
      }
      return total;
    }, []);

    return [...system, ...base, ...additional];
  }

  /**
   * Retrieves the guidelines from the URL defined in the GUIDELINES_URL environment variable. Can be either loaded
   * from a remote location or from the file system.
   *
   * @throws {ExternalServiceError} If the URL is not provided or if the guidelines could not be loaded.
   * @return {Promise<IGuidelines>} The retrieved guidelines.
   */
  public async getGuidelines(): Promise<IGuidelines> {
    // TODO: Improve error handling...technically a local file read error is not a external service error
    const url: string | undefined = process.env.GUIDELINES_URL;

    if (!url) {
      throw new ExternalServiceError(`URL to guidelines is not provided`);
    }

    // If it starts with http/https, fetch it
    if (isValidHttpUrl(url)) {
      try {
        const response: Response = await fetch(url);

        if (!response.ok) {
          throw new ExternalServiceError(`Guidelines could not be loaded from remote url`);
        }

        return await response.json();
      } catch (error: unknown) {
        throw new ExternalServiceError(`Guidelines could not be loaded from remote url`);
      }
    }

    if (!isValidConfigFile(url)) {
      throw new ExternalServiceError(`Provided guidelines URL is not a valid file name.`);
    }

    // Else, read from local file system
    const filePath: string = path.join(CONFIG_DIR, url);
    let fileContent: string;

    try {
      fileContent = await fs.readFile(filePath, "utf-8");
    } catch (err: unknown) {
      throw new ExternalServiceError(`Failed to read guidelines from the provided file`);
    }

    try {
      return JSON.parse(fileContent);
    } catch (err: unknown) {
      throw new ExternalServiceError(`Invalid JSON in the provided guidelines file`);
    }
  }
}
