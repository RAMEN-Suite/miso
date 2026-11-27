import type { RamenFile } from "@ramen-suite/core";

/** An entry of an element's `attributes`, keyed by attribute ref (`<modelId>:<attributeId>`) */
export interface ConfigAttributeEntry {
  /** Name of the attribute in the model. A hint for readers, the ref decides. */
  name: string;
  [key: string]: unknown;
}

/**
 * An entry of `elements.classifiers` or `elements.annotations`: the settings of one model element. The server passes
 * them through and reads only a few keys.
 */
export interface ConfigElementEntry {
  /** Name of the element in the model (for shapes their type). A hint for readers, the ref decides. */
  name: string;
  /** Settings of the attributes declared on the element, keyed by attribute ref */
  attributes?: Record<string, ConfigAttributeEntry>;
  [key: string]: unknown;
}

/** An entry of `editors.text.mappings`: a native editor type and the annotation shape (qualified ref) that implements it */
export interface ConfigMapping {
  native: string;
  annotation: string;
  type: string;
  /** Native attribute -> attribute ref of the shape property that holds it */
  attributes?: Record<string, string>;
}

/**
 * The Miso config: the raw RAMEN model and the app's settings of its elements, keyed by qualified ref (`<modelId>:<id>`).
 * The model is validated and read by RAMEN core, the settings and their refs by `checkConfigSettings`.
 */
export interface IMisoConfig {
  /** The config format and its version, e.g. `https://ramen-schema.org/miso/1.0.0/config.schema.json` */
  $schema: string;
  /** Identity of the config, kept across regenerations */
  id: string;
  /** About the config itself. The project's name and description are in the model's `project`. */
  meta?: {
    /** What this editor configuration is for */
    description?: string;
  };
  /** The raw model, never changed by the app */
  model: RamenFile;
  /** Settings that concern the whole app, not a single editor */
  general: {
    /** Subgraph templates (currently always empty) */
    templates: unknown[];
  };
  /** How model elements are shown and edited, by section of element kind and keyed by qualified ref */
  elements: {
    /** Settings of node classifiers (RAMEN base nodes included) */
    classifiers: Record<string, ConfigElementEntry>;
    /** Settings of annotation shapes */
    annotations: Record<string, ConfigElementEntry>;
  };
  /** Settings of the Content editors, one section per editor */
  editors: {
    text: {
      /** The text editor's native types and the annotation shapes that implement them */
      mappings: ConfigMapping[];
      /** The groups of the special characters picker. Only read by the client, which validates them. */
      specialCharacters?: unknown[];
    };
  };
}
