import type { RamenFile } from "@ramen-suite/core";

/** An entry of `miso.base`: settings of a RAMEN base level element, which can't be set in the model itself */
export interface ConfigBaseEntry {
  kind: string;
  id: string;
  modelId: string;
  name: string;
  ext?: { miso?: Record<string, unknown> };
  attributes?: { id: string; name: string; ext?: { miso?: Record<string, unknown> } }[];
}

/** An entry of `miso.mappings`: a native editor type and the annotation shape (qualified ref) that implements it */
export interface ConfigMapping {
  native: string;
  annotation: string;
  type: string;
  attributes?: Record<string, string>;
}

/**
 * The Miso config: the ingested RAMEN model with Miso settings in `ext.miso`, plus the global Miso settings. The model
 * is validated and read by RAMEN core, the `ext.miso` blocks are validated by the client; the server passes them through.
 */
export interface IMisoConfig {
  $schema?: string;
  meta: {
    configVersion: string;
    project: string;
    description?: string;
    /** Where and when the model was ingested. Reserved for the drift check against the original model. */
    ingest?: { source: string; ingestedAt: string; modelFileId: string; checksum: string };
  };
  model: RamenFile;
  miso: {
    templates: unknown[];
    /** The editor's native types and the annotation shapes that implement them */
    mappings: ConfigMapping[];
    base?: ConfigBaseEntry[];
  };
}
