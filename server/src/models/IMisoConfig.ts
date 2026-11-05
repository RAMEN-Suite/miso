import type { RamenFile } from "@ramen-suite/core";
import { AnnotationType, PropertyConfig } from "./types.js";

/** An entry of `miso.base`: settings of a RAMEN base level element, which can't be set in the model itself */
export interface ConfigBaseEntry {
  kind: string;
  id: string;
  modelId: string;
  name: string;
  ext?: { miso?: Record<string, unknown> };
  attributes?: { id: string; name: string; ext?: { miso?: Record<string, unknown> } }[];
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
    /** The editor's native types and the annotation shapes (qualified refs) that implement them */
    mappings: { native: string; annotation: string; type: string; attributes?: Record<string, string> }[];
    base?: ConfigBaseEntry[];
  };
}

/** A refinement of the Collection, Content or Entity node */
export interface NodeTypeConfig {
  /** The node label, i.e. the classifier name. Used for matching until the lookups use IDs. */
  additionalLabel: string;
  /** Qualified ref (`<modelId>:<id>`) of the classifier */
  classifierRef: string;
  /** The `ext.miso` block of the classifier */
  miso?: Record<string, unknown>;
  /** The attributes of the classifier and of its refinement ancestors (not of the RAMEN base node) */
  properties: PropertyConfig[];
}

/** A refinement of the Collection node, with the annotation types only it carries */
export interface CollectionTypeConfig extends NodeTypeConfig {
  annotationTypes: AnnotationType[];
}

/** The lookups of the guidelines service by name, derived from the model and the Miso config */
export interface ConfigIndex {
  collections: {
    miso?: Record<string, unknown>;
    /** Attributes declared by the RAMEN Collection node (identity attributes like `uuid` excluded) */
    properties: PropertyConfig[];
    types: CollectionTypeConfig[];
    /** Annotation types carried by every Collection */
    annotationTypes: AnnotationType[];
  };
  contents: {
    miso?: Record<string, unknown>;
    types: NodeTypeConfig[];
    /** Annotation types carried by Content nodes */
    annotationTypes: AnnotationType[];
  };
  entities: {
    miso?: Record<string, unknown>;
    types: NodeTypeConfig[];
  };
  /** Problems found while building the index. The index is still usable, the affected entries are left out. */
  warnings: string[];
}
