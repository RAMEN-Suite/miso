import type { RamenFile } from "@ramen-suite/core";

/** An entry of `miso.general.baseClassifiers`: settings of a RAMEN base level classifier, which can't be set in the model itself */
export interface ConfigBaseClassifier {
  kind: string;
  id: string;
  modelId: string;
  name: string;
  ext?: { miso?: Record<string, unknown> };
  attributes?: { id: string; name: string; ext?: { miso?: Record<string, unknown> } }[];
}

/** An entry of `miso.editors.text.mappings`: a native editor type and the annotation shape (qualified ref) that implements it */
export interface ConfigMapping {
  native: string;
  annotation: string;
  type: string;
  attributes?: Record<string, string>;
}

/**
 * The Miso config: the ingested RAMEN model with Miso settings in `ext.miso`, plus the global Miso settings. The model
 * is validated and read by RAMEN core, the `ext.miso` blocks and mappings by `checkExtBlocks`/`checkMappings`
 * (`schemas/configBlocks.schema.ts`).
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
  model: RamenFile;
  miso: {
    /** Settings that concern the whole app, not a single editor */
    general: {
      /** Subgraph templates. Not migrated yet, always empty for now. */
      templates: unknown[];
      /** Settings of RAMEN base level classifiers, which RAMEN core accepts only unchanged in the model */
      baseClassifiers?: ConfigBaseClassifier[];
    };
    /** Settings of the Content editors, one section per editor */
    editors: {
      text: {
        /** The text editor's native types and the annotation shapes that implement them */
        mappings: ConfigMapping[];
      };
    };
  };
}
